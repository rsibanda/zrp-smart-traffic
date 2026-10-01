import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { EvidenceStorage } from './evidence-storage';
export { evidenceDirectory } from './evidence-storage';
import { createHash, randomUUID } from 'crypto';
import sharp from 'sharp';
import { Roles, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';
import { scope } from './offences.service';
import { serial } from './transactions';
const publicFields = {
  id: true,
  mimeType: true,
  byteSize: true,
  createdAt: true,
} as const;
@ApiTags('Private evidence')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller()
export class EvidenceController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: EvidenceStorage,
  ) {}
  @Get('offences/:id/evidence')
  @Roles('OFFICER', 'SUPERVISOR')
  async list(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    if (
      !(await this.db.offence.findFirst({ where: { id, ...scope(req.actor) } }))
    )
      throw new NotFoundException('Offence not found');
    return this.db.evidence.findMany({
      where: { offenceId: id },
      select: publicFields,
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('offences/:id/evidence')
  @Roles('OFFICER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
      fileFilter: (_req, file, callback) =>
        callback(
          ['image/jpeg', 'image/png'].includes(file.mimetype)
            ? null
            : new BadRequestException('Only JPEG and PNG images are accepted'),
          ['image/jpeg', 'image/png'].includes(file.mimetype),
        ),
    }),
  )
  async upload(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('Attach a JPEG or PNG image, maximum 5 MB');
    if (
      !(await this.db.offence.findFirst({
        where: { id, officerId: req.actor.id },
      }))
    )
      throw new NotFoundException('Offence not found');
    let bytes: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 20000000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if (
        !['jpeg', 'png'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1 ||
        file.mimetype !== `image/${metadata.format}`
      )
        throw new Error('Unsupported image');
      // Decode and re-encode; remove EXIF/GPS and embedded non-image content.
      bytes = await image.rotate().jpeg({ quality: 85 }).toBuffer();
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Image too large');
    } catch {
      throw new BadRequestException(
        'Invalid, oversized or unsupported image content',
      );
    }
    const objectKey = `${randomUUID()}.jpg`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = await this.storage.put(objectKey, bytes);
    let keep = false;
    try {
      const result = await serial(this.db, async (tx) => {
        const offence = await tx.offence.findFirst({
          where: { id, officerId: req.actor.id },
        });
        if (!offence) throw new NotFoundException('Offence not found');
        if (offence.status !== 'DRAFT')
          throw new ConflictException(
            'Attach evidence before submitting the draft',
          );
        const existing = await tx.evidence.findUnique({
          where: { offenceId_sha256: { offenceId: id, sha256 } },
        });
        if (existing) return existing;
        if ((await tx.evidence.count({ where: { offenceId: id } })) >= 5)
          throw new ConflictException('Maximum five images per offence');
        const record = await tx.evidence.create({
          data: {
            offenceId: id,
            privateStorageKey: key,
            mimeType: 'image/jpeg',
            byteSize: bytes.length,
            sha256,
            uploadedBy: req.actor.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: req.actor.id,
            action: 'EVIDENCE_UPLOADED',
            entityType: 'Evidence',
            entityId: record.id,
          },
        });
        return record;
      });
      keep = result.privateStorageKey === key;
      return {
        id: result.id,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        createdAt: result.createdAt,
      };
    } finally {
      if (!keep) await this.storage.remove(key).catch(() => undefined);
    }
  }
  @Get('evidence/:id')
  @Roles('OFFICER', 'SUPERVISOR')
  async download(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const record = await this.db.evidence.findFirst({
      where: { id, offence: scope(req.actor) },
    });
    if (!record) throw new NotFoundException('Evidence not found');
    let bytes: Buffer;
    try {
      bytes = await this.storage.get(record.privateStorageKey);
    } catch {
      throw new NotFoundException('Evidence file unavailable');
    }
    await this.db.auditEvent.create({
      data: {
        actorId: req.actor.id,
        action: 'EVIDENCE_VIEWED',
        entityType: 'Evidence',
        entityId: id,
      },
    });
    res
      .set({
        'Content-Type': record.mimeType,
        'Content-Disposition': `attachment; filename="evidence-${record.id}.jpg"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
}

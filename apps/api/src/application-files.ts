import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import sharp from 'sharp';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRawStream,
} from 'pdf-lib';
import { Actor } from './auth';
import { EvidenceStorage } from './evidence-storage';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';
import {
  applicationFiles,
  applicationScope,
  ensureEditable,
} from './vehicle-applications.service';

function bounded(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error('Invalid application attachment limits');
  return n;
}
export const applicationFileLimit = () =>
  bounded(process.env.APPLICATION_FILE_LIMIT_MB, 10, 1, 20) * 1024 * 1024;
export const applicationAttachmentLimit = () =>
  bounded(process.env.APPLICATION_ATTACHMENT_LIMIT, 5, 3, 5);
export const fileKinds = [
  'OWNERSHIP',
  'FRONT',
  'REAR_PLATE',
  'OTHER_1',
  'OTHER_2',
];

export async function inspectApplicationFile(file: Express.Multer.File) {
  if (file.size > applicationFileLimit())
    throw new BadRequestException(
      'Attachment exceeds the configured file size limit.',
    );
  if (
    /hei[cf]/i.test(file.mimetype) ||
    /\.(heic|heif)$/i.test(file.originalname)
  )
    throw new BadRequestException(
      'Convert HEIC/HEIF to JPEG or PNG before uploading.',
    );
  if (file.buffer.subarray(0, 5).toString() === '%PDF-') {
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('File type does not match its content.');
    try {
      const pdf = await PDFDocument.load(file.buffer, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      if (pdf.getPageCount() < 1 || pdf.getPageCount() > 50)
        throw new Error('Page limit');
      const forbidden = new Set([
        'JavaScript',
        'JS',
        'OpenAction',
        'AA',
        'Launch',
        'EmbeddedFile',
        'EmbeddedFiles',
        'RichMedia',
        'XFA',
        'AcroForm',
        'GoToR',
        'SubmitForm',
        'ImportData',
        'URI',
        'FileAttachment',
        'Sound',
        'Movie',
      ]);
      const visited = new Set<PDFObject>();
      const inspect = (object: PDFObject, depth = 0) => {
        if (depth > 100) throw new Error('Nested document');
        if (visited.has(object)) return;
        visited.add(object);
        if (object instanceof PDFName && forbidden.has(object.decodeText()))
          throw new Error('Active content');
        if (object instanceof PDFDict)
          for (const [key, value] of object.entries()) {
            inspect(key, depth + 1);
            inspect(value, depth + 1);
          }
        if (object instanceof PDFArray)
          for (const value of object.asArray()) inspect(value, depth + 1);
        if (object instanceof PDFRawStream) inspect(object.dict, depth + 1);
      };
      for (const [, object] of pdf.context.enumerateIndirectObjects())
        inspect(object);
      pdf.setAuthor('');
      pdf.setSubject('');
      pdf.setKeywords([]);
      pdf.setTitle('Vehicle application document');
      const bytes = Buffer.from(await pdf.save());
      if (bytes.length > applicationFileLimit()) throw new Error('Size limit');
      return { bytes, mimeType: 'application/pdf', extension: 'pdf' };
    } catch {
      throw new BadRequestException(
        'Invalid, encrypted or unsafe PDF. Upload a flat PDF without scripts, links, forms or attachments (maximum 50 pages).',
      );
    }
  }
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 20000000,
      failOn: 'warning',
    });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1 ||
      file.mimetype !== `image/${meta.format}`
    )
      throw new Error('Unsupported content');
    const bytes = await image.rotate().jpeg({ quality: 85 }).toBuffer();
    if (bytes.length > applicationFileLimit()) throw new Error('Size limit');
    return { bytes, mimeType: 'image/jpeg', extension: 'jpg' };
  } catch {
    throw new BadRequestException(
      'Choose a valid PDF, JPEG or PNG. Executables and unsupported image formats are not accepted.',
    );
  }
}

@Injectable()
export class ApplicationFilesService {
  private readonly signingKey = randomBytes(32); // Local development grants expire on restart.
  constructor(
    private readonly db: PrismaService,
    private readonly storage: EvidenceStorage,
  ) {}
  async upload(
    actor: Actor,
    id: string,
    kind: string,
    file?: Express.Multer.File,
  ) {
    if (!file || !fileKinds.includes(kind))
      throw new BadRequestException(
        'Choose a supported attachment and file kind.',
      );
    const initial = await this.db.vehicleApplication.findFirst({
      where: { requestId: id, request: { motoristId: actor.id } },
      include: { request: true },
    });
    if (!initial) throw new NotFoundException('Application not found');
    ensureEditable(initial.request.status);
    const { bytes, mimeType, extension } = await inspectApplicationFile(file);
    if (kind !== 'OWNERSHIP' && mimeType === 'application/pdf')
      throw new BadRequestException('Vehicle photographs must be JPEG or PNG.');
    const storageKey = await this.storage.put(
      `application-${randomUUID()}.${extension}`,
      bytes,
      mimeType,
    );
    let kept = false,
      oldKey: string | undefined;
    try {
      const result = await serial(this.db, async (tx) => {
        const row = await tx.vehicleApplication.findFirst({
          where: { requestId: id, request: { motoristId: actor.id } },
          include: { request: true, files: true },
        });
        if (!row) throw new NotFoundException('Application not found');
        ensureEditable(row.request.status);
        const old = row.files.find((f) => f.kind === kind);
        if (!old && row.files.length >= applicationAttachmentLimit())
          throw new ConflictException(
            'Maximum attachment count reached. Replace or remove a file.',
          );
        oldKey = old?.storageKey;
        const data = {
          storageKey,
          mimeType,
          byteSize: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          uploadedBy: actor.id,
        };
        const result = await tx.vehicleApplicationFile.upsert({
          where: { applicationId_kind: { applicationId: id, kind } },
          create: { applicationId: id, kind, ...data },
          update: data,
          select: applicationFiles,
        });
        await tx.vehicleApplication.update({
          where: { requestId: id },
          data: { revision: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            action: 'VEHICLE_APPLICATION_FILE_UPLOADED',
            entityType: 'VehicleApplication',
            entityId: id,
            safeMetadata: { kind, mimeType, byteSize: bytes.length },
          },
        });
        return result;
      });
      kept = true;
      if (oldKey) await this.storage.remove(oldKey).catch(() => undefined);
      return result;
    } finally {
      if (!kept) await this.storage.remove(storageKey).catch(() => undefined);
    }
  }
  async remove(actor: Actor, id: string) {
    const key = await serial(this.db, async (tx) => {
      const file = await tx.vehicleApplicationFile.findFirst({
        where: { id, application: { request: { motoristId: actor.id } } },
        include: { application: { include: { request: true } } },
      });
      if (!file) throw new NotFoundException('File not found');
      ensureEditable(file.application.request.status);
      await tx.vehicleApplicationFile.delete({ where: { id } });
      await tx.vehicleApplication.update({
        where: { requestId: file.applicationId },
        data: { revision: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'VEHICLE_APPLICATION_FILE_REMOVED',
          entityType: 'VehicleApplication',
          entityId: file.applicationId,
        },
      });
      return file.storageKey;
    });
    await this.storage.remove(key).catch(() => undefined);
    return { removed: true };
  }
  async download(actor: Actor, id: string) {
    const file = await this.db.vehicleApplicationFile.findFirst({
      where: { id, application: applicationScope(actor) },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: 'VEHICLE_APPLICATION_FILE_VIEWED',
        entityType: 'VehicleApplication',
        entityId: file.applicationId,
        safeMetadata: { fileId: id },
      },
    });
    const remote = await this.storage.signedDownload(
      file.storageKey,
      file.mimeType,
    );
    const expires = Date.now() + 120000;
    const signature = createHmac('sha256', this.signingKey)
      .update(`${id}:${expires}:${file.sha256}`)
      .digest('hex');
    return {
      url:
        remote ??
        `/api/v1/vehicle-application-files/${id}/content?expires=${expires}&signature=${signature}`,
      expiresAt: new Date(expires),
      mimeType: file.mimeType,
    };
  }
  async content(id: string, expires: string, signature: string) {
    if (
      !/^\d{13}$/.test(expires) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 120000
    )
      throw new NotFoundException('Download link expired or invalid');
    const file = await this.db.vehicleApplicationFile.findUnique({
      where: { id },
    });
    if (!file) throw new NotFoundException('File not found');
    const expected = createHmac('sha256', this.signingKey)
      .update(`${id}:${expires}:${file.sha256}`)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new NotFoundException('Download link expired or invalid');
    return {
      bytes: await this.storage.get(file.storageKey, applicationFileLimit()),
      mimeType: file.mimeType,
    };
  }
}

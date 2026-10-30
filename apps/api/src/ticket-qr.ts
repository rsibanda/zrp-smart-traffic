import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Matches } from 'class-validator';
import { randomBytes } from 'crypto';
import { toDataURL } from 'qrcode';
import { Actor, hashToken, Roles, SessionGuard, StaffRequest } from './auth';
import { scope } from './offences.service';
import { ledgerTicket, ticketInclude } from './payments.service';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';

export function qrConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const source = env.PUBLIC_SITE_URL;
  const days = Number(env.TICKET_QR_EXPIRY_DAYS ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error('TICKET_QR_EXPIRY_DAYS must be an integer from 1 to 365');
  if (!source) return { origin: null, days };
  const url = new URL(source);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/i.test(url.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
  )
    throw new Error('PUBLIC_SITE_URL must be a public HTTPS origin');
  return { origin: url.origin, days };
}

class VerifyQrDto {
  @ApiProperty({
    description: 'Opaque token decoded from the ticket QR; never log it.',
  })
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

@Injectable()
export class TicketQrService {
  constructor(private readonly db: PrismaService) {}

  async issue(actor: Actor, ticketId: string) {
    const config = qrConfiguration();
    if (!config.origin)
      throw new ServiceUnavailableException(
        'Ticket QR is unavailable until the public site URL is configured. Use the manual verification code.',
      );
    const token = randomBytes(32).toString('hex');
    const verificationUrl = `${config.origin}/verify#token=${token}`;
    const qrImage = await toDataURL(verificationUrl, {
      width: 600,
      margin: 4,
      errorCorrectionLevel: 'M',
    });
    const expiresAt = new Date(Date.now() + config.days * 86400000);
    return serial(this.db, async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id: ticketId, offence: scope(actor) },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.status !== 'ISSUED')
        throw new ConflictException('Only issued tickets can have a QR code');
      await tx.ticketVerificationToken.updateMany({
        where: { ticketId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.ticketVerificationToken.create({
        data: { ticketId, tokenHash: hashToken(token), expiresAt },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'TICKET_QR_ROTATED',
          entityType: 'Ticket',
          entityId: ticketId,
        },
      });
      return {
        displayReference: ticket.displayReference,
        verificationUrl,
        qrImage,
        expiresAt,
      };
    });
  }

  async revoke(actor: Actor, ticketId: string) {
    return serial(this.db, async (tx) => {
      if (
        !(await tx.ticket.findFirst({
          where: { id: ticketId, offence: scope(actor) },
        }))
      )
        throw new NotFoundException('Ticket not found');
      await tx.ticketVerificationToken.updateMany({
        where: { ticketId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'TICKET_QR_REVOKED',
          entityType: 'Ticket',
          entityId: ticketId,
        },
      });
      return { status: 'REVOKED' };
    });
  }

  async status(token: string) {
    const record = await this.db.ticketVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        revokedAt: true,
        expiresAt: true,
        ticket: { select: { status: true } },
      },
    });
    if (!record || record.revokedAt || record.ticket.status !== 'ISSUED')
      return { status: 'INVALID' };
    return { status: record.expiresAt <= new Date() ? 'EXPIRED' : 'VALID' };
  }

  async ticket(actor: Actor, token: string) {
    // One query checks token validity AND immutable ownership; no claiming side effect.
    const record = await this.db.ticketVerificationToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ticket: { status: 'ISSUED', motoristId: actor.id },
      },
      select: { ticket: { include: ticketInclude } },
    });
    if (!record)
      throw new NotFoundException(
        'Ticket unavailable for this account. Check the code or ask the issuing officer.',
      );
    return ledgerTicket(record.ticket);
  }
}

@ApiTags('Ticket QR verification')
@Controller()
export class TicketQrController {
  constructor(private readonly qr: TicketQrService) {}

  @Get('public/ticket-qr/config')
  config() {
    return { origin: qrConfiguration().origin };
  }

  @Post('public/ticket-qr/status')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  status(@Body() dto: VerifyQrDto) {
    return this.qr.status(dto.token);
  }

  @Post('motorist/ticket-qr/verify')
  @ApiBearerAuth()
  @UseGuards(SessionGuard, ThrottlerGuard)
  @Roles('USER')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Req() req: StaffRequest, @Body() dto: VerifyQrDto) {
    return this.qr.ticket(req.actor, dto.token);
  }

  @Post('tickets/:id/qr')
  @ApiBearerAuth()
  @UseGuards(SessionGuard, ThrottlerGuard)
  @Roles('OFFICER')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  issue(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.qr.issue(req.actor, id);
  }

  @Post('tickets/:id/qr/revoke')
  @ApiBearerAuth()
  @UseGuards(SessionGuard)
  @Roles('OFFICER', 'SUPERVISOR')
  revoke(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.qr.revoke(req.actor, id);
  }
}

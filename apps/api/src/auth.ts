import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '../generated/client';
import { Request } from 'express';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
import { LoginDto } from './dto';

export const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;
export type Actor = { id: string; name: string; email: string; role: Role };
export type StaffRequest = Request & { actor: Actor; tokenHash: string };
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly db: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    const match = /^Bearer ([a-f0-9]{64})$/.exec(
      req.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException('Sign in required');
    req.tokenHash = hashToken(match[1]);
    const session = await this.db.session.findUnique({
      where: { tokenHash: req.tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new UnauthorizedException('Session expired or revoked');
    const { id, name, email, role } = session.user;
    req.actor = { id, name, email, role };
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(role))
      throw new ForbiddenException('Role not permitted');
    return true;
  }
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  constructor(private readonly db: PrismaService) {}
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !valid || !user.active) {
      await this.db.auditEvent.create({data: {action: 'LOGIN_FAILED', entityType: 'Authentication', entityId: 'staff-login'}});
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.db.$transaction(async (tx) => {
      await tx.session.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      });
      await tx.session.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
        },
      });
    });
    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(SessionGuard)
  me(@Req() req: StaffRequest) {
    return req.actor;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(SessionGuard)
  async logout(@Req() req: StaffRequest) {
    await this.db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { tokenHash: req.tokenHash } });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: 'LOGOUT',
          entityType: 'User',
          entityId: req.actor.id,
        },
      });
    });
  }
}

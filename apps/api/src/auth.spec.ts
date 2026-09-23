import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashToken, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';

describe('Session guard', () => {
  const token = 'a'.repeat(64);
  const user = {
    id: 'officer',
    name: 'Fictional Officer',
    email: 'officer@demo.invalid',
    role: 'OFFICER',
    active: true,
    passwordHash: 'never expose',
  };
  const findUnique = jest.fn();
  const db = { session: { findUnique } } as unknown as PrismaService;
  const reflector = new Reflector();
  const guard = new SessionGuard(db, reflector);
  const makeContext = (authorization?: string) => {
    const req = { headers: { authorization } } as StaffRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    return { req, context };
  };
  beforeEach(() => {
    jest.restoreAllMocks();
    findUnique.mockReset();
  });
  it('rejects missing and malformed tokens before querying the database', async () => {
    for (const value of [undefined, 'Bearer short', `Basic ${token}`]) {
      await expect(
        guard.canActivate(makeContext(value).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('rejects revoked, expired and disabled-user sessions', async () => {
    for (const session of [
      null,
      { user, expiresAt: new Date(0) },
      {
        user: { ...user, active: false },
        expiresAt: new Date(Date.now() + 60000),
      },
    ]) {
      findUnique.mockResolvedValueOnce(session);
      await expect(
        guard.canActivate(makeContext(`Bearer ${token}`).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
  it('uses a token digest and exposes only safe actor fields', async () => {
    findUnique.mockResolvedValue({
      user,
      expiresAt: new Date(Date.now() + 60000),
    });
    const { req, context } = makeContext(`Bearer ${token}`);
    expect(await guard.canActivate(context)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    expect(req.actor).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  });
  it('rejects a valid officer session at a supervisor endpoint', async () => {
    findUnique.mockResolvedValue({
      user,
      expiresAt: new Date(Date.now() + 60000),
    });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPERVISOR']);
    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches } from 'class-validator';
import * as argon2 from 'argon2';
import { Prisma } from '../generated/client';
import { publicUser, Roles, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';
import {
  CategoryDto,
  CreateUserDto,
  SearchQuery,
  SettingsDto,
  UpdateUserDto,
} from './staff.dto';
import { serial } from './transactions';

const accountFields = {
  ...publicUser,
  active: true,
  supervisorId: true,
  createdAt: true,
} as const;
export class MotoristLinkDto {
  @ApiProperty() @Matches(/^[A-Z0-9]{3,16}$/) registration!: string;
  @ApiProperty() @IsEmail() email!: string;
}
@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly db: PrismaService) {}
  @Post('motorist-links')
  link(@Req() req: StaffRequest, @Body() dto: MotoristLinkDto) {
    return serial(this.db, async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: dto.email.toLowerCase(), role: 'USER', active: true },
      });
      const vehicle = await tx.vehicle.findUnique({
        where: { registrationNumber: dto.registration },
      });
      if (!user || !vehicle)
        throw new BadRequestException(
          'Select an existing vehicle and active motorist account.',
        );
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { motoristId: user.id },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: 'VEHICLE_MOTORIST_LINKED',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          safeMetadata: {
            previousMotoristId: vehicle.motoristId,
            motoristId: user.id,
          },
        },
      });
      return {
        registration: vehicle.registrationNumber,
        motorist: user.name,
        message:
          'Vehicle linked. Existing tickets retain their recorded owner.',
      };
    });
  }
  @Get('users')
  async users(@Query() query: SearchQuery) {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: accountFields,
        orderBy: { email: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  @Get('supervisors')
  supervisors() {
    return this.db.user.findMany({
      where: { role: 'SUPERVISOR', active: true },
      select: publicUser,
      orderBy: { name: 'asc' },
    });
  }
  private async supervisor(
    tx: Prisma.TransactionClient,
    role: string,
    id?: string | null,
  ) {
    if (!id) {
      if (role === 'OFFICER')
        throw new BadRequestException(
          'Officers require an assigned supervisor',
        );
      return;
    }
    if (
      role !== 'OFFICER' ||
      !(await tx.user.findFirst({
        where: { id, role: 'SUPERVISOR', active: true },
      }))
    )
      throw new BadRequestException('Assign officers to an active supervisor');
  }
  @Post('users')
  async create(@Req() req: StaffRequest, @Body() dto: CreateUserDto) {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    return serial(this.db, async (tx) => {
      await this.supervisor(tx, dto.role, dto.supervisorId);
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          role: dto.role,
          supervisorId: dto.supervisorId,
          passwordHash,
        },
        select: accountFields,
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: user.id,
          safeMetadata: { role: user.role },
        },
      });
      return user;
    });
  }
  @Patch('users/:id')
  async update(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('Provide at least one field');
    if (Object.values(dto).some((value) => value === null))
      throw new BadRequestException('Null account fields are not permitted');
    const passwordHash = dto.password
      ? await argon2.hash(dto.password, { type: argon2.argon2id })
      : undefined;
    return serial(this.db, async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Account not found');
      const role = dto.role ?? current.role;
      const active = dto.active ?? current.active;
      if (id === req.actor.id && (!active || role !== 'ADMIN'))
        throw new ConflictException(
          'You cannot disable or demote your own account',
        );
      if (
        current.active &&
        current.role === 'ADMIN' &&
        (!active || role !== 'ADMIN') &&
        (await tx.user.count({ where: { role: 'ADMIN', active: true } })) <= 1
      )
        throw new ConflictException('Keep at least one active administrator');
      if (current.role === 'SUPERVISOR' && (!active || role !== 'SUPERVISOR')) {
        const [team, offences, incidents] = await Promise.all([
          tx.user.count({ where: { supervisorId: id, active: true } }),
          tx.offence.count({
            where: {
              supervisorId: id,
              status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] },
            },
          }),
          tx.incident.count({
            where: {
              supervisorId: id,
              status: { in: ['OPEN', 'IN_PROGRESS'] },
            },
          }),
        ]);
        if (team + offences + incidents > 0)
          throw new ConflictException(
            'Reassign this supervisor’s officers and open work first',
          );
      }
      const supervisorId =
        role === 'OFFICER' ? (dto.supervisorId ?? current.supervisorId) : null;
      await this.supervisor(tx, role, supervisorId);
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          role,
          active,
          supervisorId,
          passwordHash,
        },
        select: accountFields,
      });
      if (supervisorId && supervisorId !== current.supervisorId) {
        await tx.offence.updateMany({
          where: {
            officerId: id,
            status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] },
          },
          data: { supervisorId },
        });
        await tx.incident.updateMany({
          where: { reportedBy: id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          data: { supervisorId },
        });
      }
      if (
        passwordHash ||
        role !== current.role ||
        active !== current.active ||
        (dto.email && dto.email !== current.email)
      )
        await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          safeMetadata: {
            changedFields: Object.keys(dto),
            role,
            active,
            supervisorId,
          },
        },
      });
      return updated;
    });
  }
  @Get('categories')
  categories() {
    return this.db.offenceCategory.findMany({ orderBy: { code: 'asc' } });
  }
  @Post('categories')
  createCategory(@Req() req: StaffRequest, @Body() dto: CategoryDto) {
    return this.saveCategory(req, dto);
  }
  @Patch('categories/:id')
  updateCategory(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryDto,
  ) {
    return this.saveCategory(req, dto, id);
  }
  private saveCategory(req: StaffRequest, dto: CategoryDto, id?: string) {
    return serial(this.db, async (tx) => {
      if (id && !(await tx.offenceCategory.findUnique({ where: { id } })))
        throw new NotFoundException('Category not found');
      const result = id
        ? await tx.offenceCategory.update({ where: { id }, data: dto })
        : await tx.offenceCategory.create({ data: dto });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED',
          entityType: 'OffenceCategory',
          entityId: result.id,
        },
      });
      return result;
    });
  }
  @Get('settings')
  async settings() {
    return (
      (await this.db.systemSetting.findUnique({ where: { key: 'demo' } })) ?? {
        publicNotice: 'View current traffic notices and road information.',
      }
    );
  }
  @Patch('settings')
  settingsUpdate(@Req() req: StaffRequest, @Body() dto: SettingsDto) {
    return serial(this.db, async (tx) => {
      const result = await tx.systemSetting.upsert({
        where: { key: 'demo' },
        create: { key: 'demo', ...dto },
        update: dto,
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: 'SETTINGS_UPDATED',
          entityType: 'SystemSetting',
          entityId: 'demo',
        },
      });
      return result;
    });
  }
  @Get('security')
  async security() {
    const since = new Date(Date.now() - 86400000);
    const [activeUsers, activeSessions, failedLogins, events] =
      await Promise.all([
        this.db.user.count({ where: { active: true } }),
        this.db.session.count({
          where: { expiresAt: { gt: new Date() }, user: { active: true } },
        }),
        this.db.auditEvent.count({
          where: { action: 'LOGIN_FAILED', timestamp: { gte: since } },
        }),
        this.db.auditEvent.findMany({
          take: 50,
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          include: { actor: { select: { name: true, role: true } } },
        }),
      ]);
    return {
      activeUsers,
      activeSessions,
      failedLoginsLast24Hours: failedLogins,
      events,
      sessionMinutes: 30,
      loginLimitPerMinute: 5,
      permissions: {
        USER: [
          'Verified traffic tickets',
          'Payment simulation',
          'Road reports and notices',
        ],
        ADMIN: [
          'Accounts',
          'Roles and assignments',
          'Categories',
          'Settings',
          'Audit',
        ],
        SUPERVISOR: [
          'Assigned offences and incidents',
          'Checkpoints',
          'Analytics',
        ],
        OFFICER: [
          'Vehicle lookup',
          'Own offences and incidents',
          'Traffic tickets',
        ],
      },
    };
  }
}

import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, SessionGuard, StaffRequest } from './auth';
import {
  CreateOffenceDto,
  OffenceQuery,
  PageQuery,
  ReviewDto,
  VehicleQuery,
  UpdateOffenceDto,
} from './dto';
import { OffencesService, scope } from './offences.service';
import { PrismaService } from './prisma.service';

@ApiTags('Traffic')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller()
export class TrafficController {
  constructor(
    private readonly db: PrismaService,
    private readonly offences: OffencesService,
  ) {}
  @Get('vehicles')
  @Roles('OFFICER')
  async vehicles(@Query() query: VehicleQuery) {
    const vehicle = await this.db.vehicle.findUnique({
      where: { registrationNumber: query.registration },
      include: { driver: { select: { fullName: true, licenceStatus: true } } },
    });
    return { items: vehicle ? [vehicle] : [] };
  }
  @Get('vehicles/:id')
  @Roles('OFFICER')
  async vehicle(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.db.vehicle.findUnique({
      where: { id },
      include: { driver: { select: { fullName: true, licenceStatus: true } } },
    });
    if (!result) throw new NotFoundException('No matching records.');
    return result;
  }
  @Get('offence-categories')
  @Roles('OFFICER', 'SUPERVISOR', 'ADMIN')
  categories() {
    return this.db.offenceCategory.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
    });
  }
  @Post('offences')
  @Roles('OFFICER')
  create(@Req() req: StaffRequest, @Body() dto: CreateOffenceDto) {
    return this.offences.create(req.actor, dto);
  }
  @Get('offences')
  @Roles('OFFICER', 'SUPERVISOR')
  list(@Req() req: StaffRequest, @Query() query: OffenceQuery) {
    return this.offences.list(req.actor, query);
  }
  @Get('offences/:id')
  @Roles('OFFICER', 'SUPERVISOR')
  get(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.offences.get(req.actor, id);
  }
  @Post('offences/:id/submit')
  @Roles('OFFICER')
  submit(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.offences.submit(req.actor, id);
  }
  @Patch('offences/:id')
  @Roles('OFFICER')
  update(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOffenceDto,
  ) {
    return this.offences.update(req.actor, id, dto);
  }
  @Post('offences/:id/discard')
  @Roles('OFFICER')
  discard(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.offences.discard(req.actor, id);
  }
  @Post('offences/:id/review')
  @Roles('SUPERVISOR')
  review(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.offences.review(req.actor, id, dto);
  }
  @Get('tickets/:id')
  @Roles('OFFICER', 'SUPERVISOR')
  async ticket(
    @Req() req: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ticket = await this.db.ticket.findFirst({
      where: { id, offence: scope(req.actor) },
    });
    if (!ticket) throw new NotFoundException('Record not found');
    return {
      ...ticket,
      disclaimer: 'Academic Prototype',
    };
  }
  @Get('audit-events')
  @Roles('ADMIN')
  async audit(@Query() query: PageQuery) {
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.auditEvent.count(),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { Roles, SessionGuard, StaffRequest } from './auth';
import { PageQuery } from './dto';
import { OutcomeDto } from './motorist.controller';
import {
  ApplicationFilesService,
  applicationFileLimit,
  applicationAttachmentLimit,
} from './application-files';
import {
  ApplicationDto,
  ApplicationFeeDto,
  ApplicationReviewDto,
  ApplicationSubmitDto,
  VehicleCategoryDto,
} from './vehicle-application.dto';
import { VehicleApplicationsService } from './vehicle-applications.service';

@ApiTags('Vehicle applications')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller()
export class VehicleApplicationsController {
  constructor(
    private readonly service: VehicleApplicationsService,
    private readonly files: ApplicationFilesService,
  ) {}
  @Get('vehicle-categories') @Roles('USER', 'ADMIN') categories(
    @Req() r: StaffRequest,
  ) {
    return this.service.categories(r.actor.role === 'ADMIN');
  }
  @Post('admin/vehicle-categories') @Roles('ADMIN') category(
    @Req() r: StaffRequest,
    @Body() dto: VehicleCategoryDto,
  ) {
    return this.service.category(r.actor, dto);
  }
  @Patch('admin/vehicle-categories/:id') @Roles('ADMIN') updateCategory(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VehicleCategoryDto,
  ) {
    return this.service.category(r.actor, dto, id);
  }
  @Get('motorist/vehicle-applications/limits') @Roles('USER') limits() {
    return {
      maxFileBytes: applicationFileLimit(),
      maxAttachments: applicationAttachmentLimit(),
      supportedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    };
  }
  @Get('motorist/vehicle-applications') @Roles('USER') list(
    @Req() r: StaffRequest,
    @Query() q: PageQuery,
  ) {
    return this.service.list(r.actor, q);
  }
  @Get('supervisor/vehicle-applications') @Roles('SUPERVISOR') queue(
    @Req() r: StaffRequest,
    @Query() q: PageQuery,
  ) {
    return this.service.list(r.actor, q);
  }
  @Get('motorist/vehicle-applications/:id') @Roles('USER') detail(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(r.actor, id);
  }
  @Get('supervisor/vehicle-applications/:id') @Roles('SUPERVISOR') reviewDetail(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(r.actor, id);
  }
  @Post('motorist/vehicle-applications')
  @Roles('USER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  create(@Req() r: StaffRequest, @Body() dto: ApplicationDto) {
    return this.service.save(r.actor, dto);
  }
  @Patch('motorist/vehicle-applications/:id') @Roles('USER') save(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationDto,
  ) {
    return this.service.save(r.actor, dto, id);
  }
  @Post('motorist/vehicle-applications/:id/submit') @Roles('USER') submit(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationSubmitDto,
  ) {
    return this.service.submit(r.actor, id, dto);
  }
  @Post('supervisor/vehicle-applications/:id/review')
  @Roles('SUPERVISOR')
  review(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationReviewDto,
  ) {
    return this.service.review(r.actor, id, dto);
  }
  @Post('motorist/vehicle-applications/:id/files/:kind')
  @Roles('USER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // Transport ceiling; inspection applies the runtime configured limit.
      // Local .env is loaded after module imports, so do not snapshot it here.
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.files.upload(r.actor, id, kind, file);
  }
  @Post('motorist/vehicle-application-files/:id/remove') @Roles('USER') remove(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.remove(r.actor, id);
  }
  @Post('vehicle-application-files/:id/download')
  @Roles('USER', 'SUPERVISOR')
  download(@Req() r: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.download(r.actor, id);
  }
  @Post('motorist/vehicle-applications/:id/payments') @Roles('USER') fee(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationFeeDto,
  ) {
    return this.service.fee(r.actor, id, dto);
  }
  @Post('motorist/application-payments/:reference/outcome')
  @Roles('USER')
  outcome(
    @Req() r: StaffRequest,
    @Param('reference') reference: string,
    @Body() dto: OutcomeDto,
  ) {
    return this.service.outcome(r.actor, reference, dto.outcome);
  }
}

@ApiTags('Short-lived private application downloads')
@Controller('vehicle-application-files')
export class ApplicationDownloadController {
  constructor(private readonly files: ApplicationFilesService) {}
  @Get(':id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ) {
    const file = await this.files.content(id, expires ?? '', signature ?? '');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="application-document.${file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.bytes);
  }
}

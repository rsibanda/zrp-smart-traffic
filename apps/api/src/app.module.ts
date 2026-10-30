import {
  VehicleAccountsService,
  VehicleAccountsController,
  VehicleRequestsController,
} from './vehicle-accounts';
import { Module } from '@nestjs/common';
import { DriverPointsController, DriverPointsService } from './driver-points';
import { TicketQrController, TicketQrService } from './ticket-qr';
import {
  VehicleApplicationsController,
  ApplicationDownloadController,
} from './vehicle-applications.controller';
import { VehicleApplicationsService } from './vehicle-applications.service';
import { ApplicationFilesService } from './application-files';
import { SupervisorController } from './supervisor.controller';
import { MotoristController } from './motorist.controller';
import { PaymentsService } from './payments.service';
import { EvidenceStorage } from './evidence-storage';
import { HealthController } from './health.controller';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController, SessionGuard } from './auth';
import { OffencesService } from './offences.service';
import { PrismaService } from './prisma.service';
import { TrafficController } from './traffic.controller';
import { AdminController } from './admin.controller';
import { OperationsController } from './operations.controller';
import {
  PublicController,
  PublicManagementController,
} from './public.controller';
import { EvidenceController } from './evidence.controller';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])],
  controllers: [
    DriverPointsController,
    VehicleApplicationsController,
    ApplicationDownloadController,
    TicketQrController,
    SupervisorController,
    MotoristController,
    VehicleAccountsController,
    VehicleRequestsController,
    HealthController,
    AuthController,
    TrafficController,
    AdminController,
    OperationsController,
    PublicController,
    PublicManagementController,
    EvidenceController,
  ],
  providers: [
    DriverPointsService,
    VehicleApplicationsService,
    ApplicationFilesService,
    TicketQrService,
    PrismaService,
    VehicleAccountsService,
    SessionGuard,
    OffencesService,
    EvidenceStorage,
    PaymentsService,
  ],
})
export class AppModule {}

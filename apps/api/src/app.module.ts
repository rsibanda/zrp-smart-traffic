import {
  VehicleAccountsService,
  VehicleAccountsController,
  VehicleRequestsController,
} from './vehicle-accounts';
import { Module } from '@nestjs/common';
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
    PrismaService,
    VehicleAccountsService,
    SessionGuard,
    OffencesService,
    EvidenceStorage,
    PaymentsService,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController, SessionGuard } from './auth';
import { OffencesService } from './offences.service';
import { PrismaService } from './prisma.service';
import { TrafficController } from './traffic.controller';
import { AdminController } from './admin.controller';
import { OperationsController } from './operations.controller';
import { PublicController, PublicManagementController } from './public.controller';
import { EvidenceController } from './evidence.controller';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])],
  controllers: [AuthController, TrafficController, AdminController, OperationsController, PublicController, PublicManagementController, EvidenceController],
  providers: [PrismaService, SessionGuard, OffencesService],
})
export class AppModule {}

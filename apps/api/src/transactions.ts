import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/client';
import { PrismaService } from './prisma.service';
export async function serial<T>(db: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {return await db.$transaction(work, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});}
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
        if (['P2034', 'P2002', 'P2003'].includes(error.code)) throw new ConflictException('Record conflict. Refresh and retry.');
      }
      throw error;
    }
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { RestockStateController } from './restock-state.controller';
import { RestockStateService } from './restock-state.service';

@Module({
  imports: [PrismaModule],
  controllers: [RestockStateController],
  providers: [RestockStateService],
})
export class RestockStateModule {}

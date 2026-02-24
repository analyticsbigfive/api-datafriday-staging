import { Module } from '@nestjs/common';
import { AnalyseService } from './analyse.service';
import { AnalyseController } from './analyse.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyseController],
  providers: [AnalyseService],
  exports: [AnalyseService],
})
export class AnalyseModule {}

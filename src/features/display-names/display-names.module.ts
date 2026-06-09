import { Module } from '@nestjs/common';
import { DisplayNamesController } from './display-names.controller';
import { DisplayNamesService } from './display-names.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisplayNamesController],
  providers: [DisplayNamesService],
  exports: [DisplayNamesService],
})
export class DisplayNamesModule {}

import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { PinnedSpacesController } from './pinned-spaces.controller';
import { SpacesService } from './spaces.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SpacesController, PinnedSpacesController],
  providers: [SpacesService],
  exports: [SpacesService],
})
export class SpacesModule {}

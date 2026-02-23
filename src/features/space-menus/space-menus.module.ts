import { Module } from '@nestjs/common';
import { SpaceMenusController } from './space-menus.controller';
import { SpaceMenusService } from './space-menus.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SpaceMenusController],
  providers: [SpaceMenusService],
})
export class SpaceMenusModule {}

import { Module } from '@nestjs/common';
import { MenuComponentsService } from './menu-components.service';
import { MenuComponentsController } from './menu-components.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MenuComponentsController],
  providers: [MenuComponentsService],
  exports: [MenuComponentsService],
})
export class MenuComponentsModule {}

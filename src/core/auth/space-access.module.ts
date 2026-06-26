import { Global, Module } from '@nestjs/common';
import { SpaceAccessService } from './space-access.service';

/**
 * Module global exposant SpaceAccessService partout (guard global, spaces.service,
 * users.service) sans import par module. PrismaModule étant @Global, pas d'import requis.
 */
@Global()
@Module({
  providers: [SpaceAccessService],
  exports: [SpaceAccessService],
})
export class SpaceAccessModule {}

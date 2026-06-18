import { Module } from '@nestjs/common';
import { InventoryController, InventoryCountsController, SpaceInventoryCountsController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController, InventoryCountsController, SpaceInventoryCountsController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

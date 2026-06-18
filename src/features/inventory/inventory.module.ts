import { Module } from '@nestjs/common';
import { InventoryController, InventoryCountsController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController, InventoryCountsController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

@ApiTags('inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  // ':spaceId/latest' MUST come before ':spaceId/:eventId' — otherwise Fastify
  // would route GET /inventory/abc/latest to the /:eventId handler with eventId='latest'.
  @Get(':spaceId/latest')
  @ApiOperation({ summary: "Dernier snapshot d'inventaire d'un espace (tous events)" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({
    status: 200,
    description: 'Snapshot le plus récent — contient inventoryCounts + eventId',
  })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getLatestBySpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    this.logger.log(`GET /inventory/${spaceId}/latest`);
    return this.inventoryService.getLatestBySpace(spaceId, user.tenantId);
  }

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: "Dernier snapshot d'inventaire pour un espace+événement" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement" })
  @ApiResponse({ status: 200, description: 'Snapshot avec inventoryCounts' })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getBySpaceAndEvent(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/${eventId}`);
    return this.inventoryService.getBySpaceAndEvent(spaceId, eventId, user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Enregistrer un snapshot d'inventaire (append-only)" })
  @ApiResponse({ status: 200, description: 'Snapshot créé' })
  async upsertInventory(@Body() dto: CreateInventoryDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId}`);
    return this.inventoryService.upsertInventory(dto, user.tenantId, user.id);
  }
}

@ApiTags('inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory-counts')
export class InventoryCountsController {
  private readonly logger = new Logger(InventoryCountsController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert un comptage unitaire (par space+event+shop+item)' })
  @ApiResponse({ status: 200, description: 'Comptage upserted' })
  async saveInventoryCounts(@Body() dto: CreateInventoryCountDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory-counts itemId=${dto.itemId}`);
    return this.inventoryService.saveInventoryCounts(dto, user.tenantId, user.id);
  }
}

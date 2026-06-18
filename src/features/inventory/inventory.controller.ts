import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

@ApiTags('inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: 'Dernier snapshot d\'inventaire pour un espace+événement' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
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

  @Get(':spaceId/latest')
  @ApiOperation({ summary: 'Dernier snapshot d\'inventaire d\'un espace (tous events)' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Snapshot le plus récent' })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getLatestBySpace(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/latest`);
    return this.inventoryService.getLatestBySpace(spaceId, user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un snapshot d\'inventaire (append-only)' })
  @ApiResponse({ status: 200, description: 'Snapshot créé' })
  async upsertInventory(
    @Body() dto: CreateInventoryDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId}`);
    return this.inventoryService.upsertInventory(dto, user.tenantId, user.id);
  }
}

@ApiTags('inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('inventory-counts')
export class InventoryCountsController {
  private readonly logger = new Logger(InventoryCountsController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert un comptage unitaire (par space+event+shop+item)' })
  @ApiResponse({ status: 200, description: 'Comptage upserted' })
  async saveInventoryCounts(
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory-counts itemId=${dto.itemId}`);
    return this.inventoryService.saveInventoryCounts(dto, user.tenantId, user.id);
  }
}

// ─── Canonical routes (P2) ────────────────────────────────────────────────────

@ApiTags('inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('spaces/:spaceId/inventory-counts')
export class SpaceInventoryCountsController {
  private readonly logger = new Logger(SpaceInventoryCountsController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des comptages d\'un espace (filtrables par eventId)' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par événement' })
  @ApiResponse({ status: 200, description: 'Tableau de InventoryCount' })
  async list(
    @Param('spaceId') spaceId: string,
    @Query('eventId') eventId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.getCountsBySpace(spaceId, user.tenantId, eventId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Résumé de l\'inventaire (compté / total / par shop / par emplacement)' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'eventId', required: false })
  @ApiResponse({ status: 200, description: 'InventorySummary' })
  async summary(
    @Param('spaceId') spaceId: string,
    @Query('eventId') eventId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.getSummary(spaceId, user.tenantId, eventId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un comptage dans l\'espace' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 201, description: 'InventoryCount créé' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.createCount(spaceId, user.tenantId, dto, user.id);
  }

  @Patch(':countId')
  @ApiOperation({ summary: 'Mise à jour partielle d\'un comptage' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiParam({ name: 'countId', description: 'ID du comptage' })
  @ApiResponse({ status: 200, description: 'InventoryCount mis à jour' })
  async patch(
    @Param('countId') countId: string,
    @Body() patch: Partial<CreateInventoryCountDto>,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.patchCount(countId, user.tenantId, patch);
  }

  @Delete(':countId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un comptage' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiParam({ name: 'countId', description: 'ID du comptage' })
  @ApiResponse({ status: 204, description: 'Comptage supprimé' })
  async remove(
    @Param('countId') countId: string,
    @CurrentUser() user: any,
  ) {
    await this.inventoryService.deleteCount(countId, user.tenantId);
  }
}

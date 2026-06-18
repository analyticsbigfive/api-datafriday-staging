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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
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
  @ApiOperation({ summary: 'Inventaire d\'un événement donné' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Inventaire avec ses comptages' })
  @ApiResponse({ status: 404, description: 'Inventaire introuvable' })
  async getBySpaceAndEvent(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/${eventId} - tenant: ${user.tenantId}`);
    return this.inventoryService.getBySpaceAndEvent(spaceId, eventId, user.tenantId);
  }

  @Get(':spaceId/latest')
  @ApiOperation({ summary: 'Dernier inventaire d\'un espace' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Dernier inventaire (updatedAt desc)' })
  @ApiResponse({ status: 404, description: 'Aucun inventaire trouvé' })
  async getLatestBySpace(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/latest - tenant: ${user.tenantId}`);
    return this.inventoryService.getLatestBySpace(spaceId, user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer / upsert un inventaire (clé spaceId+eventId)' })
  @ApiResponse({ status: 200, description: 'Inventaire créé ou mis à jour' })
  async upsertInventory(
    @Body() dto: CreateInventoryDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory - spaceId=${dto.spaceId} tenant=${user.tenantId}`);
    return this.inventoryService.upsertInventory(dto, user.tenantId);
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
  @ApiOperation({ summary: 'Enregistrer les comptages d\'inventaire' })
  @ApiResponse({ status: 200, description: 'Comptages enregistrés, inventaire retourné' })
  async saveInventoryCounts(
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory-counts - tenant=${user.tenantId}`);
    return this.inventoryService.saveInventoryCounts(dto, user.tenantId);
  }
}

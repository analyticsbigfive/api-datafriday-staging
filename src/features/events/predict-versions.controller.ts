import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { PredictVersionsService } from './predict-versions.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import {
  CreatePredictVersionDto,
  PatchPredictVersionDto,
  SetDefaultVersionDto,
} from './dto/predict-version.dto';

@ApiTags('Event Predict Versions')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('events/:eventId/predict-versions')
export class PredictVersionsController {
  private readonly logger = new Logger(PredictVersionsController.name);

  constructor(private readonly service: PredictVersionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les versions de prédiction d\'un événement' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Liste des versions' })
  async findAll(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findAll(eventId, user.tenantId);
  }

  @RequirePermissions('menu.events.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une version de prédiction' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 201, description: 'Version créée' })
  async create(
    @Param('eventId') eventId: string,
    @Body() dto: CreatePredictVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(eventId, user.tenantId, dto, user.id);
  }

  // Doit être déclaré AVANT :versionId pour que NestJS le matche en premier
  @RequirePermissions('menu.events.manage')
  @Put('default')
  @ApiOperation({
    summary: 'Définir la version par défaut (exclusif)',
    description: 'Met isDefault=true sur versionId et false sur toutes les autres. versionId=null retire le défaut.',
  })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'defaultVersionId retourné' })
  async setDefault(
    @Param('eventId') eventId: string,
    @Body() dto: SetDefaultVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setDefault(eventId, dto.versionId, user.tenantId);
  }
}

@ApiTags('Event Predict Versions')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('predict-versions')
export class PredictVersionsStandaloneController {
  private readonly logger = new Logger(PredictVersionsStandaloneController.name);

  constructor(private readonly service: PredictVersionsService) {}

  @RequirePermissions('menu.events.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour partiellement une version de prédiction' })
  @ApiParam({ name: 'id', description: 'ID de la version' })
  @ApiResponse({ status: 200, description: 'Version mise à jour' })
  @ApiResponse({ status: 404, description: 'Version introuvable' })
  async patch(
    @Param('id') id: string,
    @Body() dto: PatchPredictVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.patch(id, user.tenantId, dto);
  }

  @RequirePermissions('menu.events.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une version de prédiction' })
  @ApiParam({ name: 'id', description: 'ID de la version' })
  @ApiResponse({ status: 204, description: 'Version supprimée' })
  @ApiResponse({ status: 404, description: 'Version introuvable' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.service.removeById(id, user.tenantId);
  }
}

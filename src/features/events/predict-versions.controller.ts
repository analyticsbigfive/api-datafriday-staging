import {
  Controller,
  Get,
  Post,
  Put,
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
import {
  CreatePredictVersionDto,
  UpdatePredictVersionDto,
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

  @Get(':versionId')
  @ApiOperation({ summary: 'Obtenir une version de prédiction' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiParam({ name: 'versionId', description: 'ID de la version' })
  @ApiResponse({ status: 200, description: 'Version trouvée' })
  @ApiResponse({ status: 404, description: 'Version introuvable' })
  async findOne(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findOne(eventId, versionId, user.tenantId);
  }

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

  @Put(':versionId')
  @ApiOperation({ summary: 'Mettre à jour une version de prédiction' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiParam({ name: 'versionId', description: 'ID de la version' })
  @ApiResponse({ status: 200, description: 'Version mise à jour' })
  async update(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdatePredictVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(eventId, versionId, user.tenantId, dto);
  }

  @Delete(':versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une version de prédiction' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiParam({ name: 'versionId', description: 'ID de la version' })
  @ApiResponse({ status: 204, description: 'Version supprimée' })
  async remove(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.remove(eventId, versionId, user.tenantId);
  }
}

@ApiTags('Event Predict Versions')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('events/:eventId/predict-default-version')
export class PredictDefaultVersionController {
  private readonly logger = new Logger(PredictDefaultVersionController.name);

  constructor(private readonly service: PredictVersionsService) {}

  @Put()
  @ApiOperation({
    summary: 'Définir la version de prédiction par défaut',
    description: 'Passe la version ciblée en isDefault=true et remet toutes les autres à false (transaction atomique).',
  })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Version définie comme default' })
  async setDefault(
    @Param('eventId') eventId: string,
    @Body() dto: SetDefaultVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setDefault(eventId, dto.versionId, user.tenantId);
  }
}

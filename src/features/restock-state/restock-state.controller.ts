import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RestockStateService } from './restock-state.service';
import { RestockStateDto } from './dto/restock-state.dto';

@ApiTags('Restock State')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('spaces/:spaceId/restock-state')
export class RestockStateController {
  constructor(private readonly service: RestockStateService) {}

  @Get()
  // Lecture : accessible au Réarmement comme au Tableau de Réarmement (logique OR).
  @RequirePermissions('front.fb.restock', 'front.fb.restockBoard')
  @ApiOperation({ summary: 'Lire l\'état de réarmement d\'un space' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiResponse({ status: 200, description: 'RestockState ou null si aucun état enregistré' })
  async get(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.service.get(spaceId, user.tenantId);
  }

  @Put()
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Enregistrer / mettre à jour l\'état de réarmement (upsert)' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiBody({
    type: RestockStateDto,
    description:
      'Snapshot du réarmement. Stocké comme blob jsonb opaque : champs additionnels tolérés, énumérations non figées (cf. docs/restockState.api.md).',
  })
  @ApiResponse({ status: 200, description: 'RestockState persisté (avec id et updatedAt)' })
  async upsert(
    // Body typé en objet libre (et non en RestockStateDto) : le ValidationPipe
    // global (whitelist + forbidNonWhitelisted) s'exécute AVANT tout pipe de
    // route et rejetterait/strippait les champs hors DTO. On garde donc le blob
    // opaque conformément au contrat, validé a minima côté service.
    @Param('spaceId') spaceId: string,
    @Body() state: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.upsert(spaceId, user.tenantId, state, user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Réinitialiser l\'état de réarmement' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiResponse({ status: 204, description: 'État supprimé (idempotent)' })
  async remove(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    await this.service.remove(spaceId, user.tenantId);
  }
}

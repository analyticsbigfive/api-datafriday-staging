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
  ApiResponse,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
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
  @ApiOperation({ summary: 'Lire l\'état de réarmement d\'un space' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiResponse({ status: 200, description: 'RestockState ou null si aucun état enregistré' })
  async get(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.service.get(spaceId, user.tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Enregistrer / mettre à jour l\'état de réarmement (upsert)' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiResponse({ status: 200, description: 'RestockState persisté (avec id et updatedAt)' })
  async upsert(
    @Param('spaceId') spaceId: string,
    @Body() dto: RestockStateDto,
    @CurrentUser() user: any,
  ) {
    return this.service.upsert(spaceId, user.tenantId, dto, user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Réinitialiser l\'état de réarmement' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiResponse({ status: 204, description: 'État supprimé (idempotent)' })
  async remove(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    await this.service.remove(spaceId, user.tenantId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { SpacesService } from './spaces.service';
import { SetPinnedSpacesDto } from './dto/set-pinned-spaces.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';

@ApiTags('Pinned Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('pinned-spaces')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class PinnedSpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  /**
   * Get all pinned spaces for current user
   */
  @Get()
  @ApiOperation({
    summary: 'Obtenir les espaces épinglés',
    description: 'Retourne la liste des espaces favoris/épinglés par l\'utilisateur courant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des espaces épinglés',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          image: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              configs: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getPinnedSpaces(@CurrentUser() user: any) {
    if (!user.tenantId) {
      throw new ForbiddenException('Organisation requise. Veuillez compléter l\'onboarding.');
    }
    return this.spacesService.getPinned(user.id, user.tenantId);
  }

  /**
   * Set pinned spaces for current user
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Définir les espaces épinglés',
    description: 'Remplace la liste des espaces favoris/épinglés par l\'utilisateur courant.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['spaceIds'],
      properties: {
        spaceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Liste des IDs des espaces à épingler',
          example: ['space-abc123', 'space-xyz789'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Liste mise à jour des espaces épinglés',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          image: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              configs: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async setPinnedSpaces(
    @CurrentUser() user: any,
    @Body() body: SetPinnedSpacesDto,
  ) {
    if (!user.tenantId) {
      throw new ForbiddenException('Organisation requise. Veuillez compléter l\'onboarding.');
    }
    return this.spacesService.setPinnedSpaces(user.id, user.tenantId, body.spaceIds || []);
  }
}

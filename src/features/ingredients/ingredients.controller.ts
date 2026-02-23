import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { IngredientsService } from './ingredients.service';

@ApiTags('Ingredients')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('ingredients')
export class IngredientsController {
  private readonly logger = new Logger(IngredientsController.name);

  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un ingrédient' })
  @ApiResponse({ status: 201, description: 'Ingrédient créé' })
  create(@Body() dto: any, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /ingredients - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.ingredientsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les ingrédients' })
  @ApiResponse({ status: 200, description: 'Liste des ingrédients' })
  findAll(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`GET /ingredients - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.ingredientsService.findAll(tenantId, page ? +page : 1, limit ? +limit : 100);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un ingrédient par ID' })
  @ApiResponse({ status: 200, description: 'Détails de l\'ingrédient' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.ingredientsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un ingrédient' })
  @ApiResponse({ status: 200, description: 'Ingrédient mis à jour' })
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.ingredientsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un ingrédient' })
  @ApiResponse({ status: 200, description: 'Ingrédient supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.ingredientsService.remove(id, tenantId);
  }
}

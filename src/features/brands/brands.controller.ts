import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { BrandsService } from './brands.service';

class CreateBrandDto {
  @IsString()
  name: string;
}

class UpdateBrandDto extends PartialType(CreateBrandDto) {}

@ApiTags('Brands')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('brand-names')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les brands du tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.brandsService.findAll(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un brand' })
  create(@Body() dto: CreateBrandDto, @CurrentTenant() tenantId: string) {
    return this.brandsService.create(dto.name, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un brand par id' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.brandsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un brand' })
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto, @CurrentTenant() tenantId: string) {
    return this.brandsService.update(id, dto.name, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un brand' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.brandsService.remove(id, tenantId);
  }
}

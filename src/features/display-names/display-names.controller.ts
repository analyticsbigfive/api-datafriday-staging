import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { DisplayNamesService } from './display-names.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

class CreateDisplayNameDto {
  @IsString()
  name: string;
}

@ApiTags('Display Names')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('display-names')
export class DisplayNamesController {
  constructor(private readonly displayNamesService: DisplayNamesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les display names du tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.displayNamesService.findAll(tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un display name' })
  create(@Body() dto: CreateDisplayNameDto, @CurrentTenant() tenantId: string) {
    return this.displayNamesService.create(dto.name, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un display name' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.displayNamesService.remove(id, tenantId);
  }
}

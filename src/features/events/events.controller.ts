import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventTypeDto } from './dto/create-event-type.dto';
import { UpdateEventTypeDto } from './dto/update-event-type.dto';
import { CreateEventCategoryDto } from './dto/create-event-category.dto';
import { UpdateEventCategoryDto } from './dto/update-event-category.dto';
import { CreateEventSubcategoryDto } from './dto/create-event-subcategory.dto';
import { UpdateEventSubcategoryDto } from './dto/update-event-subcategory.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';

@ApiTags('Events')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un événement' })
  @ApiResponse({ status: 201, description: 'Événement créé' })
  create(@Req() req, @Body() dto: CreateEventDto) {
    return this.eventsService.create(req.user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les événements' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Taille de page' })
  @ApiResponse({ status: 200, description: 'Liste paginée des événements' })
  findAll(@Req() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.eventsService.findAll(req.user.tenantId, +page || 1, +limit || 50);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un événement par ID' })
  @ApiParam({ name: 'id', description: 'ID de l’événement' })
  @ApiResponse({ status: 200, description: 'Détail de l’événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.eventsService.findOne(id, req.user.tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un événement' })
  @ApiParam({ name: 'id', description: 'ID de l’événement' })
  @ApiResponse({ status: 200, description: 'Événement mis à jour' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un événement' })
  @ApiParam({ name: 'id', description: 'ID de l’événement' })
  @ApiResponse({ status: 200, description: 'Événement supprimé' })
  remove(@Req() req, @Param('id') id: string) {
    return this.eventsService.remove(id, req.user.tenantId);
  }
}

@ApiTags('Event Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('event-types')
export class EventTypesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les types d’événements' })
  @ApiResponse({ status: 200, description: 'Liste des types d’événements' })
  findAll(@Req() req) { return this.eventsService.getEventTypes(req.user.tenantId); }

  @Post()
  @ApiOperation({ summary: 'Créer un type d’événement' })
  @ApiResponse({ status: 201, description: 'Type d’événement créé' })
  create(@Req() req, @Body() dto: CreateEventTypeDto) { return this.eventsService.createEventType(req.user.tenantId, dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un type d’événement' })
  @ApiParam({ name: 'id', description: 'ID du type d’événement' })
  @ApiResponse({ status: 200, description: 'Type d’événement mis à jour' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateEventTypeDto) { return this.eventsService.updateEventType(req.user.tenantId, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type d’événement' })
  @ApiParam({ name: 'id', description: 'ID du type d’événement' })
  @ApiResponse({ status: 200, description: 'Type d’événement supprimé' })
  remove(@Req() req, @Param('id') id: string) { return this.eventsService.deleteEventType(req.user.tenantId, id); }
}

@ApiTags('Event Categories')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('event-categories')
export class EventCategoriesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les catégories d’événements' })
  @ApiResponse({ status: 200, description: 'Liste des catégories d’événements' })
  findAll(@Req() req) { return this.eventsService.getEventCategories(req.user.tenantId); }

  @Post()
  @ApiOperation({ summary: 'Créer une catégorie d’événement' })
  @ApiResponse({ status: 201, description: 'Catégorie d’événement créée' })
  create(@Req() req, @Body() dto: CreateEventCategoryDto) { return this.eventsService.createEventCategory(req.user.tenantId, dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une catégorie d’événement' })
  @ApiParam({ name: 'id', description: 'ID de la catégorie d’événement' })
  @ApiResponse({ status: 200, description: 'Catégorie d’événement mise à jour' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateEventCategoryDto) { return this.eventsService.updateEventCategory(req.user.tenantId, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une catégorie d’événement' })
  @ApiParam({ name: 'id', description: 'ID de la catégorie d’événement' })
  @ApiResponse({ status: 200, description: 'Catégorie d’événement supprimée' })
  remove(@Req() req, @Param('id') id: string) { return this.eventsService.deleteEventCategory(req.user.tenantId, id); }
}

@ApiTags('Event Subcategories')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('event-subcategories')
export class EventSubcategoriesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les sous-catégories d’événements' })
  @ApiResponse({ status: 200, description: 'Liste des sous-catégories d’événements' })
  findAll(@Req() req) { return this.eventsService.getEventSubcategories(req.user.tenantId); }

  @Post()
  @ApiOperation({ summary: 'Créer une sous-catégorie d’événement' })
  @ApiResponse({ status: 201, description: 'Sous-catégorie d’événement créée' })
  create(@Req() req, @Body() dto: CreateEventSubcategoryDto) { return this.eventsService.createEventSubcategory(req.user.tenantId, dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une sous-catégorie d’événement' })
  @ApiParam({ name: 'id', description: 'ID de la sous-catégorie d’événement' })
  @ApiResponse({ status: 200, description: 'Sous-catégorie d’événement mise à jour' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateEventSubcategoryDto) { return this.eventsService.updateEventSubcategory(req.user.tenantId, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une sous-catégorie d’événement' })
  @ApiParam({ name: 'id', description: 'ID de la sous-catégorie d’événement' })
  @ApiResponse({ status: 200, description: 'Sous-catégorie d’événement supprimée' })
  remove(@Req() req, @Param('id') id: string) { return this.eventsService.deleteEventSubcategory(req.user.tenantId, id); }
}

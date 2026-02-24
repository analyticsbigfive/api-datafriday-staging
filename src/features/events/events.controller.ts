import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateEventDto) {
    return this.eventsService.create(req.user.tenantId, dto);
  }

  @Get()
  findAll(@Req() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.eventsService.findAll(req.user.tenantId, +page || 1, +limit || 50);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.eventsService.findOne(id, req.user.tenantId);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.eventsService.remove(id, req.user.tenantId);
  }
}

@ApiTags('Event Types')
@ApiBearerAuth()
@Controller('event-types')
export class EventTypesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Req() req) { return this.eventsService.getEventTypes(req.user.tenantId); }

  @Post()
  create(@Req() req, @Body() dto: { name: string }) { return this.eventsService.createEventType(req.user.tenantId, dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name: string }) { return this.eventsService.updateEventType(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.eventsService.deleteEventType(id); }
}

@ApiTags('Event Categories')
@ApiBearerAuth()
@Controller('event-categories')
export class EventCategoriesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Req() req) { return this.eventsService.getEventCategories(req.user.tenantId); }

  @Post()
  create(@Req() req, @Body() dto: { name: string; eventTypeId: string }) { return this.eventsService.createEventCategory(req.user.tenantId, dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string; eventTypeId?: string }) { return this.eventsService.updateEventCategory(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.eventsService.deleteEventCategory(id); }
}

@ApiTags('Event Subcategories')
@ApiBearerAuth()
@Controller('event-subcategories')
export class EventSubcategoriesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Req() req) { return this.eventsService.getEventSubcategories(req.user.tenantId); }

  @Post()
  create(@Req() req, @Body() dto: { name: string; eventCategoryId: string }) { return this.eventsService.createEventSubcategory(req.user.tenantId, dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string; eventCategoryId?: string }) { return this.eventsService.updateEventSubcategory(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.eventsService.deleteEventSubcategory(id); }
}

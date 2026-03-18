import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

  private readonly includeRelations = {
    eventType: true,
    eventCategory: true,
    eventSubcategory: true,
  };

  private async findOwnedEventTypeOrThrow(id: string, tenantId: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id, tenantId },
    });

    if (!eventType) {
      throw new NotFoundException(`Event type ${id} not found`);
    }

    return eventType;
  }

  private async findOwnedEventCategoryOrThrow(id: string, tenantId: string) {
    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: { id, tenantId },
    });

    if (!eventCategory) {
      throw new NotFoundException(`Event category ${id} not found`);
    }

    return eventCategory;
  }

  private async findOwnedEventSubcategoryOrThrow(id: string, tenantId: string) {
    const eventSubcategory = await this.prisma.eventSubcategory.findFirst({
      where: { id, tenantId },
    });

    if (!eventSubcategory) {
      throw new NotFoundException(`Event subcategory ${id} not found`);
    }

    return eventSubcategory;
  }

  async create(tenantId: string, dto: CreateEventDto) {
    this.logger.log(`Creating event "${dto.name}" for tenant ${tenantId}`);
    return this.prisma.event.create({
      data: {
        tenantId,
        name: dto.name,
        eventDate: new Date(dto.eventDate),
        spaceId: dto.spaceId,
        configurationId: dto.configurationId,
        eventTypeId: dto.eventTypeId,
        eventCategoryId: dto.eventCategoryId,
        eventSubcategoryId: dto.eventSubcategoryId,
        location: dto.location,
        spaceName: dto.spaceName,
        sessions: dto.sessions,
        numberOfSessions: dto.numberOfSessions,
        hasOpeningAct: dto.hasOpeningAct,
        hasIntermission: dto.hasIntermission,
        status: dto.status || 'draft',
      },
      include: this.includeRelations,
    });
  }

  async findAll(tenantId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where: { tenantId },
        orderBy: { eventDate: 'desc' },
        include: this.includeRelations,
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where: { tenantId } }),
    ]);
    return {
      data: events,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, tenantId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId },
      include: this.includeRelations,
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async update(id: string, tenantId: string, dto: UpdateEventDto) {
    await this.findOne(id, tenantId);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventDate !== undefined && { eventDate: new Date(dto.eventDate) }),
        ...(dto.spaceId !== undefined && { spaceId: dto.spaceId }),
        ...(dto.configurationId !== undefined && { configurationId: dto.configurationId }),
        ...(dto.eventTypeId !== undefined && { eventTypeId: dto.eventTypeId }),
        ...(dto.eventCategoryId !== undefined && { eventCategoryId: dto.eventCategoryId }),
        ...(dto.eventSubcategoryId !== undefined && { eventSubcategoryId: dto.eventSubcategoryId }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.spaceName !== undefined && { spaceName: dto.spaceName }),
        ...(dto.sessions !== undefined && { sessions: dto.sessions }),
        ...(dto.numberOfSessions !== undefined && { numberOfSessions: dto.numberOfSessions }),
        ...(dto.hasOpeningAct !== undefined && { hasOpeningAct: dto.hasOpeningAct }),
        ...(dto.hasIntermission !== undefined && { hasIntermission: dto.hasIntermission }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: this.includeRelations,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.event.delete({ where: { id } });
  }

  // ── Event Types CRUD ──

  async getEventTypes(tenantId: string) {
    return this.prisma.eventType.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: { categories: true },
    });
  }

  async createEventType(tenantId: string, data: { name: string }) {
    return this.prisma.eventType.create({
      data: { name: data.name, tenantId },
    });
  }

  async updateEventType(tenantId: string, id: string, data: { name?: string }) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
    return this.prisma.eventType.update({ where: { id }, data: { name: data.name } });
  }

  async deleteEventType(tenantId: string, id: string) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
    return this.prisma.eventType.delete({ where: { id } });
  }

  // ── Event Categories CRUD ──

  async getEventCategories(tenantId: string) {
    return this.prisma.eventCategory.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: { subcategories: true },
    });
  }

  async createEventCategory(tenantId: string, data: { name: string; eventTypeId: string }) {
    return this.prisma.eventCategory.create({
      data: { name: data.name, eventTypeId: data.eventTypeId, tenantId },
    });
  }

  async updateEventCategory(tenantId: string, id: string, data: { name?: string; eventTypeId?: string }) {
    await this.findOwnedEventCategoryOrThrow(id, tenantId);

    if (data.eventTypeId !== undefined) {
      const eventType = await this.prisma.eventType.findFirst({
        where: {
          id: data.eventTypeId,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!eventType) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'eventTypeId',
              constraints: {
                exists: 'eventTypeId must reference an accessible event type',
              },
              messages: ['eventTypeId must reference an accessible event type'],
              value: data.eventTypeId,
            },
          ],
        });
      }
    }

    return this.prisma.eventCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.eventTypeId !== undefined && {
          eventType: {
            connect: { id: data.eventTypeId },
          },
        }),
      },
    });
  }

  async deleteEventCategory(tenantId: string, id: string) {
    await this.findOwnedEventCategoryOrThrow(id, tenantId);
    return this.prisma.eventCategory.delete({ where: { id } });
  }

  // ── Event Subcategories CRUD ──

  async getEventSubcategories(tenantId: string) {
    return this.prisma.eventSubcategory.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
    });
  }

  async createEventSubcategory(
    tenantId: string,
    data: { name: string; eventCategoryId?: string; categoryId?: string },
  ) {
    const eventCategoryId = data.eventCategoryId ?? data.categoryId;

    if (!eventCategoryId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'eventCategoryId',
            constraints: {
              isNotEmpty: 'eventCategoryId should not be empty',
              isString: 'eventCategoryId must be a string',
            },
            messages: [
              'eventCategoryId should not be empty',
              'eventCategoryId must be a string',
            ],
            value: eventCategoryId,
          },
        ],
      });
    }

    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: {
        id: eventCategoryId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!eventCategory) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'eventCategoryId',
            constraints: {
              exists: 'eventCategoryId must reference an accessible event category',
            },
            messages: ['eventCategoryId must reference an accessible event category'],
            value: eventCategoryId,
          },
        ],
      });
    }

    return this.prisma.eventSubcategory.create({
      data: { name: data.name, eventCategoryId, tenantId },
    });
  }

  async updateEventSubcategory(
    tenantId: string,
    id: string,
    data: { name?: string; eventCategoryId?: string; categoryId?: string },
  ) {
    await this.findOwnedEventSubcategoryOrThrow(id, tenantId);

    const eventCategoryId = data.eventCategoryId ?? data.categoryId;

    if (eventCategoryId !== undefined) {
      const eventCategory = await this.prisma.eventCategory.findFirst({
        where: {
          id: eventCategoryId,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!eventCategory) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'eventCategoryId',
              constraints: {
                exists: 'eventCategoryId must reference an accessible event category',
              },
              messages: ['eventCategoryId must reference an accessible event category'],
              value: eventCategoryId,
            },
          ],
        });
      }
    }

    return this.prisma.eventSubcategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(eventCategoryId !== undefined && {
          eventCategory: {
            connect: { id: eventCategoryId },
          },
        }),
      },
    });
  }

  async deleteEventSubcategory(tenantId: string, id: string) {
    await this.findOwnedEventSubcategoryOrThrow(id, tenantId);
    return this.prisma.eventSubcategory.delete({ where: { id } });
  }
}

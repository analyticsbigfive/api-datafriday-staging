import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../core/database/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;

  const mockEvent = {
    id: 'evt-1',
    name: 'Festival 2024',
    eventDate: new Date('2024-07-15'),
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    status: 'draft',
    location: 'Paris',
    eventType: null,
    eventCategory: null,
    eventSubcategory: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    event: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    eventType: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    eventCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    eventSubcategory: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01' };
      mockPrisma.event.create.mockResolvedValue({ ...mockEvent, ...dto });

      const result = await service.create('tenant-1', dto as any);
      expect(result.name).toBe('New Event');
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', name: 'New Event' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([mockEvent]);
      mockPrisma.event.count.mockResolvedValue(1);

      const result = await service.findAll('tenant-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should respect pagination params', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(0);

      await service.findAll('tenant-1', 2, 10);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an event by ID', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await service.findOne('evt-1', 'tenant-1');
      expect(result.id).toBe('evt-1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      await expect(service.findOne('invalid', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, name: 'Updated' });

      const result = await service.update('evt-1', 'tenant-1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if event not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.update('invalid', 'tenant-1', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an event', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.delete.mockResolvedValue(mockEvent);

      const result = await service.remove('evt-1', 'tenant-1');
      expect(result.id).toBe('evt-1');
    });
  });

  describe('getEventTypes', () => {
    it('should return event types for tenant', async () => {
      const types = [{ id: 'type-1', name: 'Concert', categories: [] }];
      mockPrisma.eventType.findMany.mockResolvedValue(types);

      const result = await service.getEventTypes('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Concert');
    });
  });

  describe('createEventType', () => {
    it('should create event type', async () => {
      const newType = { id: 'type-2', name: 'Festival', tenantId: 'tenant-1' };
      mockPrisma.eventType.create.mockResolvedValue(newType);

      const result = await service.createEventType('tenant-1', { name: 'Festival' });
      expect(result.name).toBe('Festival');
    });
  });

  describe('getEventCategories', () => {
    it('should return categories for tenant', async () => {
      const cats = [{ id: 'cat-1', name: 'Rock', subcategories: [] }];
      mockPrisma.eventCategory.findMany.mockResolvedValue(cats);

      const result = await service.getEventCategories('tenant-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateEventCategory', () => {
    it('should update category name only', async () => {
      mockPrisma.eventCategory.update.mockResolvedValue({ id: 'cat-1', name: 'Motos' });

      const result = await service.updateEventCategory('cat-1', { name: 'Motos' });

      expect(result.name).toBe('Motos');
      expect(mockPrisma.eventCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { name: 'Motos' },
      });
    });

    it('should update category relation using eventType.connect', async () => {
      mockPrisma.eventCategory.update.mockResolvedValue({ id: 'cat-1', name: 'Motos' });

      await service.updateEventCategory('cat-1', {
        name: 'Motos',
        eventTypeId: 'type-2',
      });

      expect(mockPrisma.eventCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: {
          name: 'Motos',
          eventType: {
            connect: { id: 'type-2' },
          },
        },
      });
    });
  });

  describe('getEventSubcategories', () => {
    it('should return subcategories for tenant', async () => {
      mockPrisma.eventSubcategory.findMany.mockResolvedValue([]);

      const result = await service.getEventSubcategories('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('updateEventSubcategory', () => {
    it('should update subcategory name only', async () => {
      mockPrisma.eventSubcategory.update.mockResolvedValue({ id: 'sub-1', name: 'Cross' });

      const result = await service.updateEventSubcategory('sub-1', { name: 'Cross' });

      expect(result.name).toBe('Cross');
      expect(mockPrisma.eventSubcategory.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { name: 'Cross' },
      });
    });

    it('should update subcategory relation using eventCategory.connect', async () => {
      mockPrisma.eventSubcategory.update.mockResolvedValue({ id: 'sub-1', name: 'Cross' });

      await service.updateEventSubcategory('sub-1', {
        name: 'Cross',
        eventCategoryId: 'cat-2',
      });

      expect(mockPrisma.eventSubcategory.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          name: 'Cross',
          eventCategory: {
            connect: { id: 'cat-2' },
          },
        },
      });
    });
  });

  describe('createEventSubcategory', () => {
    it('should create subcategory with eventCategoryId', async () => {
      mockPrisma.eventSubcategory.create.mockResolvedValue({ id: 'sub-1', name: 'Race F1' });

      const result = await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
        eventCategoryId: 'cat-1',
      });

      expect(result.name).toBe('Race F1');
      expect(mockPrisma.eventSubcategory.create).toHaveBeenCalledWith({
        data: {
          name: 'Race F1',
          eventCategoryId: 'cat-1',
          tenantId: 'tenant-1',
        },
      });
    });

    it('should create subcategory with categoryId alias', async () => {
      mockPrisma.eventSubcategory.create.mockResolvedValue({ id: 'sub-1', name: 'Race F1' });

      await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
        categoryId: 'cat-1',
      });

      expect(mockPrisma.eventSubcategory.create).toHaveBeenCalledWith({
        data: {
          name: 'Race F1',
          eventCategoryId: 'cat-1',
          tenantId: 'tenant-1',
        },
      });
    });

    it('should throw detailed BadRequestException when category is missing', async () => {
      await expect(
        service.createEventSubcategory('tenant-1', {
          name: 'Race F1',
        }),
      ).rejects.toThrow(BadRequestException);

      await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
      }).catch((error) => {
        expect(error.getResponse()).toEqual(
          expect.objectContaining({
            message: 'Validation failed',
            errors: expect.arrayContaining([
              expect.objectContaining({
                property: 'eventCategoryId',
                messages: expect.arrayContaining([
                  'eventCategoryId should not be empty',
                  'eventCategoryId must be a string',
                ]),
              }),
            ]),
          }),
        );
      });
    });
  });
});

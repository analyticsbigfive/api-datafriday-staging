import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

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

  describe('getEventSubcategories', () => {
    it('should return subcategories for tenant', async () => {
      mockPrisma.eventSubcategory.findMany.mockResolvedValue([]);

      const result = await service.getEventSubcategories('tenant-1');
      expect(result).toEqual([]);
    });
  });
});

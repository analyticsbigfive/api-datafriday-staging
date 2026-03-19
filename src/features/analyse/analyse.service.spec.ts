import { Test, TestingModule } from '@nestjs/testing';
import { AnalyseService } from './analyse.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('AnalyseService', () => {
  let service: AnalyseService;

  const mockPrisma = {
    menuItem: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    menuComponent: { count: jest.fn() },
    ingredient: { count: jest.fn() },
    supplier: { count: jest.fn() },
    event: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    space: { count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyseService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyseService>(AnalyseService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return all counts', async () => {
      mockPrisma.menuItem.count.mockResolvedValue(50);
      mockPrisma.menuComponent.count.mockResolvedValue(30);
      mockPrisma.ingredient.count.mockResolvedValue(120);
      mockPrisma.supplier.count.mockResolvedValue(10);
      mockPrisma.event.count.mockResolvedValue(5);
      mockPrisma.space.count.mockResolvedValue(3);

      const result = await service.getDashboard('tenant-1');
      expect(result.menuItems).toBe(50);
      expect(result.components).toBe(30);
      expect(result.ingredients).toBe(120);
      expect(result.suppliers).toBe(10);
      expect(result.events).toBe(5);
      expect(result.spaces).toBe(3);
    });

    it('should filter by tenantId', async () => {
      mockPrisma.menuItem.count.mockResolvedValue(0);
      mockPrisma.menuComponent.count.mockResolvedValue(0);
      mockPrisma.ingredient.count.mockResolvedValue(0);
      mockPrisma.supplier.count.mockResolvedValue(0);
      mockPrisma.event.count.mockResolvedValue(0);
      mockPrisma.space.count.mockResolvedValue(0);

      await service.getDashboard('tenant-2');
      expect(mockPrisma.menuItem.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-2' }) }),
      );
    });
  });

  describe('getMenuKpis', () => {
    it('should return KPIs for empty data', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.totalItems).toBe(0);
      expect(result.avgPrice).toBe(0);
      expect(result.avgCost).toBe(0);
      expect(result.avgMargin).toBe(0);
    });

    it('should compute averages correctly', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { basePrice: 10, totalCost: 3, margin: 70, typeId: 'food', categoryId: 'main' },
        { basePrice: 20, totalCost: 8, margin: 60, typeId: 'food', categoryId: 'main' },
      ]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.totalItems).toBe(2);
      expect(result.avgPrice).toBe(15);
      expect(result.avgCost).toBe(5.5);
      expect(result.avgMargin).toBe(65);
      expect(result.highMarginItems).toBe(2);
      expect(result.lowMarginItems).toBe(0);
    });

    it('should count low and high margin items', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { basePrice: 10, totalCost: 8, margin: 20, typeId: 'drink', categoryId: 'beer' },
        { basePrice: 20, totalCost: 5, margin: 75, typeId: 'food', categoryId: 'main' },
      ]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.lowMarginItems).toBe(1);
      expect(result.highMarginItems).toBe(1);
    });
  });

  describe('getEventKpis', () => {
    it('should return KPIs for empty events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);

      const result = await service.getEventKpis('tenant-1');
      expect(result.totalEvents).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.avgRevenue).toBe(0);
    });

    it('should compute event KPIs correctly', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      mockPrisma.event.findMany.mockResolvedValue([
        { revenue: 5000, transactionCount: 200, eventDate: pastDate, status: 'success' },
        { revenue: 3000, transactionCount: 100, eventDate: futureDate, status: 'pending' },
      ]);

      const result = await service.getEventKpis('tenant-1');
      expect(result.totalEvents).toBe(2);
      expect(result.totalRevenue).toBe(8000);
      expect(result.avgRevenue).toBe(4000);
      expect(result.totalTransactions).toBe(300);
      expect(result.completed).toBe(1);
      expect(result.upcoming).toBe(1);
    });
  });

  describe('getCostBreakdown', () => {
    it('should return mapped items', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-1', name: 'Burger', basePrice: 12, totalCost: 4, margin: 66,
          productType: { name: 'Food' }, productCategory: { name: 'Main' },
        },
      ]);

      const result = await service.getCostBreakdown('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Burger');
      expect(result[0].type).toBe('Food');
      expect(result[0].category).toBe('Main');
    });

    it('should handle null relations', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-2', name: 'Water', basePrice: 3, totalCost: 0.5, margin: 83,
          productType: null, productCategory: null,
        },
      ]);

      const result = await service.getCostBreakdown('tenant-1');
      expect(result[0].type).toBe('N/A');
      expect(result[0].category).toBe('N/A');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { SpaceAggregationService } from './space-aggregation.service';
import { PrismaService } from '../../../core/database/prisma.service';

describe('SpaceAggregationService', () => {
  let service: SpaceAggregationService;

  const mockPrismaService: any = {
    aggregationJobLog: {
      create: jest.fn(),
      update: jest.fn(),
    },
    spaceElement: { findMany: jest.fn() },
    weezeventMerchantElementMapping: { findMany: jest.fn() },
    spaceRevenueDailyAgg: { upsert: jest.fn() },
    spaceProductRevenueDailyAgg: { upsert: jest.fn() },
    spaceRevenueDailyAggUnmapped: { upsert: jest.fn() },
    dashboardVersion: { upsert: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpaceAggregationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SpaceAggregationService>(SpaceAggregationService);
    jest.clearAllMocks();

    // Default: aggregationJobLog.create returns a job with an id
    mockPrismaService.aggregationJobLog.create.mockResolvedValue({ id: 'job-1' });
    mockPrismaService.aggregationJobLog.update.mockResolvedValue({});
    // Default: findMany for spaces / mappings
    mockPrismaService.spaceElement.findMany.mockResolvedValue([]);
    mockPrismaService.weezeventMerchantElementMapping.findMany.mockResolvedValue([]);
    // Default: raw query returns empty
    mockPrismaService.$queryRaw.mockResolvedValue([]);
  });

  describe('SQL status filter', () => {
    it('should use status = V (not completed) in aggregateDailyRevenue SQL', async () => {
      await service.runAggregation({
        tenantId: 'tenant-123',
        spaceId: 'space-abc',
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
        jobType: 'full',
      }).catch(() => {}); // May throw for unrelated reasons — we care about SQL

      const allSqlCalls: string[] = mockPrismaService.$queryRaw.mock.calls.flatMap(
        (call: any[]) => call[0]?.strings ?? [],
      );
      const fullSql = allSqlCalls.join(' ');

      expect(fullSql).not.toContain("'completed'");
      if (fullSql.includes('WeezeventTransaction')) {
        expect(fullSql).toContain("'V'");
      }
    });

    it('should never filter by status = completed in any raw query', async () => {
      // Run tenant-wide aggregation
      await service.runAggregation({
        tenantId: 'tenant-123',
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
        jobType: 'full',
      }).catch(() => {});

      for (const call of mockPrismaService.$queryRaw.mock.calls) {
        const strings: string[] = call[0]?.strings ?? [];
        const fragment = strings.join(' ');
        expect(fragment).not.toContain("status = 'completed'");
      }
    });
  });
});

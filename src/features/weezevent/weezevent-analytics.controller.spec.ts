import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventAnalyticsController } from './weezevent-analytics.controller';
import { PrismaService } from '../../core/database/prisma.service';

describe('WeezeventAnalyticsController', () => {
    let controller: WeezeventAnalyticsController;
    let prisma: PrismaService;

    const mockUser = {
        id: 'user-123',
        tenantId: 'tenant-123',
        email: 'test@example.com',
    };

    const mockPrismaService = {
        weezeventTransaction: {
            findMany: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [WeezeventAnalyticsController],
            providers: [
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        controller = module.get<WeezeventAnalyticsController>(WeezeventAnalyticsController);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getSalesByProduct', () => {
        it('should return sales aggregated by product', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    tenantId: 'tenant-123',
                    amount: 100,
                    items: [
                        {
                            id: 'item-1',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 2,
                            unitPrice: 10,
                            product: { id: 'prod-1', name: 'Burger' },
                        },
                        {
                            id: 'item-2',
                            productId: 'prod-2',
                            productName: 'Fries',
                            quantity: 1,
                            unitPrice: 5,
                            product: { id: 'prod-2', name: 'Fries' },
                        },
                    ],
                },
                {
                    id: 'tx-2',
                    tenantId: 'tenant-123',
                    amount: 50,
                    items: [
                        {
                            id: 'item-3',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 1,
                            unitPrice: 10,
                            product: { id: 'prod-1', name: 'Burger' },
                        },
                    ],
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getSalesByProduct(mockUser);

            expect(result.data).toHaveLength(2);
            expect(result.data[0]).toEqual({
                productId: 'prod-1',
                productName: 'Burger',
                quantity: 3,
                totalAmount: 30,
                transactionCount: 2,
            });
            expect(result.data[1]).toEqual({
                productId: 'prod-2',
                productName: 'Fries',
                quantity: 1,
                totalAmount: 5,
                transactionCount: 1,
            });
            expect(result.meta.total).toBe(2);
        });

        it('should filter by eventId when provided', async () => {
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);

            await controller.getSalesByProduct(mockUser, 'event-123');

            expect(mockPrismaService.weezeventTransaction.findMany).toHaveBeenCalledWith({
                where: {
                    tenantId: 'tenant-123',
                    eventId: 'event-123',
                },
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            });
        });

        it('should filter by date range when provided', async () => {
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);

            await controller.getSalesByProduct(mockUser, undefined, '2026-01-01', '2026-12-31');

            expect(mockPrismaService.weezeventTransaction.findMany).toHaveBeenCalledWith({
                where: {
                    tenantId: 'tenant-123',
                    transactionDate: {
                        gte: new Date('2026-01-01'),
                        lte: new Date('2026-12-31'),
                    },
                },
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            });
        });

        it('should handle empty transactions', async () => {
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);

            const result = await controller.getSalesByProduct(mockUser);

            expect(result.data).toEqual([]);
            expect(result.meta.total).toBe(0);
        });
    });

    describe('getSalesByEvent', () => {
        it('should return sales aggregated by event', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    eventId: 'event-1',
                    eventName: 'Festival 2026',
                    amount: 100,
                    items: [{ id: 'item-1' }, { id: 'item-2' }],
                    event: { id: 'event-1', name: 'Festival 2026' },
                },
                {
                    id: 'tx-2',
                    eventId: 'event-1',
                    eventName: 'Festival 2026',
                    amount: 50,
                    items: [{ id: 'item-3' }],
                    event: { id: 'event-1', name: 'Festival 2026' },
                },
                {
                    id: 'tx-3',
                    eventId: 'event-2',
                    eventName: 'Concert 2026',
                    amount: 75,
                    items: [{ id: 'item-4' }],
                    event: { id: 'event-2', name: 'Concert 2026' },
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getSalesByEvent(mockUser);

            expect(result.data).toHaveLength(2);
            expect(result.data[0]).toEqual({
                eventId: 'event-1',
                eventName: 'Festival 2026',
                totalAmount: 150,
                transactionCount: 2,
                itemCount: 3,
            });
            expect(result.data[1]).toEqual({
                eventId: 'event-2',
                eventName: 'Concert 2026',
                totalAmount: 75,
                transactionCount: 1,
                itemCount: 1,
            });
        });

        it('should handle transactions without eventId', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    eventId: null,
                    eventName: null,
                    amount: 100,
                    items: [{ id: 'item-1' }],
                    event: null,
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getSalesByEvent(mockUser);

            expect(result.data).toHaveLength(1);
            expect(result.data[0].eventId).toBe('unknown');
            expect(result.data[0].eventName).toBe('Unknown Event');
        });
    });

    describe('getMarginAnalysis', () => {
        it('should calculate margins for mapped products', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    tenantId: 'tenant-123',
                    amount: 100,
                    items: [
                        {
                            id: 'item-1',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 2,
                            unitPrice: 10,
                            product: {
                                id: 'prod-1',
                                mappings: [
                                    {
                                        id: 'mapping-1',
                                        menuItemId: 'menu-1',
                                        menuItem: {
                                            id: 'menu-1',
                                            name: 'Burger Classic',
                                            totalCost: 3.5,
                                        },
                                    },
                                ],
                            },
                        },
                        {
                            id: 'item-2',
                            productId: 'prod-2',
                            productName: 'Fries',
                            quantity: 1,
                            unitPrice: 5,
                            product: {
                                id: 'prod-2',
                                mappings: [],
                            },
                        },
                    ],
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getMarginAnalysis(mockUser);

            expect(result.summary.totalSales).toBe(25);
            expect(result.summary.totalCost).toBe(7);
            expect(result.summary.totalMargin).toBe(18);
            expect(result.summary.marginPercent).toBe(72);
            expect(result.summary.mappedItems).toBe(1);
            expect(result.summary.unmappedItems).toBe(1);
            expect(result.summary.mappingRate).toBe(50);

            expect(result.productMargins).toHaveLength(1);
            expect(result.productMargins[0]).toEqual({
                productId: 'prod-1',
                productName: 'Burger',
                menuItemId: 'menu-1',
                menuItemName: 'Burger Classic',
                quantity: 2,
                sales: 20,
                cost: 7,
                margin: 13,
                marginPercent: 65,
            });
        });

        it('should handle all unmapped products', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    items: [
                        {
                            id: 'item-1',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 1,
                            unitPrice: 10,
                            product: {
                                id: 'prod-1',
                                mappings: [],
                            },
                        },
                    ],
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getMarginAnalysis(mockUser);

            expect(result.summary.totalSales).toBe(10);
            expect(result.summary.totalCost).toBe(0);
            expect(result.summary.mappedItems).toBe(0);
            expect(result.summary.unmappedItems).toBe(1);
            expect(result.summary.mappingRate).toBe(0);
            expect(result.productMargins).toHaveLength(0);
        });

        it('should handle empty transactions', async () => {
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);

            const result = await controller.getMarginAnalysis(mockUser);

            expect(result.summary.totalSales).toBe(0);
            expect(result.summary.totalCost).toBe(0);
            expect(result.summary.mappingRate).toBe(0);
            expect(result.productMargins).toEqual([]);
        });
    });

    describe('getTopProducts', () => {
        it('should return top N products by revenue', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    items: [
                        {
                            id: 'item-1',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 10,
                            unitPrice: 10,
                            product: { id: 'prod-1', category: 'Food' },
                        },
                        {
                            id: 'item-2',
                            productId: 'prod-2',
                            productName: 'Fries',
                            quantity: 5,
                            unitPrice: 5,
                            product: { id: 'prod-2', category: 'Food' },
                        },
                        {
                            id: 'item-3',
                            productId: 'prod-3',
                            productName: 'Soda',
                            quantity: 3,
                            unitPrice: 3,
                            product: { id: 'prod-3', category: 'Drink' },
                        },
                    ],
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getTopProducts(mockUser, 2);

            expect(result.data).toHaveLength(2);
            expect(result.data[0]).toEqual({
                productId: 'prod-1',
                productName: 'Burger',
                category: 'Food',
                quantity: 10,
                revenue: 100,
                averagePrice: 10,
            });
            expect(result.data[1]).toEqual({
                productId: 'prod-2',
                productName: 'Fries',
                category: 'Food',
                quantity: 5,
                revenue: 25,
                averagePrice: 5,
            });
            expect(result.meta.limit).toBe(2);
            expect(result.meta.total).toBe(3);
        });

        it('should use default limit of 10', async () => {
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);

            const result = await controller.getTopProducts(mockUser);

            expect(result.meta.limit).toBe(10);
        });

        it('should calculate average price correctly', async () => {
            const mockTransactions = [
                {
                    id: 'tx-1',
                    items: [
                        {
                            id: 'item-1',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 2,
                            unitPrice: 10,
                            product: { id: 'prod-1', category: null },
                        },
                    ],
                },
                {
                    id: 'tx-2',
                    items: [
                        {
                            id: 'item-2',
                            productId: 'prod-1',
                            productName: 'Burger',
                            quantity: 1,
                            unitPrice: 12,
                            product: { id: 'prod-1', category: null },
                        },
                    ],
                },
            ];

            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue(mockTransactions);

            const result = await controller.getTopProducts(mockUser);

            expect(result.data[0].quantity).toBe(3);
            expect(result.data[0].revenue).toBe(32);
            expect(result.data[0].averagePrice).toBeCloseTo(10.67, 2);
        });
    });
});

import { BadRequestException } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';

describe('MenuItemsService product categories', () => {
  const mockPrisma = {
    productCategory: {
      create: jest.fn(),
    },
  } as any;

  const mockRedis = {} as any;

  let service: MenuItemsService;

  beforeEach(() => {
    service = new MenuItemsService(mockPrisma, mockRedis);
    jest.clearAllMocks();
  });

  it('creates a product category with typeId', async () => {
    mockPrisma.productCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Food' });

    const result = await service.createProductCategory('Food', 'type-1', 'tenant-1');

    expect(result.name).toBe('Food');
    expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Food',
        tenantId: 'tenant-1',
        type: {
          connect: { id: 'type-1' },
        },
      },
      include: { type: true },
    });
  });

  it('creates a product category with productTypeId alias', async () => {
    mockPrisma.productCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Food' });

    await service.createProductCategory('Food', undefined as any, 'tenant-1', 'type-1');

    expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Food',
        tenantId: 'tenant-1',
        type: {
          connect: { id: 'type-1' },
        },
      },
      include: { type: true },
    });
  });

  it('throws a detailed BadRequestException when type is missing', async () => {
    await expect(service.createProductCategory('Food', undefined as any, 'tenant-1')).rejects.toThrow(
      BadRequestException,
    );

    await service.createProductCategory('Food', undefined as any, 'tenant-1').catch((error) => {
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          message: 'Validation failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              property: 'typeId',
              messages: expect.arrayContaining([
                'typeId should not be empty',
                'typeId must be a string',
              ]),
            }),
          ]),
        }),
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PinnedSpacesController } from './pinned-spaces.controller';
import { SpacesService } from './spaces.service';

describe('PinnedSpacesController', () => {
  let controller: PinnedSpacesController;
  let spacesService: SpacesService;

  const mockSpacesService = {
    getPinned: jest.fn(),
    setPinnedSpaces: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PinnedSpacesController],
      providers: [
        {
          provide: SpacesService,
          useValue: mockSpacesService,
        },
      ],
    }).compile();

    controller = module.get<PinnedSpacesController>(PinnedSpacesController);
    spacesService = module.get<SpacesService>(SpacesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPinnedSpaces', () => {
    it('should return pinned spaces for current user', async () => {
      const pinnedSpaces = [
        {
          id: 'space-1',
          name: 'Space 1',
          image: null,
          createdAt: new Date(),
          _count: { configs: 2 },
        },
        {
          id: 'space-2',
          name: 'Space 2',
          image: 'https://example.com/image.jpg',
          createdAt: new Date(),
          _count: { configs: 1 },
        },
      ];

      mockSpacesService.getPinned.mockResolvedValue(pinnedSpaces);

      const result = await controller.getPinnedSpaces(mockUser);

      expect(result).toEqual(pinnedSpaces);
      expect(mockSpacesService.getPinned).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.tenantId,
      );
    });

    it('should return empty array if no pinned spaces', async () => {
      mockSpacesService.getPinned.mockResolvedValue([]);

      const result = await controller.getPinnedSpaces(mockUser);

      expect(result).toEqual([]);
      expect(mockSpacesService.getPinned).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.tenantId,
      );
    });
  });

  describe('setPinnedSpaces', () => {
    it('should set pinned spaces for current user', async () => {
      const spaceIds = ['space-1', 'space-2', 'space-3'];
      const updatedPinnedSpaces = [
        { id: 'space-1', name: 'Space 1', image: null },
        { id: 'space-2', name: 'Space 2', image: null },
        { id: 'space-3', name: 'Space 3', image: null },
      ];

      mockSpacesService.setPinnedSpaces.mockResolvedValue(updatedPinnedSpaces);

      const result = await controller.setPinnedSpaces(mockUser, { spaceIds });

      expect(result).toEqual(updatedPinnedSpaces);
      expect(mockSpacesService.setPinnedSpaces).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.tenantId,
        spaceIds,
      );
    });

    it('should handle empty spaceIds array', async () => {
      const spaceIds: string[] = [];

      mockSpacesService.setPinnedSpaces.mockResolvedValue([]);

      const result = await controller.setPinnedSpaces(mockUser, { spaceIds });

      expect(result).toEqual([]);
      expect(mockSpacesService.setPinnedSpaces).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.tenantId,
        [],
      );
    });

    it('should handle undefined spaceIds', async () => {
      mockSpacesService.setPinnedSpaces.mockResolvedValue([]);

      const result = await controller.setPinnedSpaces(mockUser, { spaceIds: undefined } as any);

      expect(result).toEqual([]);
      expect(mockSpacesService.setPinnedSpaces).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.tenantId,
        [],
      );
    });
  });
});

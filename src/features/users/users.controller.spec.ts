import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockTenantId = 'tenant-123';
  const mockCurrentUser = {
    id: 'user-123',
    email: 'admin@test.com',
    role: 'ADMIN',
  };

  const mockUser = {
    id: 'user-456',
    email: 'user@test.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.STAFF,
    tenantId: 'tenant-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockUsersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    getStatistics: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    invite: jest.fn(),
    changeRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createDto = {
        email: 'new@test.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: UserRole.STAFF,
      };
      mockUsersService.create.mockResolvedValue({ ...mockUser, ...createDto });

      const result = await controller.create(mockTenantId, createDto);

      expect(result.email).toBe('new@test.com');
      expect(mockUsersService.create).toHaveBeenCalledWith(mockTenantId, createDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const paginatedResult = {
        data: [mockUser],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockUsersService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll(mockTenantId, {});

      expect(result).toEqual(paginatedResult);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(mockTenantId, {});
    });

    it('should apply filters', async () => {
      const query = { search: 'john', role: UserRole.STAFF };
      mockUsersService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(mockTenantId, query);

      expect(mockUsersService.findAll).toHaveBeenCalledWith(mockTenantId, query);
    });
  });

  describe('getStatistics', () => {
    it('should return user statistics', async () => {
      const stats = {
        total: 50,
        byRole: { ADMIN: 5, MANAGER: 10, STAFF: 30, VIEWER: 5 },
        active: 45,
        inactive: 5,
      };
      mockUsersService.getStatistics.mockResolvedValue(stats);

      const result = await controller.getStatistics(mockTenantId);

      expect(result).toEqual(stats);
    });
  });

  describe('getMe', () => {
    it('should return current user profile', async () => {
      mockUsersService.findOne.mockResolvedValue(mockCurrentUser);

      const result = await controller.getMe(mockCurrentUser, mockTenantId);

      expect(mockUsersService.findOne).toHaveBeenCalledWith(
        mockCurrentUser.id,
        mockTenantId,
      );
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-456', mockTenantId);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-456', mockTenantId);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateDto = { firstName: 'Johnny' };
      const updatedUser = { ...mockUser, ...updateDto };
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update('user-456', mockTenantId, updateDto);

      expect(result.firstName).toBe('Johnny');
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user-456',
        mockTenantId,
        updateDto,
      );
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      mockUsersService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove('user-456', mockTenantId, mockCurrentUser);

      expect(mockUsersService.remove).toHaveBeenCalledWith(
        'user-456',
        mockTenantId,
        mockCurrentUser.id,
      );
    });
  });

  describe('invite', () => {
    it('should invite a user', async () => {
      const inviteDto = {
        email: 'invite@test.com',
        role: UserRole.STAFF,
      };
      mockUsersService.invite.mockResolvedValue({
        success: true,
        message: 'Invitation sent',
        user: { id: 'user-new', email: 'invite@test.com' },
      });

      const result = await controller.invite(mockTenantId, mockCurrentUser, inviteDto);

      expect(result.success).toBe(true);
      expect(mockUsersService.invite).toHaveBeenCalledWith(
        mockTenantId,
        inviteDto,
        mockCurrentUser.id,
      );
    });
  });

  describe('changeRole', () => {
    it('should change user role', async () => {
      const changeRoleDto = { role: UserRole.MANAGER };
      mockUsersService.changeRole.mockResolvedValue({
        ...mockUser,
        role: UserRole.MANAGER,
      });

      const result = await controller.changeRole(
        'user-456',
        mockTenantId,
        mockCurrentUser,
        changeRoleDto,
      );

      expect(result.role).toBe(UserRole.MANAGER);
      expect(mockUsersService.changeRole).toHaveBeenCalledWith(
        'user-456',
        mockTenantId,
        changeRoleDto,
        mockCurrentUser.id,
        mockCurrentUser.role,
      );
    });
  });
});

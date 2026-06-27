import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { SupabaseAdminService } from '../../core/supabase/supabase-admin.service';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    userTenant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    userSpaceAccess: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    space: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    role: {
      findFirst: jest.fn(),
    },
    // create() englobe user + userTenant + userSpaceAccess dans une transaction.
    $transaction: jest.fn((cb: any) => cb(mockPrismaService)),
  };

  const mockJwtDatabaseStrategy = {
    invalidateUserCache: jest.fn(),
  };

  const mockSupabaseAdmin = {
    createUser: jest.fn(),
    inviteUserByEmail: jest.fn(),
    deleteUser: jest.fn(),
    getUserById: jest.fn(),
    getUserByEmail: jest.fn().mockResolvedValue(null),
    getAuthInfoByIds: jest.fn().mockResolvedValue(new Map()),
    isEnabled: jest.fn().mockReturnValue(true),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    role: UserRole.VIEWER,
    tenantId: mockTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtDatabaseStrategy,
          useValue: mockJwtDatabaseStrategy,
        },
        {
          provide: SupabaseAdminService,
          useValue: mockSupabaseAdmin,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user (provisioned in Supabase, DB id = Supabase id)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-viewer' });
      mockSupabaseAdmin.createUser.mockResolvedValue({ id: mockUserId, email: 'test@example.com' });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.create.mockResolvedValue({});

      const dto = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await service.create(mockTenantId, dto);

      expect(result).toBeDefined();
      expect(result.email).toBe(dto.email);
      expect(mockSupabaseAdmin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email }),
      );
      // DB user id must be the Supabase user id
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: mockUserId }) }),
      );
      expect(mockPrismaService.userTenant.create).toHaveBeenCalled();
    });

    it('should roll back the Supabase account if DB creation fails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue(null);
      mockSupabaseAdmin.createUser.mockResolvedValue({ id: mockUserId, email: 'test@example.com' });
      mockPrismaService.user.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(mockTenantId, { email: 'test@example.com', firstName: 'John', lastName: 'Doe' }),
      ).rejects.toThrow('db down');
      expect(mockSupabaseAdmin.deleteUser).toHaveBeenCalledWith(mockUserId);
    });

    it('should throw ConflictException if user exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const dto = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(service.create(mockTenantId, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('invite', () => {
    it('sends a Supabase invitation, uses the Supabase id, and prefills name + role', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-staff', systemKey: UserRole.STAFF });
      mockSupabaseAdmin.inviteUserByEmail.mockResolvedValue({ id: 'supa-invite-id', email: 'new@x.com' });
      mockPrismaService.user.create.mockResolvedValue({ id: 'supa-invite-id', email: 'new@x.com' });
      mockPrismaService.userTenant.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('https://app.test/accept-invite');

      const result = await service.invite(
        mockTenantId,
        { email: 'new@x.com', firstName: 'Ada', lastName: 'Lovelace', roleId: 'role-staff' },
        'admin-1',
      );

      expect(result.success).toBe(true);
      expect(mockSupabaseAdmin.inviteUserByEmail).toHaveBeenCalledWith(
        'new@x.com',
        expect.objectContaining({ redirectTo: 'https://app.test/accept-invite' }),
      );
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'supa-invite-id',
            firstName: 'Ada',
            lastName: 'Lovelace',
            roleId: 'role-staff',
          }),
        }),
      );
    });

    it('rolls back the Supabase account if DB creation fails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-staff', systemKey: UserRole.STAFF });
      mockSupabaseAdmin.getUserByEmail.mockResolvedValue(null);
      mockSupabaseAdmin.inviteUserByEmail.mockResolvedValue({ id: 'supa-invite-id' });
      mockPrismaService.user.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.invite(mockTenantId, { email: 'new@x.com', roleId: 'role-staff' }, 'admin-1'),
      ).rejects.toThrow('db down');
      expect(mockSupabaseAdmin.deleteUser).toHaveBeenCalledWith('supa-invite-id');
    });

    it('attaches an existing Supabase account (no DB profile) without sending an email', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-staff', systemKey: UserRole.STAFF });
      mockSupabaseAdmin.getUserByEmail.mockResolvedValue({ id: 'existing-supa-id', email: 'exist@x.com' });
      mockPrismaService.user.findUnique.mockResolvedValue(null); // no DB profile yet
      mockPrismaService.user.create.mockResolvedValue({ id: 'existing-supa-id', email: 'exist@x.com' });
      mockPrismaService.userTenant.create.mockResolvedValue({});

      const result = await service.invite(mockTenantId, { email: 'exist@x.com', roleId: 'role-staff' }, 'admin-1');

      expect(result.success).toBe(true);
      expect(mockSupabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled(); // no new email
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: 'existing-supa-id' }) }),
      );
    });

    it('rejects with a clear 409 when the account belongs to another organization', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-staff', systemKey: UserRole.STAFF });
      mockSupabaseAdmin.getUserByEmail.mockResolvedValue({ id: 'existing-supa-id', email: 'exist@x.com' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-supa-id', tenantId: 'other-tenant' });

      await expect(
        service.invite(mockTenantId, { email: 'exist@x.com', roleId: 'role-staff' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockSupabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
    });
  });

  describe('reinvite', () => {
    const pendingUser = {
      ...mockUser,
      firstName: 'Invited',
      lastName: 'User',
      roleId: 'role-staff',
      allSpacesAccess: false,
    };

    it('re-sends a fresh invitation for a pending user, preserving role + spaces', async () => {
      // 1st findFirst: lookup by id (the pending user). 2nd findFirst (inside invite): existing-by-email → null.
      mockPrismaService.user.findFirst
        .mockResolvedValueOnce(pendingUser)
        .mockResolvedValueOnce(null);
      mockSupabaseAdmin.getUserById.mockResolvedValue({ id: mockUserId, last_sign_in_at: null });
      mockPrismaService.userTenant.count.mockResolvedValue(1);
      mockPrismaService.userSpaceAccess.findMany.mockResolvedValue([{ spaceId: 's1' }]);
      mockPrismaService.user.delete.mockResolvedValue(pendingUser);
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-staff', systemKey: UserRole.STAFF });
      mockSupabaseAdmin.getUserByEmail.mockResolvedValue(null);
      mockSupabaseAdmin.inviteUserByEmail.mockResolvedValue({ id: 'new-supa-id', email: mockUser.email });
      mockPrismaService.user.create.mockResolvedValue({ id: 'new-supa-id', email: mockUser.email });
      mockPrismaService.userTenant.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('https://app.test/accept-invite');

      const result = await service.reinvite(mockUserId, mockTenantId, 'admin-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain(mockUser.email);
      expect(mockSupabaseAdmin.deleteUser).toHaveBeenCalledWith(mockUserId);
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(mockSupabaseAdmin.inviteUserByEmail).toHaveBeenCalled();
    });

    it('refuses to re-invite a user who already signed in (409)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(pendingUser);
      mockSupabaseAdmin.getUserById.mockResolvedValue({ id: mockUserId, last_sign_in_at: '2026-01-01T00:00:00Z' });

      await expect(service.reinvite(mockUserId, mockTenantId, 'admin-1')).rejects.toThrow(ConflictException);
      expect(mockSupabaseAdmin.deleteUser).not.toHaveBeenCalled();
    });

    it('refuses to re-invite a multi-organization account (409)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(pendingUser);
      mockSupabaseAdmin.getUserById.mockResolvedValue({ id: mockUserId, last_sign_in_at: null });
      mockPrismaService.userTenant.count.mockResolvedValue(2);

      await expect(service.reinvite(mockUserId, mockTenantId, 'admin-1')).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is not in the tenant', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.reinvite('nope', mockTenantId, 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll(mockTenantId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('enriches users with a connection status from Supabase', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);
      mockSupabaseAdmin.getAuthInfoByIds.mockResolvedValue(
        new Map([[mockUserId, { lastSignInAt: '2026-06-01T10:00:00Z', invitedAt: null, emailConfirmedAt: '2026-05-01T00:00:00Z' }]]),
      );

      const result = await service.findAll(mockTenantId, { page: 1, limit: 20 });

      expect(result.data[0].status).toBe('active');
      expect(result.data[0].lastSignInAt).toBe('2026-06-01T10:00:00Z');
    });

    it('marks users as pending when they never signed in, unknown when Supabase has no info', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);
      mockSupabaseAdmin.getAuthInfoByIds.mockResolvedValue(
        new Map([[mockUserId, { lastSignInAt: null, invitedAt: '2026-06-01T00:00:00Z', emailConfirmedAt: null }]]),
      );

      const pending = await service.findAll(mockTenantId, { page: 1, limit: 20 });
      expect(pending.data[0].status).toBe('pending');

      mockSupabaseAdmin.getAuthInfoByIds.mockResolvedValue(new Map());
      const unknown = await service.findAll(mockTenantId, { page: 1, limit: 20 });
      expect(unknown.data[0].status).toBe('unknown');
    });

    it('should filter by search term', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAll(mockTenantId, { search: 'john', page: 1, limit: 20 });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('should filter by role', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAll(mockTenantId, { role: UserRole.ADMIN, page: 1, limit: 20 });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: UserRole.ADMIN,
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findOne(mockUserId, mockTenantId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUserId);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockTenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
      });

      const result = await service.update(mockUserId, mockTenantId, { firstName: 'Jane' });

      expect(result.firstName).toBe('Jane');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a user and tear down the Supabase account when no memberships remain', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.userTenant.deleteMany.mockResolvedValue({});
      mockPrismaService.userTenant.count.mockResolvedValue(0);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove(mockUserId, mockTenantId, 'other-user');

      expect(result.success).toBe(true);
      expect(mockPrismaService.user.delete).toHaveBeenCalled();
      expect(mockSupabaseAdmin.deleteUser).toHaveBeenCalledWith(mockUserId);
      expect(mockJwtDatabaseStrategy.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
    });

    it('should keep the Supabase account when the user still belongs to another org', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.userTenant.deleteMany.mockResolvedValue({});
      mockPrismaService.userTenant.count.mockResolvedValue(1);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      await service.remove(mockUserId, mockTenantId, 'other-user');

      expect(mockSupabaseAdmin.deleteUser).not.toHaveBeenCalled();
    });

    it('should not allow deleting yourself', async () => {
      await expect(service.remove(mockUserId, mockTenantId, mockUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not allow deleting organization owner', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: true });

      await expect(service.remove(mockUserId, mockTenantId, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('changeRole', () => {
    it('should change user role (legacy `role` enum)', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: UserRole.MANAGER });
      mockPrismaService.userTenant.updateMany.mockResolvedValue({});

      const result = await service.changeRole(
        mockUserId,
        mockTenantId,
        { role: UserRole.MANAGER },
        'other-user',
        UserRole.ADMIN,
      );

      expect(result.role).toBe(UserRole.MANAGER);
      expect(mockJwtDatabaseStrategy.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
    });

    it('should change user role via roleId (dynamic RBAC role)', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue({
        id: 'role-manager',
        name: 'MANAGER',
        systemKey: UserRole.MANAGER,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: UserRole.MANAGER });
      mockPrismaService.userTenant.updateMany.mockResolvedValue({});

      const result = await service.changeRole(
        mockUserId,
        mockTenantId,
        { roleId: 'role-manager' },
        'other-user',
        UserRole.ADMIN,
      );

      expect(result.role).toBe(UserRole.MANAGER);
      expect(result.roleId).toBe('role-manager');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { role: UserRole.MANAGER, roleId: 'role-manager' },
      });
    });

    it('should throw NotFoundException when roleId does not belong to the tenant', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue(null);

      await expect(
        service.changeRole(mockUserId, mockTenantId, { roleId: 'unknown-role' }, 'other-user', UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not allow changing own role', async () => {
      await expect(
        service.changeRole(mockUserId, mockTenantId, { role: UserRole.ADMIN }, mockUserId, UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should require either roleId or role', async () => {
      await expect(
        service.changeRole(mockUserId, mockTenantId, {}, 'other-user', UserRole.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatistics', () => {
    it('should return user statistics', async () => {
      mockPrismaService.user.count.mockResolvedValue(10);
      mockPrismaService.user.groupBy.mockResolvedValue([
        { role: UserRole.ADMIN, _count: 2 },
        { role: UserRole.VIEWER, _count: 8 },
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getStatistics(mockTenantId);

      expect(result.total).toBe(10);
      expect(result.byRole.ADMIN).toBe(2);
      expect(result.byRole.VIEWER).toBe(8);
      expect(result.recentUsers).toHaveLength(1);
    });
  });
});

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateWeezeventConfigDto } from './dto/update-weezevent-config.dto';
import { EncryptionService } from '../../core/encryption/encryption.service';
import { randomBytes } from 'crypto';

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) { }

  /**
   * Generate a unique invitation code (8 characters, uppercase alphanumeric)
   */
  private generateInvitationCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Ensure the invitation code is unique
   */
  private async generateUniqueInvitationCode(): Promise<string> {
    let code: string;
    let exists = true;
    let attempts = 0;
    
    while (exists && attempts < 10) {
      code = this.generateInvitationCode();
      const existing = await this.prisma.tenant.findFirst({
        where: { invitationCode: code },
      });
      exists = !!existing;
      attempts++;
    }
    
    if (exists) {
      throw new ConflictException('Could not generate unique invitation code. Please try again.');
    }
    
    return code;
  }

  /**
   * Check if user exists in DB and get their status
   */
  async getUserStatus(supabaseUserId: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: supabaseUserId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
          },
        },
      },
    });

    if (user) {
      return {
        exists: true,
        hasOrganization: !!user.tenantId,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        tenant: user.tenant,
      };
    }

    // User doesn't exist in DB yet
    return {
      exists: false,
      hasOrganization: false,
      user: null,
      tenant: null,
    };
  }

  /**
   * Join an existing tenant by slug
   * Creates user record and links to the tenant
   */
  async joinTenant(
    supabaseUserId: string,
    email: string,
    tenantSlug: string,
    firstName?: string,
    lastName?: string,
  ) {
    // Find tenant by slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException(`Organization with slug "${tenantSlug}" not found`);
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id: supabaseUserId },
    });

    if (existingUser) {
      throw new ConflictException('User already exists. Use a different endpoint to switch tenants.');
    }

    // Create user and link to tenant
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: supabaseUserId,
          email,
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
          fullName: firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0],
          tenantId: tenant.id,
          role: 'STAFF', // Default role when joining existing tenant
        },
      });

      // Create UserTenant relation
      await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'STAFF',
          isOwner: false,
        },
      });

      return {
        message: 'Successfully joined organization',
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    });
  }

  /**
   * Join an existing tenant using an invitation code
   * This is the SECURE way for users to join organizations
   */
  async joinByInvitationCode(
    supabaseUserId: string,
    email: string,
    invitationCode: string,
    firstName?: string,
    lastName?: string,
  ) {
    if (!invitationCode || invitationCode.trim().length === 0) {
      throw new BadRequestException('Invitation code is required');
    }

    // Find tenant by invitation code
    const tenant = await this.prisma.tenant.findFirst({
      where: { 
        invitationCode: invitationCode.toUpperCase().trim(),
        invitationEnabled: true,
        status: { not: 'SUSPENDED' },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Invalid or expired invitation code');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id: supabaseUserId },
    });

    if (existingUser) {
      throw new ConflictException('You are already a member of an organization');
    }

    // Create user and link to tenant
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: supabaseUserId,
          email,
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
          fullName: firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0],
          tenantId: tenant.id,
          role: 'STAFF', // Default role when joining via invitation
        },
      });

      // Create UserTenant relation
      await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'STAFF',
          isOwner: false,
        },
      });

      return {
        message: 'Successfully joined organization',
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    });
  }

  /**
   * Create organization and admin user in a single transaction
   * Called after Supabase authentication
   */
  async createOrganization(
    supabaseUserId: string,
    email: string,
    dto: CreateOrganizationDto,
  ) {
    // Generate unique slug from organization name
    const baseSlug = this.generateSlug(dto.organizationName);
    const slug = await this.ensureUniqueSlug(baseSlug);
    
    // Generate unique invitation code
    const invitationCode = await this.generateUniqueInvitationCode();

    // Create tenant, user, and UserTenant relation in transaction
    return this.prisma.$transaction(async (tx) => {
      // Create tenant with business info and invitation code
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organizationName,
          slug,
          plan: 'FREE',
          status: 'TRIAL',
          invitationCode,
          invitationEnabled: true,
          organizationType: dto.organizationType,
          email: dto.organizationEmail,
          phone: dto.organizationPhone,
          siret: dto.siret,
          address: dto.address,
          city: dto.city,
          postalCode: dto.postalCode,
          country: dto.country || 'France',
          numberOfEmployees: dto.numberOfEmployees,
          numberOfSpaces: dto.numberOfSpaces,
          paymentMethod: dto.paymentMethod,
        },
      });

      // Check if user already exists
      let user = await tx.user.findUnique({
        where: { id: supabaseUserId },
      });

      if (!user) {
        // Create user if doesn't exist
        user = await tx.user.create({
          data: {
            id: supabaseUserId,
            email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            fullName: `${dto.firstName} ${dto.lastName}`,
            tenantId: tenant.id,
            role: 'ADMIN',
          },
        });
      }

      // Create UserTenant relation (user is owner)
      await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'ADMIN',
          isOwner: true,
        },
      });

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
          organizationType: tenant.organizationType,
          email: tenant.email,
          phone: tenant.phone,
          invitationCode: tenant.invitationCode, // Include for owner to share
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    });
  }

  /**
   * Update Weezevent configuration for a tenant
   * Client Secret will be encrypted before storage
   */
  async updateWeezeventConfig(
    tenantId: string,
    config: UpdateWeezeventConfigDto,
  ) {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    // Encrypt the client secret
    const encryptedSecret = this.encryptionService.encrypt(
      config.weezeventClientSecret,
    );

    // Update tenant with Weezevent config
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        weezeventClientId: config.weezeventClientId,
        weezeventClientSecret: encryptedSecret,
        weezeventOrganizationId: config.weezeventOrganizationId,
        weezeventEnabled: config.weezeventEnabled ?? true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        weezeventClientId: true,
        weezeventOrganizationId: true,
        weezeventEnabled: true,
        // Never return the encrypted secret
      },
    });
  }

  /**
   * Get Weezevent configuration for a tenant
   * Returns decrypted credentials for internal use
   */
  async getWeezeventConfig(tenantId: string): Promise<{
    clientId: string;
    clientSecret: string;
    enabled: boolean;
  } | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        weezeventClientId: true,
        weezeventOrganizationId: true,
        weezeventEnabled: true,
        weezeventClientSecret: true, // Needed for internal logic, but not returned to API
      },
    });

    if (!tenant?.weezeventClientId || !tenant?.weezeventClientSecret) {
      return null;
    }

    // Decrypt the client secret
    const decryptedSecret = this.encryptionService.decrypt(
      tenant.weezeventClientSecret,
    );

    return {
      clientId: tenant.weezeventClientId,
      clientSecret: decryptedSecret,
      enabled: tenant.weezeventEnabled,
    };
  }

  /**
   * Update webhook configuration for a tenant
   */
  async updateWebhookConfig(
    tenantId: string,
    config: { weezeventWebhookSecret?: string; weezeventWebhookEnabled?: boolean },
  ) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        weezeventWebhookSecret: config.weezeventWebhookSecret,
        weezeventWebhookEnabled: config.weezeventWebhookEnabled,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        weezeventWebhookEnabled: true,
        // Never return the secret
      },
    });
  }

  /**
   * Get webhook configuration (public info only)
   */
  async getWebhookConfigPublic(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        weezeventWebhookEnabled: true,
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return {
      enabled: tenant.weezeventWebhookEnabled,
      configured: !!tenant.weezeventWebhookEnabled,
    };
  }

  /**
   * Get public Weezevent configuration (without secret)
   * Safe to expose via API
   */
  async getWeezeventConfigPublic(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        weezeventClientId: true,
        weezeventOrganizationId: true,
        weezeventEnabled: true,
      },
    });

    if (!tenant?.weezeventClientId) {
      throw new NotFoundException('Weezevent configuration not found');
    }

    return {
      clientId: tenant.weezeventClientId,
      organizationId: tenant.weezeventOrganizationId,
      enabled: tenant.weezeventEnabled,
      configured: true,
    };
  }

  /**
   * Generate URL-friendly slug from organization name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .substring(0, 50); // Max 50 chars
  }

  /**
   * Ensure slug is unique by appending number if needed
   */
  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Check if slug already exists
   */
  private async slugExists(slug: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    return !!tenant;
  }
}

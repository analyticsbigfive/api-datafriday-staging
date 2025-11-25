import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateWeezeventConfigDto } from './dto/update-weezevent-config.dto';
import { EncryptionService } from '../../core/encryption/encryption.service';

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) { }

  /**
   * Create organization and admin user in a single transaction
   * Called after Supabase authentication
   */
  async createOrganization(
    supabaseUserId: string,
    email: string,
    dto: CreateOrganizationDto,
  ) {
    // Check if user already has an organization
    const existingUser = await this.prisma.user.findFirst({
      where: { id: supabaseUserId },
      include: { tenant: true },
    });

    if (existingUser) {
      throw new ConflictException('User already has an organization');
    }

    // Generate unique slug from organization name
    const baseSlug = this.generateSlug(dto.organizationName);
    const slug = await this.ensureUniqueSlug(baseSlug);

    // Create tenant and user in transaction
    return this.prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organizationName,
          slug,
          plan: 'FREE',
          status: 'TRIAL', // 30 days trial with all features
        },
      });

      // Create admin user
      const user = await tx.user.create({
        data: {
          id: supabaseUserId, // Use Supabase user ID
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          tenantId: tenant.id,
          role: 'ADMIN', // First user is always ADMIN
        },
      });

      return {
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
        weezeventEnabled: config.weezeventEnabled ?? true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        weezeventClientId: true,
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
        weezeventClientSecret: true,
        weezeventEnabled: true,
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
        weezeventEnabled: true,
      },
    });

    if (!tenant?.weezeventClientId) {
      throw new NotFoundException('Weezevent configuration not found');
    }

    return {
      clientId: tenant.weezeventClientId,
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

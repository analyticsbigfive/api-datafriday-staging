import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

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

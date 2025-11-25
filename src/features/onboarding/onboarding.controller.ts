import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtOnboardingGuard } from '../../core/auth/guards/jwt-onboarding.guard';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-database.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateWeezeventConfigDto } from './dto/update-weezevent-config.dto';
import { UpdateWebhookConfigDto } from '../weezevent/dto/update-webhook-config.dto';

@Controller('onboarding')
@UseGuards(JwtOnboardingGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) { }

  /**
   * Create organization for authenticated user
   *
   * This endpoint should be called AFTER Supabase authentication
   * It creates both the organization (tenant) and the user record
   *
   * @param user - Authenticated user from Supabase JWT
   * @param dto - Organization details
   * @returns Created tenant and user
   */
  @Post()
  async createOrganization(
    @CurrentUser() user: any,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.onboardingService.createOrganization(
      user.id,
      user.email,
      dto,
    );
  }

  /**
   * Update Weezevent configuration for a tenant
   * Client Secret will be encrypted before storage
   */
  @Patch('tenants/:tenantId/weezevent')
  async updateWeezeventConfig(
    @Param('tenantId') tenantId: string,
    @Body() config: UpdateWeezeventConfigDto,
  ) {
    return this.onboardingService.updateWeezeventConfig(tenantId, config);
  }

  /**
   * Get Weezevent configuration for a tenant
   * Returns public info only (no secret)
   */
  @Get('tenants/:tenantId/weezevent')
  async getWeezeventConfig(@Param('tenantId') tenantId: string) {
    return this.onboardingService.getWeezeventConfigPublic(tenantId);
  }

  // Webhook Configuration
  @Patch('tenants/:id/webhook')
  @UseGuards(JwtDatabaseGuard)
  async updateWebhookConfig(
    @Param('id') tenantId: string,
    @Body() dto: UpdateWebhookConfigDto,
  ) {
    return this.onboardingService.updateWebhookConfig(tenantId, dto);
  }

  @Get('tenants/:id/webhook')
  @UseGuards(JwtDatabaseGuard)
  async getWebhookConfig(@Param('id') tenantId: string) {
    return this.onboardingService.getWebhookConfigPublic(tenantId);
  }
}

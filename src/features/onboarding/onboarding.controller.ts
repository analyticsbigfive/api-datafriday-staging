import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtOnboardingGuard } from '../../core/auth/guards/jwt-onboarding.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

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
}

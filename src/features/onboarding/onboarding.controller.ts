import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtOnboardingGuard } from '../../core/auth/guards/jwt-onboarding.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';

@ApiTags('Onboarding')
@ApiBearerAuth('supabase-jwt')
@Controller('onboarding')
@UseGuards(JwtOnboardingGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) { }

  /**
   * Get user status - check if user exists in DB
   */
  @Get('status')
  @ApiOperation({
    summary: 'Vérifier le statut de l\'utilisateur',
    description: 'Vérifie si l\'utilisateur Supabase existe dans la base de données et s\'il est lié à une organisation.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statut de l\'utilisateur',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean', description: 'L\'utilisateur existe-t-il en DB ?' },
        hasOrganization: { type: 'boolean', description: 'Est-il lié à une organisation ?' },
        user: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'STAFF'] },
          },
        },
        tenant: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            plan: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async getUserStatus(@CurrentUser() user: any) {
    return this.onboardingService.getUserStatus(user.id, user.email);
  }

  /**
   * Create organization for authenticated user
   */
  @Post()
  @ApiOperation({
    summary: 'Créer une organisation',
    description: 'Crée une nouvelle organisation et associe l\'utilisateur comme propriétaire (ADMIN). Un code d\'invitation est automatiquement généré.',
  })
  @ApiResponse({
    status: 201,
    description: 'Organisation créée avec succès',
    schema: {
      type: 'object',
      properties: {
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            plan: { type: 'string' },
            status: { type: 'string' },
            invitationCode: { type: 'string', description: 'Code à partager pour inviter des membres' },
          },
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', example: 'ADMIN' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 409, description: 'Slug déjà utilisé' })
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
   * Join an existing tenant using an invitation code
   */
  @Post('join-by-code')
  @ApiOperation({
    summary: 'Rejoindre une organisation via code d\'invitation',
    description: 'Permet à un utilisateur de rejoindre une organisation existante en utilisant un code d\'invitation fourni par un administrateur.',
  })
  @ApiBody({ type: JoinByCodeDto })
  @ApiResponse({
    status: 201,
    description: 'Utilisateur ajouté à l\'organisation',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Successfully joined organization' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            plan: { type: 'string' },
            status: { type: 'string' },
          },
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', example: 'STAFF' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Code d\'invitation requis' })
  @ApiResponse({ status: 404, description: 'Code d\'invitation invalide ou expiré' })
  @ApiResponse({ status: 409, description: 'Utilisateur déjà membre d\'une organisation' })
  async joinByInvitationCode(
    @CurrentUser() user: any,
    @Body() dto: JoinByCodeDto,
  ) {
    return this.onboardingService.joinByInvitationCode(
      user.id,
      user.email,
      dto.invitationCode,
      dto.firstName,
      dto.lastName,
    );
  }

  /**
   * @deprecated Use join-by-code instead for security
   */
  @Post('join/:slug')
  @ApiOperation({
    summary: '[DÉPRÉCIÉ] Rejoindre par slug',
    description: '⚠️ DÉPRÉCIÉ - Utilisez /join-by-code à la place. Cet endpoint sera supprimé dans une future version.',
    deprecated: true,
  })
  async joinTenant(
    @CurrentUser() user: any,
    @Param('slug') slug: string,
    @Body() dto: { firstName?: string; lastName?: string },
  ) {
    return this.onboardingService.joinTenant(
      user.id,
      user.email,
      slug,
      dto.firstName,
      dto.lastName,
    );
  }
}

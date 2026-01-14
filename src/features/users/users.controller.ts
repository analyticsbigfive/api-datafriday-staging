import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth('supabase-jwt')
@Controller('users')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouvel utilisateur',
    description: 'Crée un utilisateur dans l\'organisation. Réservé aux admins et managers.',
  })
  @ApiResponse({ status: 201, description: 'Utilisateur créé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto);
  }

  /**
   * Get all users with pagination
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Lister les utilisateurs',
    description: 'Liste paginée des utilisateurs de l\'organisation.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom ou email' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryUserDto,
  ) {
    return this.usersService.findAll(tenantId, query);
  }

  /**
   * Get user statistics
   */
  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Statistiques des utilisateurs',
    description: 'Statistiques sur les utilisateurs de l\'organisation.',
  })
  @ApiResponse({ status: 200, description: 'Statistiques' })
  async getStatistics(@CurrentTenant() tenantId: string) {
    return this.usersService.getStatistics(tenantId);
  }

  /**
   * Get current user profile (alias for /me)
   */
  @Get('me')
  @ApiOperation({
    summary: 'Profil utilisateur courant',
    description: 'Retourne le profil de l\'utilisateur connecté.',
  })
  @ApiResponse({ status: 200, description: 'Profil utilisateur' })
  async getMe(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    return this.usersService.findOne(user.id, tenantId);
  }

  /**
   * Get user by ID
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Détail d\'un utilisateur',
    description: 'Retourne les détails d\'un utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Détails de l\'utilisateur' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.usersService.findOne(id, tenantId);
  }

  /**
   * Update a user
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Mettre à jour un utilisateur',
    description: 'Met à jour les informations d\'un utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async update(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, tenantId, dto);
  }

  /**
   * Delete a user
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un utilisateur',
    description: 'Supprime un utilisateur de l\'organisation. Réservé aux admins.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur supprimé' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.remove(id, tenantId, user.id);
  }

  /**
   * Invite a user
   */
  @Post('invite')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Inviter un utilisateur',
    description: 'Envoie une invitation à rejoindre l\'organisation.',
  })
  @ApiResponse({ status: 201, description: 'Invitation envoyée' })
  @ApiResponse({ status: 409, description: 'Utilisateur déjà membre' })
  async invite(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: InviteUserDto,
  ) {
    return this.usersService.invite(tenantId, dto, user.id);
  }

  /**
   * Change user role
   */
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Changer le rôle d\'un utilisateur',
    description: 'Modifie le rôle d\'un utilisateur. Réservé aux admins.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Rôle modifié' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  async changeRole(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.usersService.changeRole(id, tenantId, dto, user.id, user.role);
  }

  /**
   * Grant space access to a user
   */
  @Post(':id/spaces/:spaceId/access')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Accorder l\'accès à un espace',
    description: 'Donne à un utilisateur l\'accès à un espace spécifique.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 201, description: 'Accès accordé' })
  async grantSpaceAccess(
    @Param('id') userId: string,
    @Param('spaceId') spaceId: string,
    @CurrentTenant() tenantId: string,
    @Body() body: { role?: UserRole },
  ) {
    return this.usersService.grantSpaceAccess(userId, spaceId, tenantId, body.role);
  }

  /**
   * Revoke space access from a user
   */
  @Delete(':id/spaces/:spaceId/access')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Révoquer l\'accès à un espace',
    description: 'Retire à un utilisateur l\'accès à un espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Accès révoqué' })
  async revokeSpaceAccess(
    @Param('id') userId: string,
    @Param('spaceId') spaceId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.usersService.revokeSpaceAccess(userId, spaceId, tenantId);
  }
}

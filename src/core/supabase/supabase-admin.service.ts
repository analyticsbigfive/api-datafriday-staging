import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Thin wrapper around the Supabase Admin (service-role) API.
 *
 * Centralizes all privileged auth operations (create / invite / delete users)
 * so the rest of the app never juggles the service-role key directly.
 *
 * The service-role client bypasses RLS and must NEVER be exposed to the request
 * pipeline — it is only used server-side for provisioning.
 */
@Injectable()
export class SupabaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — admin user provisioning disabled.',
      );
      return;
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.logger.log('Supabase admin client initialized');
  }

  /** True when the service-role client is configured and usable. */
  isEnabled(): boolean {
    return this.client !== null;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Supabase admin client is not configured (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }
    return this.client;
  }

  /**
   * Create a confirmed auth user with an optional password.
   * Returns the Supabase user whose `id` MUST be reused as the DB `User.id`.
   */
  async createUser(params: {
    email: string;
    password?: string;
    emailConfirm?: boolean;
    userMetadata?: Record<string, unknown>;
  }): Promise<User> {
    const { data, error } = await this.getClient().auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: params.emailConfirm ?? true,
      user_metadata: params.userMetadata,
    });

    if (error || !data?.user) {
      this.logger.error(`createUser failed for ${params.email}: ${error?.message}`);
      throw new InternalServerErrorException(
        `Supabase user creation failed: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data.user;
  }

  /**
   * Send an invitation email and create the (pending) auth user.
   * Returns the Supabase user whose `id` MUST be reused as the DB `User.id`.
   */
  async inviteUserByEmail(
    email: string,
    options?: { redirectTo?: string; data?: Record<string, unknown> },
  ): Promise<User> {
    const { data, error } = await this.getClient().auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: options?.redirectTo,
        data: options?.data,
      },
    );

    if (error || !data?.user) {
      this.logger.error(`inviteUserByEmail failed for ${email}: ${error?.message}`);
      throw new InternalServerErrorException(
        `Supabase invitation failed: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data.user;
  }

  /**
   * Delete an auth user. Best-effort: logs and swallows "not found" so DB
   * cleanup can proceed even if the auth user was already removed.
   */
  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.getClient().auth.admin.deleteUser(userId);
    if (error) {
      this.logger.warn(`deleteUser(${userId}) failed: ${error.message}`);
    }
  }

  /** Look up an auth user by id (used to reconcile / verify). */
  async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await this.getClient().auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return null;
    }
    return data.user;
  }
}

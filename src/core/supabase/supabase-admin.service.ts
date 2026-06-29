import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Connection-lifecycle info read from Supabase `auth.users` for a single user.
 * `lastSignInAt === null` means the person has never logged in (still pending).
 */
export interface UserAuthInfo {
  lastSignInAt: string | null;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
}

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
      const detail = this.describeAuthError(error);
      this.logger.error(
        `createUser failed for ${params.email}: ${detail}`,
        error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : undefined,
      );
      throw new InternalServerErrorException(`Supabase user creation failed: ${detail}`);
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
      const detail = this.describeAuthError(error);
      // Log complet (status/code/name + sérialisation des props non-énumérables) :
      // un `error.message` vide ici = quasi toujours un échec d'ENVOI d'email côté
      // Supabase (SMTP non configuré dans le dashboard, ou rate limit de l'email
      // intégré dépassé). Vérifier Supabase → Auth → Logs / Rate limits / SMTP.
      this.logger.error(
        `inviteUserByEmail failed for ${email}: ${detail}`,
        error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : undefined,
      );
      throw new InternalServerErrorException(`Supabase invitation failed: ${detail}`);
    }

    return data.user;
  }

  /**
   * Construit un message d'erreur exploitable à partir d'une AuthError Supabase
   * (dont le `.message` est parfois vide quand GoTrue renvoie un 500 opaque,
   * typiquement sur échec d'envoi d'email / rate limit).
   */
  private describeAuthError(error: unknown): string {
    if (!error) return 'no user returned';
    const e = error as { name?: string; status?: number; code?: string; message?: string };
    const parts = [
      e.name ?? 'AuthError',
      e.status != null ? `status=${e.status}` : null,
      e.code ? `code=${e.code}` : null,
      e.message
        ? `message=${e.message}`
        : 'message=(vide — souvent un échec d’envoi d’email Supabase : SMTP absent ou rate limit dépassé)',
    ].filter(Boolean);
    return parts.join(' ');
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

  /**
   * Bulk-fetch the auth status (connection lifecycle) of several users by id.
   *
   * Source of truth for "has this person ever logged in?" lives in Supabase
   * (`auth.users`), not in our DB. Used to surface a real status / last-login on
   * the users list. Returns an empty map when the admin client is disabled
   * (local dev without keys) so callers degrade gracefully to "unknown".
   *
   * One `getUserById` per id (parallel) — fine for a paginated page (~20 ids).
   */
  async getAuthInfoByIds(ids: string[]): Promise<Map<string, UserAuthInfo>> {
    const map = new Map<string, UserAuthInfo>();
    if (!this.isEnabled() || ids.length === 0) {
      return map;
    }

    const results = await Promise.all(
      ids.map(async (id) => [id, await this.getUserById(id)] as const),
    );

    for (const [id, user] of results) {
      if (user) {
        map.set(id, {
          lastSignInAt: user.last_sign_in_at ?? null,
          invitedAt: user.invited_at ?? null,
          emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
        });
      }
    }

    return map;
  }

  /**
   * Find an auth user by email. The admin API has no direct "get by email", so
   * we paginate listUsers and match case-insensitively. Returns null if none.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const target = email.toLowerCase();
    const perPage = 200;
    const maxPages = 50; // safety bound (~10k users)

    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await this.getClient().auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) {
        this.logger.warn(`listUsers failed while searching ${email}: ${error.message}`);
        return null;
      }
      const users = data?.users ?? [];
      const match = users.find((u) => u.email?.toLowerCase() === target);
      if (match) {
        return match;
      }
      if (users.length < perPage) {
        break; // last page reached
      }
    }
    return null;
  }
}

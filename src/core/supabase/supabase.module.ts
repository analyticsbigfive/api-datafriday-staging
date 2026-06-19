import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseAdminService } from './supabase-admin.service';

/**
 * Global module exposing the Supabase Admin (service-role) client.
 * Imported once; SupabaseAdminService is then injectable anywhere.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseAdminService],
  exports: [SupabaseAdminService],
})
export class SupabaseModule {}

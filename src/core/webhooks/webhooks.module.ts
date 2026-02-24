import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule, HttpModule.register({ timeout: 10000 })],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

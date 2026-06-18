import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { KvService } from './kv.service';

@ApiTags('kv')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('kv')
export class KvController {
  private readonly logger = new Logger(KvController.name);

  constructor(private readonly kvService: KvService) {}

  @Get(':key')
  @ApiOperation({
    summary: 'Lire une valeur KV',
    description:
      'Clés utilisées par le front : event-predict-versions:<eventId>, event-predict-default-version:<eventId>, event-predict-active-version:<eventId>.',
  })
  @ApiParam({ name: 'key', description: 'Clé KV (ex: event-predict-versions:abc123)' })
  @ApiResponse({ status: 200, description: 'Entrée KV', schema: { type: 'object', properties: { key: { type: 'string' }, value: {} } } })
  @ApiResponse({ status: 404, description: 'Clé introuvable' })
  async get(
    @Param('key') key: string,
    @CurrentUser() user: any,
  ) {
    return this.kvService.get(key, user.tenantId);
  }

  @Put(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Écrire / mettre à jour une valeur KV' })
  @ApiParam({ name: 'key', description: 'Clé KV' })
  @ApiBody({ schema: { type: 'object', description: 'Valeur JSON quelconque', additionalProperties: true } })
  @ApiResponse({ status: 200, description: 'Entrée KV upserted' })
  async set(
    @Param('key') key: string,
    @Body() value: unknown,
    @CurrentUser() user: any,
  ) {
    return this.kvService.set(key, value, user.tenantId);
  }
}

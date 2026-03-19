import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Obtenir le message racine de l’application' })
  @ApiResponse({ status: 200, description: 'Message de bienvenue de l’API' })
  getHello(): string {
    return this.appService.getHello();
  }
}

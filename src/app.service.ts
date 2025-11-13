import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to DataFriday API - NestJS with Fastify and Prisma';
  }
}

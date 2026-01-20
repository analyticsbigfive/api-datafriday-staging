import { Module, Global, DynamicModule, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({})
export class RedisModule {
  private static readonly logger = new Logger('RedisModule');

  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_CLIENT,
          useFactory: (configService: ConfigService) => {
            const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
            
            const redis = new Redis(redisUrl, {
              maxRetriesPerRequest: 3,
              retryStrategy: (times) => {
                if (times > 3) {
                  this.logger.error('Redis connection failed after 3 retries');
                  return null; // Stop retrying
                }
                const delay = Math.min(times * 200, 2000);
                return delay;
              },
              enableReadyCheck: true,
              lazyConnect: true,
            });

            redis.on('connect', () => {
              this.logger.log('✅ Redis connected successfully');
            });

            redis.on('error', (err) => {
              this.logger.error(`Redis connection error: ${err.message}`);
            });

            redis.on('close', () => {
              this.logger.warn('Redis connection closed');
            });

            // Connect immediately
            redis.connect().catch((err) => {
              this.logger.error(`Failed to connect to Redis: ${err.message}`);
            });

            return redis;
          },
          inject: [ConfigService],
        },
        RedisService,
      ],
      exports: [REDIS_CLIENT, RedisService],
    };
  }
}

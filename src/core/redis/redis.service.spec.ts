import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.module';

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  hset: jest.fn(),
  hget: jest.fn(),
  hgetall: jest.fn(),
  zadd: jest.fn(),
  zrange: jest.fn(),
  publish: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  quit: jest.fn(),
};

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedisClient,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return cached value when exists', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('datafriday:test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('error-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.set('test-key', { data: 'value' });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'datafriday:test-key',
        300, // default TTL
        JSON.stringify({ data: 'value' }),
      );
    });

    it('should set value with custom TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.set('test-key', { data: 'value' }, { ttl: 600 });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'datafriday:test-key',
        600,
        JSON.stringify({ data: 'value' }),
      );
    });

    it('should set value with custom prefix', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.set('test-key', { data: 'value' }, { prefix: 'custom:' });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'custom:test-key',
        300,
        JSON.stringify({ data: 'value' }),
      );
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.delete('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('datafriday:test-key');
    });
  });

  describe('deletePattern', () => {
    it('should delete multiple keys matching pattern', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'datafriday:user:1',
        'datafriday:user:2',
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await service.deletePattern('user:*');

      expect(result).toBe(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('datafriday:user:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'datafriday:user:1',
        'datafriday:user:2',
      );
    });

    it('should return 0 when no keys match', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await service.deletePattern('non-existent:*');

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return true when key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.has('test-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.has('non-existent-key');

      expect(result).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value when exists', async () => {
      const cachedData = { cached: true };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const factory = jest.fn().mockResolvedValue({ cached: false });
      const result = await service.getOrSet('test-key', factory);

      expect(result).toEqual(cachedData);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should compute and cache value when not cached', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const computedData = { computed: true };
      const factory = jest.fn().mockResolvedValue(computedData);
      const result = await service.getOrSet('test-key', factory);

      expect(result).toEqual(computedData);
      expect(factory).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('should return true when Redis is healthy', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const result = await service.ping();

      expect(result).toBe(true);
    });

    it('should return false when Redis is unhealthy', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection error'));

      const result = await service.ping();

      expect(result).toBe(false);
    });
  });

  describe('hash operations', () => {
    it('should set hash field', async () => {
      mockRedisClient.hset.mockResolvedValue(1);

      await service.hset('hash-key', 'field1', { value: 'test' });

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'datafriday:hash-key',
        'field1',
        JSON.stringify({ value: 'test' }),
      );
    });

    it('should get hash field', async () => {
      mockRedisClient.hget.mockResolvedValue(JSON.stringify({ value: 'test' }));

      const result = await service.hget('hash-key', 'field1');

      expect(result).toEqual({ value: 'test' });
    });

    it('should get all hash fields', async () => {
      mockRedisClient.hgetall.mockResolvedValue({
        field1: JSON.stringify({ value: 1 }),
        field2: JSON.stringify({ value: 2 }),
      });

      const result = await service.hgetall<{ value: number }>('hash-key');

      expect(result).toEqual({
        field1: { value: 1 },
        field2: { value: 2 },
      });
    });
  });
});

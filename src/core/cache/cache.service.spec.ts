import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    // Clear the cleanup interval
    service.onModuleDestroy?.();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      const result = service.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return cached value', () => {
      service.set('test-key', { data: 'test' }, 300);
      const result = service.get('test-key');
      expect(result).toEqual({ data: 'test' });
    });

    it('should return null for expired entry', async () => {
      service.set('expired-key', 'value', 0.001); // 1ms TTL
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = service.get('expired-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store value in cache', () => {
      service.set('key1', 'value1', 300);
      expect(service.get('key1')).toBe('value1');
    });

    it('should use default TTL when not provided', () => {
      service.set('key2', 'value2');
      expect(service.get('key2')).toBe('value2');
    });

    it('should overwrite existing value', () => {
      service.set('key3', 'original');
      service.set('key3', 'updated');
      expect(service.get('key3')).toBe('updated');
    });
  });

  describe('delete', () => {
    it('should remove value from cache', () => {
      service.set('to-delete', 'value');
      service.delete('to-delete');
      expect(service.get('to-delete')).toBeNull();
    });

    it('should not throw for non-existent key', () => {
      expect(() => service.delete('non-existent')).not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      service.set('exists', 'value');
      expect(service.has('exists')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(service.has('not-exists')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      service.set('key1', 'value1');
      service.set('key2', 'value2');
      service.clear();
      expect(service.get('key1')).toBeNull();
      expect(service.get('key2')).toBeNull();
    });
  });

  describe('getOrSet', () => {
    it('should return existing value', async () => {
      service.set('existing', 'cached-value');
      const result = await service.getOrSet('existing', async () => 'new-value');
      expect(result).toBe('cached-value');
    });

    it('should compute and cache new value', async () => {
      const result = await service.getOrSet('new-key', async () => 'computed');
      expect(result).toBe('computed');
      expect(service.get('new-key')).toBe('computed');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      service.set('key1', 'value1');
      service.set('key2', 'value2');
      const stats = service.getStats();
      expect(stats.size).toBe(2);
    });
  });
});

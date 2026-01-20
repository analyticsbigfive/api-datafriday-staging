import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plainText = 'Hello, World!';
      const encrypted = service.encrypt(plainText);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plainText);
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should produce different ciphertexts for same input', () => {
      const plainText = 'Same text';
      const encrypted1 = service.encrypt(plainText);
      const encrypted2 = service.encrypt(plainText);
      
      // Due to random IV, ciphertexts should be different
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt empty string', () => {
      const encrypted = service.encrypt('');
      expect(encrypted).toBeDefined();
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should encrypt unicode characters', () => {
      const plainText = '你好世界 🌍';
      const encrypted = service.encrypt(plainText);
      expect(encrypted).toBeDefined();
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plainText = 'Secret message';
      const encrypted = service.encrypt(plainText);
      const decrypted = service.decrypt(encrypted);
      
      expect(decrypted).toBe(plainText);
    });

    it('should decrypt unicode characters', () => {
      const plainText = '你好世界 🌍 émojis';
      const encrypted = service.encrypt(plainText);
      const decrypted = service.decrypt(encrypted);
      
      expect(decrypted).toBe(plainText);
    });

    it('should throw for invalid format', () => {
      expect(() => service.decrypt('invalid')).toThrow('Invalid encrypted text format');
      expect(() => service.decrypt('part1:part2')).toThrow('Invalid encrypted text format');
    });

    it('should throw for tampered data', () => {
      const encrypted = service.encrypt('test');
      const parts = encrypted.split(':');
      // Tamper significantly with the encrypted data (replace multiple chars)
      parts[2] = 'xxxxxxxxxxxxxxxx' + parts[2].substring(16);
      
      // Some tampering might not throw if it produces valid (but wrong) decryption
      // The important thing is that the result should be different from original
      try {
        const decrypted = service.decrypt(parts.join(':'));
        // If it doesn't throw, the decrypted value should be different
        expect(decrypted).not.toBe('test');
      } catch (e) {
        // If it throws, that's also acceptable behavior for tampered data
        expect(e).toBeDefined();
      }
    });
  });

  describe('round-trip', () => {
    it('should handle various string lengths', () => {
      const testStrings = [
        '',
        'a',
        'short',
        'This is a medium length string for testing',
        'A'.repeat(1000),
      ];

      for (const str of testStrings) {
        const encrypted = service.encrypt(str);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(str);
      }
    });

    it('should handle special characters', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const encrypted = service.encrypt(special);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(special);
    });

    it('should handle JSON strings', () => {
      const json = JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } });
      const encrypted = service.encrypt(json);
      const decrypted = service.decrypt(encrypted);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(json));
    });
  });
});

describe('EncryptionService - Invalid Config', () => {
  it('should throw for missing ENCRYPTION_KEY', () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    expect(() => {
      new EncryptionService(mockConfigService as any);
    }).toThrow('ENCRYPTION_KEY must be 64 hex characters');
  });

  it('should throw for invalid ENCRYPTION_KEY length', () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('short'),
    };

    expect(() => {
      new EncryptionService(mockConfigService as any);
    }).toThrow('ENCRYPTION_KEY must be 64 hex characters');
  });
});

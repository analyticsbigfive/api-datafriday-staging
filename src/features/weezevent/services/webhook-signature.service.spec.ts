import { Test, TestingModule } from '@nestjs/testing';
import { WebhookSignatureService } from './webhook-signature.service';

describe('WebhookSignatureService', () => {
  let service: WebhookSignatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookSignatureService],
    }).compile();

    service = module.get<WebhookSignatureService>(WebhookSignatureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSignature', () => {
    it('should generate a signature', () => {
      const payload = { type: 'transaction', data: { id: 123 } };
      const secret = 'my-secret';

      const signature = service.generateSignature(payload, secret);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should generate consistent signatures for same input', () => {
      const payload = { type: 'test' };
      const secret = 'secret';

      const sig1 = service.generateSignature(payload, secret);
      const sig2 = service.generateSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'secret';
      const sig1 = service.generateSignature({ a: 1 }, secret);
      const sig2 = service.generateSignature({ a: 2 }, secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = { test: true };
      const sig1 = service.generateSignature(payload, 'secret1');
      const sig2 = service.generateSignature(payload, 'secret2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('validateSignature', () => {
    it('should validate correct signature', () => {
      const payload = { type: 'transaction', data: { id: 123 } };
      const secret = 'my-secret';
      const signature = service.generateSignature(payload, secret);

      const isValid = service.validateSignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = { type: 'transaction', data: { id: 123 } };
      const secret = 'my-secret';

      const isValid = service.validateSignature(payload, 'invalid-signature', secret);

      expect(isValid).toBe(false);
    });

    it('should reject when signature is empty', () => {
      const payload = { type: 'test' };

      const isValid = service.validateSignature(payload, '', 'secret');

      expect(isValid).toBe(false);
    });

    it('should reject when secret is empty', () => {
      const payload = { type: 'test' };

      const isValid = service.validateSignature(payload, 'sig', '');

      expect(isValid).toBe(false);
    });

    it('should handle payload modification', () => {
      const payload = { type: 'test', data: { id: 1 } };
      const secret = 'secret';
      const signature = service.generateSignature(payload, secret);

      // Modify payload
      const modifiedPayload = { type: 'test', data: { id: 2 } };

      const isValid = service.validateSignature(modifiedPayload, signature, secret);

      expect(isValid).toBe(false);
    });
  });
});

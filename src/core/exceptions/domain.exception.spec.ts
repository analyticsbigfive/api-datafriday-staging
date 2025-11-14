import { HttpStatus } from '@nestjs/common';
import {
  NotFoundException,
  TenantNotFoundException,
  ConflictException,
  ForbiddenException,
  ValidationException,
} from './domain.exception';

describe('DomainExceptions', () => {
  describe('NotFoundException', () => {
    it('should create exception with resource only', () => {
      const exception = new NotFoundException('User');

      expect(exception.message).toBe('User not found');
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('should create exception with resource and identifier', () => {
      const exception = new NotFoundException('User', 'user-123');

      expect(exception.message).toBe("User with identifier 'user-123' not found");
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('TenantNotFoundException', () => {
    it('should create tenant-specific exception', () => {
      const exception = new TenantNotFoundException('tenant-456');

      expect(exception.message).toBe("Tenant with identifier 'tenant-456' not found");
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('ConflictException', () => {
    it('should create exception with resource only', () => {
      const exception = new ConflictException('User');

      expect(exception.message).toBe('User already exists');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('should create exception with resource and field', () => {
      const exception = new ConflictException('User', 'email');

      expect(exception.message).toBe('User with this email already exists');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('ForbiddenException', () => {
    it('should create exception with default message', () => {
      const exception = new ForbiddenException();

      expect(exception.message).toBe('You do not have permission to perform this action');
      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    });

    it('should create exception with custom message', () => {
      const exception = new ForbiddenException('Custom forbidden message');

      expect(exception.message).toBe('Custom forbidden message');
      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('ValidationException', () => {
    it('should create exception with message only', () => {
      const exception = new ValidationException('Validation failed');

      expect(exception.message).toBe('Validation failed');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.errors).toBeUndefined();
    });

    it('should create exception with message and errors', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const exception = new ValidationException('Validation failed', errors);

      expect(exception.message).toBe('Validation failed');
      expect(exception.errors).toEqual(errors);
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});

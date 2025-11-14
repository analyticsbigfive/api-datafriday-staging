import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for domain-specific exceptions
 */
export abstract class DomainException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}

/**
 * Thrown when a resource is not found
 */
export class NotFoundException extends DomainException {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, HttpStatus.NOT_FOUND);
  }
}

/**
 * Thrown when tenant is not found or invalid
 */
export class TenantNotFoundException extends NotFoundException {
  constructor(tenantId: string) {
    super('Tenant', tenantId);
  }
}

/**
 * Thrown when a resource already exists
 */
export class ConflictException extends DomainException {
  constructor(resource: string, field?: string) {
    const message = field
      ? `${resource} with this ${field} already exists`
      : `${resource} already exists`;
    super(message, HttpStatus.CONFLICT);
  }
}

/**
 * Thrown when user lacks permission
 */
export class ForbiddenException extends DomainException {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

/**
 * Thrown when validation fails
 */
export class ValidationException extends DomainException {
  constructor(message: string, public readonly errors?: any[]) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrganizationDto } from './onboarding/dto/create-organization.dto';
import { CreateMenuItemDto } from './menu-items/dto/create-menu-item.dto';
import { CreateMarketPriceDto } from './market-prices/dto/create-market-price.dto';
import { CreateConfigDto } from './spaces/dto/create-config.dto';
import { CreateSpaceDto } from './spaces/dto/create-space.dto';

describe('DTO Validation Test Suite - Error Messages', () => {
  describe('CreateOrganizationDto', () => {
    it('should reject firstName with less than 2 characters', async () => {
      const dto = plainToInstance(CreateOrganizationDto, {
        firstName: 'A',
        lastName: 'Dupont',
        organizationName: 'Test Org',
        organizationType: 'Restaurant',
        organizationEmail: 'test@example.com',
        organizationPhone: '+33612345678',
      });

      const errors = await validate(dto);
      const firstNameError = errors.find((e) => e.property === 'firstName');

      expect(firstNameError).toBeDefined();
      expect(firstNameError?.constraints).toHaveProperty('minLength');
      expect(firstNameError?.constraints?.minLength).toContain('must be longer than or equal to 2 characters');
    });

    it('should reject invalid email format', async () => {
      const dto = plainToInstance(CreateOrganizationDto, {
        firstName: 'Jean',
        lastName: 'Dupont',
        organizationName: 'Test Org',
        organizationType: 'Restaurant',
        organizationEmail: 'invalid-email',
        organizationPhone: '+33612345678',
      });

      const errors = await validate(dto);
      const emailError = errors.find((e) => e.property === 'organizationEmail');

      expect(emailError).toBeDefined();
      expect(emailError?.constraints).toHaveProperty('isEmail');
      expect(emailError?.constraints?.isEmail).toContain('must be an email');
    });

    it('should accept valid organization data', async () => {
      const dto = plainToInstance(CreateOrganizationDto, {
        firstName: 'Jean',
        lastName: 'Dupont',
        organizationName: 'Test Org',
        organizationType: 'Restaurant',
        organizationEmail: 'test@example.com',
        organizationPhone: '+33612345678',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('CreateMenuItemDto', () => {
    it('should reject missing required fields', async () => {
      const dto = plainToInstance(CreateMenuItemDto, {
        name: 'Test Item',
      });

      const errors = await validate(dto);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'typeId')).toBe(true);
      expect(errors.some(e => e.property === 'categoryId')).toBe(true);
      expect(errors.some(e => e.property === 'basePrice')).toBe(true);
    });

    it('should accept valid menu item data', async () => {
      const dto = plainToInstance(CreateMenuItemDto, {
        name: 'Test Item',
        typeId: 'type-123',
        categoryId: 'cat-123',
        basePrice: 10.50,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('CreateMarketPriceDto', () => {
    it('should reject invalid goodType enum', async () => {
      const dto = plainToInstance(CreateMarketPriceDto, {
        itemName: 'Test Item',
        unit: 'kg',
        price: 10.50,
        goodType: 'InvalidType',
      });

      const errors = await validate(dto);
      const goodTypeError = errors.find((e) => e.property === 'goodType');

      expect(goodTypeError).toBeDefined();
      expect(goodTypeError?.constraints).toHaveProperty('isEnum');
    });

    it('should accept valid market price data', async () => {
      const dto = plainToInstance(CreateMarketPriceDto, {
        itemName: 'Test Item',
        unit: 'kg',
        price: 10.50,
        goodType: 'Food',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('CreateConfigDto', () => {
    it('should reject negative capacity', async () => {
      const dto = plainToInstance(CreateConfigDto, {
        name: 'Test Config',
        spaceId: 'space-123',
        capacity: -100,
      });

      const errors = await validate(dto);
      const capacityError = errors.find((e) => e.property === 'capacity');

      expect(capacityError).toBeDefined();
      expect(capacityError?.constraints).toHaveProperty('min');
      expect(capacityError?.constraints?.min).toContain('must not be less than 0');
    });

    it('should accept capacity = 0', async () => {
      const dto = plainToInstance(CreateConfigDto, {
        name: 'Test Config',
        spaceId: 'space-123',
        capacity: 0,
      });

      const errors = await validate(dto);
      const capacityError = errors.find((e) => e.property === 'capacity');

      expect(capacityError).toBeUndefined();
    });

    it('should accept valid config data', async () => {
      const dto = plainToInstance(CreateConfigDto, {
        name: 'Test Config',
        spaceId: 'space-123',
        capacity: 5000,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('CreateSpaceDto', () => {
    it('should reject department = 0', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Test Space',
        department: 0,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeDefined();
      expect(departmentError?.constraints).toHaveProperty('min');
      expect(departmentError?.constraints?.min).toContain('must not be less than 1');
    });

    it('should reject department > 95', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Test Space',
        department: 100,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeDefined();
      expect(departmentError?.constraints).toHaveProperty('max');
      expect(departmentError?.constraints?.max).toContain('must not be greater than 95');
    });

    it('should accept valid department values', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Test Space',
        department: 75,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeUndefined();
    });

    it('should reject empty name', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: '',
      });

      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === 'name');

      expect(nameError).toBeDefined();
      expect(nameError?.constraints).toHaveProperty('isNotEmpty');
    });
  });

  describe('Global Validation Behavior', () => {
    it('should provide detailed error messages for all validation failures', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: '',
        department: 0,
        maxCapacity: -100,
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      
      errors.forEach(error => {
        expect(error.property).toBeDefined();
        expect(error.constraints).toBeDefined();
        expect(Object.keys(error.constraints).length).toBeGreaterThan(0);
      });
    });
  });
});

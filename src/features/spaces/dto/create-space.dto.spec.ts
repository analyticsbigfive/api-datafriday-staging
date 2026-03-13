import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSpaceDto } from './create-space.dto';

describe('CreateSpaceDto Validation', () => {
  describe('department field', () => {
    it('should reject department = 0 (below minimum)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: 0,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeDefined();
      expect(departmentError?.constraints).toHaveProperty('min');
      expect(departmentError?.constraints?.min).toContain('must not be less than 1');
    });

    it('should accept department = 1 (minimum valid)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: 1,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeUndefined();
    });

    it('should accept department = 75 (valid)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: 75,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeUndefined();
    });

    it('should accept department = 95 (maximum valid)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: 95,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeUndefined();
    });

    it('should reject department = 96 (above maximum)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: 96,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeDefined();
      expect(departmentError?.constraints).toHaveProperty('max');
      expect(departmentError?.constraints?.max).toContain('must not be greater than 95');
    });

    it('should accept department = undefined (optional field)', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Space Test',
        department: undefined,
      });

      const errors = await validate(dto);
      const departmentError = errors.find((e) => e.property === 'department');

      expect(departmentError).toBeUndefined();
    });
  });

  describe('name field', () => {
    it('should reject empty name', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: '',
      });

      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === 'name');

      expect(nameError).toBeDefined();
      expect(nameError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should accept valid name', async () => {
      const dto = plainToInstance(CreateSpaceDto, {
        name: 'Valid Space Name',
      });

      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === 'name');

      expect(nameError).toBeUndefined();
    });
  });
});

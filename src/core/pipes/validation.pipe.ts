import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ValidationError, validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Global validation pipe using class-validator
 * Automatically validates DTOs decorated with class-validator decorators
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object, {
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Allow extra properties (will be stripped by whitelist)
      transform: true, // Automatically transform to the correct type
    });

    if (errors.length > 0) {
      const messages = this.formatErrors(errors);

      throw new BadRequestException({
        message: 'Validation failed',
        errors: messages,
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatErrors(errors: ValidationError[], parentPath?: string): Array<{
    property: string;
    constraints?: Record<string, string>;
    messages?: string[];
    value: unknown;
  }> {
    return errors.flatMap((error) => {
      const propertyPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;

      const currentError = error.constraints
        ? [{
            property: propertyPath,
            constraints: error.constraints,
            messages: Object.values(error.constraints),
            value: error.value,
          }]
        : [];

      const childErrors = error.children?.length
        ? this.formatErrors(error.children, propertyPath)
        : [];

      return [...currentError, ...childErrors];
    });
  }
}

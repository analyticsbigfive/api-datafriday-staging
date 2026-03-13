import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ValidationPipe } from '../pipes/validation.pipe';
import { CreateSpaceDto } from '../../features/spaces/dto/create-space.dto';

describe('AllExceptionsFilter with ValidationPipe', () => {
  it('should return validation errors in the real API error payload', async () => {
    const pipe = new ValidationPipe();
    const filter = new AllExceptionsFilter();

    const reply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    const request = {
      url: '/api/v1/spaces',
      method: 'POST',
      headers: {},
      ip: '127.0.0.1',
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => request,
      }),
    } as any;

    let thrownError: BadRequestException | null = null;

    try {
      await pipe.transform(
        {
          name: 'Space Test',
          department: 0,
        },
        { metatype: CreateSpaceDto } as ArgumentMetadata,
      );
    } catch (error) {
      thrownError = error as BadRequestException;
    }

    expect(thrownError).toBeInstanceOf(BadRequestException);

    filter.catch(thrownError, host);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        path: '/api/v1/spaces',
        method: 'POST',
        errors: expect.arrayContaining([
          expect.objectContaining({
            property: 'department',
            value: 0,
            constraints: expect.objectContaining({
              min: expect.stringContaining('must not be less than 1'),
            }),
            messages: expect.arrayContaining([
              expect.stringContaining('must not be less than 1'),
            ]),
          }),
        ]),
      }),
    );
  });
});

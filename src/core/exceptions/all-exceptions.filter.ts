import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  errors?: any[];
  timestamp: string;
  path: string;
  method: string;
}

/**
 * Global exception filter that catches all exceptions
 * and returns a standardized error response
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: this.getErrorMessage(exception),
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    // Add error name for non-500 errors
    if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
      errorResponse.error = this.getErrorName(exception);
    }

    // Add validation errors if present
    const validationErrors = this.getValidationErrors(exception);
    if (validationErrors) {
      errorResponse.errors = validationErrors;
    }

    // Log error
    this.logError(exception, request, status);

    response.status(status).send(errorResponse);
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && 'message' in response) {
        const message = (response as any).message;
        return Array.isArray(message) ? message[0] : message;
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal server error';
  }

  private getErrorName(exception: unknown): string {
    if (exception instanceof HttpException) {
      return exception.name;
    }
    if (exception instanceof Error) {
      return exception.name;
    }
    return 'UnknownError';
  }

  private getValidationErrors(exception: unknown): any[] | null {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && 'message' in response) {
        const message = (response as any).message;
        if (Array.isArray(message)) {
          return message;
        }
      }
    }
    return null;
  }

  private logError(exception: unknown, request: FastifyRequest, status: number) {
    const message = this.getErrorMessage(exception);
    const logContext = {
      method: request.method,
      url: request.url,
      status,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    if (status >= 500) {
      this.logger.error(
        `${message}\n${JSON.stringify(logContext, null, 2)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${message} - ${JSON.stringify(logContext)}`);
    }
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

const PRISMA_ERROR_STATUS: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();

    const { status, message, code } = this.parse(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(
      ctx.getResponse(),
      {
        statusCode: status,
        message,
        ...(code && { code }),
        path: httpAdapter.getRequestUrl(request),
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }

  private parse(exception: unknown): {
    status: number;
    message: string | string[];
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null
          ? ((response as { message?: string | string[] }).message ??
            exception.message)
          : (response as string);
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        PRISMA_ERROR_STATUS[exception.code] ??
        HttpStatus.INTERNAL_SERVER_ERROR;
      return {
        status,
        code: exception.code,
        message:
          status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Database error'
            : exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}

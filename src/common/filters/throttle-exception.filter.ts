import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

@Catch(ThrottlerException)
export class ThrottleExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    console.warn(
      `🛑 Rate limit exceeded from IP: ${request.ip} — ${request.method} ${request.url}`,
    );

    response.status(429).json({
      statusCode: 429,
      message: 'Too many requests — please slow down.',
    });
  }
}

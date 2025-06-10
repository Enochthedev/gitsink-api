import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const res = exception.getResponse() as any;
    const message = res?.message || exception.message;
    const code = res?.code || exception.name;

    response.status(status).json({
      statusCode: status,
      errorCode: code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

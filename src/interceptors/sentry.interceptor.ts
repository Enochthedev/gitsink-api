import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(err => {
        const request = context.switchToHttp().getRequest();
        Sentry.withScope(scope => {
          scope.setTag('route', request?.route?.path || 'unknown');
          scope.setExtras({
            params: request.params,
            query: request.query,
            body: request.body,
            user: request.user,
          });
          Sentry.captureException(err);
        });
        return throwError(() => err);
      }),
    );
  }
}

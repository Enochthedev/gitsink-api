import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(err => {
        let request: any = {};

        if (context.getType<GqlContextType>() === 'graphql') {
          const gqlContext = GqlExecutionContext.create(context);
          const ctx = gqlContext.getContext();
          request = ctx.req || ctx.request; // Try both standard and Fastify
        } else if (context.getType() === 'http') {
          request = context.switchToHttp().getRequest();
        }

        Sentry.withScope(scope => {
          if (request) {
            scope.setTag('route', request.route?.path || 'unknown');
            scope.setExtras({
              params: request.params,
              query: request.query,
              body: request.body,
              user: request.user,
            });
          }
          Sentry.captureException(err);
        });
        return throwError(() => err);
      }),
    );
  }
}

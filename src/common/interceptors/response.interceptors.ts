import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from 'rxjs'
import { ApiResponse } from "../responses/api.response";

@Injectable()
export class ResponseInteceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          // paginated response case
          return {
            statusCode,
            message: 'Success',
            data: data.data,
            meta: data.meta,
          };
        }
        
        return {
          statusCode,
          message: 'Success',
          data
        }
      })
    )
  }
}
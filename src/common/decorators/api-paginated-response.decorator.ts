import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Documents a paginated endpoint's response shape in Swagger, i.e.
 * { data: T[], meta: { total, page, limit, lastPage } }.
 *
 * Usage: @ApiPaginatedResponse(ClientResponseDTO)
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(model: TModel) => {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  lastPage: { type: 'number' },
                },
              },
            },
          },
        ],
      },
    }),
  );
};
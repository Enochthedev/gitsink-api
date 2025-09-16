import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T = any> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Human-readable message describing the result',
    example: 'Operation completed successfully',
  })
  message!: string;

  @ApiProperty({
    description: 'The response data',
    required: false,
  })
  data?: T;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Unique request identifier for tracking',
    example: 'req_1234567890abcdef',
  })
  requestId?: string;
}

export class PaginatedResponseDto<T = any> extends ApiResponseDto<T[]> {
  @ApiProperty({
    description: 'Pagination metadata',
    type: 'object',
    properties: {
      page: { type: 'number', example: 1 },
      limit: { type: 'number', example: 20 },
      total: { type: 'number', example: 150 },
      totalPages: { type: 'number', example: 8 },
      hasNext: { type: 'boolean', example: true },
      hasPrev: { type: 'boolean', example: false },
    },
  })
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class ErrorResponseDto {
  @ApiProperty({
    description: 'Indicates the request failed',
    example: false,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Error message',
    example: 'Validation failed',
  })
  message!: string;

  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode!: number;

  @ApiProperty({
    description: 'Error code for programmatic handling',
    example: 'VALIDATION_ERROR',
  })
  error!: string;

  @ApiProperty({
    description: 'Detailed error information',
    required: false,
    example: {
      field: 'email',
      constraint: 'must be a valid email address',
    },
  })
  details?: any;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Request path that caused the error',
    example: '/auth/signup',
  })
  path!: string;
}

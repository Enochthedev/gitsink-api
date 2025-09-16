import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class SignupDto {
  @ApiProperty({
    description: 'User email address - must be unique',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    description: 'Username for the account - must be unique if provided',
    example: 'user123',
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9_-]+$',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username?: string;

  @ApiProperty({
    description: 'Password for the account - required for password-based authentication',
    example: 'strongPassword123!',
    minLength: 8,
    maxLength: 128,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  password?: string;
}

export class SignupResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'User created successfully',
  })
  message!: string;

  @ApiProperty({
    description: 'Created user information',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'user_1234567890' },
      email: { type: 'string', example: 'user@example.com' },
      username: { type: 'string', example: 'user123' },
      createdAt: {
        type: 'string',
        format: 'date-time',
        example: '2024-01-15T10:30:00Z',
      },
    },
  })
  user!: {
    id: string;
    email: string;
    username?: string;
    createdAt: string;
  };

  @ApiProperty({
    description: 'Generated API key for immediate use',
    example: 'gsk_1234567890abcdef...',
  })
  apiKey!: string;
}

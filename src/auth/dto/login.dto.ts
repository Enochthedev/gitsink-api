import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    description: 'User password - required for password-based authentication',
    example: 'strongPassword123!',
    required: false,
  })
  @IsOptional()
  @IsString()
  password?: string;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token for API authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT refresh token for obtaining new access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;

  @ApiProperty({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Authenticated user information',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'user_1234567890' },
      email: { type: 'string', example: 'user@example.com' },
      username: { type: 'string', example: 'user123' },
      githubId: { type: 'string', example: '12345678' },
      createdAt: { type: 'string', format: 'date-time' },
      lastLoginAt: { type: 'string', format: 'date-time' },
      hasApiKey: { type: 'boolean', example: true },
    },
  })
  user!: {
    id: string;
    email: string;
    username?: string;
    githubId?: string;
    createdAt: string;
    lastLoginAt?: string;
    hasApiKey: boolean;
  };
}

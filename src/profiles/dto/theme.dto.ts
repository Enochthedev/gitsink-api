import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateThemeDto {
  @ApiPropertyOptional({
    description: 'Primary color in hex format',
    example: '#007bff',
    pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'Primary color must be a valid hex color (e.g., #007bff or #fff)',
  })
  primaryColor?: string;

  @ApiPropertyOptional({
    description: 'Secondary color in hex format',
    example: '#6c757d',
    pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'Secondary color must be a valid hex color (e.g., #6c757d or #ccc)',
  })
  secondaryColor?: string;

  @ApiPropertyOptional({
    description: 'Background style',
    example: 'gradient-dark',
    enum: [
      'solid',
      'gradient-dark',
      'gradient-vibrant',
      'gradient-creative',
      'minimal',
      'professional',
    ],
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  backgroundStyle?: string;

  @ApiPropertyOptional({
    description: 'Font family',
    example: 'Inter, sans-serif',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fontFamily?: string;
}

export class ApplyThemePresetDto {
  @ApiPropertyOptional({
    description: 'Theme preset name',
    example: 'dark',
    enum: ['default', 'dark', 'minimal', 'vibrant', 'professional', 'creative'],
  })
  @IsString()
  @MaxLength(50)
  presetName!: string;
}

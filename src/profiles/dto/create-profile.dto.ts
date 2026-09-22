import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialLinkDto {
  @ApiProperty({ description: 'Social platform name' })
  @IsString()
  @MaxLength(50)
  platform!: string;

  @ApiProperty({ description: 'Social profile URL' })
  @IsUrl()
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ description: 'Display label for the link' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class ProfileThemeDto {
  @ApiPropertyOptional({ description: 'Primary color theme' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'Secondary color theme' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  secondaryColor?: string;

  @ApiPropertyOptional({ description: 'Background style' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  backgroundStyle?: string;

  @ApiPropertyOptional({ description: 'Font family' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fontFamily?: string;
}

export class CreateProfileDto {
  @ApiProperty({ description: 'Unique username for the profile' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Profile bio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatar?: string;

  @ApiPropertyOptional({ description: 'Location' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    description: 'Social media links',
    type: [SocialLinkDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];

  @ApiPropertyOptional({
    description: 'Profile theme settings',
    type: ProfileThemeDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileThemeDto)
  theme?: ProfileThemeDto;

  @ApiPropertyOptional({ description: 'Whether the profile is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Custom domain for the profile' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customDomain?: string;
}

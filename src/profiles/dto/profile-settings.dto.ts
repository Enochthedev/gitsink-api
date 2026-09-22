import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CustomSectionDto {
  @ApiPropertyOptional({ description: 'Section title' })
  @IsString()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ description: 'Section content' })
  @IsString()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ description: 'Section order' })
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Whether section is visible' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class ProfileSettingsDto {
  @ApiPropertyOptional({ description: 'Whether the profile is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Whether to show email address' })
  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @ApiPropertyOptional({ description: 'Whether to show profile statistics' })
  @IsOptional()
  @IsBoolean()
  showStats?: boolean;

  @ApiPropertyOptional({ description: 'Whether to show private repositories' })
  @IsOptional()
  @IsBoolean()
  showPrivateRepos?: boolean;

  @ApiPropertyOptional({ description: 'List of featured project IDs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featuredProjects?: string[];

  @ApiPropertyOptional({
    description: 'Custom profile sections',
    type: [CustomSectionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  customSections?: CustomSectionDto[];

  @ApiPropertyOptional({ description: 'Profile layout preference' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  layout?: string;

  @ApiPropertyOptional({ description: 'Whether to show activity timeline' })
  @IsOptional()
  @IsBoolean()
  showActivity?: boolean;

  @ApiPropertyOptional({ description: 'Whether to show contribution graph' })
  @IsOptional()
  @IsBoolean()
  showContributions?: boolean;
}

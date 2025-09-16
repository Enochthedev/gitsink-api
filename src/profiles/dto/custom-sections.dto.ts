import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomSectionDto {
  @ApiProperty({
    description: 'Section title',
    example: 'About Me',
  })
  @IsString()
  @MaxLength(100)
  title!: string;

  @ApiProperty({
    description: 'Section content (supports markdown)',
    example: 'I am a passionate developer with experience in...',
  })
  @IsString()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({
    description: 'Display order of the section',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  order?: number;

  @ApiPropertyOptional({
    description: 'Whether the section is visible',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateCustomSectionsDto {
  @ApiProperty({
    description: 'Array of custom sections',
    type: [CustomSectionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  customSections!: CustomSectionDto[];
}

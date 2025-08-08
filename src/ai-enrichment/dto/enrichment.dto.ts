import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EnrichProjectDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsBoolean()
  forceReanalysis?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificAnalysis?: ('description' | 'technology' | 'category')[];
}

export class RepositoryContentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileInfoDto)
  files!: FileInfoDto[];

  @IsOptional()
  @IsString()
  readme?: string;

  @IsOptional()
  packageJson?: any;

  @IsOptional()
  languages?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  totalSize?: number;
}

export class FileInfoDto {
  @IsString()
  path!: string;

  @IsString()
  name!: string;

  @IsString()
  extension!: string;

  @IsNumber()
  size!: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class TechnologyStackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageInfoDto)
  languages!: LanguageInfoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrameworkInfoDto)
  frameworks!: FrameworkInfoDto[];

  @IsArray()
  @IsString({ each: true })
  databases!: string[];

  @IsArray()
  @IsString({ each: true })
  tools!: string[];

  @IsArray()
  @IsString({ each: true })
  platforms!: string[];

  @IsArray()
  @IsString({ each: true })
  buildTools!: string[];

  @IsArray()
  @IsString({ each: true })
  testingFrameworks!: string[];
}

export class LanguageInfoDto {
  @IsString()
  name!: string;

  @IsNumber()
  percentage!: number;

  @IsNumber()
  bytes!: number;

  @IsNumber()
  confidence!: number;
}

export class FrameworkInfoDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsNumber()
  confidence!: number;

  @IsEnum(['web', 'mobile', 'desktop', 'backend', 'ml', 'game', 'other'])
  category!: 'web' | 'mobile' | 'desktop' | 'backend' | 'ml' | 'game' | 'other';
}

export class ProjectCategoryDto {
  @IsString()
  primary!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondary?: string[];

  @IsNumber()
  confidence!: number;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}

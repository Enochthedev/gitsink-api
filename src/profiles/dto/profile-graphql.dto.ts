import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean, IsArray, IsUrl, IsEmail } from 'class-validator';
import { PublicProfileGraphQL } from '../entities/profile-graphql.entity';
import { PageInfo } from '../../common/dto/graphql-common.dto';

@InputType()
export class CreateProfileInput {
  @Field(() => String)
  @IsString()
  username!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bio?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  location?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl()
  website?: string;

  @Field(() => Boolean, { defaultValue: false })
  @IsBoolean()
  isPublic: boolean = false;
}

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bio?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  location?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl()
  website?: string;
}

@InputType()
export class ProfileSettingsInput {
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  showStats?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  showPrivateRepos?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featuredProjects?: string[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  layout?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  showActivity?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  showContributions?: boolean;
}

@InputType()
export class SocialLinkInput {
  @Field(() => String)
  @IsString()
  platform!: string;

  @Field(() => String)
  @IsUrl()
  url!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  label?: string;
}

@InputType()
export class CustomSectionInput {
  @Field(() => String)
  @IsString()
  title!: string;

  @Field(() => String)
  @IsString()
  content!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  order?: number;

  @Field(() => Boolean, { defaultValue: true })
  @IsBoolean()
  visible: boolean = true;
}

@InputType()
export class ProfileThemeInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  backgroundStyle?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  fontFamily?: string;
}

@InputType()
export class ProfileSearchInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  query?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  location?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @Field(() => Int, { defaultValue: 0 })
  offset: number = 0;

  @Field(() => Int, { defaultValue: 20 })
  limit: number = 20;
}

@ObjectType()
export class ProfileEdge {
  @Field(() => PublicProfileGraphQL)
  node!: PublicProfileGraphQL;

  @Field(() => String)
  cursor!: string;
}

@ObjectType()
export class ProfileConnection {
  @Field(() => [ProfileEdge])
  edges!: ProfileEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field(() => Int)
  totalCount!: number;
}
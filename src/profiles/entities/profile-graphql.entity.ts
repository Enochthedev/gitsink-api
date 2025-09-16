import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class SocialLink {
  @Field(() => String)
  platform!: string;

  @Field(() => String)
  url!: string;

  @Field(() => String, { nullable: true })
  label?: string;
}

@ObjectType()
export class ProfileTheme {
  @Field(() => String, { nullable: true })
  primaryColor?: string;

  @Field(() => String, { nullable: true })
  secondaryColor?: string;

  @Field(() => String, { nullable: true })
  backgroundStyle?: string;

  @Field(() => String, { nullable: true })
  fontFamily?: string;
}

@ObjectType()
export class CustomSection {
  @Field(() => String)
  title!: string;

  @Field(() => String)
  content!: string;

  @Field(() => Int, { nullable: true })
  order?: number;

  @Field(() => Boolean, { nullable: true })
  visible?: boolean;
}

@ObjectType()
export class ProfileSettings {
  @Field(() => Boolean, { nullable: true })
  isPublic?: boolean;

  @Field(() => Boolean, { nullable: true })
  showEmail?: boolean;

  @Field(() => Boolean, { nullable: true })
  showStats?: boolean;

  @Field(() => Boolean, { nullable: true })
  showPrivateRepos?: boolean;

  @Field(() => [String], { nullable: true })
  featuredProjects?: string[];

  @Field(() => [CustomSection], { nullable: true })
  customSections?: CustomSection[];

  @Field(() => String, { nullable: true })
  layout?: string;

  @Field(() => Boolean, { nullable: true })
  showActivity?: boolean;

  @Field(() => Boolean, { nullable: true })
  showContributions?: boolean;
}

@ObjectType()
export class ProfileStats {
  @Field(() => Int)
  totalProjects!: number;

  @Field(() => Int)
  publicProjects!: number;

  @Field(() => Int)
  totalStars!: number;

  @Field(() => Int)
  totalForks!: number;

  @Field(() => GraphQLJSON)
  languages!: Record<string, number>;

  @Field(() => Date, { nullable: true })
  lastActivityAt?: Date;

  @Field(() => Date)
  joinedAt!: Date;
}

@ObjectType()
export class PublicProfileGraphQL {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  userId!: string;

  @Field(() => String)
  username!: string;

  @Field(() => String, { nullable: true })
  displayName?: string | null;

  @Field(() => String, { nullable: true })
  bio?: string | null;

  @Field(() => String, { nullable: true })
  avatar?: string | null;

  @Field(() => String, { nullable: true })
  location?: string | null;

  @Field(() => String, { nullable: true })
  website?: string | null;

  @Field(() => [SocialLink])
  socialLinks!: SocialLink[];

  @Field(() => ProfileTheme)
  theme!: ProfileTheme;

  @Field(() => ProfileSettings)
  settings!: ProfileSettings;

  @Field(() => Boolean)
  isPublic!: boolean;

  @Field(() => String, { nullable: true })
  customDomain?: string | null;

  @Field(() => Int)
  viewCount!: number;

  @Field(() => ProfileStats, { nullable: true })
  stats?: ProfileStats;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PublicProfile as PrismaPublicProfile } from '@prisma/client';

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

export interface ProfileTheme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundStyle?: string;
  fontFamily?: string;
}

export interface ProfileSettings {
  isPublic?: boolean;
  showEmail?: boolean;
  showStats?: boolean;
  showPrivateRepos?: boolean;
  featuredProjects?: string[];
  customSections?: CustomSection[];
  layout?: string;
  showActivity?: boolean;
  showContributions?: boolean;
}

export interface CustomSection {
  title: string;
  content: string;
  order?: number;
  visible?: boolean;
}

export interface ProfileStats {
  totalProjects: number;
  publicProjects: number;
  totalStars: number;
  totalForks: number;
  languages: { [key: string]: number };
  lastActivityAt?: Date;
  joinedAt: Date;
}

export class PublicProfile
  implements Omit<PrismaPublicProfile, 'socialLinks' | 'theme' | 'settings'>
{
  @ApiProperty({ description: 'Profile ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Unique username' })
  username: string;

  @ApiPropertyOptional({ description: 'Display name' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'Profile bio' })
  bio: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  avatar: string | null;

  @ApiPropertyOptional({ description: 'Location' })
  location: string | null;

  @ApiPropertyOptional({ description: 'Website URL' })
  website: string | null;

  @ApiProperty({ description: 'Social media links' })
  socialLinks: SocialLink[];

  @ApiProperty({ description: 'Profile theme settings' })
  theme: ProfileTheme;

  @ApiProperty({ description: 'Profile settings' })
  settings: ProfileSettings;

  @ApiProperty({ description: 'Whether the profile is public' })
  isPublic: boolean;

  @ApiPropertyOptional({ description: 'Custom domain' })
  customDomain: string | null;

  @ApiProperty({ description: 'Profile view count' })
  viewCount: number;

  @ApiProperty({ description: 'Profile creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Profile last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Profile statistics' })
  stats?: ProfileStats;

  constructor(profile: PrismaPublicProfile) {
    this.id = profile.id;
    this.userId = profile.userId;
    this.username = profile.username;
    this.displayName = profile.displayName;
    this.bio = profile.bio;
    this.avatar = profile.avatar;
    this.location = profile.location;
    this.website = profile.website;
    this.socialLinks = Array.isArray(profile.socialLinks)
      ? (profile.socialLinks as unknown as SocialLink[])
      : [];
    this.theme =
      typeof profile.theme === 'object' && profile.theme !== null
        ? (profile.theme as unknown as ProfileTheme)
        : {};
    this.settings =
      typeof profile.settings === 'object' && profile.settings !== null
        ? (profile.settings as unknown as ProfileSettings)
        : {};
    this.isPublic = profile.isPublic;
    this.customDomain = profile.customDomain;
    this.viewCount = profile.viewCount;
    this.createdAt = profile.createdAt;
    this.updatedAt = profile.updatedAt;
  }
}

import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfileCustomizationService } from './profile-customization.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileSettingsDto } from './dto/profile-settings.dto';
import { ApplyThemePresetDto, UpdateThemeDto } from './dto/theme.dto';
import { AddSocialLinkDto, UpdateSocialLinksDto } from './dto/social-links.dto';
import { UpdateCustomSectionsDto } from './dto/custom-sections.dto';
import { PublicProfile } from './entities/public-profile.entity';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { PublicProfileGraphQL } from './entities/profile-graphql.entity';
import {
  CreateProfileInput,
  CustomSectionInput,
  ProfileConnection,
  ProfileSearchInput,
  ProfileSettingsInput,
  ProfileThemeInput,
  SocialLinkInput,
  UpdateProfileInput,
} from './dto/profile-graphql.dto';
import { PubSub } from 'graphql-subscriptions';
import { ProfileViewEvent } from '../common/dto/subscription.dto';

@Resolver(() => PublicProfileGraphQL)
export class ProfilesResolver {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly customizationService: ProfileCustomizationService,
    @Inject('PUB_SUB') private pubSub: PubSub,
  ) {}

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async createProfile(
    @Args('input') input: CreateProfileInput,
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.createProfile(userId, input);
    return this.convertToGraphQLProfile(profile);
  }

  @Query(() => PublicProfileGraphQL, { nullable: true })
  @UseGuards(EnhancedJwtGuard)
  async myProfile(@Context() context: any): Promise<PublicProfileGraphQL | null> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.getProfileByUserId(userId);
    return profile ? this.convertToGraphQLProfile(profile) : null;
  }

  @Query(() => PublicProfileGraphQL, { nullable: true })
  async publicProfile(@Args('username') username: string): Promise<PublicProfileGraphQL | null> {
    const profile = await this.profilesService.getPublicProfile(username);
    return profile ? this.convertToGraphQLProfile(profile) : null;
  }

  @Query(() => PublicProfileGraphQL, { nullable: true })
  async profileByDomain(@Args('domain') domain: string): Promise<PublicProfileGraphQL | null> {
    const profile = await this.profilesService.getProfileByDomain(domain);
    return profile ? this.convertToGraphQLProfile(profile) : null;
  }

  @Query(() => [PublicProfileGraphQL])
  async searchProfiles(
    @Args('query') query: string,
    @Args('limit', { defaultValue: 20 }) limit: number,
    @Args('offset', { defaultValue: 0 }) offset: number,
  ): Promise<PublicProfileGraphQL[]> {
    const profiles = await this.profilesService.searchProfiles(query, limit, offset);
    return profiles.map(profile => this.convertToGraphQLProfile(profile));
  }

  @Query(() => [PublicProfileGraphQL])
  async featuredProfiles(
    @Args('limit', { defaultValue: 10 }) limit: number,
  ): Promise<PublicProfileGraphQL[]> {
    const profiles = await this.profilesService.getFeaturedProfiles(limit);
    return profiles.map(profile => this.convertToGraphQLProfile(profile));
  }

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async updateProfile(
    @Args('input') input: UpdateProfileInput,
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.updateProfile(userId, input);
    return this.convertToGraphQLProfile(profile);
  }

  @Mutation(() => Boolean)
  @UseGuards(EnhancedJwtGuard)
  async updateProfileSettings(
    @Args('input') input: ProfileSettingsInput,
    @Context() context: any,
  ): Promise<boolean> {
    const userId = context.req.user.id;
    await this.profilesService.updateProfileSettings(userId, input);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(EnhancedJwtGuard)
  async deleteProfile(@Context() context: any): Promise<boolean> {
    const userId = context.req.user.id;
    await this.profilesService.deleteProfile(userId);
    return true;
  }

  @Query(() => Boolean)
  async isUsernameAvailable(@Args('username') username: string): Promise<boolean> {
    return this.profilesService.isUsernameAvailable(username);
  }

  @Query(() => Boolean)
  async isDomainAvailable(@Args('domain') domain: string): Promise<boolean> {
    return this.profilesService.isDomainAvailable(domain);
  }

  @Query(() => String)
  generateProfileUrl(
    @Args('username') username: string,
    @Args('customDomain', { nullable: true }) customDomain?: string,
  ): string {
    return this.profilesService.generateProfileUrl(username, customDomain);
  }

  // Theme Customization Queries

  @Query(() => [String])
  getSupportedPlatforms(): string[] {
    return this.customizationService.getSupportedPlatforms();
  }

  // Enhanced GraphQL Methods
  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async createProfileGraphQL(
    @Args('input') input: CreateProfileInput,
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.createProfile(userId, input);
    return this.convertToGraphQLProfile(profile);
  }

  @Query(() => PublicProfileGraphQL, { nullable: true })
  @UseGuards(EnhancedJwtGuard)
  async myProfileGraphQL(@Context() context: any): Promise<PublicProfileGraphQL | null> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.getProfileByUserId(userId);
    return profile ? this.convertToGraphQLProfile(profile) : null;
  }

  @Query(() => PublicProfileGraphQL, { nullable: true })
  async publicProfileGraphQL(
    @Args('username') username: string,
  ): Promise<PublicProfileGraphQL | null> {
    const profile = await this.profilesService.getPublicProfile(username);
    if (profile) {
      // Track profile view
      this.pubSub.publish('profileView', {
        profileView: {
          profileId: profile.id,
          viewerId: 'anonymous',
          timestamp: new Date(),
        },
      });
    }
    return profile ? this.convertToGraphQLProfile(profile) : null;
  }

  @Query(() => ProfileConnection)
  async searchProfilesGraphQL(
    @Args('input') input: ProfileSearchInput,
  ): Promise<ProfileConnection> {
    const profiles = await this.profilesService.searchProfiles(
      input.query || '',
      input.limit,
      input.offset,
    );

    return {
      edges: profiles.map((profile, index) => ({
        node: this.convertToGraphQLProfile(profile),
        cursor: Buffer.from(`${input.offset + index}`).toString('base64'),
      })),
      pageInfo: {
        hasNextPage: profiles.length === input.limit,
        hasPreviousPage: input.offset > 0,
        startCursor:
          profiles.length > 0 ? Buffer.from(`${input.offset}`).toString('base64') : undefined,
        endCursor:
          profiles.length > 0
            ? Buffer.from(`${input.offset + profiles.length - 1}`).toString('base64')
            : undefined,
      },
      totalCount: profiles.length, // This would need to be calculated separately for accurate count
    };
  }

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async updateProfileGraphQL(
    @Args('input') input: UpdateProfileInput,
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    const profile = await this.profilesService.updateProfile(userId, input);
    return this.convertToGraphQLProfile(profile);
  }

  @Mutation(() => Boolean)
  @UseGuards(EnhancedJwtGuard)
  async updateProfileSettingsGraphQL(
    @Args('input') input: ProfileSettingsInput,
    @Context() context: any,
  ): Promise<boolean> {
    const userId = context.req.user.id;
    await this.profilesService.updateProfileSettings(userId, input);
    return true;
  }

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async updateProfileThemeGraphQL(
    @Args('input') input: ProfileThemeInput,
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    await this.customizationService.updateTheme(userId, input);
    const profile = await this.profilesService.getProfileByUserId(userId);
    return this.convertToGraphQLProfile(profile!);
  }

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async updateSocialLinksGraphQL(
    @Args('socialLinks', { type: () => [SocialLinkInput] })
    socialLinks: SocialLinkInput[],
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    await this.customizationService.updateSocialLinks(userId, socialLinks);
    const profile = await this.profilesService.getProfileByUserId(userId);
    return this.convertToGraphQLProfile(profile!);
  }

  @Mutation(() => PublicProfileGraphQL)
  @UseGuards(EnhancedJwtGuard)
  async updateCustomSectionsGraphQL(
    @Args('customSections', { type: () => [CustomSectionInput] })
    customSections: CustomSectionInput[],
    @Context() context: any,
  ): Promise<PublicProfileGraphQL> {
    const userId = context.req.user.id;
    await this.customizationService.updateCustomSections(userId, customSections);
    const profile = await this.profilesService.getProfileByUserId(userId);
    return this.convertToGraphQLProfile(profile!);
  }

  // Subscriptions
  @Subscription(() => ProfileViewEvent, {
    filter: (payload, variables, context) => {
      return payload.profileView.profileId === variables.profileId;
    },
  })
  profileViews(@Args('profileId') profileId: string) {
    return (this.pubSub as any).asyncIterator('profileView');
  }

  // Helper method to convert PublicProfile to GraphQL entity
  private convertToGraphQLProfile(profile: PublicProfile): PublicProfileGraphQL {
    return {
      id: profile.id,
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      avatar: profile.avatar,
      location: profile.location,
      website: profile.website,
      socialLinks: profile.socialLinks,
      theme: profile.theme,
      settings: profile.settings,
      isPublic: profile.isPublic,
      customDomain: profile.customDomain,
      viewCount: profile.viewCount,
      stats: profile.stats,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { ProfileCustomizationService } from './profile-customization.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileSettingsDto } from './dto/profile-settings.dto';
import { ApplyThemePresetDto, UpdateThemeDto } from './dto/theme.dto';
import {
  AddSocialLinkDto,
  RemoveSocialLinkDto,
  UpdateSocialLinksDto,
} from './dto/social-links.dto';
import { UpdateCustomSectionsDto } from './dto/custom-sections.dto';
import { PublicProfile } from './entities/public-profile.entity';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { RequestWithUser } from '../auth/request-with-user';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly customizationService: ProfileCustomizationService,
  ) {}

  @Post()
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new public profile' })
  @ApiResponse({
    status: 201,
    description: 'Profile created successfully',
    type: PublicProfile,
  })
  @ApiResponse({
    status: 409,
    description: 'Profile already exists or username/domain taken',
  })
  async createProfile(
    @Request() req: RequestWithUser,
    @Body() createProfileDto: CreateProfileDto,
  ): Promise<PublicProfile> {
    return this.profilesService.createProfile(req.user.id, createProfileDto);
  }

  @Get('me')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: PublicProfile,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(@Request() req: RequestWithUser): Promise<PublicProfile> {
    const profile = await this.profilesService.getProfileByUserId(req.user.id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  @Put('me')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: PublicProfile,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateMyProfile(
    @Request() req: RequestWithUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<PublicProfile> {
    return this.profilesService.updateProfile(req.user.id, updateProfileDto);
  }

  @Put('me/settings')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile settings' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateProfileSettings(
    @Request() req: RequestWithUser,
    @Body() settingsDto: ProfileSettingsDto,
  ): Promise<{ message: string }> {
    await this.profilesService.updateProfileSettings(req.user.id, settingsDto);
    return { message: 'Settings updated successfully' };
  }

  @Delete('me')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete current user profile' })
  @ApiResponse({ status: 200, description: 'Profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async deleteMyProfile(@Request() req: RequestWithUser): Promise<{ message: string }> {
    await this.profilesService.deleteProfile(req.user.id);
    return { message: 'Profile deleted successfully' };
  }

  @Get('check-username/:username')
  @ApiOperation({ summary: 'Check if username is available' })
  @ApiResponse({ status: 200, description: 'Username availability checked' })
  async checkUsername(@Param('username') username: string): Promise<{ available: boolean }> {
    if (!username || username.length < 3) {
      throw new BadRequestException('Username must be at least 3 characters long');
    }

    const available = await this.profilesService.isUsernameAvailable(username);
    return { available };
  }

  @Get('check-domain/:domain')
  @ApiOperation({ summary: 'Check if custom domain is available' })
  @ApiResponse({ status: 200, description: 'Domain availability checked' })
  async checkDomain(@Param('domain') domain: string): Promise<{ available: boolean }> {
    if (!domain) {
      throw new BadRequestException('Domain is required');
    }

    const available = await this.profilesService.isDomainAvailable(domain);
    return { available };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search public profiles' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'limit',
    description: 'Number of results to return',
    required: false,
  })
  @ApiQuery({
    name: 'offset',
    description: 'Number of results to skip',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Profiles found',
    type: [PublicProfile],
  })
  async searchProfiles(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PublicProfile[]> {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    if (limitNum > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }

    return this.profilesService.searchProfiles(query, limitNum, offsetNum);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured public profiles' })
  @ApiQuery({
    name: 'limit',
    description: 'Number of profiles to return',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Featured profiles retrieved',
    type: [PublicProfile],
  })
  async getFeaturedProfiles(@Query('limit') limit?: string): Promise<PublicProfile[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;

    if (limitNum > 50) {
      throw new BadRequestException('Limit cannot exceed 50');
    }

    return this.profilesService.getFeaturedProfiles(limitNum);
  }

  @Get(':username')
  @ApiOperation({ summary: 'Get public profile by username' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: PublicProfile,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getPublicProfile(@Param('username') username: string): Promise<PublicProfile> {
    const profile = await this.profilesService.getPublicProfile(username);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  @Get('domain/:domain')
  @ApiOperation({ summary: 'Get public profile by custom domain' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: PublicProfile,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfileByDomain(@Param('domain') domain: string): Promise<PublicProfile> {
    const profile = await this.profilesService.getProfileByDomain(domain);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  // Theme Customization Endpoints

  @Get('themes/presets')
  @ApiOperation({ summary: 'Get available theme presets' })
  @ApiResponse({
    status: 200,
    description: 'Theme presets retrieved successfully',
  })
  getThemePresets() {
    return this.customizationService.getThemePresets();
  }

  @Put('me/theme')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile theme' })
  @ApiResponse({ status: 200, description: 'Theme updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateTheme(@Request() req: RequestWithUser, @Body() updateThemeDto: UpdateThemeDto) {
    const theme = await this.customizationService.updateTheme(req.user.id, updateThemeDto);
    return { theme, message: 'Theme updated successfully' };
  }

  @Post('me/theme/preset')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply a theme preset' })
  @ApiResponse({
    status: 200,
    description: 'Theme preset applied successfully',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async applyThemePreset(
    @Request() req: RequestWithUser,
    @Body() applyPresetDto: ApplyThemePresetDto,
  ) {
    const theme = await this.customizationService.applyThemePreset(
      req.user.id,
      applyPresetDto.presetName,
    );
    return { theme, message: 'Theme preset applied successfully' };
  }

  // Social Links Management Endpoints

  @Get('platforms')
  @ApiOperation({ summary: 'Get supported social media platforms' })
  @ApiResponse({
    status: 200,
    description: 'Supported platforms retrieved successfully',
  })
  getSupportedPlatforms() {
    return { platforms: this.customizationService.getSupportedPlatforms() };
  }

  @Put('me/social-links')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update all social links' })
  @ApiResponse({
    status: 200,
    description: 'Social links updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateSocialLinks(
    @Request() req: RequestWithUser,
    @Body() updateLinksDto: UpdateSocialLinksDto,
  ) {
    const socialLinks = await this.customizationService.updateSocialLinks(
      req.user.id,
      updateLinksDto.socialLinks,
    );
    return { socialLinks, message: 'Social links updated successfully' };
  }

  @Post('me/social-links')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a social link' })
  @ApiResponse({ status: 200, description: 'Social link added successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async addSocialLink(@Request() req: RequestWithUser, @Body() addLinkDto: AddSocialLinkDto) {
    const socialLinks = await this.customizationService.addSocialLink(req.user.id, addLinkDto);
    return { socialLinks, message: 'Social link added successfully' };
  }

  @Delete('me/social-links/:platform')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a social link' })
  @ApiResponse({ status: 200, description: 'Social link removed successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async removeSocialLink(@Request() req: RequestWithUser, @Param('platform') platform: string) {
    const socialLinks = await this.customizationService.removeSocialLink(req.user.id, platform);
    return { socialLinks, message: 'Social link removed successfully' };
  }

  // Custom Sections Management Endpoints

  @Put('me/custom-sections')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update custom profile sections' })
  @ApiResponse({
    status: 200,
    description: 'Custom sections updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateCustomSections(
    @Request() req: RequestWithUser,
    @Body() updateSectionsDto: UpdateCustomSectionsDto,
  ) {
    await this.customizationService.updateCustomSections(
      req.user.id,
      updateSectionsDto.customSections,
    );
    return { message: 'Custom sections updated successfully' };
  }

  // Profile Statistics Endpoint

  @Get('me/statistics')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comprehensive profile statistics' })
  @ApiResponse({
    status: 200,
    description: 'Profile statistics retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfileStatistics(@Request() req: RequestWithUser) {
    const statistics = await this.customizationService.calculateProfileStatistics(req.user.id);
    return { statistics };
  }
}

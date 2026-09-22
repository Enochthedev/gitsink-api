import { IsArray, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialLinkDto {
  @ApiProperty({
    description: 'Social platform name',
    example: 'github',
    enum: [
      'github',
      'gitlab',
      'bitbucket',
      'twitter',
      'linkedin',
      'instagram',
      'facebook',
      'youtube',
      'twitch',
      'discord',
      'telegram',
      'reddit',
      'stackoverflow',
      'dev.to',
      'medium',
      'hashnode',
      'personal-website',
      'blog',
      'portfolio',
    ],
  })
  @IsString()
  @MaxLength(50)
  platform!: string;

  @ApiProperty({
    description: 'Social profile URL',
    example: 'https://github.com/username',
  })
  @IsUrl()
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({
    description: 'Display label for the link',
    example: 'My GitHub',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class UpdateSocialLinksDto {
  @ApiProperty({
    description: 'Array of social media links',
    type: [SocialLinkDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks!: SocialLinkDto[];
}

export class AddSocialLinkDto extends SocialLinkDto {}

export class RemoveSocialLinkDto {
  @ApiProperty({
    description: 'Platform to remove',
    example: 'twitter',
  })
  @IsString()
  @MaxLength(50)
  platform!: string;
}

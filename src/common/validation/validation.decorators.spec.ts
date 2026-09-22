import { validate } from 'class-validator';
import {
  IsApiKeyFormat,
  IsGitHubRepoUrl,
  IsHexColor,
  IsInRange,
  IsOneOfIgnoreCase,
  IsSlug,
  IsStrongPassword,
  IsUniqueArray,
  IsValidUsername,
} from './validation.decorators';

class TestDto {
  @IsGitHubRepoUrl()
  repoUrl!: string;

  @IsValidUsername()
  username!: string;

  @IsStrongPassword()
  password!: string;

  @IsApiKeyFormat()
  apiKey!: string;

  @IsHexColor()
  color!: string;

  @IsSlug()
  slug!: string;

  @IsUniqueArray()
  tags!: string[];

  @IsInRange(1, 100)
  score!: number;

  @IsOneOfIgnoreCase(['active', 'inactive', 'pending'])
  status!: string;
}

describe('Validation Decorators', () => {
  let dto: TestDto;

  beforeEach(() => {
    dto = new TestDto();
  });

  describe('IsGitHubRepoUrl', () => {
    it('should validate correct GitHub URLs', async () => {
      dto.repoUrl = 'https://github.com/user/repository';
      const errors = await validate(dto);
      const repoUrlErrors = errors.filter(e => e.property === 'repoUrl');
      expect(repoUrlErrors).toHaveLength(0);
    });

    it('should reject invalid GitHub URLs', async () => {
      dto.repoUrl = 'https://gitlab.com/user/repository';
      const errors = await validate(dto);
      const repoUrlErrors = errors.filter(e => e.property === 'repoUrl');
      expect(repoUrlErrors.length).toBeGreaterThan(0);
    });

    it('should reject non-URL strings', async () => {
      dto.repoUrl = 'not-a-url';
      const errors = await validate(dto);
      const repoUrlErrors = errors.filter(e => e.property === 'repoUrl');
      expect(repoUrlErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidUsername', () => {
    it('should validate correct usernames', async () => {
      dto.username = 'valid_user-123';
      const errors = await validate(dto);
      const usernameErrors = errors.filter(e => e.property === 'username');
      expect(usernameErrors).toHaveLength(0);
    });

    it('should reject usernames that are too short', async () => {
      dto.username = 'ab';
      const errors = await validate(dto);
      const usernameErrors = errors.filter(e => e.property === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
    });

    it('should reject usernames with invalid characters', async () => {
      dto.username = 'user@name';
      const errors = await validate(dto);
      const usernameErrors = errors.filter(e => e.property === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
    });

    it('should reject usernames starting with special characters', async () => {
      dto.username = '_username';
      const errors = await validate(dto);
      const usernameErrors = errors.filter(e => e.property === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsStrongPassword', () => {
    it('should validate strong passwords', async () => {
      dto.password = 'StrongPass123!';
      const errors = await validate(dto);
      const passwordErrors = errors.filter(e => e.property === 'password');
      expect(passwordErrors).toHaveLength(0);
    });

    it('should reject passwords without uppercase', async () => {
      dto.password = 'weakpass123!';
      const errors = await validate(dto);
      const passwordErrors = errors.filter(e => e.property === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });

    it('should reject passwords without numbers', async () => {
      dto.password = 'WeakPassword!';
      const errors = await validate(dto);
      const passwordErrors = errors.filter(e => e.property === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });

    it('should reject passwords without special characters', async () => {
      dto.password = 'WeakPassword123';
      const errors = await validate(dto);
      const passwordErrors = errors.filter(e => e.property === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });

    it('should reject short passwords', async () => {
      dto.password = 'Weak1!';
      const errors = await validate(dto);
      const passwordErrors = errors.filter(e => e.property === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsApiKeyFormat', () => {
    it('should validate correct API key format', async () => {
      dto.apiKey = 'gsk_' + 'a'.repeat(64);
      const errors = await validate(dto);
      const apiKeyErrors = errors.filter(e => e.property === 'apiKey');
      expect(apiKeyErrors).toHaveLength(0);
    });

    it('should reject API keys with wrong prefix', async () => {
      dto.apiKey = 'api_' + 'a'.repeat(64);
      const errors = await validate(dto);
      const apiKeyErrors = errors.filter(e => e.property === 'apiKey');
      expect(apiKeyErrors.length).toBeGreaterThan(0);
    });

    it('should reject API keys with wrong length', async () => {
      dto.apiKey = 'gsk_' + 'a'.repeat(32);
      const errors = await validate(dto);
      const apiKeyErrors = errors.filter(e => e.property === 'apiKey');
      expect(apiKeyErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsHexColor', () => {
    it('should validate 6-digit hex colors', async () => {
      dto.color = '#FF0000';
      const errors = await validate(dto);
      const colorErrors = errors.filter(e => e.property === 'color');
      expect(colorErrors).toHaveLength(0);
    });

    it('should validate 3-digit hex colors', async () => {
      dto.color = '#F00';
      const errors = await validate(dto);
      const colorErrors = errors.filter(e => e.property === 'color');
      expect(colorErrors).toHaveLength(0);
    });

    it('should reject invalid hex colors', async () => {
      dto.color = '#GG0000';
      const errors = await validate(dto);
      const colorErrors = errors.filter(e => e.property === 'color');
      expect(colorErrors.length).toBeGreaterThan(0);
    });

    it('should reject colors without hash', async () => {
      dto.color = 'FF0000';
      const errors = await validate(dto);
      const colorErrors = errors.filter(e => e.property === 'color');
      expect(colorErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsSlug', () => {
    it('should validate correct slugs', async () => {
      dto.slug = 'valid-slug-123';
      const errors = await validate(dto);
      const slugErrors = errors.filter(e => e.property === 'slug');
      expect(slugErrors).toHaveLength(0);
    });

    it('should reject slugs with uppercase', async () => {
      dto.slug = 'Invalid-Slug';
      const errors = await validate(dto);
      const slugErrors = errors.filter(e => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should reject slugs starting with hyphen', async () => {
      dto.slug = '-invalid-slug';
      const errors = await validate(dto);
      const slugErrors = errors.filter(e => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsUniqueArray', () => {
    it('should validate arrays with unique values', async () => {
      dto.tags = ['tag1', 'tag2', 'tag3'];
      const errors = await validate(dto);
      const tagsErrors = errors.filter(e => e.property === 'tags');
      expect(tagsErrors).toHaveLength(0);
    });

    it('should reject arrays with duplicate values', async () => {
      dto.tags = ['tag1', 'tag2', 'tag1'];
      const errors = await validate(dto);
      const tagsErrors = errors.filter(e => e.property === 'tags');
      expect(tagsErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsInRange', () => {
    it('should validate numbers within range', async () => {
      dto.score = 50;
      const errors = await validate(dto);
      const scoreErrors = errors.filter(e => e.property === 'score');
      expect(scoreErrors).toHaveLength(0);
    });

    it('should reject numbers below range', async () => {
      dto.score = 0;
      const errors = await validate(dto);
      const scoreErrors = errors.filter(e => e.property === 'score');
      expect(scoreErrors.length).toBeGreaterThan(0);
    });

    it('should reject numbers above range', async () => {
      dto.score = 101;
      const errors = await validate(dto);
      const scoreErrors = errors.filter(e => e.property === 'score');
      expect(scoreErrors.length).toBeGreaterThan(0);
    });
  });

  describe('IsOneOfIgnoreCase', () => {
    it('should validate exact matches', async () => {
      dto.status = 'active';
      const errors = await validate(dto);
      const statusErrors = errors.filter(e => e.property === 'status');
      expect(statusErrors).toHaveLength(0);
    });

    it('should validate case-insensitive matches', async () => {
      dto.status = 'ACTIVE';
      const errors = await validate(dto);
      const statusErrors = errors.filter(e => e.property === 'status');
      expect(statusErrors).toHaveLength(0);
    });

    it('should reject invalid values', async () => {
      dto.status = 'invalid';
      const errors = await validate(dto);
      const statusErrors = errors.filter(e => e.property === 'status');
      expect(statusErrors.length).toBeGreaterThan(0);
    });
  });
});

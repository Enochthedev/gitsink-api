import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplateService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        APP_NAME: 'GitSink',
        FRONTEND_URL: 'http://localhost:3001',
        SUPPORT_EMAIL: 'support@gitsink.com',
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateWaitlistWelcome', () => {
    it('should generate waitlist welcome template', () => {
      const template = service.generateWaitlistWelcome();

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('text');
      expect(template).toHaveProperty('html');

      expect(template.subject).toContain('GitSink');
      expect(template.text).toContain('waitlist');
      expect(template.html).toContain('<!DOCTYPE html>');
    });

    it('should handle custom data', () => {
      const template = service.generateWaitlistWelcome({ name: 'John' });

      expect(template.subject).toBeDefined();
      expect(template.text).toBeDefined();
      expect(template.html).toBeDefined();
    });
  });

  describe('generateSignupConfirmation', () => {
    it('should generate signup confirmation template', () => {
      const template = service.generateSignupConfirmation({
        username: 'testuser',
      });

      expect(template.subject).toContain('Welcome');
      expect(template.text).toContain('testuser');
      expect(template.html).toContain('testuser');
    });
  });

  describe('generatePasswordReset', () => {
    it('should generate password reset template', () => {
      const template = service.generatePasswordReset({
        token: 'reset123',
        username: 'testuser',
      });

      expect(template.subject).toContain('Reset');
      expect(template.text).toContain('reset123');
      expect(template.html).toContain('reset123');
    });

    it('should handle missing username gracefully', () => {
      const template = service.generatePasswordReset({ token: 'reset123' });

      expect(template.subject).toBeDefined();
      expect(template.text).toContain('reset123');
      expect(template.html).toContain('reset123');
    });
  });

  describe('generateMagicLinkSignIn', () => {
    it('should generate magic link template', () => {
      const template = service.generateMagicLinkSignIn({
        token: 'magic123',
        username: 'testuser',
      });

      expect(template.subject).toContain('Sign in');
      expect(template.text).toContain('magic123');
      expect(template.html).toContain('magic123');
    });
  });

  describe('generatePasswordResetConfirmation', () => {
    it('should generate password reset confirmation template', () => {
      const template = service.generatePasswordResetConfirmation({
        username: 'testuser',
      });

      expect(template.subject).toContain('password has been reset');
      expect(template.text).toContain('successfully');
      expect(template.html).toContain('successfully');
    });
  });

  describe('generateSignInNotification', () => {
    it('should generate sign-in notification template', () => {
      const template = service.generateSignInNotification({
        username: 'testuser',
        location: 'San Francisco, CA',
        timestamp: new Date('2023-01-01T12:00:00Z'),
      });

      expect(template.subject).toContain('sign-in');
      expect(template.text).toContain('San Francisco');
      expect(template.html).toContain('San Francisco');
    });

    it('should handle missing location gracefully', () => {
      const template = service.generateSignInNotification({
        username: 'testuser',
      });

      expect(template.subject).toBeDefined();
      expect(template.text).toBeDefined();
      expect(template.html).toBeDefined();
    });
  });

  describe('template consistency', () => {
    it('should include GitSink branding in all templates', () => {
      const templates = [
        service.generateWaitlistWelcome(),
        service.generateSignupConfirmation(),
        service.generatePasswordReset({ token: 'test' }),
        service.generateMagicLinkSignIn({ token: 'test' }),
        service.generatePasswordResetConfirmation(),
        service.generateSignInNotification(),
      ];

      templates.forEach(template => {
        expect(template.subject.toLowerCase()).toContain('gitsink');
        expect(template.text.toLowerCase()).toContain('gitsink');
        expect(template.html.toLowerCase()).toContain('gitsink');
      });
    });

    it('should have valid HTML structure in all templates', () => {
      const templates = [
        service.generateWaitlistWelcome(),
        service.generateSignupConfirmation(),
        service.generatePasswordReset({ token: 'test' }),
        service.generateMagicLinkSignIn({ token: 'test' }),
        service.generatePasswordResetConfirmation(),
        service.generateSignInNotification(),
      ];

      templates.forEach(template => {
        expect(template.html).toContain('<!DOCTYPE html>');
        expect(template.html).toContain('<html>');
        expect(template.html).toContain('</html>');
        expect(template.html).toContain('<body>');
        expect(template.html).toContain('</body>');
      });
    });
  });
});

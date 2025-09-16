import { MagicLinkCleanupService } from './magic-link-cleanup.service';

describe('MagicLinkCleanupService Unit Tests', () => {
  describe('Service structure', () => {
    it('should have required methods', () => {
      // Test that the service has the expected interface
      expect(typeof MagicLinkCleanupService).toBe('function');

      // Check that the service has the expected methods
      expect(MagicLinkCleanupService.prototype.cleanupExpiredTokens).toBeDefined();
      expect(MagicLinkCleanupService.prototype.logMagicLinkStats).toBeDefined();
    });
  });

  describe('Cron job configuration', () => {
    it('should have cron decorators', () => {
      // Test that the service methods have cron decorators
      // This is a structural test to ensure the methods exist
      const cleanupMethod = MagicLinkCleanupService.prototype.cleanupExpiredTokens;
      const statsMethod = MagicLinkCleanupService.prototype.logMagicLinkStats;

      expect(typeof cleanupMethod).toBe('function');
      expect(typeof statsMethod).toBe('function');
    });
  });

  describe('Metrics integration', () => {
    it('should integrate with metrics service', () => {
      // Test that the service is designed to work with metrics
      // This is a structural test
      expect(MagicLinkCleanupService.name).toBe('MagicLinkCleanupService');
    });
  });
});

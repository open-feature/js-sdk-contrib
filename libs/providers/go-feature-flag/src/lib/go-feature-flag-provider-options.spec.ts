import type { GoFeatureFlagProviderOptions } from './go-feature-flag-provider-options';
import { EvaluationType } from './model';

describe('GoFeatureFlagProviderOptions', () => {
  describe('Type checking for endpoint configuration', () => {
    it('should allow endpoint for InProcess evaluation (default)', () => {
      const options: GoFeatureFlagProviderOptions = {
        endpoint: 'https://api.example.com',
        evaluationType: EvaluationType.InProcess,
      };

      expect(options.endpoint).toBe('https://api.example.com');
    });

    it('should allow endpoint when using Remote evaluation', () => {
      const options: GoFeatureFlagProviderOptions = {
        endpoint: 'https://api.example.com',
        evaluationType: EvaluationType.Remote,
      };

      expect(options.endpoint).toBe('https://api.example.com');
    });

    it('should allow omitting endpoint for evaluation type remote', () => {
      const options: GoFeatureFlagProviderOptions = {
        evaluationType: EvaluationType.Remote,
      };

      expect(options.endpoint).toBeUndefined();
    });

    it('should allow all base options with endpoint', () => {
      const options: GoFeatureFlagProviderOptions = {
        endpoint: 'https://api.example.com',
        timeout: 5000,
        flagChangePollingIntervalMs: 30000,
        dataFlushInterval: 60000,
        maxPendingEvents: 5000,
        disableDataCollection: true,
        apiKey: 'test-key',
      };

      expect(options.endpoint).toBe('https://api.example.com');
      expect(options.timeout).toBe(5000);
      expect(options.flagChangePollingIntervalMs).toBe(30000);
      expect(options.dataFlushInterval).toBe(60000);
      expect(options.maxPendingEvents).toBe(5000);
      expect(options.disableDataCollection).toBe(true);
      expect(options.apiKey).toBe('test-key');
    });

    it('should allow all base options without endpoint when evaluation type is remote', () => {
      const options: GoFeatureFlagProviderOptions = {
        timeout: 5000,
        flagChangePollingIntervalMs: 30000,
        disableDataCollection: false,
        evaluationType: EvaluationType.Remote,
      };

      expect(options.endpoint).toBeUndefined();
      expect(options.timeout).toBe(5000);
      expect(options.flagChangePollingIntervalMs).toBe(30000);
      expect(options.disableDataCollection).toBe(false);
    });
  });
});

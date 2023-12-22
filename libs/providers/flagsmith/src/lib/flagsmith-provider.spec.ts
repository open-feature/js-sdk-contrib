import { createFlagsmithInstance } from 'flagsmith';
import FlagsmithWebProvider from './flagsmith-provider';
import { FlagSource, IInitConfig } from 'flagsmith/types';
import { ProviderEvents, ProviderStatus } from '@openfeature/web-sdk';

// Mock the dependencies
jest.mock('flagsmith', () => ({
  createFlagsmithInstance: jest.fn(),
}));

const logger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  reset: jest.fn(),
  warn: jest.fn(),
};

const exampleConfig: IInitConfig = {
  environmentID: '0p3nf34tur3',
};
describe('FlagsmithWebProvider', () => {
  let flagsmithProvider: FlagsmithWebProvider;

  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods of mock logger
    jest.clearAllMocks();

    // Mock createFlagsmithInstance to return a simple mock client
    (createFlagsmithInstance as jest.Mock).mockReturnValue({
      init: jest.fn(),
      hasFeature: jest.fn(),
      getValue: jest.fn(),
      loadingState: {
        source: FlagSource.CACHE,
      },
    });

    // Create an instance of FlagsmithWebProvider for each test
    flagsmithProvider = new FlagsmithWebProvider(exampleConfig, logger);
  });

  describe('Initialization', () => {
    it('should initialize the FlagsmithWebProvider', async () => {
      await flagsmithProvider.initialize();

      expect(flagsmithProvider.status).toBe(ProviderStatus.READY);
      expect(createFlagsmithInstance).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      // Mock createFlagsmithInstance to throw an error during initialization
      (createFlagsmithInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Initialization Error');
      });

      await flagsmithProvider.initialize();

      expect(flagsmithProvider.status).toBe(ProviderStatus.ERROR);
      expect(logger.error).toHaveBeenCalled();
      expect(flagsmithProvider.events.emit).toHaveBeenCalledWith(
        ProviderEvents.Error,
        expect.objectContaining({ message: 'Initialization Error' }),
      );
    });
  });

  describe('Context Change', () => {
    it('should handle context change', async () => {
      // Mock initialize method
      flagsmithProvider.initialize = jest.fn();

      await flagsmithProvider.onContextChange({}, { user: 'newUser' });

      expect(flagsmithProvider.events.emit).toHaveBeenCalledWith(
        ProviderEvents.Stale,
        expect.objectContaining({ message: 'Context Changed' }),
      );
      expect(flagsmithProvider.initialize).toHaveBeenCalledWith({ user: 'newUser' });
    });
  });

  // Add more test cases for other methods and edge cases as needed
});

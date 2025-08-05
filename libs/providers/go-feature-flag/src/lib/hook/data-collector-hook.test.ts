import { DataCollectorHook } from './data-collector-hook';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { HookContext, EvaluationDetails } from '@openfeature/server-sdk';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';
import { mockLogger } from '../testutil/mock-logger';

describe('DataCollectorHook', () => {
  let mockEvaluator: jest.Mocked<IEvaluator>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let hook: DataCollectorHook;

  beforeEach(() => {
    mockEvaluator = {
      isFlagTrackable: jest.fn(),
      initialize: jest.fn(),
      dispose: jest.fn(),
      evaluateBoolean: jest.fn(),
      evaluateString: jest.fn(),
      evaluateNumber: jest.fn(),
      evaluateObject: jest.fn(),
    } as jest.Mocked<IEvaluator>;

    mockEventPublisher = {
      addEvent: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<EventPublisher>;

    hook = new DataCollectorHook(mockEvaluator, mockEventPublisher);
  });

  describe('constructor', () => {
    it('should throw error if evaluator is null', () => {
      expect(() => new DataCollectorHook(null as any, mockEventPublisher)).toThrow(EvaluatorNotFoundException);
    });

    it('should throw error if eventPublisher is null', () => {
      expect(() => new DataCollectorHook(mockEvaluator, null as any)).toThrow(EventPublisherNotFoundException);
    });
  });

  describe('after', () => {
    it('should not collect data if flag is not trackable', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(false);

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: { targetingKey: 'user-1' },
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
      };

      const details: EvaluationDetails<boolean> = {
        flagKey: 'test-flag',
        value: true,
        variant: 'on',
        reason: 'TARGETING_MATCH',
        flagMetadata: {},
      };

      await hook.after(context, details);

      expect(mockEvaluator.isFlagTrackable).toHaveBeenCalledWith('test-flag');
      expect(mockEventPublisher.addEvent).not.toHaveBeenCalled();
    });

    it('should collect data if flag is trackable', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: { targetingKey: 'user-1' },
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
      };

      const details: EvaluationDetails<boolean> = {
        flagKey: 'test-flag',
        value: true,
        variant: 'on',
        reason: 'TARGETING_MATCH',
        flagMetadata: {},
      };

      await hook.after(context, details);

      expect(mockEvaluator.isFlagTrackable).toHaveBeenCalledWith('test-flag');
      expect(mockEventPublisher.addEvent).toHaveBeenCalledWith({
        kind: 'feature',
        key: 'test-flag',
        contextKind: 'user',
        default: false,
        variation: 'on',
        value: true,
        userKey: 'user-1',
        creationDate: expect.any(Number),
      });
    });

    it('should handle anonymous user correctly', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: { targetingKey: '1234', anonymous: true },
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
      };

      const details: EvaluationDetails<boolean> = {
        flagKey: 'test-flag',
        value: true,
        variant: 'on',
        reason: 'TARGETING_MATCH',
        flagMetadata: {},
      };

      await hook.after(context, details);

      expect(mockEventPublisher.addEvent).toHaveBeenCalledWith({
        kind: 'feature',
        key: 'test-flag',
        contextKind: 'anonymousUser',
        default: false,
        variation: 'on',
        value: true,
        userKey: '1234',
        creationDate: expect.any(Number),
      });
    });
  });

  describe('error', () => {
    it('should not collect data if flag is not trackable', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(false);

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: { targetingKey: 'user-1' },
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
      };

      const error = new Error('Test error');

      await hook.error(context, error);

      expect(mockEvaluator.isFlagTrackable).toHaveBeenCalledWith('test-flag');
      expect(mockEventPublisher.addEvent).not.toHaveBeenCalled();
    });

    it('should collect error data if flag is trackable', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: { targetingKey: 'user-1' },
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
      };

      const error = new Error('Test error');

      await hook.error(context, error);

      expect(mockEvaluator.isFlagTrackable).toHaveBeenCalledWith('test-flag');
      expect(mockEventPublisher.addEvent).toHaveBeenCalledWith({
        kind: 'feature',
        key: 'test-flag',
        contextKind: 'user',
        default: true,
        variation: 'SdkDefault',
        value: false,
        userKey: 'user-1',
        creationDate: expect.any(Number),
      });
    });
  });
});

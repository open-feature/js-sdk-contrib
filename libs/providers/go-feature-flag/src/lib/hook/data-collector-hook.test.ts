import { DataCollectorHook } from './data-collector-hook';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { HookContext, EvaluationDetails, Logger } from '@openfeature/server-sdk';
import { MapHookData } from '@openfeature/server-sdk';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';

describe('DataCollectorHook', () => {
  let mockEvaluator: jest.Mocked<IEvaluator>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let hook: DataCollectorHook;
  let mockLogger: jest.Mocked<Logger>;

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

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

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

  describe('disableDataCollection', () => {
    /** The hook context both stages take; the stages only read `flagKey` before the gate. */
    const contextFor = (): HookContext<boolean> => ({
      flagKey: 'test-flag',
      defaultValue: false,
      context: { targetingKey: 'user-1' },
      flagValueType: 'boolean',
      clientMetadata: { providerMetadata: { name: 'test' } },
      providerMetadata: { name: 'test' },
      logger: mockLogger,
      hookData: new MapHookData(),
    });

    const details: EvaluationDetails<boolean> = {
      flagKey: 'test-flag',
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      flagMetadata: {},
    };

    it('should not record a successful evaluation when data collection is disabled', async () => {
      // Trackable on purpose: the option has to win over the flag's own trackability, otherwise it
      // only suppresses events the provider was not going to send anyway.
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
      const disabledHook = new DataCollectorHook(mockEvaluator, mockEventPublisher, {
        disableDataCollection: true,
      });

      await disabledHook.after(contextFor(), details);

      expect(mockEventPublisher.addEvent).not.toHaveBeenCalled();
    });

    it('should not record a failed evaluation when data collection is disabled', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
      const disabledHook = new DataCollectorHook(mockEvaluator, mockEventPublisher, {
        disableDataCollection: true,
      });

      await disabledHook.error(contextFor(), new Error('boom'));

      // Gating only one stage leaves telemetry covering errors but not successes, which reads
      // downstream as data loss rather than as the opt-out the caller asked for.
      expect(mockEventPublisher.addEvent).not.toHaveBeenCalled();
    });

    it('should record on both stages when data collection is enabled', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
      const enabledHook = new DataCollectorHook(mockEvaluator, mockEventPublisher, {
        disableDataCollection: false,
      });

      await enabledHook.after(contextFor(), details);
      await enabledHook.error(contextFor(), new Error('boom'));

      expect(mockEventPublisher.addEvent).toHaveBeenCalledTimes(2);
    });

    it('should default to collecting when the flag is omitted', async () => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
      const defaultHook = new DataCollectorHook(mockEvaluator, mockEventPublisher);

      await defaultHook.after(contextFor(), details);

      // `@default false` - an omitted option must not silently turn telemetry off.
      expect(mockEventPublisher.addEvent).toHaveBeenCalledTimes(1);
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
        hookData: new MapHookData(),
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
        hookData: new MapHookData(),
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
        hookData: new MapHookData(),
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
        hookData: new MapHookData(),
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
        hookData: new MapHookData(),
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

import { DataCollectorHook } from './data-collector-hook';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { HookContext, EvaluationDetails, FlagMetadata, Logger } from '@openfeature/server-sdk';
import { MapHookData } from '@openfeature/server-sdk';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';
import type { FeatureEvent } from '../model';

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

  describe('feature event fields', () => {
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

    const detailsWith = (flagMetadata: FlagMetadata): EvaluationDetails<boolean> => ({
      flagKey: 'test-flag',
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      flagMetadata,
    });

    /** The single event the hook published, for assertions about individual fields. */
    const publishedEvent = () => mockEventPublisher.addEvent.mock.calls[0][0] as FeatureEvent;

    beforeEach(() => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
    });

    const versionCases: { label: string; metadata: FlagMetadata; expected?: string }[] = [
      { label: 'a string version', metadata: { version: '1.0.0' }, expected: '1.0.0' },
      // A configuration carries `version: "1.0"` as readily as `version: 1`; a cast would have put
      // the number straight into a string-typed field.
      { label: 'a numeric version', metadata: { version: 3 }, expected: '3' },
      { label: 'no version', metadata: {}, expected: undefined },
      // Not a version. Stringifying it would export the literal "true".
      { label: 'a boolean version', metadata: { version: true }, expected: undefined },
    ];

    it.each(versionCases)('should populate version from $label', async ({ metadata, expected }) => {
      await hook.after(contextFor(), detailsWith(metadata));

      expect(publishedEvent().version).toBe(expected);
    });

    it('should mark a successful evaluation as INPROCESS', async () => {
      await hook.after(contextFor(), detailsWith({}));

      // Unconditional: the remote evaluator reports every flag as untrackable, so this hook only
      // ever runs for a locally evaluated flag.
      expect(publishedEvent().source).toBe('INPROCESS');
    });

    it('should mark a failed evaluation as INPROCESS', async () => {
      await hook.error(contextFor(), new Error('boom'));

      expect(publishedEvent().source).toBe('INPROCESS');
    });
  });

  describe('remote fallback results', () => {
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

    const detailsWith = (flagMetadata: FlagMetadata): EvaluationDetails<boolean> => ({
      flagKey: 'test-flag',
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      flagMetadata,
    });

    beforeEach(() => {
      mockEvaluator.isFlagTrackable.mockReturnValue(true);
    });

    it('should not record an evaluation the relay proxy already answered', async () => {
      await hook.after(contextFor(), detailsWith({ gofeatureflag_evaluated_remotely: true }));

      // The relay proxy records the evaluations it answers, so exporting here would double-count.
      expect(mockEventPublisher.addEvent).not.toHaveBeenCalled();
    });

    it('should still record a locally evaluated flag', async () => {
      await hook.after(contextFor(), detailsWith({}));

      expect(mockEventPublisher.addEvent).toHaveBeenCalledTimes(1);
    });

    it('should not read a non-true value as a fallback marker', async () => {
      await hook.after(contextFor(), detailsWith({ gofeatureflag_evaluated_remotely: false }));

      expect(mockEventPublisher.addEvent).toHaveBeenCalledTimes(1);
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
        version: undefined,
        source: 'INPROCESS',
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
        version: undefined,
        source: 'INPROCESS',
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
        source: 'INPROCESS',
      });
    });
  });
});

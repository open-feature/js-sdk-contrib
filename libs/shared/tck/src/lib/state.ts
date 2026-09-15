import type {
  Client,
  EvaluationContext,
  EvaluationDetails,
  EventDetails,
  FlagValue,
  Provider,
  ServerProviderEvents,
} from '@openfeature/server-sdk';
import type { TckOptions } from './options';
import type { FlagType } from './values';

/**
 * The payload the server SDK hands an event handler.
 *
 * `EventDetails` defaults to *both* the server and the web event unions, which is wider than
 * anything this suite can ever see: it runs on the server SDK, so pinning the parameter keeps the
 * recorder's type honest about what it holds.
 */
export type ServerEventDetails = EventDetails<ServerProviderEvents>;

/**
 * Captures the events of one type, in order, so a scenario can consume them one at a time.
 *
 * Consuming rather than merely observing is what makes the stale scenario work: it awaits a
 * `PROVIDER_READY` at the start and a second, different `PROVIDER_READY` once the backend is back,
 * and a recorder that only remembered "ready has fired at some point" would report the second
 * assertion as satisfied by the first event.
 */
export class EventRecorder {
  // The SDK types the payload as optional, so an entry may be `undefined`. It is still queued
  // rather than dropped: an event that arrives without details has still arrived, and every
  // "should have been executed" assertion is about arrival. Dropping it would turn a delivered
  // event into a timeout, which is the most misleading failure this class could produce.
  private readonly queue: (ServerEventDetails | undefined)[] = [];

  /** The most recently consumed event, which the payload assertions inspect. */
  last: ServerEventDetails | undefined;

  constructor(readonly eventName: string) {}

  record(details: ServerEventDetails | undefined): void {
    this.queue.push(details);
  }

  /** Consumes the next event of this recorder's type, waiting up to `timeoutMs`. */
  async next(timeoutMs: number): Promise<ServerEventDetails | undefined> {
    const deadline = Date.now() + timeoutMs;

    while (this.queue.length === 0) {
      if (Date.now() > deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a ${this.eventName} event. If the provider ` +
            `is simply slower than this to notice, raise eventTimeoutMs rather than treating it ` +
            `as a failure`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const details = this.queue.shift();
    this.last = details;
    return details;
  }
}

/** The flag a scenario declared, and the type it is being requested as. */
export interface FlagUnderTest {
  key: string;
  type: FlagType;
  defaultValue: unknown;
}

/** The two provider functions a scenario may call directly rather than through the SDK. */
export type LifecycleOperation = 'shutdown' | 'initialize';

/**
 * The outcome of one direct call into the provider's lifecycle.
 *
 * The shutdown scenarios call the provider's own `onClose` and `initialize` rather than going
 * through the SDK, because the SDK's bookkeeping around them is Appendix B's business rather than
 * this suite's. Each call is recorded the way an evaluation is — what it threw, if anything — so
 * that "no exception should have been thrown" reads one kind of record for both, plus how long it
 * took, which is what the prompt-shutdown scenario bounds.
 */
export interface LifecycleRecord {
  operation: LifecycleOperation;
  /** Wall-clock milliseconds the call took to settle, or to be given up on. */
  durationMs: number;
  /** What the call threw or rejected with, if anything; `undefined` means it settled cleanly. */
  thrown: unknown;
}

/** Something the scenario asked of the provider that threw, and what it was. */
export interface ThrownBy {
  /** What was being called, for the failure message: `the evaluation`, `shutdown`, `initialize`. */
  what: string;
  error: unknown;
}

/**
 * Everything one scenario accumulates.
 *
 * A single instance is shared by every step definition of a suite and reset before each scenario,
 * which is how jest-cucumber's `autoBindSteps` threads state between steps.
 */
export class TckState {
  client: Client | undefined;
  /**
   * The provider instance under test, as the factory produced it.
   *
   * Everything else reaches the provider through {@link client}, which is how an application would.
   * The lifecycle and metadata steps are the exception: they ask the provider itself, because what
   * they verify is the provider's own `onClose`, `initialize` and `metadata` rather than the SDK's
   * handling of them.
   */
  provider: Provider | undefined;
  flag: FlagUnderTest | undefined;
  /**
   * The evaluation context a scenario supplied, or `undefined` if it supplied none.
   *
   * The distinction is load-bearing rather than cosmetic, which is why this is not defaulted to an
   * empty object. One `@targeting` scenario asserts that a targeting rule which cannot match does
   * not error *when no context is passed at all*, and it catches a provider that requires a
   * targeting key. Passing `{}` where the scenario said nothing would put that provider on a
   * different code path and the scenario would stop asking its question.
   */
  context: EvaluationContext | undefined;
  details: EvaluationDetails<FlagValue> | undefined;
  /** The error an evaluation threw, if any. See the "no exception" step for why this matters. */
  thrown: unknown;
  /** Every direct lifecycle call this scenario made, in order. */
  readonly lifecycle: LifecycleRecord[] = [];
  remembered: unknown;
  hasMemory = false;
  readonly recorders = new Map<ServerProviderEvents, EventRecorder>();

  /**
   * What the provider called itself, observed from the last scenario that registered one.
   *
   * Deliberately outlives {@link reset}: it identifies the subject of the whole suite rather than
   * anything about one scenario, and the conformance report needs it after the last scenario has
   * finished. A suite in which every scenario was skipped never observes one, which is why the
   * report falls back to the suite name rather than emitting an empty string.
   */
  providerName: string | undefined;

  constructor(readonly options: TckOptions) {}

  reset(): void {
    this.client = undefined;
    this.provider = undefined;
    this.flag = undefined;
    this.context = undefined;
    this.details = undefined;
    this.thrown = undefined;
    this.lifecycle.length = 0;
    this.remembered = undefined;
    this.hasMemory = false;
    this.recorders.clear();
  }

  requireClient(): Client {
    if (!this.client) {
      throw new Error(
        'no provider has been registered in this scenario: a "Given a stable provider" or ' +
          '"Given a unavailable provider" step must come first',
      );
    }
    return this.client;
  }

  requireProvider(): Provider {
    if (!this.provider) {
      throw new Error(
        'no provider has been created in this scenario: a "Given a stable provider" or ' +
          '"Given a unavailable provider" step must come first',
      );
    }
    return this.provider;
  }

  /** The most recent direct shutdown call, for the step that bounds it. */
  requireShutdown(): LifecycleRecord {
    for (let index = this.lifecycle.length - 1; index >= 0; index -= 1) {
      const record = this.lifecycle[index];
      if (record.operation === 'shutdown') {
        return record;
      }
    }
    throw new Error(
      'the provider has not been shut down in this scenario: a "When the provider is shut down" ' +
        'step must come first',
    );
  }

  /**
   * Everything the scenario asked of the provider that threw, in the order it was asked.
   *
   * The evaluation and the lifecycle calls are recorded separately, since they carry different
   * things, but "did anything the scenario asked of the provider throw" is one question and this is
   * where it is answered. The "no exception" step is the only reader.
   */
  exceptions(): ThrownBy[] {
    const thrown: ThrownBy[] = this.lifecycle
      .filter((record) => record.thrown !== undefined)
      .map((record) => ({ what: record.operation, error: record.thrown }));

    if (this.thrown !== undefined) {
      thrown.push({ what: 'the evaluation', error: this.thrown });
    }
    return thrown;
  }

  /** Whether the scenario has asked anything of the provider yet. */
  hasCalledProvider(): boolean {
    return this.details !== undefined || this.thrown !== undefined || this.lifecycle.length > 0;
  }

  requireFlag(): FlagUnderTest {
    if (!this.flag) {
      throw new Error(
        'no flag has been declared in this scenario: a "Given a <type>-flag with key ... and a ' +
          'default value ..." step must come first',
      );
    }
    return this.flag;
  }

  requireDetails(): EvaluationDetails<FlagValue> {
    if (!this.details) {
      throw new Error(
        'no flag has been evaluated in this scenario: a "When the flag was evaluated with ' +
          'details" step must come first',
      );
    }
    return this.details;
  }

  requireRecorder(event: ServerProviderEvents, name: string): EventRecorder {
    const recorder = this.recorders.get(event);
    if (!recorder) {
      throw new Error(
        `no handler was registered for ${name} in this scenario: a "Given a <kind> event handler" ` +
          `step must come first`,
      );
    }
    return recorder;
  }
}

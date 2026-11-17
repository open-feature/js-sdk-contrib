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
 * `EventDetails` defaults to both the server and the web event unions; this suite runs on the server
 * SDK, so pinning the parameter keeps the recorder's type honest about what it holds.
 */
export type ServerEventDetails = EventDetails<ServerProviderEvents>;

/**
 * One recorded event: its payload, and where it sits among every event of the scenario.
 *
 * The ordinal is what makes a question about order *across kinds* answerable at all. Each kind has
 * its own recorder and its own queue — see {@link EventRecorder} — which is why awaiting one kind
 * cannot discard another kind's record, and equally why neither queue alone says which of the two
 * arrived first.
 */
export interface RecordedEvent {
  /** Arrival number within the scenario, counted across every kind, starting at 1. */
  ordinal: number;
  /** The payload the SDK delivered, which may be absent. */
  details: ServerEventDetails | undefined;
}

/**
 * Captures the events of one type, in order, so a scenario can consume them one at a time.
 *
 * Consuming rather than merely observing is what makes the stale scenario work: it awaits a
 * `PROVIDER_READY` at the start and a second, different `PROVIDER_READY` once the backend is back,
 * and a recorder that only remembered "ready has fired at some point" would report the second
 * assertion as satisfied by the first event.
 *
 * Consuming claims **only this kind's** record: an error recorded before an awaited ready event is
 * still there afterwards, for the step that asks about the order of the two. A single queue drained
 * through the match would have thrown that record away and left the ordering question nothing to
 * object to.
 */
export class EventRecorder {
  // The payload is optional, so an entry's `details` may be `undefined`. Queued rather than dropped:
  // every "should have been executed" assertion is about arrival, and dropping it would turn a
  // delivered event into a timeout.
  private readonly queue: RecordedEvent[] = [];

  /** The most recently consumed event, which the payload assertions inspect. */
  last: ServerEventDetails | undefined;

  /**
   * @param eventName the kind this recorder captures, for failure messages
   * @param nextOrdinal hands out arrival numbers shared with every other recorder of the scenario
   */
  constructor(
    readonly eventName: string,
    private readonly nextOrdinal: () => number,
  ) {}

  record(details: ServerEventDetails | undefined): void {
    this.queue.push({ ordinal: this.nextOrdinal(), details });
  }

  /**
   * The earliest event of this kind no step has consumed yet, or `undefined` if there is none.
   *
   * Read by the ordering assertion, which asks about what is *still* recorded: an event an earlier
   * step claimed was already accounted for by that step.
   */
  get unclaimed(): RecordedEvent | undefined {
    return this.queue[0];
  }

  /** Consumes the next event of this recorder's type, waiting up to `timeoutMs`. */
  async next(timeoutMs: number): Promise<RecordedEvent> {
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

    const event = this.queue.shift();
    if (!event) {
      // Unreachable: the loop above exits only with something queued, and no other code consumes.
      throw new Error(`the ${this.eventName} queue emptied between the wait and the read`);
    }

    this.last = event.details;
    return event;
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
 * Recorded the way an evaluation is — what it threw, if anything — so that "no exception should have
 * been thrown" reads one kind of record for both, plus how long it took, which the prompt-shutdown
 * scenario bounds.
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
   * Everything else reaches the provider through {@link client}, as an application would. The
   * lifecycle and metadata steps are the exception, verifying the provider's own `onClose`,
   * `initialize` and `metadata` rather than the SDK's handling of them.
   */
  provider: Provider | undefined;
  flag: FlagUnderTest | undefined;
  /**
   * The evaluation context a scenario supplied, or `undefined` if it supplied none.
   *
   * Not defaulted to `{}`: one `@targeting` scenario asserts that a rule which cannot match does not
   * error *when no context is passed at all*, which catches a provider that requires a targeting
   * key. Passing `{}` where the scenario said nothing would put it on a different code path and the
   * scenario would stop asking its question.
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
   * How many events the scenario has recorded, across every kind.
   *
   * Owned here rather than by a recorder because it has to be shared: one counter is what puts
   * records of different kinds in a single order.
   */
  private eventCount = 0;

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
    this.eventCount = 0;
  }

  /** The arrival number of the next event, whichever kind records it. */
  nextEventOrdinal(): number {
    this.eventCount += 1;
    return this.eventCount;
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
   * The evaluation and the lifecycle calls are recorded separately, but "did anything throw" is one
   * question. The "no exception" step is the only reader.
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

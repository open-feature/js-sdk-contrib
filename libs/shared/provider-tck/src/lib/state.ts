import type { Client, EvaluationDetails, EventDetails, FlagValue, ServerProviderEvents } from '@openfeature/server-sdk';
import type { TckOptions } from './options';
import type { FlagType } from './values';

/**
 * Captures the events of one type, in order, so a scenario can consume them one at a time.
 *
 * Consuming rather than merely observing is what makes the stale scenario work: it awaits a
 * `PROVIDER_READY` at the start and a second, different `PROVIDER_READY` once the backend is back,
 * and a recorder that only remembered "ready has fired at some point" would report the second
 * assertion as satisfied by the first event.
 */
export class EventRecorder {
  private readonly queue: EventDetails[] = [];

  /** The most recently consumed event, which the payload assertions inspect. */
  last: EventDetails | undefined;

  constructor(readonly eventName: string) {}

  record(details: EventDetails): void {
    this.queue.push(details);
  }

  /** Consumes the next event of this recorder's type, waiting up to `timeoutMs`. */
  async next(timeoutMs: number): Promise<EventDetails> {
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

    const details = this.queue.shift() as EventDetails;
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

/**
 * Everything one scenario accumulates.
 *
 * A single instance is shared by every step definition of a suite and reset before each scenario,
 * which is how jest-cucumber's `autoBindSteps` threads state between steps.
 */
export class TckState {
  client: Client | undefined;
  flag: FlagUnderTest | undefined;
  details: EvaluationDetails<FlagValue> | undefined;
  /** The error an evaluation threw, if any. See the "no exception" step for why this matters. */
  thrown: unknown;
  remembered: unknown;
  hasMemory = false;
  readonly recorders = new Map<ServerProviderEvents, EventRecorder>();

  constructor(readonly options: TckOptions) {}

  reset(): void {
    this.client = undefined;
    this.flag = undefined;
    this.details = undefined;
    this.thrown = undefined;
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

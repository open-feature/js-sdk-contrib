import { InMemoryProvider, OpenFeatureEventEmitter, ServerProviderEvents } from '@openfeature/server-sdk';
import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import type { BackendControl } from './control';
import type { FlagConfiguration } from './flags';
import { CHANGING_BASELINE, CHANGING_CHANGED, CHANGING_FLAG_KEY, canonicalFlagSet } from './flags';

/**
 * A flag store an initialisation reaches, which may refuse to answer — which is all the
 * `@unavailable` scenarios need, with no port to close and no container to stop.
 */
export type ControllableBackend = () => FlagConfiguration;

/** What this provider calls itself. Asserted only as "not empty", by the metadata feature. */
const PROVIDER_NAME = 'tck-controllable-provider';

/**
 * An in-process provider with a **real initialisation**, for the TCK's own Docker-free self-test.
 *
 * The SDK's `InMemoryProvider` cannot cover `lifecycle.feature`: it implements neither `initialize`
 * nor `onClose`, and the SDK's registry treats a provider with no `initialize` as `READY` the moment
 * it is registered, so the readiness scenario would pass having demonstrated nothing. That is why
 * `inMemory.spec.ts` leaves {@link Capability.Lifecycle} undeclared — and why, without this
 * provider, the shutdown and re-initialisation steps would execute only through the Docker-gated
 * flagd adoption, where a broken TCK step looks like a provider defect.
 *
 * So this provider acquires something: it starts owning nothing, {@link initialize} reaches a
 * {@link ControllableBackend} that may refuse it, and {@link onClose} drops what was acquired. The
 * store is an object in this process, but the *shape* is the one the lifecycle scenarios assert.
 *
 * ## Composition rather than `extends InMemoryProvider`
 *
 * Seeding a subclass's flags at `initialize()` time means calling `putConfiguration`, which ends
 * with an unconditional `events.emit(ConfigurationChanged, { flagsChanged })` — there is no quiet
 * path through it. A subclass's emitter is the one the SDK is subscribed to, so every initialisation
 * would announce a configuration change naming every flag in the set, and the suite would be
 * asserting against behaviour the double invented. Holding the delegate in a field keeps every
 * emission deliberate.
 *
 * **Not part of the published API**: excluded from `tsconfig.lib.json`, so it is not in the package.
 * An adopter with no backend uses {@link InProcessControl} and the SDK's own provider.
 */
export class ControllableProvider implements Provider {
  readonly runsOn = 'server' as const;

  readonly metadata = { name: PROVIDER_NAME } as const;

  /**
   * This provider's own emitter, and the only one the SDK ever sees. The delegate is never
   * registered with the OpenFeature API, so an event it emitted would reach nobody — which is why
   * {@link changeFlags} emits from here.
   */
  readonly events = new OpenFeatureEventEmitter();

  /** The flag store serving the current session, or `undefined` before init and after shutdown. */
  private delegate: InMemoryProvider | undefined;

  constructor(private readonly backend: ControllableBackend) {}

  /**
   * Acquires the flag set from the backend, and fails if the backend will not give it up.
   *
   * Called by the SDK on registration and directly by the `the provider is initialized again` step.
   * Both run the same code, which is the point of the reinitialisation scenario: a provider that
   * returned early because an `initialized` latch was never cleared would pass the first and fail the
   * second.
   *
   * Declared with no parameters, which still satisfies `initialize?(context?, domain?)`: this store
   * is not context-dependent, and naming arguments it ignores would say it was.
   */
  async initialize(): Promise<void> {
    this.delegate = new InMemoryProvider(this.backend());
  }

  /**
   * Releases the flag set.
   *
   * Idempotent, which is what "shutting down a provider twice has no further effect" asks for. The
   * emitter deliberately outlives a shutdown: a provider that destroyed it could not emit
   * `PROVIDER_READY` on being initialised again.
   */
  async onClose(): Promise<void> {
    this.delegate = undefined;
  }

  /**
   * Changes flags and says so, from this provider rather than from the delegate.
   *
   * @param configuration the whole flag set as it should now read
   * @param changed the keys that differ, for the event payload the change scenario inspects
   */
  changeFlags(configuration: FlagConfiguration, changed: readonly string[]): void {
    this.requireDelegate().putConfiguration(configuration);
    this.events.emit(ServerProviderEvents.ConfigurationChanged, { flagsChanged: [...changed] });
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.requireDelegate().resolveBooleanEvaluation(flagKey, defaultValue, context, logger);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.requireDelegate().resolveStringEvaluation(flagKey, defaultValue, context, logger);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.requireDelegate().resolveNumberEvaluation(flagKey, defaultValue, context, logger);
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.requireDelegate().resolveObjectEvaluation(flagKey, defaultValue, context, logger);
  }

  /**
   * The store, or a failure that names the cause.
   *
   * An evaluation reaching a shut-down provider is a real error rather than a reason to serve stale
   * values; the claim of the shutdown scenarios is that shutdown released something. The SDK turns a
   * throw from a resolver into the caller's default with reason `ERROR`.
   */
  private requireDelegate(): InMemoryProvider {
    if (!this.delegate) {
      throw new Error(`${PROVIDER_NAME} has no flag store: initialize() has not run, or onClose() released it.`);
    }
    return this.delegate;
  }
}

/**
 * In-process control for {@link ControllableProvider}, with a backend that can refuse to answer.
 *
 * Everything {@link InProcessControl} does, plus the one thing it cannot: hand out a provider whose
 * initialisation *fails*, which is what unlocks `@lifecycle`, `@reinitialization` and `@unavailable`
 * with no Docker.
 *
 * Used only by `controllable.spec.ts`. {@link InProcessControl} remains the one an adopter with no
 * backend writes against.
 */
export class ControllableBackendControl implements BackendControl {
  /** The provider serving the current scenario, or `undefined` between scenarios. */
  private current: ControllableProvider | undefined;

  /** Which variant `changing-flag` currently resolves to. */
  private changingVariant: string = CHANGING_BASELINE;

  readonly description = `in-process control of ${PROVIDER_NAME}`;

  /** Stated rather than defaulted, like every other control: the same scenarios passing over the
   * control API and through in-process manipulation are not the same claim. */
  readonly controlApi = 'in-process' as const;

  /**
   * Creates the provider for the scenario about to run, over a reachable store.
   *
   * The factory hands over a closure rather than a flag set, so the store is read at `initialize()`
   * time — which is what lets this provider cover the lifecycle feature at all.
   */
  newProvider(): ControllableProvider {
    this.changingVariant = CHANGING_BASELINE;
    this.current = new ControllableProvider(() => canonicalFlagSet(this.changingVariant));
    return this.current;
  }

  /**
   * Creates a provider whose backend will not answer, so `initialize()` rejects.
   *
   * Not recorded as {@link current}, so a later {@link changeFlag} fails loudly rather than mutating
   * a provider that never initialised.
   */
  newUnavailableProvider(): ControllableProvider {
    return new ControllableProvider(() => {
      throw new Error(`the TCK's in-process backend is unreachable for ${PROVIDER_NAME}`);
    });
  }

  /**
   * Drops the reference to the previous scenario's provider.
   *
   * That is the whole reset: {@link canonicalFlagSet} reparses the canonical file per call, so the
   * {@link newProvider} call that follows starts from an untouched baseline.
   */
  async prepareScenario(): Promise<void> {
    this.current = undefined;
  }

  /**
   * Flips `changing-flag` between its two variants on the live provider, and lets the provider emit
   * the event from itself — see {@link ControllableProvider.changeFlags}.
   *
   * Alternating rather than assigning a fixed variant keeps repeated calls within one scenario
   * meaningful; the suite asserts that the resolved value differs, not what it became.
   */
  async changeFlag(): Promise<void> {
    this.changingVariant = this.changingVariant === CHANGING_CHANGED ? CHANGING_BASELINE : CHANGING_CHANGED;
    this.requireProvider().changeFlags(canonicalFlagSet(this.changingVariant), [CHANGING_FLAG_KEY]);
  }

  private requireProvider(): ControllableProvider {
    if (!this.current) {
      throw new Error(
        'No controllable provider exists for this scenario. In-process control manipulates the ' +
          'provider itself, so the scenario must create one — with "Given a stable provider" — ' +
          'before any step that changes flag state.',
      );
    }
    return this.current;
  }
}

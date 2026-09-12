import type { StepDefinitions } from 'jest-cucumber';
import type { Provider } from '@openfeature/server-sdk';
import { Capability, DECLARABLE_CAPABILITIES, RESERVED_CAPABILITIES, isReserved } from './capability';
import type { BackendControl } from './control';
import type { KnownDeviation } from './deviation';

/** Creates a provider under test. */
export type ProviderFactory = () => Provider | Promise<Provider>;

export const DEFAULT_EVENT_TIMEOUT_MS = 12_000;
export const DEFAULT_READY_TIMEOUT_MS = 30_000;

/**
 * The entire contract a provider author implements to run the TCK.
 *
 * Three fields are required — a name, a provider factory, and the seam through which the backend is
 * manipulated. Everything else has a working default.
 *
 * The TCK owns the provider lifecycle from here: it registers each provider with the OpenFeature API
 * under a suite-scoped domain, waits for it to become ready, and closes it at the end. Do not call
 * `OpenFeature.setProvider` yourself.
 */
export interface TckOptions {
  /**
   * Identifies the suite in test output, and scopes the OpenFeature domain the TCK registers
   * providers under so two suites in the same run do not observe each other's providers.
   *
   * Use something that reads well in a failure message: `'flagd-rpc'`, `'in-memory'`.
   */
  name: string;

  /**
   * Creates the provider under test, configured against a backend that is already running and
   * seeded with the canonical flag set. Called once per scenario.
   *
   * A factory rather than a single instance because each scenario gets its own provider, and
   * because a provider often cannot be configured before the suite starts — a container stack's host
   * ports do not exist until it is up.
   */
  newProvider: ProviderFactory;

  /**
   * The seam through which the TCK manipulates the backend.
   *
   * See {@link BackendControl} for which implementation is right for your provider.
   */
  control: BackendControl;

  /**
   * Creates a provider pointed at a backend that does not exist.
   *
   * Used by the initialisation-failure scenarios, which assert that a provider unable to reach its
   * backend settles into `ERROR` rather than hanging or throwing out of registration.
   *
   * Point it at a closed port on localhost. Do not point it at the backend under test — that must
   * stay up, and simulated outages belong to {@link control}. Configure a short connection deadline:
   * the scenario allows a bounded time for the error event, and a provider with a 30-second connect
   * timeout will not make it.
   *
   * Required only if {@link capabilities} includes {@link Capability.UnavailableInit}.
   */
  newUnavailableProvider?: ProviderFactory;

  /**
   * Which optional parts of the provider contract this provider supports.
   *
   * Scenarios tagged with an undeclared capability are reported as skipped, with the reason in the
   * test name — never as passed. Defaults to every *declarable* capability; narrow it rather than
   * widening it.
   *
   * A reserved capability — one no scenario carries, see {@link RESERVED_CAPABILITIES} — cannot be
   * declared, and naming one here is rejected rather than passed through to the report.
   */
  capabilities?: readonly Capability[];

  /**
   * Gaps this provider is known to have, each named rather than merely absent.
   *
   * {@link capabilities} cannot express "this provider attempts the behaviour and gets it wrong",
   * and that is the case a reader most needs told. A capability left out of {@link capabilities}
   * reads as a decision — a design one, or a language one recorded against the capability itself —
   * and a defect is neither. Without somewhere to say so, the only honest-looking option left to an
   * adopter is to withdraw the capability, which replaces a failing scenario with a skip and hides
   * the defect behind something that looks deliberate.
   *
   * So the intended use is the opposite of a withdrawal. Declare the capability, let the scenario
   * run and fail, and record the deviation beside it:
   *
   * ```ts
   * knownDeviations: [
   *   KnownDeviation.untracked(
   *     Capability.Lifecycle,
   *     'shutdown() does not clear the initialised latch, so a second initialize() returns ' +
   *       'without recreating the resolver and evaluates against a closed channel',
   *   ),
   * ]
   * ```
   *
   * A deviation may also concern no capability at all — pass `undefined` — when the gap is against a
   * mandatory scenario. It may not concern a reserved one: there is no scenario to deviate *from*,
   * so the statement would be about nothing, exactly as for {@link capabilities}.
   *
   * Declaring one changes nothing about what runs. It is a statement about the provider, carried
   * through to whatever reads the declaration.
   */
  knownDeviations?: readonly KnownDeviation[];

  /**
   * Feature files of your own, run in the same suite as the canonical ones.
   *
   * A vendor with provider-specific behaviour — flagd's `fractional` targeting, say — has scenarios
   * the shared suite cannot carry, because they are not part of the contract every provider
   * implements. Naming them here runs them inside the TCK's own `describe`: the same backend
   * lifecycle, the same per-scenario reset, the same capability gate. The alternative is a second
   * harness that has to reimplement all of that and will drift from it.
   *
   * Each entry is either a directory — every `.feature` file directly in it, in sorted order — or a
   * single `.feature` file. Paths resolve against the working directory, which is the test runner's
   * and not your test file's, so pass absolute ones: `join(__dirname, 'features')`.
   *
   * **Extension features must be named differently from the canonical ones, and live in a directory
   * of their own.** Both are enforced rather than documented: a feature named after a canonical one
   * is refused. An extension can therefore never shadow, replace or re-run a canonical scenario, and
   * nothing downstream can mistake one for the other.
   *
   * The vocabulary is shared: an extension scenario can use every canonical step, and needs
   * {@link extensionSteps} only for the steps the canonical vocabulary has no word for.
   */
  extensionFeatures?: string | readonly string[];

  /**
   * Step definitions for the vocabulary {@link extensionFeatures} adds.
   *
   * jest-cucumber's own shape, and bound in the same `autoBindSteps` call as the canonical steps, so
   * an extension step and a canonical step are interchangeable within one scenario:
   *
   * ```ts
   * const fractionalSteps: StepDefinitions = ({ given, then }) => {
   *   given(/^a fractional rule splitting "([^"]*)" (\d+)\/(\d+)$/, async (key, a, b) => { ... });
   *   then(/^the split resolves "([^"]*)"$/, async (expected: string) => {
   *     expect(await clientUnderTest().getStringValue('fractional-flag', 'none')).toBe(expected);
   *   });
   * };
   * ```
   *
   * A step matcher that also matches a canonical step is rejected by jest-cucumber as ambiguous, so
   * an extension cannot quietly redefine what a canonical step means.
   *
   * **Reach the provider under test with {@link clientUnderTest}**, not with a client of your own.
   * `StepDefinitions` is handed nothing but jest-cucumber's own `given`/`when`/`then`, so that
   * accessor is the route to the client the suite registered — and registering a second provider
   * would put the step's question to something other than the provider the rest of the scenario is
   * about. {@link providerUnderTest} is there for a step whose subject is the provider's own surface
   * rather than the SDK's handling of it.
   */
  extensionSteps?: StepDefinitions | readonly StepDefinitions[];

  /**
   * How long to wait for a provider event, in milliseconds.
   *
   * The single most important knob for a provider author, because providers observe backend changes
   * on wildly different timescales. A streaming provider sees a configuration change in
   * milliseconds; one polling every 30 seconds may need most of a poll interval. Set it to
   * comfortably exceed your worst-case detection latency, or the suite reports timeouts that are
   * really just impatience.
   *
   * Scenarios can tighten this with the explicit `within {int}ms` step, which always wins.
   *
   * @default 12000
   */
  eventTimeoutMs?: number;

  /**
   * How long to wait for a provider to reach `READY` during initialisation, in milliseconds.
   *
   * @default 30000
   */
  readyTimeoutMs?: number;
}

/** What a suite's capability options work out to, once defaulted and checked. */
export interface ResolvedCapabilities {
  /** What the provider claims, and so what the conformance report declares. */
  declared: Set<Capability>;
  /**
   * Declarable capabilities this suite does not declare, which is what the tag filter gates on.
   *
   * Reserved capabilities are absent, and their absence changes nothing: no scenario carries one, so
   * excluding it from the filter excludes it from nothing.
   */
  undeclared: Capability[];
  /** The gaps the suite named, checked and in declaration order. */
  knownDeviations: readonly KnownDeviation[];
}

/**
 * The reserved names, worded so the refusal reads as English however many there are.
 *
 * There was one reservation for every message when `@targeting` and `@caching` were both reserved.
 * `@targeting` became declarable the moment Appendix F gained scenarios for it, leaving a single
 * name and a sentence that read "@caching are reserved names" — a reservation expiring is the
 * expected course of events, so the message has to survive it.
 */
function listReserved(): string {
  const names = RESERVED_CAPABILITIES.join(' and ');
  return RESERVED_CAPABILITIES.length === 1 ? `${names} is a reserved name` : `${names} are reserved names`;
}

/**
 * Works out which capabilities a suite declares, and rejects every option that would make the
 * conformance report claim something the run did not establish.
 *
 * Separated from {@link runProviderTck} so it can be exercised without Jest, because nearly every
 * rule here exists to stop a wrong report rather than a failing test, and a rule with no test is a
 * rule that regresses quietly.
 */
export function resolveCapabilities(options: TckOptions): ResolvedCapabilities {
  // Refused rather than dropped, and refused before anything else is checked. A reserved capability
  // reaching `declaration.declared` is how a real Java report came to assert two capabilities that
  // no scenario examined, and silently filtering it here would leave the adopter believing the claim
  // was made. A warning would be nearer the letter of the schema, but this is a suite whose entire
  // purpose is that unverified claims are loud: a console line in a Jest run competes with the
  // runner's own output, is invisible in CI unless someone reads the log of a green build, and would
  // have to be re-emitted per suite. The fix is a one-line edit, so failing costs the adopter
  // nothing and guarantees they see it.
  const reserved = [...new Set(options.capabilities ?? [])].filter(isReserved);
  if (reserved.length) {
    throw new Error(
      `capabilities names ${reserved.join(' ')}, which no scenario carries. ` +
        `${listReserved()} held open for scenarios that do ` +
        `not exist yet: declaring one cannot cause a skip, so it says nothing about this provider ` +
        `and would invite a report's reader to believe it was verified. Remove it; a scenario ` +
        `arriving upstream is what makes it declarable.`,
    );
  }

  const knownDeviations = options.knownDeviations ?? [];

  // Checked here, with the rest of the declaration's shape, rather than further down with the rules
  // about what the provider supports. Both say nothing about capabilities: they say the statement
  // itself is malformed, and a malformed statement should be refused before anything is derived
  // from the declaration it sits in.

  // The same rule as for `capabilities`, for the same reason: a reserved capability has no
  // scenario, so there is nothing to deviate from and the claim is about nothing.
  const reservedDeviations = knownDeviations.flatMap((deviation) =>
    deviation.capability && isReserved(deviation.capability) ? [deviation.capability] : [],
  );
  if (reservedDeviations.length) {
    throw new Error(
      `knownDeviations names ${[...new Set(reservedDeviations)].join(' ')}, which no scenario ` +
        `carries. A deviation is a gap against a scenario, so a reserved capability leaves nothing ` +
        `to deviate from. Name the capability whose scenarios the gap is against, or none at all.`,
    );
  }

  const unsummarised = knownDeviations.filter((deviation) => !deviation.summary?.trim());
  if (unsummarised.length) {
    throw new Error(
      `knownDeviations contains ${unsummarised.length} entr${unsummarised.length === 1 ? 'y' : 'ies'} ` +
        `with no summary. A deviation with no summary is indistinguishable from an omission, which ` +
        `is the thing it exists to distinguish itself from.`,
    );
  }

  const declared = new Set<Capability>(options.capabilities ?? DECLARABLE_CAPABILITIES);

  if (declared.has(Capability.UnavailableInit) && !options.newUnavailableProvider) {
    throw new Error(
      'capabilities declares Capability.UnavailableInit but newUnavailableProvider is not set: ' +
        'the @unavailable scenarios need a provider pointed at a backend that does not exist. ' +
        'Supply one, or remove the capability so those scenarios are skipped with a reason.',
    );
  }

  return {
    declared,
    undeclared: DECLARABLE_CAPABILITIES.filter((capability) => !declared.has(capability)),
    knownDeviations,
  };
}

/**
 * The OpenFeature domain a suite registers its providers under.
 *
 * Suite-scoped rather than scenario-scoped on purpose. Registering a new provider in the same domain
 * replaces the previous one; a fresh domain per scenario would leave every provider of the suite
 * registered, which for a provider holding a network connection means leaking one connection per
 * scenario.
 *
 * The prefix follows the package name, deliberately. It is observable — a domain appears in SDK
 * messages and in anything that lists registered providers — and a reader who sees it has to be
 * able to find the thing that produced it; `provider-tck/in-memory` would send them looking for a
 * package that no longer exists. Nothing consumes the string, so nothing outside this suite can be
 * broken by following the rename, and the only two properties that matter — that it is stable for
 * the life of a suite and unique per suite name — are unaffected.
 */
export function domainFor(options: TckOptions): string {
  return `tck/${options.name}`;
}

// Narrowed to the field each one reads, rather than taking the whole options object, so that the
// containerised entry point can default a timeout from its own options before it has assembled a
// TckOptions to pass on.
export function eventTimeout(options: Pick<TckOptions, 'eventTimeoutMs'>): number {
  return options.eventTimeoutMs ?? DEFAULT_EVENT_TIMEOUT_MS;
}

export function readyTimeout(options: Pick<TckOptions, 'readyTimeoutMs'>): number {
  return options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
}

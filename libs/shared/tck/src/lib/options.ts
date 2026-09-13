import type { StepDefinitions } from 'jest-cucumber';
import type { Provider } from '@openfeature/server-sdk';
import {
  ALL_CAPABILITIES,
  Capability,
  DECLARABLE_CAPABILITIES,
  RESERVED_CAPABILITIES,
  inexpressibleReason,
  isInexpressible,
  isReserved,
} from './capability';
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
   * Two kinds of capability cannot be declared, and naming either here is rejected rather than
   * passed through to the report. A **reserved** one — see {@link RESERVED_CAPABILITIES} — is a name
   * no scenario carries yet, in any language. An **inexpressible** one — see
   * {@link INEXPRESSIBLE_CAPABILITIES} — has scenarios, which pass in other languages, that this
   * SDK has no way to put to a provider. The refusals say which, because only the first is
   * temporary and neither says anything about your provider.
   */
  capabilities?: readonly Capability[];

  /**
   * Gaps this provider is known to have, each named rather than merely absent.
   *
   * **An entry says: this provider fails to do something it is required to do.** The requirement
   * must be a numbered `MUST`, or a rule the implementation bound itself to elsewhere. Where the
   * specification *permits* the choice, withholding the capability **is** the honest report and a
   * deviation would assert a defect that does not exist — `@reinitialization` is exactly that case,
   * and the README says why at length.
   *
   * {@link capabilities} cannot express any of this on its own. A capability left out reads as a
   * decision — a design one, or a language one recorded against the capability itself — and both a
   * defect and a decision produce the same skip, so a consumer comparing providers reads one as the
   * other unless something says which happened.
   *
   * It is legitimate in two shapes, and a report's results already distinguish them:
   *
   * 1. **The capability is declared, the scenario runs, and it fails.** Prefer this. The failure
   *    stays visible and the deviation says it is known and why.
   * 2. **The capability is withheld, and its scenarios skip.** Legitimate only when the provider
   *    cannot attempt the behaviour at all, so running the scenario would establish nothing. The
   *    deviation then explains the absence, so a reader can tell a defect from a design decision.
   *
   * Withdrawing a capability *in order to* turn a failing scenario into a skip is the failure mode
   * this field exists to prevent. If the provider attempts the behaviour and gets it wrong, shape 1
   * is the honest report:
   *
   * ```ts
   * capabilities: [Capability.Lifecycle, Capability.Reinitialization],
   * knownDeviations: [
   *   KnownDeviation.untracked(
   *     Capability.Reinitialization,
   *     'shutdown() does not clear the initialised latch, so a second initialize() returns ' +
   *       'without recreating the resolver and evaluates against a closed channel',
   *   ),
   * ]
   * ```
   *
   * {@link KnownDeviation.summary} is required: an entry with no summary records that something is
   * wrong without saying what, which is worth less than the bare skip or failure it accompanies.
   * The issue is optional — {@link KnownDeviation.tracked} and {@link KnownDeviation.untracked} are
   * the two forms, and naming an untracked defect is still what separates it from a choice.
   *
   * A deviation may also concern no capability at all — pass `undefined` — when the gap is against a
   * mandatory, ungated scenario. It may concern neither of the two kinds {@link capabilities}
   * refuses, for the two reasons those are refused: a reserved capability has no scenario to deviate
   * *from*, and an inexpressible one has scenarios that were never put to this provider, so the entry
   * would assert a defect that cannot exist.
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
   * Each entry is either a directory — every `.feature` file **anywhere under it**, subdirectories
   * included, in a stable order — or a single `.feature` file. Paths resolve against the working
   * directory, which is the test runner's and not your test file's, so pass absolute ones:
   * `join(__dirname, 'features')`.
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
   * Every capability a scenario can be gated by that this suite does not declare, which is what the
   * tag filter gates on.
   *
   * Reserved capabilities are absent, and their absence changes nothing: no scenario carries one, so
   * excluding it from the filter excludes it from nothing.
   *
   * Inexpressible ones are always present, which is the mechanism the central refusal rests on. No
   * suite can declare one, so its scenarios are gated in every run — and because that happens here
   * rather than in each suite's options, no suite has to remember to leave it out.
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

  // The second refusal, and deliberately not folded into the first. Both end in a throw, and that is
  // the only thing they share: a reservation is global and expires, while this is one language's and
  // permanent, and the scenarios it gates exist and pass elsewhere. Telling an adopter "no scenario
  // carries this" when three do, in Go, Java and Python, would send them looking for a gap upstream
  // that is not there. Appendix F requires the distinction to survive into the skip reasons too --
  // see `skipDisplayName`.
  const inexpressible = [...new Set(options.capabilities ?? [])].filter(isInexpressible);
  if (inexpressible.length) {
    throw new Error(
      `capabilities names ${inexpressible.join(' ')}, which no provider written against this SDK ` +
        `can be asked about: ` +
        `${inexpressible.map((capability) => `${capability} -- ${inexpressibleReason(capability)}`).join('; ')}. ` +
        `This is not a reservation and it will not expire: the scenarios exist and pass in other ` +
        `languages, and this is a property of the SDK rather than of your provider. Remove it. ` +
        `Its scenarios are skipped with that reason in every run here, whatever you declare, so ` +
        `there is nothing for you to do and no deviation to record.`,
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

  // And the same rule for an inexpressible one, for a different reason. Here there *are* scenarios,
  // so the gap would be against something -- but no provider in this language was ever asked, so a
  // deviation would assert a defect that cannot exist and put it in a report as this provider's.
  const inexpressibleDeviations = knownDeviations.flatMap((deviation) =>
    deviation.capability && isInexpressible(deviation.capability) ? [deviation.capability] : [],
  );
  if (inexpressibleDeviations.length) {
    const named = [...new Set(inexpressibleDeviations)];
    throw new Error(
      `knownDeviations names ${named.join(' ')}, which this SDK cannot ask of any provider: ` +
        `${named.map((capability) => `${capability} -- ${inexpressibleReason(capability)}`).join('; ')}. ` +
        `A deviation says this provider fails something it is required to do, and nothing here was ` +
        `ever put to it. If the gap you mean is a real one -- a narrowing defect, say -- record it ` +
        `against the capability whose scenarios catch it, or against none at all.`,
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
    // Everything a scenario can be gated by, less what this suite declared -- which is wider than
    // the declarable set by exactly the inexpressible capabilities. They can never be in `declared`,
    // so they are always gated, which is how one list here replaces an omission in every suite.
    // Reserved ones are excluded because no scenario carries them: `not @caching` would exclude
    // nothing and only make the filter longer.
    undeclared: ALL_CAPABILITIES.filter((capability) => !isReserved(capability) && !declared.has(capability)),
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

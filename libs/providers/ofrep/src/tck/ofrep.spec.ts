import { join } from 'node:path';
import { Capability, runContainerizedProviderTck } from '@openfeature/tck';
import { OFREPProvider } from '../lib/ofrep-provider';

/**
 * The OpenFeature Provider Conformance Suite, run against the OFREP provider.
 *
 * One suite per file: jest-cucumber accumulates step definitions in module state, so a second call
 * here would register the vocabulary twice and every step would report as ambiguous.
 *
 * `npx nx tck providers-ofrep`, with a Docker daemon, and never in CI. This provider's README has
 * the rest: why `ofrep-web` is not adopted alongside it, why the target is not called `e2e`, and why
 * the suite has a directory of its own.
 */

/** The container-internal port flagd serves OFREP on. */
const OFREP_PORT = 8016;

/**
 * The backend stack, shared with the flagd adoption.
 *
 * One file for the repository rather than a copy per provider — see its header. It exposes more
 * ports than this suite uses, which costs nothing: the harness maps container ports to dynamically
 * assigned host ones and looks them up by container port, and this suite only ever asks for 8016
 * and the control port.
 */
const COMPOSE_FILE = join(__dirname, '..', '..', '..', '..', 'shared', 'tck-backend', 'docker-compose.yaml');

/**
 * Budget for the stack and its control API to become reachable.
 *
 * Well above the suite's 60-second default because on a cold machine this includes pulling the
 * testbed image, which the budget is specified to cover.
 */
const STACK_TIMEOUT_MS = 180_000;

// Deliberately no jest.retryTimes: a conformance result that only holds on the third attempt is not
// a conformance result.

runContainerizedProviderTck({
  name: 'ofrep',

  // The suite owns the stack: started once before the first scenario and never restarted, with
  // scenario isolation coming from the control API instead — which restarts the flagd *process*
  // inside the container, keeping the port mapping.
  composeFile: COMPOSE_FILE,
  backendPorts: [OFREP_PORT],
  startupTimeoutMs: STACK_TIMEOUT_MS,

  // The timeout is well under the suite's own budget on purpose. Every scenario here is a single
  // round trip to a container on the same host, so anything slower is a wedged backend, and the
  // scenarios that assert a code default are only meaningful if the provider gives up promptly.
  newProvider: (endpoint) =>
    new OFREPProvider({
      baseUrl: `http://${endpoint.host}:${endpoint.port(OFREP_PORT)}`,
      timeoutMs: 10_000,
    }),

  /*
   * Why this provider declares or withholds each capability, on evidence from running the suite.
   * What the rules are is Appendix F, "Rules for declaring"; below is what they decided here.
   *
   * Five capabilities, the smallest declaration of any provider in this repo, and that is the
   * finding: `OFREPProvider` is stateless. Its entire surface is a constructor, `onClose`, and four
   * `resolve*Evaluation` methods that each POST to `/ofrep/v1/evaluate/flags/{key}` —
   * src/lib/ofrep-provider.ts:15-111. There is no `initialize`, no `events` emitter, no `status`,
   * and no cached configuration, so most of the contract this suite exercises simply is not
   * implemented here. That is a legitimate design for a request-scoped protocol client, not a
   * defect, and the skips say so by name.
   *
   * - Object: `toResolutionDetails` passes a structured value straight through
   *   (libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:235-263) and the `typeof` guard at
   *   ofrep-api.ts:251 rejects a structured flag requested as a scalar with TYPE_MISMATCH.
   * - Variants: the OFREP evaluation response carries a `variant` field and `toResolutionDetails`
   *   copies it onto the resolution details (ofrep-api.ts:235-263), so the eight gated rows ask a
   *   real question. Seven pass; the eighth asks for `large-integer-flag` (see below).
   * - Targeting: these three scenarios are the only ones in the suite that ask this provider to
   *   serialise an evaluation context into a request at all — `postEvaluateFlag` puts it in the POST
   *   body — so for a stateless provider whose whole contract is one request and one response they
   *   cover a larger share of it than they do anywhere else. All three pass.
   * - DisabledFlags, and this is the surprising one, because the request carries the flag key and
   *   the evaluation context but never the caller's *default*: a server asked about a disabled flag
   *   has nothing to return, and on the obvious reading the provider has nothing to substitute. The
   *   protocol closes it from the other end. OFREP's response schema makes `value` optional and
   *   flagd's OFREP handler omits it altogether for a disabled flag — `200 OK` with
   *   `{"key":"disabled-boolean-flag","reason":"DISABLED","metadata":{}}`, no `value` and no
   *   `variant`. `toResolutionDetails` handles exactly that shape (ofrep-api.ts:239-245): an absent
   *   value becomes the caller's default, carrying the server's reason and no error code. So the
   *   substitution is client-side here too — the protocol can say "no value" rather than making the
   *   server invent one.
   *
   *   All four rows pass, twice over, and that is what the declaration rests on rather than the
   *   reading above. It stays a claim about this provider against this backend: an OFREP server
   *   that answered a disabled flag with the flag's configured value, or with a `404`, would fail
   *   these rows through no fault of the provider.
   * - StandardReasons is worth measuring rather than reasoning about, because for a stateless
   *   provider the reason is the server's word carried through untouched. flagd's OFREP handler
   *   answers with the standard vocabulary and `toResolutionDetails` copies `reason` across
   *   unchanged, so all nine scenarios run — the tag composes with @targeting and @disabled-flags,
   *   both declared — and all nine pass: STATIC for the four rule-less flags, ERROR for the unknown
   *   flag and the type mismatch, TARGETING_MATCH and DEFAULT for the two targeting halves,
   *   DISABLED for the disabled flag.
   *
   *   The DISABLED row could not have been predicted from the provider alone, and it falls out of
   *   the same response shape that earns @disabled-flags: flagd omits `value` entirely, so the
   *   caller's default is substituted client-side *and* the server's reason survives the
   *   substitution. A provider that reported ERROR for a response with no value would fail this row
   *   while still passing the @disabled-flags rows, which is why the two scenarios are separate.
   *
   *   The claim is about this provider against this backend. An OFREP server reporting
   *   vendor-specific reasons is conformant — 2.2.5 expressly permits "some other string" — so a
   *   run against it would fail these scenarios through no fault of the provider, which is why the
   *   tag is gated rather than the assertions being ungated.
   *
   * Withheld:
   *
   * - Events, because the provider emits none: `OFREPProvider` has no `events` property
   *   (src/lib/ofrep-provider.ts:15-35), so the only lifecycle event an application sees is the
   *   PROVIDER_READY the SDK synthesises on registration. Lifecycle goes with it — initialisation
   *   does not reach the backend because there is no initialisation.
   * - Stale and ConfigurationChange, for the same root cause: nothing holds a connection or a local
   *   copy of the ruleset. Every evaluation is an independent `postEvaluateFlag`
   *   (src/lib/ofrep-provider.ts:86), so there is no connection to lose and no configuration to
   *   observe changing.
   * - UnavailableInit, because there is no `initialize` to fail. The class implements `Provider`
   *   with `onClose` as its only lifecycle method (src/lib/ofrep-provider.ts:37-39), so a provider
   *   pointed at a closed port still registers and settles into READY. The constructor does reject a
   *   malformed URL (:27-32), but that is a syntactic check that never touches the network.
   *   `newUnavailableProvider` is therefore left unset, which runProviderTck requires to be
   *   consistent with the capability.
   * - LargeIntegers, because this testbed image does not serve `large-integer-flag` at all
   *   (open-feature/flagd-testbed#392) — the same gap that fails the mandatory 2^31 - 1 scenario and
   *   the eighth @variants row. The tag gates exactly one scenario, so a backend without its flag
   *   leaves nothing establishable. No deviation: the gap is the backend's, not the provider's.
   *   Unlike the others this omission is **temporary**, and should be revisited when #392 lands.
   */
  capabilities: [
    Capability.Object,
    Capability.Variants,
    Capability.Targeting,
    Capability.DisabledFlags,
    Capability.StandardReasons,
  ],

  // The SDK synthesises READY as soon as registration completes, since the provider has no
  // initialisation step. This is headroom for a loaded machine, not an expected latency.
  readyTimeoutMs: 30_000,
});

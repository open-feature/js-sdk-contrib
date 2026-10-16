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
 * the rest, including why `ofrep-web` is not adopted alongside it.
 */

/** The container-internal port flagd serves OFREP on. */
const OFREP_PORT = 8016;

/** The backend stack, shared with the flagd adoption — see its header. */
const COMPOSE_FILE = join(__dirname, '..', '..', '..', '..', 'shared', 'tck-backend', 'docker-compose.yaml');

/** Well above the suite's 60-second default: on a cold machine this includes pulling the image. */
const STACK_TIMEOUT_MS = 180_000;

// Deliberately no jest.retryTimes: a conformance result that only holds on the third attempt is not
// a conformance result.

runContainerizedProviderTck({
  name: 'ofrep',
  composeFile: COMPOSE_FILE,
  backendPorts: [OFREP_PORT],
  startupTimeoutMs: STACK_TIMEOUT_MS,

  // Well under the suite's own budget on purpose: every scenario is a single round trip to a
  // container on the same host, and the scenarios that assert a code default are only meaningful if
  // the provider gives up promptly.
  newProvider: (endpoint) =>
    new OFREPProvider({
      baseUrl: `http://${endpoint.host}:${endpoint.port(OFREP_PORT)}`,
      timeoutMs: 10_000,
    }),

  /*
   * Why this provider declares or withholds each capability, on evidence from running the suite.
   *
   * Seven capabilities, the smallest declaration in this repository, and that is the finding:
   * `OFREPProvider` is stateless. Its whole surface is a constructor, `onClose`, and four
   * `resolve*Evaluation` methods that each POST to `/ofrep/v1/evaluate/flags/{key}`. No
   * `initialize`, no `events` emitter, no `status`, no cached configuration — a legitimate design
   * for a request-scoped protocol client, and the skips below say so by name.
   *
   * - Object: `toResolutionDetails` in ofrep-core passes a structured value straight through, and
   *   its `typeof` guard rejects a structured flag requested as a scalar with TYPE_MISMATCH.
   * - Variants: the evaluation response carries a `variant` field and `toResolutionDetails` copies
   *   it onto the details. Seven of the eight rows pass; the eighth asks for `large-integer-flag`.
   * - Targeting: all three pass. They are the only scenarios that ask this provider to serialise an
   *   evaluation context into a request at all, so for a stateless provider they cover a larger
   *   share of the contract than they do elsewhere.
   * - DisabledFlags is the surprising one: the request never carries the caller's *default*, so on
   *   the obvious reading there is nothing to substitute. The protocol closes it from the other end
   *   — OFREP makes `value` optional and flagd omits it for a disabled flag (`200 OK` with
   *   `{"key":"disabled-boolean-flag","reason":"DISABLED",...}`), and `toResolutionDetails` turns an
   *   absent value into the caller's default, carrying the server's reason and no error code. All
   *   four rows pass.
   * - StandardReasons: worth measuring rather than reasoning about, the reason being the server's
   *   word carried through untouched. All nine pass — STATIC for the four rule-less flags, ERROR for
   *   the unknown flag and the type mismatch, TARGETING_MATCH and DEFAULT for the targeting pair,
   *   DISABLED for the disabled flag. The DISABLED row falls out of the same omitted-`value` shape
   *   that earns @disabled-flags: a provider that reported ERROR for a valueless response would fail
   *   it while still passing those rows, which is why the scenarios are separate.
   * - StringTyping and FullyTypedValues: the same `typeof` guard earns both from the other side.
   *   `toResolutionDetails` compares `typeof result.value` against `typeof defaultValue`, and flagd
   *   answers with a JSON boolean, number and object, so all four scenarios pass. The typing comes
   *   out of the wire format rather than anything this provider adds, which is why one guard covers
   *   both halves of the split.
   *
   * These last three stay claims about this provider against *this* backend: an OFREP server that
   * answered a disabled flag with its configured value, reported vendor-specific reasons, or
   * serialised every value to a string would fail those rows through no fault of the provider.
   *
   * Withheld:
   *
   * - Events, because the provider has no `events` property, so the only lifecycle event an
   *   application sees is the PROVIDER_READY the SDK synthesises on registration. Lifecycle goes
   *   with it: there is no initialisation to reach the backend.
   * - Stale and ConfigurationChange: nothing holds a connection or a local copy of the ruleset, so
   *   there is no connection to lose and no configuration to observe changing.
   * - UnavailableInit, because there is no `initialize` to fail — a provider pointed at a closed
   *   port still registers and settles into READY. (The constructor rejects a malformed URL, but
   *   that never touches the network.) `newUnavailableProvider` is therefore left unset, which
   *   runProviderTck requires to be consistent with the capability.
   * - LargeIntegers: this testbed image does not serve `large-integer-flag`
   *   (open-feature/flagd-testbed#392), and the tag gates exactly one scenario, so there is nothing
   *   to establish. No deviation — the gap is the backend's, not the provider's. This omission is
   *   temporary; revisit when #392 lands.
   */
  capabilities: [
    Capability.Object,
    Capability.Variants,
    Capability.Targeting,
    Capability.DisabledFlags,
    Capability.StandardReasons,
    Capability.StringTyping,
    Capability.FullyTypedValues,
  ],

  // The provider has no initialisation step, so the SDK synthesises READY as soon as registration
  // completes. Headroom for a loaded machine, not an expected latency.
  readyTimeoutMs: 30_000,
});

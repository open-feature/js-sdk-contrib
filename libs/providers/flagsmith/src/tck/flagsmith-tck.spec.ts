/**
 * The OpenFeature Provider Conformance Suite against the Flagsmith **JavaScript** provider.
 *
 * The backend, and how the four language adoptions compare against it, are documented once in
 * https://github.com/aepfli/flagsmith-tck-testbed rather than restated in each adoption.
 */
import { join } from 'node:path';
import { Capability, KnownDeviation, runContainerizedProviderTck } from '@openfeature/tck';
import { FlagsmithOpenFeatureProvider } from '../lib/flagsmith-provider';
import { Flagsmith } from 'flagsmith-nodejs';

/** Fixed by the testbed, because the control API cannot hand connection parameters to a provider. */
const SERVER_SIDE_KEY = 'ser.provider-tck-server-key';

const PROXY_PORT = 8000;

// The suite owns the stack: it starts Compose, discovers the dynamically mapped host ports, builds
// the HttpControl against the control API, waits until it accepts commands, constructs a provider
// per scenario and tears the stack down. Nothing here touches testcontainers directly.
runContainerizedProviderTck({
  name: 'flagsmith-js-remote',
  composeFile: join(__dirname, 'docker-compose.yaml'),
  backendPorts: [PROXY_PORT],

  newProvider: (endpoint) => {
    // API root with a trailing slash; the SDK appends "flags/" beneath it.
    const apiUrl = `http://${endpoint.host}:${endpoint.port(PROXY_PORT)}/api/v1/`;
    const client = new Flagsmith({ environmentKey: SERVER_SIDE_KEY, apiUrl });

    // Default is false, which resolves a boolean from `enabled` rather than feature_state_value --
    // Python's default too, and the opposite of Go and Java. The canonical set models booleans as
    // values, so the default would resolve boolean-zero-flag to true.
    return new FlagsmithOpenFeatureProvider(client, { useBooleanConfigValue: true });
  },

  // Withheld, all permitted rather than defective, so none carries a deviation:
  //   Variants -- Flagsmith names no value; a feature state is `enabled` plus a value.
  //   FullyTypedValues -- feature_state_value is natively boolean, integer or string, so a float
  //     and a structure are stored as text and the string accessor answers them correctly.
  //   NumericCoercion -- refused by the TCK: JavaScript has one numeric type, so "a float
  //     requested as an integer" was never put to this provider.
  //   lifecycle and events -- no observable initialisation to assert against.
  //
  // StringTyping, StandardReasons and DisabledFlags are declared and all three fail. This provider
  // attempts each and gets it wrong, so the failures stay in the results; see the deviations below.
  // StringTyping is the interesting one: boolean and integer ARE native to Flagsmith, and the Go,
  // Java and Python providers report TYPE_MISMATCH for both against this identical backend.
  capabilities: [
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Targeting,
    Capability.StandardReasons,
    Capability.DisabledFlags,
    Capability.StringTyping,
  ],

  knownDeviations: [
    KnownDeviation.untracked(
      Capability.StandardReasons,
      'The reason is reported as `flag.enabled ? TARGETING_MATCH : DISABLED` -- taken from the ' +
        'enabled state alone, with no targeting involved and without consulting the evaluation ' +
        'context at all. So every enabled flag reports TARGETING_MATCH, telling the caller a ' +
        'targeting rule matched when the canonical set carries exactly one rule and the flag in ' +
        'question has none. 2.2.5 makes the reason a SHOULD, but TARGETING_MATCH for an untargeted ' +
        'flag is a wrong answer rather than a missing one. Go reports all three correctly against ' +
        'the identical backend. Seven of nine reason scenarios fail on this.',
    ),
    KnownDeviation.untracked(
      Capability.DisabledFlags,
      'A disabled flag raises GeneralError rather than resolving to the caller default with no ' +
        'error code, so the scenario fails with error-code GENERAL where it expects none. ' +
        'Neither configuration satisfies it: returnValueForDisabledFlags defaults to false and ' +
        'throws, and setting it true returns the configured value rather than the caller default, ' +
        'which the scenario also catches. Go and Java both pass this.',
    ),
    KnownDeviation.untracked(
      Capability.StringTyping,
      "typeFactory's string branch is an unconditional `String(value)` " +
        '(src/lib/type-factory.ts:51-52), where its number, boolean and object branches return ' +
        'undefined and so become a TYPE_MISMATCH. A String request for boolean-flag therefore ' +
        'resolves to "true" and for integer-flag to "10", neither reporting an error code, so both ' +
        'rows of "A non-string flag is not returned as its string representation" fail. The ' +
        'backend is not the cause: Flagsmith records a boolean and an integer natively, and the ' +
        'Go, Java and Python Flagsmith providers report TYPE_MISMATCH for both against this ' +
        'identical backend. Declared and failing rather than withheld, on the @numeric-coercion ' +
        'precedent in Appendix F: the provider has the type information and converts anyway, ' +
        'which a skip cannot express -- a skip says the question could not be put. The float and ' +
        'structured rows are held separately behind @fully-typed-values, which IS withheld here ' +
        'because Flagsmith records no native float or structure type, so this entry covers only ' +
        'the two rows the backend can answer. Untracked: no issue in open-feature/js-sdk-contrib ' +
        'covers the string accessor, and the fix belongs in a pull request against the provider ' +
        'rather than in this suite.',
    ),
  ],

  eventTimeoutMs: 15_000,
  readyTimeoutMs: 30_000,
});

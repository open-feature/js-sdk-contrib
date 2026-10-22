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

runContainerizedProviderTck({
  name: 'flagsmith-js-remote',
  composeFile: join(__dirname, 'docker-compose.yaml'),
  backendPorts: [PROXY_PORT],

  newProvider: (endpoint) => {
    // API root with a trailing slash; the SDK appends "flags/" beneath it.
    const apiUrl = `http://${endpoint.host}:${endpoint.port(PROXY_PORT)}/api/v1/`;
    const client = new Flagsmith({ environmentKey: SERVER_SIDE_KEY, apiUrl });

    // Not the default: the canonical set models booleans as values, so resolving from `enabled`
    // would make boolean-zero-flag true.
    return new FlagsmithOpenFeatureProvider(client, { useBooleanConfigValue: true });
  },

  // Withheld, all permitted rather than defective, so none carries a deviation:
  //   Variants -- Flagsmith names no value; a feature state is `enabled` plus a value.
  //   FullyTypedValues -- feature_state_value is natively boolean, integer or string, so a float
  //     and a structure are stored as text and the string accessor answers them correctly.
  //   NumericCoercion -- JavaScript has one numeric type, so "a float requested as an integer" was
  //     never put to this provider.
  //   Lifecycle and Events -- no observable initialisation to assert against.
  //
  // StringTyping, StandardReasons and DisabledFlags are declared and all three fail: this provider
  // attempts each and gets it wrong, so the failures stay in the results. See the deviations below.
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
      'The reason is reported as `flag.enabled ? TARGETING_MATCH : DISABLED`, taken from the ' +
        'enabled state alone without consulting the evaluation context at all. So every enabled ' +
        'flag claims a targeting rule matched when the flag in question has none -- a wrong answer ' +
        'rather than a missing one. Seven of nine reason scenarios fail on this.',
    ),
    KnownDeviation.untracked(
      Capability.DisabledFlags,
      'A disabled flag raises GeneralError rather than resolving to the caller default with no ' +
        'error code, so the scenario fails with error-code GENERAL where it expects none. Neither ' +
        'configuration satisfies it: returnValueForDisabledFlags defaults to false and throws, and ' +
        'setting it true returns the configured value rather than the caller default, which the ' +
        'scenario also catches.',
    ),
    KnownDeviation.untracked(
      Capability.StringTyping,
      "typeFactory's string branch is an unconditional `String(value)` (src/lib/type-factory.ts), " +
        'where its number, boolean and object branches return undefined and so become a ' +
        'TYPE_MISMATCH. A String request for boolean-flag therefore resolves to "true" and for ' +
        'integer-flag to "10", neither reporting an error code, so both rows of "A non-string flag ' +
        'is not returned as its string representation" fail. The backend is not the cause: ' +
        'Flagsmith records a boolean and an integer natively. Declared and failing rather than ' +
        'withheld, because the provider has the type information and converts anyway, which a skip ' +
        'cannot express. The float and structured rows are held separately behind ' +
        '@fully-typed-values, withheld here because Flagsmith records no native float or structure ' +
        'type, so this entry covers only the two rows the backend can answer. Untracked: no issue ' +
        'in open-feature/js-sdk-contrib covers the string accessor.',
    ),
  ],

  eventTimeoutMs: 15_000,
  readyTimeoutMs: 30_000,
});

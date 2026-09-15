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
    // The Flagsmith SDK appends its own path segments, so this is the API root with a trailing
    // slash: remote evaluation requests "flags/" beneath it.
    const apiUrl = `http://${endpoint.host}:${endpoint.port(PROXY_PORT)}/api/v1/`;
    const client = new Flagsmith({ environmentKey: SERVER_SIDE_KEY, apiUrl });

    // useBooleanConfigValue puts this provider on the same footing as the other three.
    //
    // It defaults to FALSE here, meaning a boolean flag resolves from Flagsmith's `enabled` state
    // rather than from feature_state_value — the same default Python takes, and the opposite of Go
    // and Java. Four providers for one product, split two-two on what a boolean flag *is*.
    //
    // The canonical set models booleans as values and seeds every flag enabled, so the default
    // would resolve boolean-zero-flag to true, which the falsy-value scenario exists to catch.
    return new FlagsmithOpenFeatureProvider(client, { useBooleanConfigValue: true });
  },

  // Capability.Variants is withheld: Flagsmith has no variant concept for a plain feature, the
  // evaluation response carries no variant key, and no seeding can produce one. That is permitted
  // rather than defective — 2.2.4 makes the variant a SHOULD and types.md marks the field optional
  // — so it carries no deviation entry.
  //
  // StandardReasons and DisabledFlags are declared and both fail: this provider does report a
  // reason and does handle a disabled flag, and gets both wrong. Go and Java pass DisabledFlags.
  //
  // Capability.NumericCoercion carries NO deviation here, deliberately, and the TCK refuses one:
  // JavaScript has a single numeric type, so "a float requested as an integer" is not expressible
  // and nothing was ever put to this provider. The Go, Java and Python adoptions do record one,
  // because in those languages the question can be asked and the answer is wrong. Recording it
  // here would claim a failure at something never asked.
  //
  // The lifecycle and event capabilities are withheld because this provider has no observable
  // initialisation for the suite to assert against.
  capabilities: [
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Targeting,
    Capability.StandardReasons,
    Capability.DisabledFlags,
  ],

  knownDeviations: [
    KnownDeviation.untracked(
      undefined,
      'float-flag requested as a String resolves to "0.5" rather than reporting TYPE_MISMATCH, in ' +
        'an untagged row of the wrong-type outline, and object-flag as a String resolves to the ' +
        'raw JSON text beside it. Flagsmith has no float type and no object type -- ' +
        'feature_state_value is natively boolean, integer or string -- so on this backend both ' +
        'really are strings and neither request is a type mismatch. Recorded because the ' +
        'scenarios are mandatory and fail, not because the provider is wrong: whether the ' +
        'type-mismatch matrix is satisfiable against a backend with a coarser type system is an ' +
        'open question for the suite. All four language adoptions fail these two rows. Separately ' +
        'and only here, boolean-flag and integer-flag as a String return "true" and "10" rather ' +
        'than TYPE_MISMATCH -- those are genuine mismatches and a defect in this provider alone.',
    ),
    KnownDeviation.untracked(
      Capability.StandardReasons,
      'The reason is reported as `flag.enabled ? TARGETING_MATCH : DISABLED` -- taken from the ' +
        'enabled state alone, with no targeting involved and without consulting the evaluation ' +
        'context at all. So every enabled flag reports TARGETING_MATCH, telling the caller a ' +
        'targeting rule matched when the canonical set carries exactly one rule and the flag in ' +
        'question has none. 2.2.5 makes the reason a SHOULD, which is why this is a withheld ' +
        'claim rather than a failure, but TARGETING_MATCH for an untargeted flag is not defensible ' +
        'on SHOULD grounds -- it is a wrong answer rather than a missing one. The Go Flagsmith ' +
        'provider reports STATIC, DISABLED and TARGETING_MATCH correctly against the identical ' +
        'backend. Ten scenarios fail on this, and the capability is declared rather than withheld ' +
        'so those failures stay in the results.',
    ),
    KnownDeviation.untracked(
      Capability.DisabledFlags,
      'A disabled flag raises GeneralError rather than resolving to the caller default with no ' +
        'error code, so the scenario fails with error-code GENERAL where it expects none. ' +
        'Neither configuration satisfies it: returnValueForDisabledFlags defaults to false and ' +
        'throws, and setting it true returns the configured value of the flag instead of the ' +
        'caller default -- which the scenario also catches, because the configured value of each ' +
        'disabled flag differs from the default the scenario passes in. The Go and Java Flagsmith ' +
        'providers return the caller default with reason DISABLED and no error code, which is ' +
        'what the tag asserts, and both declare the capability.',
    ),
  ],

  eventTimeoutMs: 15_000,
  readyTimeoutMs: 30_000,
});

/**
 * The OpenFeature Provider Conformance Suite against the Flagsmith **JavaScript** provider.
 *
 * One of four language adoptions running against the same container. Go reports 35 pass / 2 fail /
 * 19 skip, Java 24 / 12 / 20, Python 28 / 5 / 19 — the same backend, the same scenarios, four
 * providers written by different people against one API, and the reasons for their failures barely
 * overlap.
 *
 * The backend is https://github.com/aepfli/flagsmith-tck-testbed — the Flagsmith Edge Proxy with a
 * launchpad implementing the control API. Nothing about it is language-specific, and it needed no
 * changes for any of the four adoptions.
 */
import { join } from 'node:path';
import { Capability, KnownDeviation, runContainerizedProviderTck } from '@openfeature/tck';
import { FlagsmithOpenFeatureProvider } from '../lib/flagsmith-provider';
import { Flagsmith } from 'flagsmith-nodejs';

/**
 * Fixed by the testbed. The control API has no way to communicate connection parameters —
 * `POST /start` returns a bare 200 with no body — so every adoption hardcodes these, exactly as a
 * flagd adoption hardcodes a port.
 */
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
  // Capability.DisabledFlags is withheld too, but unlike @variants it is a defect rather than a
  // permitted absence — see the deviation below. Go and Java both declare it and pass.
  //
  // The lifecycle and event capabilities are withheld because this provider has no observable
  // initialisation for the suite to assert against.
  capabilities: [Capability.Object, Capability.LargeIntegers, Capability.Targeting],

  knownDeviations: [
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
    KnownDeviation.untracked(
      Capability.NumericCoercion,
      'Withheld pending the run, recorded as a prediction rather than a measurement. Flagsmith ' +
        'stores floats and objects as strings, because feature_state_value is natively boolean, ' +
        'integer or string only. Go compensates by parsing the string in its Float accessor; ' +
        'Python and Java do not, and cannot read a Flagsmith float at all. This provider checks ' +
        '`typeof typedValue !== flagType`, which suggests it behaves like Python and Java.',
    ),
  ],

  eventTimeoutMs: 15_000,
  readyTimeoutMs: 30_000,
});

/**
 * The OpenFeature Provider Conformance Suite against the Flagsmith **JavaScript** provider.
 *
 * The fourth language to run against the same container. Go reports 31 pass / 2 fail / 19 skip,
 * Python 28 / 5 / 19, Java 20 / 12 / 20 — the same backend, the same 52 scenarios, three providers
 * written by different people against one API, and the reasons for their failures barely overlap.
 *
 * The backend is https://github.com/aepfli/flagsmith-tck-testbed — the Flagsmith Edge Proxy with a
 * launchpad implementing the control API. Nothing about it is language-specific, and it needed no
 * changes for any of the four adoptions, which is the control API doing its job.
 */
import { Capability, HttpControl, KnownDeviation, runProviderTck } from '@openfeature/provider-tck';
import { FlagsmithOpenFeatureProvider } from '../lib/flagsmith-provider';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Flagsmith } from 'flagsmith-nodejs';

const TESTBED_IMAGE = process.env['FLAGSMITH_TESTBED_IMAGE'] ?? 'ghcr.io/aepfli/flagsmith-tck-testbed:latest';

/**
 * Fixed by the testbed. The control API has no way to communicate connection parameters —
 * `POST /start` returns a bare 200 with no body — so every adoption hardcodes these, exactly as a
 * flagd adoption hardcodes a port.
 */
const SERVER_SIDE_KEY = 'ser.provider-tck-server-key';

const PROXY_PORT = 8000;
const CONTROL_PORT = 8080;

let container: StartedTestContainer;
let baseUrl: string;
let controlUrl: string;

// HttpControl accepts baseUrl as a thunk precisely for this: the testbed maps host ports
// dynamically, so the URL does not exist until beforeAll has started the container, while
// runProviderTck is called at module scope.
const control = new HttpControl({ baseUrl: () => controlUrl });

beforeAll(async () => {
  // Started once for the whole suite and never restarted. Scenario isolation comes from the
  // control API instead: the no-container-restart invariant exists because dynamically mapped host
  // ports do not survive a restart.
  container = await new GenericContainer(TESTBED_IMAGE)
    .withExposedPorts(PROXY_PORT, CONTROL_PORT)
    // The launchpad logs this once its HTTP server is up. That is readiness of the CONTROL API and
    // says nothing about the backend — the two deliberately differ, because the control API stays
    // reachable while the backend is down during an outage scenario. The TCK calls POST /start
    // before each scenario, and /start is what must not return until the seeded state is served.
    .withWaitStrategy(Wait.forLogMessage(/launchpad listening/))
    .withStartupTimeout(90_000)
    .start();

  const host = container.getHost();
  // The Flagsmith SDK appends its own path segments, so this is the API root with a trailing
  // slash: remote evaluation requests "flags/" beneath it.
  baseUrl = `http://${host}:${container.getMappedPort(PROXY_PORT)}/api/v1/`;
  controlUrl = `http://${host}:${container.getMappedPort(CONTROL_PORT)}`;
}, 120_000);

afterAll(async () => {
  await container?.stop();
});

runProviderTck({
  name: 'flagsmith-js-remote',
  control,

  newProvider: () => {
    const client = new Flagsmith({ environmentKey: SERVER_SIDE_KEY, apiUrl: baseUrl });
    // useBooleanConfigValue puts this provider on the same footing as the other three.
    //
    // It defaults to FALSE here, meaning a boolean flag resolves from Flagsmith's `enabled` state
    // rather than from feature_state_value -- the same default Python takes, and the opposite of
    // Go and Java. Four providers for one product, split two-two on what a boolean flag *is*.
    //
    // The canonical set models booleans as values and seeds every flag enabled, so the default
    // would resolve boolean-zero-flag to true, which the falsy-value scenario exists to catch.
    return new FlagsmithOpenFeatureProvider(client, { useBooleanConfigValue: true });
  },

  // Predictions, to be corrected by the run.
  //
  // Capability.Variants is withheld for the reason the Go adoption established: Flagsmith has no
  // variant concept for a plain feature, the evaluation response carries no variant key, and no
  // seeding can produce one. Permitted rather than defective — 2.2.4 makes the variant a SHOULD —
  // so it carries no deviation entry.
  //
  // Lifecycle and event capabilities are withheld pending the run, as in the other three.
  capabilities: [Capability.Object, Capability.LargeIntegers, Capability.Targeting],

  knownDeviations: [
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

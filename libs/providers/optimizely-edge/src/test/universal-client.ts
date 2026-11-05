import {
  createInstance,
  createStaticProjectConfigManager,
  type Client,
  type RequestHandler,
} from '@optimizely/optimizely-sdk/universal';

export const EDGE_TEST_FLAG_KEYS = {
  boolean: 'edge-boolean-flag',
  string: 'edge-string-flag',
  number: 'edge-number-flag',
  object: 'edge-object-flag',
} as const;

const flag = (id: string, key: string, rolloutId: string, variables: unknown[] = []) => ({
  id,
  key,
  rolloutId,
  experimentIds: [],
  variables,
});

const rollout = (
  id: string,
  experimentKey: string,
  variationKey: string,
  variables: unknown[] = [],
  featureEnabled = true,
) => ({
  id,
  experiments: [
    {
      id: `${id}-experiment`,
      key: experimentKey,
      applicationId: 'openfeature-edge-test-application',
      status: 'Running',
      layerId: 'openfeature-edge-test-layer',
      audienceIds: [],
      audienceConditions: [],
      variations: [{ id: `${id}-variation`, key: variationKey, featureEnabled, variables }],
      trafficAllocation: [{ entityId: `${id}-variation`, endOfRange: 100000 }],
    },
  ],
});

export const OPTIMIZELY_EDGE_TEST_DATAFILE = JSON.stringify({
  version: '4',
  projectId: 'openfeature-edge-test-project',
  projectName: 'OpenFeature Optimizely edge provider tests',
  revision: '1',
  sdkKey: 'openfeature-edge-test-sdk-key',
  environmentKey: 'openfeature-edge-test-environment',
  accountId: 'openfeature-edge-test-account',
  events: [],
  audiences: [],
  typedAudiences: [],
  groups: [],
  attributes: [],
  experiments: [],
  experimentFeatureMap: {},
  holdouts: [],
  cmabExperiments: [],
  integrations: [],
  odpIntegrationConfig: { integrated: false },
  featureFlags: [
    flag('1', EDGE_TEST_FLAG_KEYS.boolean, 'edge-rollout-boolean'),
    flag('2', EDGE_TEST_FLAG_KEYS.string, 'edge-rollout-string', [
      { id: 'v2', key: 'string-value', type: 'string', defaultValue: 'default' },
    ]),
    flag('3', EDGE_TEST_FLAG_KEYS.number, 'edge-rollout-number', [
      { id: 'v3', key: 'number-value', type: 'double', defaultValue: '0' },
    ]),
    flag('4', EDGE_TEST_FLAG_KEYS.object, 'edge-rollout-object', [
      { id: 'v4', key: 'object-value', type: 'json', defaultValue: '{}' },
    ]),
  ],
  rollouts: [
    rollout('edge-rollout-boolean', 'edge-boolean-rule', 'on'),
    rollout('edge-rollout-string', 'edge-string-rule', 'on', [{ id: 'v2', value: 'hello-edge' }]),
    rollout('edge-rollout-number', 'edge-number-rule', 'on', [{ id: 'v3', value: '42.5' }]),
    rollout('edge-rollout-object', 'edge-object-rule', 'on', [{ id: 'v4', value: '{"color":"blue","count":2}' }]),
  ],
});

const staticRequestHandler: RequestHandler = {
  makeRequest: () => ({
    abort: () => undefined,
    responsePromise: Promise.resolve({ statusCode: 200, body: '', headers: {} }),
  }),
};

export function createStaticUniversalClient(): Client {
  return createInstance({
    projectConfigManager: createStaticProjectConfigManager({ datafile: OPTIMIZELY_EDGE_TEST_DATAFILE }),
    requestHandler: staticRequestHandler,
    disposable: true,
  });
}

import {
  type Client,
  type EventDispatcher,
  createForwardingEventProcessor,
  createInstance,
  createStaticProjectConfigManager,
} from '@optimizely/optimizely-sdk';

export const OPTIMIZELY_TEST_FLAG_KEYS = {
  boolean: 'boolean-flag',
  string: 'string-flag',
  number: 'number-flag',
  boolVariable: 'bool-variable-flag',
  object: 'object-flag',
  multiple: 'multiple-flag',
  disabled: 'disabled-flag',
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
  featureEnabled: boolean,
  variables: unknown[] = [],
) => ({
  id,
  experiments: [
    {
      id: `${id}-experiment`,
      key: experimentKey,
      applicationId: 'openfeature-test-application',
      status: 'Running',
      layerId: 'openfeature-test-layer',
      audienceIds: [],
      audienceConditions: [],
      variations: [{ id: `${id}-variation`, key: variationKey, featureEnabled, variables }],
      trafficAllocation: [{ entityId: `${id}-variation`, endOfRange: 100000 }],
    },
  ],
});

export const OPTIMIZELY_TEST_DATAFILE = JSON.stringify({
  version: '4',
  projectId: 'openfeature-test-project',
  projectName: 'OpenFeature Optimizely provider tests',
  revision: '1',
  sdkKey: 'openfeature-test-sdk-key',
  environmentKey: 'openfeature-test-environment',
  accountId: 'openfeature-test-account',
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
    flag('1', OPTIMIZELY_TEST_FLAG_KEYS.boolean, 'rollout-boolean'),
    flag('2', OPTIMIZELY_TEST_FLAG_KEYS.string, 'rollout-string', [
      { id: 'v20', key: 'string-value', type: 'string', defaultValue: 'default' },
    ]),
    flag('3', OPTIMIZELY_TEST_FLAG_KEYS.number, 'rollout-number', [
      { id: 'v30', key: 'number-value', type: 'double', defaultValue: '0' },
    ]),
    flag('4', OPTIMIZELY_TEST_FLAG_KEYS.boolVariable, 'rollout-bool-variable', [
      { id: 'v40', key: 'bool-value', type: 'boolean', defaultValue: 'false' },
    ]),
    flag('5', OPTIMIZELY_TEST_FLAG_KEYS.object, 'rollout-object', [
      { id: 'v50', key: 'object-value', type: 'json', defaultValue: '{}' },
    ]),
    flag('6', OPTIMIZELY_TEST_FLAG_KEYS.multiple, 'rollout-multiple', [
      { id: 'v60', key: 'first', type: 'string', defaultValue: 'a' },
      { id: 'v61', key: 'second', type: 'integer', defaultValue: '1' },
    ]),
    flag('7', OPTIMIZELY_TEST_FLAG_KEYS.disabled, 'rollout-disabled'),
  ],
  rollouts: [
    rollout('rollout-boolean', 'boolean-rule', 'on', true),
    rollout('rollout-string', 'string-rule', 'on', true, [{ id: 'v20', value: 'hello' }]),
    rollout('rollout-number', 'number-rule', 'on', true, [{ id: 'v30', value: '42.5' }]),
    rollout('rollout-bool-variable', 'bool-variable-rule', 'on', true, [{ id: 'v40', value: 'true' }]),
    rollout('rollout-object', 'object-rule', 'on', true, [{ id: 'v50', value: '{"color":"blue","count":2}' }]),
    rollout('rollout-multiple', 'multiple-rule', 'on', true, [
      { id: 'v60', value: 'one' },
      { id: 'v61', value: '7' },
    ]),
    rollout('rollout-disabled', 'disabled-rule', 'off', false),
  ],
});

const NOOP_EVENT_DISPATCHER: EventDispatcher = {
  dispatchEvent: async () => ({ statusCode: 200 }),
};

export const createStaticOptimizelyClient = (eventDispatcher: EventDispatcher = NOOP_EVENT_DISPATCHER): Client =>
  createInstance({
    projectConfigManager: createStaticProjectConfigManager({ datafile: OPTIMIZELY_TEST_DATAFILE }),
    eventProcessor: createForwardingEventProcessor(eventDispatcher),
  });

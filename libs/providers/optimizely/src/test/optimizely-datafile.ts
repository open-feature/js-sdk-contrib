import {
  type Client,
  type EventDispatcher,
  createForwardingEventProcessor,
  createInstance,
  createStaticProjectConfigManager,
} from '@optimizely/optimizely-sdk';

/**
 * A small, deterministic Feature Experimentation datafile used by the unit
 * and OpenFeature contract tests. It contains no credentials and is never
 * fetched from Optimizely's datafile service.
 */
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
    {
      id: '1',
      key: 'boolean-flag',
      rolloutId: 'rollout-boolean',
      experimentIds: [],
      variables: [],
    },
    {
      id: '2',
      key: 'string-flag',
      rolloutId: 'rollout-string',
      experimentIds: [],
      variables: [{ id: 'v20', key: 'string-value', type: 'string', defaultValue: 'default' }],
    },
    {
      id: '3',
      key: 'number-flag',
      rolloutId: 'rollout-number',
      experimentIds: [],
      variables: [{ id: 'v30', key: 'number-value', type: 'double', defaultValue: '0' }],
    },
    {
      id: '4',
      key: 'bool-variable-flag',
      rolloutId: 'rollout-bool-variable',
      experimentIds: [],
      variables: [{ id: 'v40', key: 'bool-value', type: 'boolean', defaultValue: 'false' }],
    },
    {
      id: '5',
      key: 'object-flag',
      rolloutId: 'rollout-object',
      experimentIds: [],
      variables: [{ id: 'v50', key: 'object-value', type: 'json', defaultValue: '{}' }],
    },
    {
      id: '6',
      key: 'multiple-flag',
      rolloutId: 'rollout-multiple',
      experimentIds: [],
      variables: [
        { id: 'v60', key: 'first', type: 'string', defaultValue: 'a' },
        { id: 'v61', key: 'second', type: 'integer', defaultValue: '1' },
      ],
    },
    {
      id: '7',
      key: 'disabled-flag',
      rolloutId: 'rollout-disabled',
      experimentIds: [],
      variables: [],
    },
  ],
  rollouts: [
    {
      id: 'rollout-boolean',
      experiments: [
        {
          id: 'e1',
          key: 'boolean-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [{ id: 'e1v', key: 'on', featureEnabled: true, variables: [] }],
          trafficAllocation: [{ entityId: 'e1v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-string',
      experiments: [
        {
          id: 'e2',
          key: 'string-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [{ id: 'e2v', key: 'on', featureEnabled: true, variables: [{ id: 'v20', value: 'hello' }] }],
          trafficAllocation: [{ entityId: 'e2v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-number',
      experiments: [
        {
          id: 'e3',
          key: 'number-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [{ id: 'e3v', key: 'on', featureEnabled: true, variables: [{ id: 'v30', value: '42.5' }] }],
          trafficAllocation: [{ entityId: 'e3v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-bool-variable',
      experiments: [
        {
          id: 'e4',
          key: 'bool-variable-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [{ id: 'e4v', key: 'on', featureEnabled: true, variables: [{ id: 'v40', value: 'true' }] }],
          trafficAllocation: [{ entityId: 'e4v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-object',
      experiments: [
        {
          id: 'e5',
          key: 'object-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [
            {
              id: 'e5v',
              key: 'on',
              featureEnabled: true,
              variables: [{ id: 'v50', value: '{"color":"blue","count":2}' }],
            },
          ],
          trafficAllocation: [{ entityId: 'e5v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-multiple',
      experiments: [
        {
          id: 'e6',
          key: 'multiple-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [
            {
              id: 'e6v',
              key: 'on',
              featureEnabled: true,
              variables: [
                { id: 'v60', value: 'one' },
                { id: 'v61', value: '7' },
              ],
            },
          ],
          trafficAllocation: [{ entityId: 'e6v', endOfRange: 100000 }],
        },
      ],
    },
    {
      id: 'rollout-disabled',
      experiments: [
        {
          id: 'e7',
          key: 'disabled-rule',
          applicationId: 'openfeature-test-application',
          status: 'Running',
          layerId: 'layer-1',
          audienceIds: [],
          audienceConditions: [],
          variations: [{ id: 'e7v', key: 'off', featureEnabled: false, variables: [] }],
          trafficAllocation: [{ entityId: 'e7v', endOfRange: 100000 }],
        },
      ],
    },
  ],
});

export const OPTIMIZELY_TEST_FLAG_KEYS = {
  boolean: 'boolean-flag',
  string: 'string-flag',
  number: 'number-flag',
  boolVariable: 'bool-variable-flag',
  object: 'object-flag',
  multiple: 'multiple-flag',
  disabled: 'disabled-flag',
} as const;

const NOOP_EVENT_DISPATCHER: EventDispatcher = {
  dispatchEvent: async () => ({ statusCode: 200 }),
};

export const createStaticOptimizelyClient = (eventDispatcher: EventDispatcher = NOOP_EVENT_DISPATCHER): Client =>
  createInstance({
    projectConfigManager: createStaticProjectConfigManager({ datafile: OPTIMIZELY_TEST_DATAFILE }),
    eventProcessor: createForwardingEventProcessor(eventDispatcher),
  });

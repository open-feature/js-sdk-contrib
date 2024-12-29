import { getGherkinTestPath } from '@openfeature/flagd-core';

export const FLAGD_NAME = 'flagd';
export const UNSTABLE_CLIENT_NAME = 'unstable';
export const UNAVAILABLE_CLIENT_NAME = 'unavailable';

export const GHERKIN_FLAGD = getGherkinTestPath('*.feature');
export const CONNECTION_FEATURE = getGherkinTestPath('connection.feature');
export const CONTEXT_ENRICHMENT_FEATURE = getGherkinTestPath('contextEnrichment.feature');
export const EVALUATION_FEATURE = getGherkinTestPath('evaluation.feature');
export const EVENTS_FEATURE = getGherkinTestPath('events.feature');
export const METADATA_FEATURE = getGherkinTestPath('metadata.feature');
export const RPC_CACHING_FEATURE = getGherkinTestPath('rpc-caching.feature');
export const SELECTOR_FEATURE = getGherkinTestPath('selector.feature');
export const TARGETING_FEATURE = getGherkinTestPath('targeting.feature');
export const GHERKIN_EVALUATION_FEATURE = getGherkinTestPath(
  'evaluation.feature',
  'spec/specification/assets/gherkin/',
);

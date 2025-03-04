import { getGherkinTestPath } from '@openfeature/flagd-core';

export const FLAGD_NAME = 'flagd';
export const UNSTABLE_CLIENT_NAME = 'unstable';
export const UNAVAILABLE_CLIENT_NAME = 'unavailable';

export const GHERKIN_FLAGD = getGherkinTestPath('*.feature');
export const GHERKIN_CONFIG = getGherkinTestPath('config.feature');
export const GHERKIN_FLAGD_FEATURE = getGherkinTestPath('flagd.feature');
export const GHERKIN_FLAGD_TESTING = getGherkinTestPath('testing.feature');
export const GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE = getGherkinTestPath('flagd-json-evaluator.feature');
export const GHERKIN_FLAGD_RECONNECT_FEATURE = getGherkinTestPath('flagd-reconnect.feature');
export const GHERKIN_EVALUATION_FEATURE = getGherkinTestPath(
  'evaluation.feature',
  'spec/specification/assets/gherkin/',
);

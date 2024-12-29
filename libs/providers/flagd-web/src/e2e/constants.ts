import { getGherkinTestPath } from '@openfeature/flagd-core';

export const FLAGD_NAME = 'flagd';

export const GHERKIN_EVALUATION_FEATURE = getGherkinTestPath(
  'evaluation.feature',
  'spec/specification/assets/gherkin/',
);

export const FLAGD_NAME = 'flagd Provider';
export const E2E_CLIENT_NAME = 'e2e';
export const UNSTABLE_CLIENT_NAME = 'unstable';
export const UNAVAILABLE_CLIENT_NAME = 'unavailable';

export const IMAGE_VERSION = 'v0.5.6';

export function getGherkinTestPath(file: string, modulePath = 'test-harness/gherkin/'): string {
  // TODO: find a way to resolve this in a generic manner - currently this works, because of the file structure
  return `<rootdir>/../../../../../shared/flagd-core/${modulePath}${file}`;
}

export const GHERKIN_FLAGD_FEATURE = getGherkinTestPath('flagd.feature');
export const GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE = getGherkinTestPath('flagd-json-evaluator.feature');
export const GHERKIN_FLAGD_RECONNECT_FEATURE = getGherkinTestPath('flagd-reconnect.feature');
export const GHERKIN_EVALUATION_FEATURE = getGherkinTestPath(
  'evaluation.feature',
  'spec/specification/assets/gherkin/',
);

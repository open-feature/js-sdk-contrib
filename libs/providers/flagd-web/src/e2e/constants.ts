export const FLAGD_NAME = 'flagd-web';
export const E2E_CLIENT_NAME = 'e2e';

export const IMAGE_VERSION = 'v0.5.13';

export function getGherkinTestPath(file: string, modulePath = 'test-harness/gherkin/'): string {
  // TODO: find a way to resolve this in a generic manner - currently this works, because of the file structure
  return `<rootdir>/../../../../../shared/flagd-core/${modulePath}${file}`;
}

export const GHERKIN_EVALUATION_FEATURE = getGherkinTestPath(
  'flagd.feature'
);

export const E2E_CLIENT_NAME = 'e2e';

export const IMAGE_VERSION = 'v0.5.21';

export function getGherkinTestPath(file: string, modulePath = 'test-harness/gherkin/'): string {
  return `<rootdir>/../../../../../shared/flagd-core/${modulePath}${file}`;
}

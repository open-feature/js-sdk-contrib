import { getGherkinTestPath } from '@openfeature/flagd-core';

export const UNSTABLE_CLIENT_NAME = 'unstable';
export const UNAVAILABLE_CLIENT_NAME = 'unavailable';

export const GHERKIN_FLAGD = getGherkinTestPath('*.feature');
export const CONFIG_FEATURE = getGherkinTestPath('config.feature');

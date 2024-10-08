import { OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { E2E_CLIENT_NAME } from '../constants';

export function flagd() {
  // load the feature file.
  const feature = loadFeature('features/flagd.feature');

  // get a client (flagd provider registered in setup)
  const client = OpenFeature.getClient(E2E_CLIENT_NAME);

  const aFlagProviderIsSet = (given: (stepMatcher: string, stepDefinitionCallback: () => void) => void) => {
    given('a flagd provider is set', () => undefined);
  };

  defineFeature(feature, (test) => {
    beforeAll((done) => {
      client.addHandler(ProviderEvents.Ready, async () => {
        done();
      });
    });

    test('Provider ready event', ({ given, when, then }) => {
      let ran = false;

      aFlagProviderIsSet(given);
      when('a PROVIDER_READY handler is added', () => {
        client.addHandler(ProviderEvents.Ready, async () => {
          ran = true;
        });
      });
      then('the PROVIDER_READY handler must run', () => {
        expect(ran).toBeTruthy();
      });
    });

    test('Flag change event', ({ given, when, and, then }) => {
      let ran = false;
      let flagsChanged: string[];

      aFlagProviderIsSet(given);
      when('a PROVIDER_CONFIGURATION_CHANGED handler is added', () => {
        client.addHandler(ProviderEvents.ConfigurationChanged, async (details) => {
          ran = true;
          // file writes are not atomic, so we get a few events in quick succession from the testbed
          // some will not contain changes, this tolerates that; at least 1 should have our change
          if (details?.flagsChanged?.length) {
            flagsChanged = details?.flagsChanged;
          }
        });
      });
      and(/^a flag with key "(.*)" is modified$/, async () => {
        // this happens every 1s in the associated container, so wait 3s
        await new Promise((resolve) => setTimeout(resolve, 3000));
      });
      then('the PROVIDER_CONFIGURATION_CHANGED handler must run', () => {
        expect(ran).toBeTruthy();
      });
      and(/^the event details must indicate "(.*)" was altered$/, (flagName) => {
        expect(flagsChanged).toContain(flagName);
      });
    });

    test('Resolves boolean zero value', ({ given, when, then }) => {
      let flagKey: string;
      let defaultValue: boolean;

      aFlagProviderIsSet(given);
      when(
        /^a zero-value boolean flag with key "(.*)" is evaluated with default value "(.*)"$/,
        (key, defaultVal: string) => {
          flagKey = key;
          defaultValue = defaultVal === 'true';
        },
      );
      then(/^the resolved boolean zero-value should be "(.*)"$/, async (expectedVal: string) => {
        const expectedValue = expectedVal === 'true';
        const value = await client.getBooleanValue(flagKey, defaultValue);
        expect(value).toEqual(expectedValue);
      });
    });

    test('Resolves string zero value', ({ given, when, then }) => {
      let flagKey: string;
      let defaultValue: string;

      aFlagProviderIsSet(given);
      when(/^a zero-value string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key, defaultVal) => {
        flagKey = key;
        defaultValue = defaultVal;
      });
      then('the resolved string zero-value should be ""', async () => {
        const value = await client.getStringValue(flagKey, defaultValue);
        expect(value).toEqual('');
      });
    });

    test('Resolves integer zero value', ({ given, when, then }) => {
      let flagKey: string;
      let defaultValue: number;

      aFlagProviderIsSet(given);
      when(/^a zero-value integer flag with key "(.*)" is evaluated with default value (\d+)$/, (key, defaultVal) => {
        flagKey = key;
        defaultValue = defaultVal;
      });
      then(/^the resolved integer zero-value should be (\d+)$/, async (expectedValueString) => {
        const expectedValue = Number.parseInt(expectedValueString);
        const value = await client.getNumberValue(flagKey, defaultValue);
        expect(value).toEqual(expectedValue);
      });
    });

    test('Resolves float zero value', ({ given, when, then }) => {
      let flagKey: string;
      let defaultValue: number;

      aFlagProviderIsSet(given);
      when(
        /^a zero-value float flag with key "(.*)" is evaluated with default value (\d+\.\d+)$/,
        (key, defaultValueString) => {
          flagKey = key;
          defaultValue = Number.parseFloat(defaultValueString);
        },
      );
      then(/^the resolved float zero-value should be (\d+\.\d+)$/, async (expectedValueString) => {
        const expectedValue = Number.parseFloat(expectedValueString);
        const value = await client.getNumberValue(flagKey, defaultValue);
        expect(value).toEqual(expectedValue);
      });
    });
  });
}

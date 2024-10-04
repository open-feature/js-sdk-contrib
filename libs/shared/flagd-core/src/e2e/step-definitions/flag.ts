import { StepDefinitions } from 'jest-cucumber';
import {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  JsonObject,
  OpenFeature,
  ProviderEvents,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { E2E_CLIENT_NAME } from '../constants';

export const flagStepDefinitions: StepDefinitions = ({ given, and, when, then }) => {
  let flagKey: string;
  let value: FlagValue;
  let context: EvaluationContext = {};
  let details: EvaluationDetails<FlagValue>;
  let fallback: FlagValue;
  let flagsChanged: string[];

  const client = OpenFeature.getClient(E2E_CLIENT_NAME);

  beforeAll((done) => {
    client.addHandler(ProviderEvents.Ready, () => {
      done();
    });
  });

  beforeEach(() => {
    context = {};
  });

  given('a provider is registered', () => undefined);
  given('a flagd provider is set', () => undefined);

  when(
    /^a boolean flag with key "(.*)" is evaluated with default value "(.*)"$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      value = await client.getBooleanValue(key, defaultValue === 'true');
    },
  );

  then(/^the resolved boolean value should be "(.*)"$/, (expectedValue: string) => {
    expect(value).toEqual(expectedValue === 'true');
  });

  when(
    /^a string flag with key "(.*)" is evaluated with default value "(.*)"$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      value = await client.getStringValue(key, defaultValue);
    },
  );

  then(/^the resolved string value should be "(.*)"$/, (expectedValue: string) => {
    expect(value).toEqual(expectedValue);
  });

  when(
    /^an integer flag with key "(.*)" is evaluated with default value (\d+)$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = Number(defaultValue);
      value = await client.getNumberValue(key, Number.parseInt(defaultValue));
    },
  );

  then(/^the resolved integer value should be (\d+)$/, (expectedValue: string) => {
    expect(value).toEqual(Number.parseInt(expectedValue));
  });

  when(
    /^a float flag with key "(.*)" is evaluated with default value (\d+\.?\d*)$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = Number(defaultValue);
      value = await client.getNumberValue(key, Number.parseFloat(defaultValue));
    },
  );

  then(/^the resolved float value should be (\d+\.?\d*)$/, (expectedValue: string) => {
    expect(value).toEqual(Number.parseFloat(expectedValue));
  });

  when(/^an object flag with key "(.*)" is evaluated with a null default value$/, async (key: string) => {
    const defaultValue = {};
    flagKey = key;
    fallback = '';
    value = await client.getObjectValue(key, defaultValue);
  });

  then(
    /^the resolved object value should be contain fields "(.*)", "(.*)", and "(.*)", with values "(.*)", "(.*)" and (\d+), respectively$/,
    (field1: string, field2: string, field3: string, boolValue: string, stringValue: string, intValue: string) => {
      const jsonObject = value as JsonObject;
      expect(jsonObject[field1]).toEqual(boolValue === 'true');
      expect(jsonObject[field2]).toEqual(stringValue);
      expect(jsonObject[field3]).toEqual(Number.parseInt(intValue));
    },
  );

  when(
    /^a boolean flag with key "(.*)" is evaluated with details and default value "(.*)"$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      details = await client.getBooleanDetails(key, defaultValue === 'true');
    },
  );

  then(
    /^the resolved boolean details value should be "(.*)", the variant should be "(.*)", and the reason should be "(.*)"$/,
    (expectedValue: string, expectedVariant: string, expectedReason: string) => {
      expect(details).toBeDefined();
      expect(details.value).toEqual(expectedValue === 'true');
      expect(details.variant).toEqual(expectedVariant);
      expect(details.reason).toEqual(expectedReason);
    },
  );

  when(
    /^a string flag with key "(.*)" is evaluated with details and default value "(.*)"$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      details = await client.getStringDetails(key, defaultValue);
    },
  );

  then(
    /^the resolved string details value should be "(.*)", the variant should be "(.*)", and the reason should be "(.*)"$/,
    (expectedValue: string, expectedVariant: string, expectedReason: string) => {
      expect(details).toBeDefined();
      expect(details.value).toEqual(expectedValue);
      expect(details.variant).toEqual(expectedVariant);
      expect(details.reason).toEqual(expectedReason);
    },
  );

  when(
    /^an integer flag with key "(.*)" is evaluated with details and default value (\d+)$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      details = await client.getNumberDetails(key, Number.parseInt(defaultValue));
    },
  );

  then(
    /^the resolved integer details value should be (\d+), the variant should be "(.*)", and the reason should be "(.*)"$/,
    (expectedValue: string, expectedVariant: string, expectedReason: string) => {
      expect(details).toBeDefined();
      expect(details.value).toEqual(Number.parseInt(expectedValue));
      expect(details.variant).toEqual(expectedVariant);
      expect(details.reason).toEqual(expectedReason);
    },
  );

  when(
    /^a float flag with key "(.*)" is evaluated with details and default value (\d+\.?\d*)$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      details = await client.getNumberDetails(key, Number.parseFloat(defaultValue));
    },
  );

  then(
    /^the resolved float details value should be (\d+\.?\d*), the variant should be "(.*)", and the reason should be "(.*)"$/,
    (expectedValue: string, expectedVariant: string, expectedReason: string) => {
      expect(details).toBeDefined();
      expect(details.value).toEqual(Number.parseFloat(expectedValue));
      expect(details.variant).toEqual(expectedVariant);
      expect(details.reason).toEqual(expectedReason);
    },
  );

  when(/^an object flag with key "(.*)" is evaluated with details and a null default value$/, async (key: string) => {
    flagKey = key;
    fallback = {};
    details = await client.getObjectDetails(key, {});
  });

  then(
    /^the resolved object details value should be contain fields "(.*)", "(.*)", and "(.*)", with values "(.*)", "(.*)" and (\d+), respectively$/,
    (field1: string, field2: string, field3: string, boolValue: string, stringValue: string, intValue: string) => {
      expect(details).toBeDefined();
      const jsonObject = details.value as JsonObject;

      expect(jsonObject[field1]).toEqual(boolValue === 'true');
      expect(jsonObject[field2]).toEqual(stringValue);
      expect(jsonObject[field3]).toEqual(Number.parseInt(intValue));
    },
  );

  and(
    /^the variant should be "(.*)", and the reason should be "(.*)"$/,
    (expectedVariant: string, expectedReason: string) => {
      expect(details).toBeDefined();
      expect(details.variant).toEqual(expectedVariant);
      expect(details.reason).toEqual(expectedReason);
    },
  );

  when(
    /^context contains keys "(.*)", "(.*)", "(.*)", "(.*)" with values "(.*)", "(.*)", (\d+), "(.*)"$/,
    (
      stringField1: string,
      stringField2: string,
      intField: string,
      boolField: string,
      stringValue1: string,
      stringValue2: string,
      intValue: string,
      boolValue: string,
    ) => {
      context[stringField1] = stringValue1;
      context[stringField2] = stringValue2;
      context[intField] = Number.parseInt(intValue);
      context[boolField] = boolValue === 'true';
    },
  );

  and(/^a flag with key "(.*)" is evaluated with default value "(.*)"$/, async (key: string, defaultValue: string) => {
    flagKey = key;
    value = await client.getStringValue(flagKey, defaultValue, context);
  });

  then(/^the resolved string response should be "(.*)"$/, (expectedValue: string) => {
    expect(value).toEqual(expectedValue);
  });

  and(/^the resolved flag value is "(.*)" when the context is empty$/, async (expectedValue) => {
    const emptyContextValue = await client.getStringValue(flagKey, 'nope', {});
    expect(emptyContextValue).toEqual(expectedValue);
  });

  when(
    /^a non-existent string flag with key "(.*)" is evaluated with details and a default value "(.*)"$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = defaultValue;
      details = await client.getStringDetails(flagKey, defaultValue);
    },
  );

  then(/^the default string value should be returned$/, () => {
    expect(details).toBeDefined();
    expect(details.value).toEqual(fallback);
  });

  and(
    /^the reason should indicate an error and the error code should indicate a missing flag with "(.*)"$/,
    (errorCode: string) => {
      expect(details).toBeDefined();
      expect(details.reason).toEqual(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toEqual(errorCode);
    },
  );

  when(
    /^a string flag with key "(.*)" is evaluated as an integer, with details and a default value (\d+)$/,
    async (key: string, defaultValue: string) => {
      flagKey = key;
      fallback = Number.parseInt(defaultValue);
      details = await client.getNumberDetails(flagKey, Number.parseInt(defaultValue));
    },
  );

  then(/^the default integer value should be returned$/, () => {
    expect(details).toBeDefined();
    expect(details.value).toEqual(fallback);
  });

  and(
    /^the reason should indicate an error and the error code should indicate a type mismatch with "(.*)"$/,
    (errorCode: string) => {
      expect(details).toBeDefined();
      expect(details.reason).toEqual(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toEqual(errorCode);
    },
  );

  let ran: Promise<boolean>;
  when('a PROVIDER_READY handler is added', () => {
    ran = new Promise<boolean>((resolve) => {
      client.addHandler(ProviderEvents.Ready, async () => {
        resolve(true);
      });
    });
  });
  then('the PROVIDER_READY handler must run', () => {
    expect(ran).toBeTruthy();
  });

  when('a PROVIDER_CONFIGURATION_CHANGED handler is added', () => {
    ran = new Promise<boolean>((resolve) => {
      client.addHandler(ProviderEvents.ConfigurationChanged, async (details) => {
        // file writes are not atomic, so we get a few events in quick succession from the testbed
        // some will not contain changes, this tolerates that; at least 1 should have our change
        if (details?.flagsChanged?.length) {
          flagsChanged = details?.flagsChanged;

          resolve(true);
        }
      });
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

  when(
    /^a zero-value boolean flag with key "(.*)" is evaluated with default value "(.*)"$/,
    (key, defaultVal: string) => {
      flagKey = key;
      fallback = defaultVal === 'true';
    },
  );

  then(/^the resolved boolean zero-value should be "(.*)"$/, async (expectedVal: string) => {
    const expectedValue = expectedVal === 'true';
    const value = await client.getBooleanValue(flagKey, fallback as boolean);
    expect(value).toEqual(expectedValue);
  });

  when(/^a zero-value string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key, defaultVal) => {
    flagKey = key;
    fallback = defaultVal;
  });

  then('the resolved string zero-value should be ""', async () => {
    const value = await client.getStringValue(flagKey, fallback as string);
    expect(value).toEqual('');
  });

  when(/^a zero-value integer flag with key "(.*)" is evaluated with default value (\d+)$/, (key, defaultVal) => {
    flagKey = key;
    fallback = defaultVal;
  });

  then(/^the resolved integer zero-value should be (\d+)$/, async (expectedValueString) => {
    const expectedValue = Number.parseInt(expectedValueString);
    const value = await client.getNumberValue(flagKey, fallback as number);
    expect(value).toEqual(expectedValue);
  });

  when(
    /^a zero-value float flag with key "(.*)" is evaluated with default value (\d+\.\d+)$/,
    (key, defaultValueString) => {
      flagKey = key;
      fallback = Number.parseFloat(defaultValueString);
    },
  );

  then(/^the resolved float zero-value should be (\d+\.\d+)$/, async (expectedValueString) => {
    const expectedValue = Number.parseFloat(expectedValueString);
    const value = await client.getNumberValue(flagKey, fallback as number);
    expect(value).toEqual(expectedValue);
  });

  // evaluator
  and(/^a context containing a key "(.*)", with value "?([^"]*)"?$/, (key: string, value: string) => {
    context[key] = value;
  });

  then(/^the returned value should be (.*)$/, async (expectedValue) => {
    if (!isNaN(Number(expectedValue))) {
      const value = await client.getNumberValue(flagKey, fallback as number, context);
      expect(value).toEqual(Number(expectedValue));
    } else if (typeof expectedValue == 'string') {
      const value = await client.getStringValue(flagKey, fallback as string, context);
      expect(value).toEqual(expectedValue.replaceAll('"', ''));
    }
  });

  and(
    /^a context containing a nested property with outer key "(.*)" and inner key "(.*)", with value (.*)$/,
    (outerKey: string, innerKey: string, value: string) => {
      // we have to support string and non-string params in this test (we test invalid context value 3)
      const valueNoQuotes = value.replaceAll('"', '');
      context[outerKey] = {
        [innerKey]: parseInt(value) || valueNoQuotes,
      };
    },
  );

  and(/^a context containing a targeting key with value "(.*)"$/, async (targetingKeyValue) => {
    context.targetingKey = targetingKeyValue;
    details = await client.getStringDetails(flagKey, fallback as string, context);
    value = details.value;
  });

  then(/^the returned reason should be "(.*)"$/, (expectedReason) => {
    expect(details.reason).toEqual(expectedReason);
  });
};

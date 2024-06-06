import { EvaluationContext, EvaluationDetails, OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { StepsDefinitionCallbackFunction } from 'jest-cucumber/dist/src/feature-definition-creation';
import { E2E_CLIENT_NAME } from '../constants';

// load the feature file.
const feature = loadFeature('features/flagd-json-evaluator.feature');

// get a client (flagd provider registered in setup)
const client = OpenFeature.getClient(E2E_CLIENT_NAME);

const aFlagProviderIsSet = (given: (stepMatcher: string, stepDefinitionCallback: () => void) => void) => {
  given('a flagd provider is set', () => undefined);
};

// this is common to 4 tests
const evaluateStringFlagWithContext: StepsDefinitionCallbackFunction = ({ given, when, and, then }) => {
  let flagKey: string;
  let defaultValue: string;
  const evaluationContext: EvaluationContext = {};

  aFlagProviderIsSet(given);
  when(/^a string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key: string, defaultVal: string) => {
    flagKey = key;
    defaultValue = defaultVal;
  });
  // the below has to match quotes strings ("str") and numbers (3) to test an error input
  and(/^a context containing a key "(.*)", with value "?([^"]*)"?$/, (key: string, value: string) => {
    evaluationContext[key] = value;
  });
  then(/^the returned value should be "(.*)"$/, async (expectedValue: string) => {
    const value = await client.getStringValue(flagKey, defaultValue, evaluationContext);
    expect(value).toEqual(expectedValue);
  });
};

const evaluateStringFlagWithFractional: StepsDefinitionCallbackFunction = ({ given, when, and, then }) => {
  let flagKey: string;
  let defaultValue: string;
  const evaluationContext: EvaluationContext = {};

  aFlagProviderIsSet(given);
  when(/^a string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key, defaultVal) => {
    flagKey = key;
    defaultValue = defaultVal;
  });
  and(
    /^a context containing a nested property with outer key "(.*)" and inner key "(.*)", with value (.*)$/,
    (outerKey: string, innerKey: string, value: string) => {
      // we have to support string and non-string params in this test (we test invalid context value 3)
      const valueNoQuotes = value.replaceAll('"', '');
      evaluationContext[outerKey] = {
        [innerKey]: parseInt(valueNoQuotes) || valueNoQuotes,
      };
    },
  );
  then(/^the returned value should be "(.*)"$/, async (expectedValue: string) => {
    const value = await client.getStringValue(flagKey, defaultValue, evaluationContext);
    expect(value).toEqual(expectedValue);
  });
};

defineFeature(feature, (test) => {
  beforeAll((done) => {
    client.addHandler(ProviderEvents.Ready, async () => {
      done();
    });
  });

  afterAll(async () => {
    await OpenFeature.close();
  });

  test('Evaluator reuse', evaluateStringFlagWithContext);

  test('Fractional operator', evaluateStringFlagWithFractional);

  test('Fractional operator with shared seed', evaluateStringFlagWithFractional);

  test('Second fractional operator with shared seed', evaluateStringFlagWithFractional);

  test('Substring operators', evaluateStringFlagWithContext);

  test('Semantic version operator numeric comparison', evaluateStringFlagWithContext);

  test('Semantic version operator semantic comparison', evaluateStringFlagWithContext);

  test('Time-based operations', ({ given, when, and, then }) => {
    let flagKey: string;
    let defaultValue: number;
    const evaluationContext: EvaluationContext = {};

    aFlagProviderIsSet(given);

    when(/^an integer flag with key "(.*)" is evaluated with default value (\d+)$/, (key, defaultVal) => {
      flagKey = key;
      defaultValue = defaultVal;
    });

    and(/^a context containing a key "(.*)", with value (.*)$/, (key, value) => {
      evaluationContext[key] = value;
    });
    then(/^the returned value should be (.*)$/, async (expectedValue) => {
      const value = await client.getNumberValue(flagKey, defaultValue, evaluationContext);
      expect(value).toEqual(parseInt(expectedValue));
    });
  });

  test('Targeting by targeting key', ({ given, when, and, then }) => {
    let flagKey: string;
    let defaultValue: string;
    let details: EvaluationDetails<string>;

    aFlagProviderIsSet(given);

    when(/^a string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key, defaultVal) => {
      flagKey = key;
      defaultValue = defaultVal;
    });

    and(/^a context containing a targeting key with value "(.*)"$/, async (targetingKeyValue) => {
      details = await client.getStringDetails(flagKey, defaultValue, { targetingKey: targetingKeyValue });
    });

    then(/^the returned value should be "(.*)"$/, (expectedValue) => {
      expect(details.value).toEqual(expectedValue);
    });

    then(/^the returned reason should be "(.*)"$/, (expectedReason) => {
      expect(details.reason).toEqual(expectedReason);
    });
  });

  test('Errors and edge cases', ({ given, when, then }) => {
    let flagKey: string;
    let defaultValue: number;

    aFlagProviderIsSet(given);

    when(/^an integer flag with key "(.*)" is evaluated with default value (.*)$/, (key, defaultVal) => {
      flagKey = key;
      defaultValue = parseInt(defaultVal);
    });

    then(/^the returned value should be (.*)$/, async (expectedValue) => {
      const value = await client.getNumberValue(flagKey, defaultValue);
      expect(value).toEqual(parseInt(expectedValue));
    });
  });
});

import { EvaluationContext, OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { StepsDefinitionCallbackFunction } from 'jest-cucumber/dist/src/feature-definition-creation';

// load the feature file.
const feature = loadFeature('features/flagd-json-evaluator.feature');

// get a client (flagd provider registered in setup)
const client = OpenFeature.getClient('e2e');

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
  and(/^a context containing a key "(.*)", with value "(.*)"$/, (key: string, value: string) => {
    evaluationContext[key] = value;
  });
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

  test('Fractional operator', ({ given, when, and, then }) => {
    let flagKey: string;
    let defaultValue: string;
    const evaluationContext: EvaluationContext = {};

    aFlagProviderIsSet(given);
    when(/^a string flag with key "(.*)" is evaluated with default value "(.*)"$/, (key, defaultVal) => {
      flagKey = key;
      defaultValue = defaultVal;
    });
    and(
      /^a context containing a nested property with outer key "(.*)" and inner key "(.*)", with value "(.*)"$/,
      (outerKey: string, innerKey: string, value: string) => {
        evaluationContext[outerKey] = {
          [innerKey]: value,
        };
      },
    );
    then(/^the returned value should be "(.*)"$/, async (expectedValue: string) => {
      const value = await client.getStringValue(flagKey, defaultValue, evaluationContext);
      expect(value).toEqual(expectedValue);
    });
  });

  test('Substring operators', evaluateStringFlagWithContext);

  test('Semantic version operator numeric comparision', evaluateStringFlagWithContext);

  test('Semantic version operator semantic comparision', evaluateStringFlagWithContext);
});

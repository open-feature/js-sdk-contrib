import { IFlagsmithResponse } from 'flagsmith/types';
type Flatten<T> = T extends any[] ? T[number] : T;
type FeatureResponse = Flatten<IFlagsmithResponse['flags']>;

export const exampleBooleanFlagName = 'example_boolean_flag';
export const exampleBooleanFlag: FeatureResponse = {
  feature_state_value: null,
  enabled: true,
  feature: {
    id: 1,
    name: exampleBooleanFlagName,
  },
};

export const exampleStringFlagName = 'example_string_flag';
export const exampleStringFlag: FeatureResponse = {
  feature_state_value: 'Hello World',
  enabled: true,
  feature: {
    id: 2,
    name: exampleStringFlagName,
  },
};

export const exampleNumericFlagName = 'example_numeric_flag';
export const exampleNumericFlag: FeatureResponse = {
  feature_state_value: 100,
  enabled: true,
  feature: {
    id: 3,
    name: exampleNumericFlagName,
  },
};

export const exampleFloatFlagName = 'example_float_flag';
export const exampleFloatFlag: FeatureResponse = {
  feature_state_value: 99.999,
  enabled: true,
  feature: {
    id: 4,
    name: exampleFloatFlagName,
  },
};

export const exampleJSONFlagName = 'example_json_flag';
export const exampleJSONFlag: FeatureResponse = {
  feature_state_value: JSON.stringify({ foo: 'bar' }),
  enabled: true,
  feature: {
    id: 5,
    name: exampleJSONFlagName,
  },
};
export const getFetchMock = (response: Record<string, any>) => {
  return jest.fn().mockResolvedValue({
    text: async () => JSON.stringify(response),
    status: 200,
  }) as any;
};

export const getFetchErrorMock = () => {
  return jest.fn().mockResolvedValue({
    status: 500,
    text: async () => JSON.stringify({ message: 'Oops there was an error!' }),
  }) as any;
};

export const exampleFlagsmithResponse = [
  exampleBooleanFlag,
  exampleFloatFlag,
  exampleJSONFlag,
  exampleNumericFlag,
  exampleStringFlag,
];

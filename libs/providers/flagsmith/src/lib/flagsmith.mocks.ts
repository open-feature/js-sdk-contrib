import { IFlagsmithResponse, IInitConfig } from 'flagsmith/types';
type Flatten<T> = T extends unknown[] ? T[number] : T;
type FeatureResponse = Flatten<IFlagsmithResponse['flags']>;
type Callback = (err: Error | null, val: string | null) => void;

class MockAsyncStorage {
  store: Map<string, string | null>;

  constructor() {
    this.store = new Map();
  }

  getItem = jest.fn(async (k: string, cb?: Callback): Promise<string | null> => {
    const val = this.store.get(k) || null;
    if (cb) cb(null, val);
    return Promise.resolve(val);
  });

  setItem = jest.fn(async (k: string, v: string, cb?: Callback): Promise<void> => {
    this.store.set(k, v);
    if (cb) cb(null, v);
    return Promise.resolve();
  });
}
export function getAsyncStorageMock() {
  return new MockAsyncStorage();
}
const environmentID = '0p3nf34tur3';
export const defaultConfig: () => IInitConfig = () => ({
  environmentID,
  AsyncStorage: getAsyncStorageMock(),
  fetch: getFetchMock(exampleFlagsmithResponse),
});
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
export const getFetchMock = (response: Record<string, unknown>) => {
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
export const defaultState = {
  api: 'https://edge.api.flagsmith.com/api/v1/',
  environmentID: environmentID,
  identity: undefined,
  traits: {},
  flags: {
    [exampleBooleanFlag.feature.name]: {
      id: exampleBooleanFlag.feature.id,
      enabled: exampleBooleanFlag.enabled,
      value: exampleBooleanFlag.feature_state_value,
    },
    [exampleFloatFlag.feature.name]: {
      id: exampleFloatFlag.feature.id,
      enabled: exampleFloatFlag.enabled,
      value: exampleFloatFlag.feature_state_value,
    },
    [exampleJSONFlag.feature.name]: {
      id: exampleJSONFlag.feature.id,
      enabled: exampleJSONFlag.enabled,
      value: exampleJSONFlag.feature_state_value,
    },
    [exampleNumericFlag.feature.name]: {
      id: exampleNumericFlag.feature.id,
      enabled: exampleNumericFlag.enabled,
      value: exampleNumericFlag.feature_state_value,
    },
    [exampleStringFlag.feature.name]: {
      id: exampleStringFlag.feature.id,
      enabled: exampleStringFlag.enabled,
      value: exampleStringFlag.feature_state_value,
    },
  },
};

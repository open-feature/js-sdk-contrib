import type { BaseFlag } from 'flagsmith-nodejs';

export const mockFlagData = {
  booleanAsStringEnabled: {
    enabled: true,
    value: 'true',
    isDefault: false,
  } as BaseFlag,
  booleanDefault: {
    enabled: true,
    value: false,
    isDefault: true,
  } as BaseFlag,
  booleanEnabled: {
    enabled: true,
    value: true,
    isDefault: false,
  } as BaseFlag,
  booleanDisabled: {
    enabled: false,
    value: false,
    isDefault: false,
  } as BaseFlag,
  stringDefault: {
    enabled: true,
    value: 'default-value',
    isDefault: true,
  } as BaseFlag,
  stringFlag: {
    enabled: true,
    value: 'test-string-value',
    isDefault: false,
  } as BaseFlag,
  numberAsStringFlag: {
    enabled: true,
    value: '42',
    isDefault: false,
  } as BaseFlag,
  numberActual: {
    enabled: true,
    value: 123,
    isDefault: false,
  } as BaseFlag,
  jsonValidFlag: {
    enabled: true,
    value: '{"key": "value", "nested": {"prop": true}}',
    isDefault: false,
  } as BaseFlag,
  jsonInvalidFlag: {
    enabled: true,
    value: '{invalid json',
    isDefault: false,
  } as BaseFlag,
  disabledFlag: {
    enabled: false,
    value: 'disabled-value',
    isDefault: false,
  } as BaseFlag,
};

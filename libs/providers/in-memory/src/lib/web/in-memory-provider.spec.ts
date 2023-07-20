import { ProviderEvents, ProviderStatus, ResolutionDetails, StandardResolutionReasons, TypeMismatchError, FlagNotFoundError, GeneralError } from '@openfeature/web-sdk';

import { InMemoryProvider } from './in-memory-provider';

describe(InMemoryProvider, () => {
  let provider: InMemoryProvider;
  beforeEach(() => {
    const flags = {
      'a-string-flag': 'configured-value',
      'a-boolean-flag': true,
      'a-numeric-flag': 42,
    };
    provider = new InMemoryProvider(flags);
  });

  describe('boolean flags', () => {
    it('resolves to the configured value for a known flag', () => {
      const resolution = provider.resolveBooleanEvaluation('a-boolean-flag', false);
      verifyResolution(resolution, { expectedValue: true });
    });

    it('throws a TypeMismatchError when asked to resolve a non-boolean flag', () => {
      expect(() => {
        provider.resolveBooleanEvaluation('a-string-flag', false);
      }).toThrow(TypeMismatchError)
    });

    it('throws when asked for an unrecognized flag', () => {
      expect(() => {
        provider.resolveBooleanEvaluation('unknown-flag', false);
      }).toThrow(FlagNotFoundError)
    });
  });

  describe('string flags', () => {
    it('resolves to the configured value for a known flag', () => {
      const resolution = provider.resolveStringEvaluation('a-string-flag','blah');
      verifyResolution(resolution, { expectedValue: 'configured-value' });
    });

    it('throws when asked for an unrecognized flag', () => {
      expect(() => {
        provider.resolveStringEvaluation('unknown-string-flag','blah');
      }).toThrow(FlagNotFoundError);
    });

    it('throws a TypeMismatchError when asked to resolve a non-string flag', () => {
      expect(() => {
        provider.resolveStringEvaluation('a-boolean-flag','blah');
      }).toThrow(TypeMismatchError);
    });
  });

  describe('numeric flags', () => {
    it('resolves to the configured value for a known flag', () => {
      const resolution = provider.resolveNumberEvaluation('a-numeric-flag',0);
      verifyResolution(resolution, { expectedValue: 42 });
    });

    it('throws when asked for an unrecognized flag', () => {
      expect(() => {
        provider.resolveNumberEvaluation('unknown-number-flag',0);
      }).toThrow(FlagNotFoundError);
    });

    it('throws a TypeMismatchError when asked to resolve a non-string flag', () => {
      expect(() => {
        provider.resolveNumberEvaluation('a-boolean-flag',0);
      }).toThrow(TypeMismatchError);
    });
  });

  describe('object flags', () => {
    it('is not currently supported, even if you try providing an object flag', () => {
      const provider = new InMemoryProvider({
        'an-object-flag': { foo: 'bar' },
      } as any); // bypass type-safety to simulate a JS consumer

      expect(() => {
        provider.resolveObjectEvaluation('an-object-flag',{});
      }).toThrow(GeneralError);
    });
  });

  it('reflects changes in flag configuration', () => {
    const provider = new InMemoryProvider({
      'some-flag': 'initial-value',
    });

    const firstResolution = provider.resolveStringEvaluation('some-flag','blah');
    verifyResolution(firstResolution, { expectedValue: 'initial-value' });

    provider.replaceConfiguration({
      'some-flag': 'updated-value',
    });

    const secondResolution = provider.resolveStringEvaluation('some-flag','blah');
    verifyResolution(secondResolution, { expectedValue: 'updated-value' });
  });

  it('does not let you monkey with the configuration passed by reference', () => {
    const configuration = {
      'some-flag': 'initial-value',
    };
    const provider = new InMemoryProvider(configuration);

    // I passed configuration by reference, so maybe I can mess
    // with it behind the providers back!
    configuration['some-flag'] = 'change';

    const resolution = provider.resolveStringEvaluation('some-flag','blah');
    verifyResolution(resolution, { expectedValue: 'initial-value' });
  });

  it('always has a READY status', ()=>{
    expect(provider.status).toEqual(ProviderStatus.READY)

  })

  describe('events', () => {
    it('emits provider changed event if a new value is added', (done) => { const configuration = {
        'some-flag': 'initial-value',
      };
      const provider = new InMemoryProvider(configuration);

      provider.events.addHandler(ProviderEvents.ConfigurationChanged, (details) => {
        expect(details?.flagsChanged).toEqual(['some-other-flag']);
        done();
      });

      const newConfiguration = { ...configuration, 'some-other-flag': 'value' };
      provider.replaceConfiguration(newConfiguration);
    });

    it('emits provider changed event if an existing value is changed', (done) => {
      const configuration = {
        'some-flag': 'initial-value',
      };
      const provider = new InMemoryProvider(configuration);

      provider.events.addHandler(ProviderEvents.ConfigurationChanged, (details) => {
        expect(details?.flagsChanged).toEqual(['some-flag']);
        done();
      });

      const newConfiguration = { 'some-flag': 'new-value' };
      provider.replaceConfiguration(newConfiguration);
    });
  });
});

type VerifyResolutionParams<U> = {
  expectedValue: U;
};

function verifyResolution<U>(resolution: ResolutionDetails<U>, { expectedValue }: VerifyResolutionParams<U>) {
  expect(resolution.value).toBe(expectedValue);
  expect(resolution.reason).toBe(StandardResolutionReasons.STATIC);
  expect(resolution.errorCode).toBeUndefined();
}

import type { Client, Provider } from '@openfeature/server-sdk';
import type { BackendControl } from './control';
import type { TckOptions } from './options';
import { TckState } from './state';
import { clientUnderTest, providerUnderTest, registerSuiteUnderTest, resetSuiteUnderTest } from './underTest';

/**
 * The unit half of the accessor's coverage. The behaviour that matters — that an extension step
 * reaches the client of the provider the suite registered, and that instance and no other — is
 * asserted end to end by `extensionSuite.spec.ts`, because only a real run has a real provider in
 * it. What is left for here is the failure modes, which a real run cannot reach without being
 * broken: no suite, and two suites.
 */

const control: BackendControl = {
  description: 'a control that exists only to satisfy the options type',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

const optionsFor = (name: string): TckOptions => ({
  name,
  control,
  newProvider: () => {
    throw new Error('no provider is constructed in these tests');
  },
});

beforeEach(() => {
  resetSuiteUnderTest();
});

afterAll(() => {
  resetSuiteUnderTest();
});

describe('the accessors, before any suite has registered', () => {
  it('say so, and say where the mistake usually is', () => {
    expect(() => clientUnderTest()).toThrow(/clientUnderTest\(\) was called before runProviderTck/);
    expect(() => clientUnderTest()).toThrow(/only means anything from inside a step definition/);
    expect(() => providerUnderTest()).toThrow(/providerUnderTest\(\) was called before runProviderTck/);
  });
});

describe('the accessors, once a suite has registered', () => {
  it('report the canonical "put a Given first" message before the scenario has a provider', () => {
    registerSuiteUnderTest(new TckState(optionsFor('unit')));

    // Deliberately the same message the canonical steps produce, because it is the same mistake:
    // the accessor adds no diagnosis of its own for a scenario that simply has not got there yet.
    expect(() => clientUnderTest()).toThrow(/no provider has been registered in this scenario/);
    expect(() => providerUnderTest()).toThrow(/no provider has been created in this scenario/);
  });

  it('return what the scenario put there, and not a copy of it', () => {
    const state = new TckState(optionsFor('unit'));
    registerSuiteUnderTest(state);

    const client = { name: 'the suite client' } as unknown as Client;
    const provider = { metadata: { name: 'the suite provider' } } as unknown as Provider;
    state.client = client;
    state.provider = provider;

    expect(clientUnderTest()).toBe(client);
    expect(providerUnderTest()).toBe(provider);
  });

  it('follow the reset between scenarios rather than holding the previous one', () => {
    const state = new TckState(optionsFor('unit'));
    registerSuiteUnderTest(state);
    state.client = { name: 'the suite client' } as unknown as Client;

    state.reset();

    expect(() => clientUnderTest()).toThrow(/no provider has been registered in this scenario/);
  });
});

describe('a second suite in one file', () => {
  it('is refused, naming the ambiguity it would cause', () => {
    registerSuiteUnderTest(new TckState(optionsFor('first')));

    expect(() => registerSuiteUnderTest(new TckState(optionsFor('second')))).toThrow(
      /runProviderTck was called twice in one file/,
    );
  });

  it('is not what registering the same suite twice is, so that stays allowed', () => {
    // Registration is idempotent for one state object. Nothing calls it twice today, but a refusal
    // that fired on a re-entrant call would turn a harmless one into a failed suite.
    const state = new TckState(optionsFor('same'));
    registerSuiteUnderTest(state);

    expect(() => registerSuiteUnderTest(state)).not.toThrow();
  });
});

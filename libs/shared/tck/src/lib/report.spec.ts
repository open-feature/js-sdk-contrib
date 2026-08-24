import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_CAPABILITIES, Capability } from './capability';
import type { BackendControl } from './control';
import { planFeature } from './scenarioRunner';
import type { ScenarioIdentity } from './report';
import {
  ConformanceRecorder,
  REPORT_DIR_ENV,
  coverageProblems,
  reportFileName,
  writeConformanceReport,
} from './report';
import { loadTckFeatures } from './runProviderTck';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  controlApi: 'in-process',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

const recorderFor = (declared: Capability[], notApplicable: Capability[] = []) =>
  new ConformanceRecorder({
    suiteName: 'unit',
    control,
    declared: new Set(declared),
    notApplicable: new Set(notApplicable),
    observedProviderName: () => 'observed-provider',
  });

const scenario = (name: string, tags: string[] = []): ScenarioIdentity => ({ feature: 'events', name, tags });

describe('the conformance report', () => {
  it('never reports a capability-skipped scenario as passed', () => {
    // The rule Appendix F exists to enforce, and the one a runner's own summary is most likely to
    // get wrong: godog counts a capability skip in its passed tally.
    const recorder = recorderFor([Capability.Events]);
    recorder.skipped(scenario('Losing the backend makes the provider stale', ['@stale']), [Capability.Stale]);

    const [result] = recorder.build().scenarios;

    expect(result.outcome).toBe('not-declared');
    expect(result.reason).toContain('@stale');
  });

  it('distinguishes not-applicable from not-declared', () => {
    // JavaScript is the language that forces the distinction: @strict-numeric-typing is
    // unsatisfiable because there is no integer type, so calling it 'not-declared' would report
    // every JavaScript provider as missing something none of them can have.
    const recorder = recorderFor([Capability.Events], [Capability.StrictNumericTyping]);
    recorder.skipped(scenario('A float flag is not silently narrowed', ['@strict-numeric-typing']), [
      Capability.StrictNumericTyping,
    ]);
    recorder.skipped(scenario('Losing the backend', ['@stale']), [Capability.Stale]);

    const report = recorder.build();
    const outcomes = Object.fromEntries(report.scenarios.map((result) => [result.name, result.outcome]));

    expect(outcomes['A float flag is not silently narrowed']).toBe('not-applicable');
    expect(outcomes['Losing the backend']).toBe('not-declared');
    expect(report.capabilities[Capability.StrictNumericTyping]).toEqual({
      state: 'not-applicable',
      reason: expect.stringContaining('not applicable'),
    });
    expect(report.capabilities[Capability.Stale]).toEqual({
      state: 'not-declared',
      reason: expect.stringContaining('not declared'),
    });
  });

  it('prefers not-declared when a scenario is gated by both', () => {
    // A provider must not be able to hide a gap behind an inapplicable tag that happens to sit on
    // the same scenario.
    const recorder = recorderFor([], [Capability.StrictNumericTyping]);
    recorder.skipped(scenario('gated twice', ['@strict-numeric-typing', '@stale']), [
      Capability.StrictNumericTyping,
      Capability.Stale,
    ]);

    expect(recorder.build().scenarios[0].outcome).toBe('not-declared');
  });

  it('reports a declared capability as failed when a scenario gating on it failed', () => {
    const recorder = recorderFor([Capability.Events, Capability.Object]);
    recorder.started(scenario('a passing one', ['@object']))({ durationMs: 1 });
    recorder.started(scenario('a failing one', ['@events']))({ durationMs: 2, error: new Error('boom') });

    const report = recorder.build();

    // The schema requires a reason for any outcome other than passed, and this is the branch no
    // passing suite reaches: every self-test suite passes, so nothing that runs end to end builds a
    // failed capability entry. It is driven with synthetic records for that reason.
    expect(report.capabilities[Capability.Events]).toEqual({
      state: 'failed',
      reason: expect.stringContaining('1 of 1'),
    });
    expect(report.capabilities[Capability.Object]).toEqual({ state: 'passed' });
    expect(report.scenarios.find((result) => result.name === 'a failing one')?.reason).toBe('boom');
  });

  it('gives every capability it does report a reason unless it passed', () => {
    const recorder = recorderFor([Capability.Events, Capability.Object], [Capability.StrictNumericTyping]);
    recorder.started(scenario('a failing one', ['@events']))({ durationMs: 1, error: new Error('boom') });
    recorder.started(scenario('a passing one', ['@object']))({ durationMs: 1 });

    for (const [tag, result] of Object.entries(recorder.build().capabilities)) {
      if (result.state !== 'passed') {
        expect(`${tag}: ${result.reason ?? ''}`).not.toBe(`${tag}: `);
      }
    }
  });

  it('reports a scenario that never finished as failed rather than passed', () => {
    // A Jest timeout kills the test body, so the completion callback never runs. The record exists
    // from the moment the scenario is defined precisely so this cannot become a silent omission.
    const recorder = recorderFor([Capability.Events]);
    recorder.started(scenario('interrupted', ['@events']));

    const [result] = recorder.build().scenarios;

    expect(result.outcome).toBe('failed');
    expect(result.reason).toContain('never reported an outcome');
  });

  it('names the provider as the provider names itself and the suite as the configuration', () => {
    const report = recorderFor([]).build();

    expect(report.provider.name).toBe('observed-provider');
    expect(report.provider.configuration).toBe('unit');
    expect(report.provider.language).toBe('javascript');
  });

  it('falls back to the suite name when no scenario ever registered a provider', () => {
    const recorder = new ConformanceRecorder({
      suiteName: 'unit',
      control,
      declared: new Set(),
      notApplicable: new Set(),
    });

    expect(recorder.build().provider.name).toBe('unit');
  });

  it('identifies itself, the SDK and the artifacts it ran', () => {
    const { tck, sdk, backend } = recorderFor([]).build();

    expect(tck.implementation).toBe('js-sdk-contrib/libs/shared/tck');
    expect(tck.version).not.toBe('unknown');
    expect(tck.specRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(tck.assetsTree).toMatch(/^[0-9a-f]{40}$/);
    expect(sdk.name).toBe('@openfeature/server-sdk');
    expect(sdk.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(backend?.controlApi).toBe('in-process');
  });

  it('reports every capability the run had something to say about', () => {
    // Everything undeclared is reported as such; the one declared capability here is omitted only
    // because nothing exercised it, which the next tests are about.
    const recorder = recorderFor([Capability.Events]);
    recorder.started(scenario('a passing one', ['@events']))({ durationMs: 1 });

    expect(Object.keys(recorder.build().capabilities).sort()).toEqual([...ALL_CAPABILITIES].sort());
  });

  it('omits a declared capability that no scenario in the suite carries', () => {
    // @targeting is reserved: it is in the vocabulary and no scenario carries the tag, because
    // asserting that an evaluation context reached the backend needs an echo operation the control
    // API does not have. Reporting it as passed would be a green result for a claim nothing
    // examined -- the vacuous pass the capability vocabulary exists to eliminate, arriving through
    // the report instead of through the suite. Omitting it says the suite asked no question.
    const recorder = recorderFor([Capability.Events, Capability.Targeting]);
    recorder.started(scenario('a passing one', ['@events']))({ durationMs: 1 });

    const { capabilities } = recorder.build();

    expect(capabilities).not.toHaveProperty(Capability.Targeting);
    expect(capabilities[Capability.Events]).toEqual({ state: 'passed' });
  });

  it('omits a declared capability whose every scenario was skipped for another one', () => {
    // The same vacuous pass by a different route. Both scenarios in events.feature carry @events as
    // well as @stale or @configuration-change, so a provider declaring @events and neither of the
    // others has nothing that ran to show for it. Counting tag presence rather than execution
    // reported that as passed.
    const recorder = recorderFor([Capability.Events]);
    recorder.skipped(scenario('a configuration change is applied', ['@events', '@configuration-change']), [
      Capability.ConfigurationChange,
    ]);
    recorder.skipped(scenario('losing the backend', ['@events', '@stale']), [Capability.Stale]);

    const { capabilities } = recorder.build();

    expect(capabilities).not.toHaveProperty(Capability.Events);
    expect(capabilities[Capability.Stale].state).toBe('not-declared');
  });

  it('still reports a capability the provider does not declare, so a gap stays visible', () => {
    // Omission is only ever for a declared capability. An undeclared one is a fact about the
    // provider and has to be stated.
    const capabilities = recorderFor([]).build().capabilities;

    expect(capabilities[Capability.Targeting]).toEqual({
      state: 'not-declared',
      reason: expect.stringContaining('not declared'),
    });
  });
});

describe('scenario accounting', () => {
  /** The canonical features, planned as the harness plans them. */
  const plans = loadTckFeatures(undefined).map(({ feature, parsed, examples }) =>
    planFeature(feature, parsed, examples, new Set([Capability.Events, Capability.ConfigurationChange, Capability.Object])),
  );

  const planned = plans.flatMap((plan) =>
    plan.scenarios.map(({ name, example }) => ({ feature: plan.feature, name, example })),
  );

  it('plans one entry for every scenario in the canonical features, examples included', () => {
    // Counted from the feature files rather than hard-coded per feature, so adding a scenario
    // upstream does not silently go unplanned.
    const expected = plans.reduce((total, plan) => total + plan.scenarios.length, 0);

    expect(planned).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
    expect(plans.map((plan) => plan.feature)).toEqual(['errors', 'evaluation', 'events', 'lifecycle', 'metadata']);
  });

  it('accounts for every planned scenario exactly once', () => {
    const recorder = recorderFor([Capability.Events, Capability.ConfigurationChange, Capability.Object]);

    for (const plan of plans) {
      for (const { name, example, tags, missing } of plan.scenarios) {
        const identity = { feature: plan.feature, name, example, tags };
        if (missing.length) {
          recorder.skipped(identity, missing);
        } else {
          recorder.started(identity)({ durationMs: 0 });
        }
      }
    }

    const report = recorder.build();

    expect(coverageProblems(report.scenarios, planned)).toEqual([]);
    expect(report.scenarios).toHaveLength(planned.length);
    // Nothing gated by an undeclared capability may show up as passed.
    for (const result of report.scenarios) {
      const gated = (result.tags ?? []).some(
        (tag) => tag === '@stale' || tag === '@lifecycle' || tag === '@unavailable',
      );
      if (gated) {
        expect(result.outcome).toBe('not-declared');
      }
    }
  });

  it('catches a scenario recorded twice, which is how a skip becomes a pass', () => {
    const duplicated = [...planned, planned[0]];

    expect(coverageProblems(duplicated, planned)).toEqual([
      `${planned[0].feature}.feature: ${planned[0].name}: expected 1 outcome(s), recorded 2`,
    ]);
  });

  it('catches a scenario that was never recorded', () => {
    expect(coverageProblems(planned.slice(1), planned)).toEqual([
      `${planned[0].feature}.feature: ${planned[0].name}: expected 1 outcome(s), recorded 0`,
    ]);
  });

  it('catches one dropped example row rather than letting its siblings cover for it', () => {
    // The reason the accounting is keyed on the example and not only on the name. Eleven rows share
    // the name 'Requesting the wrong type returns the code default'; keyed on the name alone,
    // dropping one and duplicating another would tally as eleven expected and eleven recorded.
    const matrix = planned.filter((entry) => entry.name === 'Requesting the wrong type returns the code default');
    expect(matrix).toHaveLength(11);

    const swapped = planned.filter((entry) => entry !== matrix[0]).concat(matrix[1]);

    expect(coverageProblems(swapped, planned)).toEqual([
      'errors.feature: Requesting the wrong type returns the code default ' +
        '[key=string-flag requested=Boolean default=false]: expected 1 outcome(s), recorded 0',
      'errors.feature: Requesting the wrong type returns the code default ' +
        '[key=string-flag requested=Integer default=1]: expected 1 outcome(s), recorded 2',
    ]);
  });
});

describe('identifying a scenario in the report', () => {
  const canonical = loadTckFeatures(undefined);

  const reportOf = (declared: Capability[]) => {
    const recorder = recorderFor(declared);
    const plans = canonical.map(({ feature, parsed, examples }) =>
      planFeature(feature, parsed, examples, new Set(declared)),
    );

    for (const plan of plans) {
      for (const { name, example, tags, missing } of plan.scenarios) {
        const identity = { feature: plan.feature, name, example, tags };
        if (missing.length) {
          recorder.skipped(identity, missing);
        } else {
          recorder.started(identity)({ durationMs: 0 });
        }
      }
    }
    return recorder.build();
  };

  it('identifies every scenario uniquely by feature, name and example', () => {
    // The property the format depends on. Feature and name alone do not have it: eleven rows of one
    // outline share both, and a consumer keying on them keeps whichever row it saw last.
    const { scenarios } = reportOf([...ALL_CAPABILITIES]);
    const keys = scenarios.map((result) =>
      JSON.stringify([result.feature, result.name, Object.entries(result.example ?? {})]),
    );

    expect(scenarios.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(scenarios.length);
  });

  it('records the example verbatim, as strings, on every row of an outline', () => {
    const matrix = reportOf([...ALL_CAPABILITIES]).scenarios.filter(
      (result) => result.name === 'Requesting the wrong type returns the code default',
    );

    // Feature-file order: the report sorts by feature and name, and rows sharing both keep the order
    // they were recorded in, which is the order the Examples blocks are written in.
    expect(matrix.map((result) => result.example)).toEqual([
      { key: 'string-flag', requested: 'Boolean', default: 'false' },
      { key: 'string-flag', requested: 'Integer', default: '1' },
      { key: 'string-flag', requested: 'Float', default: '0.1' },
      { key: 'wrong-flag', requested: 'Boolean', default: 'false' },
      { key: 'boolean-flag', requested: 'String', default: 'fallback' },
      { key: 'boolean-flag', requested: 'Integer', default: '1' },
      { key: 'boolean-flag', requested: 'Float', default: '0.1' },
      { key: 'integer-flag', requested: 'Boolean', default: 'false' },
      { key: 'integer-flag', requested: 'String', default: 'fallback' },
      { key: 'float-flag', requested: 'Boolean', default: 'false' },
      { key: 'float-flag', requested: 'String', default: 'fallback' },
    ]);
  });

  it('omits the example for a scenario that is not an outline row', () => {
    const plain = reportOf([...ALL_CAPABILITIES]).scenarios.filter(
      (result) => result.name === 'An unknown flag key returns the code default',
    );

    expect(plain).toHaveLength(1);
    expect(plain[0]).not.toHaveProperty('example');
  });

  it('carries the example on a capability-skipped row', () => {
    // A skipped row is still a row, and the schema requires the reason with it.
    const skipped = reportOf(
      [...ALL_CAPABILITIES].filter((capability) => capability !== Capability.Object),
    ).scenarios.filter((result) => result.name === 'Requesting a structured flag as a scalar returns the code default');

    expect(skipped).toHaveLength(4);
    for (const result of skipped) {
      expect(result.outcome).toBe('not-declared');
      expect(result.reason).toContain('@object');
      expect(Object.keys(result.example ?? {})).toEqual(['requested', 'default']);
    }
  });
});

describe('writing the report', () => {
  const previous = process.env[REPORT_DIR_ENV];

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[REPORT_DIR_ENV];
    } else {
      process.env[REPORT_DIR_ENV] = previous;
    }
  });

  it('writes nothing when the environment variable is unset, which is not an error', () => {
    delete process.env[REPORT_DIR_ENV];

    expect(writeConformanceReport(recorderFor([]), 'in-memory')).toBeUndefined();
  });

  it('writes one file per suite, named after the suite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tck-report-'));
    process.env[REPORT_DIR_ENV] = dir;

    try {
      const path = writeConformanceReport(recorderFor([Capability.Events]), 'flagd/rpc');

      expect(path).toBe(join(dir, 'flagd-rpc.json'));
      expect(JSON.parse(readFileSync(path as string, 'utf8')).schemaVersion).toBe('1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a suite name from escaping the directory it was given', () => {
    // Suite names are chosen to read well in failure messages, not to be path-safe.
    expect(reportFileName('flagd/rpc')).toBe('flagd-rpc.json');
    expect(reportFileName('../../etc/passwd')).toBe('etc-passwd.json');
    expect(reportFileName('///')).toBe('report.json');
  });
});

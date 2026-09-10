import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { version as messagesVersion } from '@cucumber/messages';
import { Capability, NO_INTEGER_TYPE_IN_JAVASCRIPT, RESERVED_CAPABILITIES } from './capability';
import type { BackendControl } from './control';
import { ConformanceMessages } from './messages';
import type { ScenarioIdentity } from './report';
import {
  ConformanceRecorder,
  REPORT_DIR_ENV,
  coverageProblems,
  reportBaseName,
  unexecutedScenarios,
  writeConformanceReport,
} from './report';
import { loadTckFeatures } from './runProviderTck';
import { planFeature } from './scenarioRunner';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  controlApi: 'in-process',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

const recorderFor = (declared: Capability[], notApplicable = new Map<Capability, string>()) =>
  new ConformanceRecorder({
    suiteName: 'unit',
    control,
    declared: new Set(declared),
    notApplicable,
    messages: new ConformanceMessages(),
    observedProviderName: () => 'observed-provider',
  });

/** Where the results live, as the envelope has to be told. */
const RESULTS = {
  format: 'cucumber-messages' as const,
  // The real library version rather than a literal, so this fixture cannot drift from what
  // the emitter actually records.
  formatVersion: messagesVersion,
  location: 'unit.ndjson',
};

describe('the conformance envelope', () => {
  it('records the Cucumber Messages release the stream was produced against', () => {
    // Messages is versioned and the four TCK implementations pin different releases, so a
    // consumer cannot assume one schema validates every stream. The value has to come from the
    // library that produced it -- a literal here would go on claiming an old release after a
    // dependency bump moved the types underneath it.
    const { results } = recorderFor([Capability.Events]).build(RESULTS);

    expect(results.formatVersion).toBe(messagesVersion);
    expect(results.formatVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('states the capabilities the provider declares, which the results cannot say', () => {
    // The declaration is an input to reading the results rather than a summary of them: a skipped
    // test case says the question was not put to this provider, and only the declaration says
    // whether that is because the provider declines the capability.
    const { declaration } = recorderFor([Capability.Events, Capability.Object]).build(RESULTS);

    expect(declaration.declared).toEqual([Capability.Events, Capability.Object]);
    expect(declaration).not.toHaveProperty('notApplicable');
  });

  it('states a capability that cannot hold for this provider, with the reason', () => {
    // JavaScript is the language that forces the distinction: @numeric-coercion is
    // unsatisfiable because there is no integer type, so leaving it merely undeclared would report
    // every JavaScript provider as missing something none of them can have.
    const notApplicable = new Map([[Capability.NumericCoercion, NO_INTEGER_TYPE_IN_JAVASCRIPT]]);
    const { declaration } = recorderFor([Capability.Events], notApplicable).build(RESULTS);

    expect(declaration.declared).toEqual([Capability.Events]);
    expect(declaration.notApplicable).toEqual({
      [Capability.NumericCoercion]: expect.stringContaining('no integer type'),
    });
  });

  it('never declares a reserved capability, whatever it was handed', () => {
    // @targeting and @caching are names held open for scenarios that do not exist, so nothing can
    // be skipped for them and declaring one claims a verification that never happened. A published
    // Java report asserted both, because that adoption declares "everything except X" and picked up
    // every reserved tag on the way past. An adoption naming one is refused before it gets here;
    // this is the emitter being unable to write it down regardless of how the set was built.
    const { declaration } = recorderFor([Capability.Events, ...RESERVED_CAPABILITIES]).build(RESULTS);

    expect(declaration.declared).toEqual([Capability.Events]);
    for (const capability of RESERVED_CAPABILITIES) {
      expect(declaration.declared).not.toContain(capability);
    }
  });

  it('names the provider as the provider names itself and the suite as the configuration', () => {
    const report = recorderFor([]).build(RESULTS);

    expect(report.provider.name).toBe('observed-provider');
    expect(report.provider.configuration).toBe('unit');
    expect(report.provider.language).toBe('javascript');
  });

  it('falls back to the suite name when no scenario ever registered a provider', () => {
    const recorder = new ConformanceRecorder({
      suiteName: 'unit',
      control,
      declared: new Set(),
      notApplicable: new Map(),
      messages: new ConformanceMessages(),
    });

    expect(recorder.build(RESULTS).provider.name).toBe('unit');
  });

  it('identifies itself, the SDK and the artifacts it ran', () => {
    const { tck, sdk, backend } = recorderFor([]).build(RESULTS);

    expect(tck.implementation).toBe('js-sdk-contrib/libs/shared/tck');
    expect(tck.version).not.toBe('unknown');
    expect(tck.specRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(sdk.name).toBe('@openfeature/server-sdk');
    expect(sdk.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(backend?.controlApi).toBe('in-process');
  });

  it('points at the results rather than containing them', () => {
    // Everything a consumer needs about a scenario -- its outcome, its tags, its Examples row, the
    // source it came from -- is specified by Cucumber Messages already. A second definition here
    // would be a second thing to version and a second place for the same fact to disagree.
    const report = recorderFor([Capability.Events]).build({ ...RESULTS, digest: `sha256:${'0'.repeat(64)}` });

    expect(report.results).toEqual({
      format: 'cucumber-messages',
      formatVersion: messagesVersion,
      location: 'unit.ndjson',
      digest: `sha256:${'0'.repeat(64)}`,
    });
    expect(report).not.toHaveProperty('scenarios');
    expect(report).not.toHaveProperty('capabilities');
    expect(report.tck).not.toHaveProperty('assetsTree');
  });
});

describe('scenario accounting', () => {
  /** The canonical features, compiled and planned as the harness plans them. */
  const plan = (declared: Capability[]) => {
    const messages = new ConformanceMessages();
    const features = loadTckFeatures(undefined, messages.newId);
    features.forEach((feature) => messages.addFeature(feature.messages));

    return {
      messages,
      plans: features.map(({ feature, parsed, messages: compiled }) =>
        planFeature(feature, parsed, compiled.planned, new Set(declared)),
      ),
    };
  };

  const declared = [Capability.Events, Capability.ConfigurationChange, Capability.Object];
  const { messages, plans } = plan(declared);

  const planned: ScenarioIdentity[] = plans.flatMap((feature) =>
    feature.scenarios.map(({ name, pickleId, example }) => ({ feature: feature.feature, name, pickleId, example })),
  );

  it('plans one entry for every scenario in the canonical features, examples included', () => {
    // Counted from the feature files rather than hard-coded per feature, so adding a scenario
    // upstream does not silently go unplanned.
    const expected = plans.reduce((total, feature) => total + feature.scenarios.length, 0);

    expect(planned).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
    expect(plans.map((feature) => feature.feature)).toEqual([
      'errors',
      'evaluation',
      'events',
      'lifecycle',
      'metadata',
    ]);
  });

  /** A recorder writing into the stream the canonical features above were registered with. */
  const recorderInto = () =>
    new ConformanceRecorder({
      suiteName: 'unit',
      control,
      declared: new Set(declared),
      notApplicable: new Map(),
      messages,
    });

  it('accounts for every planned scenario exactly once', () => {
    const recorder = recorderInto();

    for (const feature of plans) {
      for (const { name, pickleId, example, missing } of feature.scenarios) {
        const identity = { feature: feature.feature, name, pickleId, example };
        if (missing.length) {
          recorder.skipped(identity, missing);
        } else {
          recorder.started(identity)({ durationMs: 0 });
        }
      }
    }

    expect(coverageProblems(recorder.results, planned)).toEqual([]);
    expect(recorder.results).toHaveLength(planned.length);
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
    // The reason the accounting is keyed on the pickle and not on the name. Eleven rows share the
    // name 'Requesting the wrong type returns the code default'; keyed on the name alone, dropping
    // one and duplicating another would tally as eleven expected and eleven recorded.
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

  it('does not call a scenario executed until the runner has decided about it', () => {
    // The distinction the canonical guard turns on, and the reason `coverageProblems` alone is not
    // enough. A scenario is registered when it is *defined*, so one Jest then declines to run is
    // present in the report -- carrying the placeholder failure -- and satisfies the accounting
    // above while having proved nothing.
    const recorder = recorderInto();
    const held = planned.find((scenario) => !scenario.example) as ScenarioIdentity;

    const complete = recorder.started(held);
    for (const scenario of planned.filter((entry) => entry !== held)) {
      recorder.started(scenario)({ durationMs: 0 });
    }

    expect(unexecutedScenarios(planned, recorder.settled)).toEqual([`${held.feature}.feature: ${held.name}`]);

    complete({ durationMs: 1 });
    expect(unexecutedScenarios(planned, recorder.settled)).toEqual([]);
  });

  it('treats a capability skip as a decision rather than as a scenario that did not run', () => {
    // Declaring fewer capabilities narrows what the suite asks, and says so in the declaration and
    // in every skipped result's reason. It is a claim the provider is making, not a hole in the run,
    // so the guard must not fire on it -- otherwise no provider could adopt the suite selectively.
    const recorder = recorderInto();
    const gated = plans.flatMap((feature) =>
      feature.scenarios
        .filter((scenario) => scenario.missing.length)
        .map(({ name, pickleId, example, missing }) => ({
          identity: { feature: feature.feature, name, pickleId, example },
          missing,
        })),
    );

    expect(gated.length).toBeGreaterThan(0);
    gated.forEach(({ identity, missing }) => recorder.skipped(identity, missing));

    expect(
      unexecutedScenarios(
        gated.map(({ identity }) => identity),
        recorder.settled,
      ),
    ).toEqual([]);
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

  it('writes an envelope and the results it points at, both named after the suite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tck-report-'));
    process.env[REPORT_DIR_ENV] = dir;

    try {
      const written = writeConformanceReport(recorderFor([Capability.Events]), 'flagd/rpc');

      expect(written).toEqual({ report: join(dir, 'flagd-rpc.json'), results: join(dir, 'flagd-rpc.ndjson') });

      const envelope = JSON.parse(readFileSync(written?.report as string, 'utf8')) as Record<string, never>;
      const results = readFileSync(written?.results as string, 'utf8');

      expect(envelope['schemaVersion']).toBe('1');
      // Relative to the envelope, so the pair can be published or moved together.
      expect(envelope['results']).toEqual({
        format: 'cucumber-messages',
        formatVersion: messagesVersion,
        location: 'flagd-rpc.ndjson',
        digest: `sha256:${createHash('sha256').update(results, 'utf8').digest('hex')}`,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a suite name from escaping the directory it was given', () => {
    // Suite names are chosen to read well in failure messages, not to be path-safe.
    expect(reportBaseName('flagd/rpc')).toBe('flagd-rpc');
    expect(reportBaseName('../../etc/passwd')).toBe('etc-passwd');
    expect(reportBaseName('///')).toBe('report');
  });
});

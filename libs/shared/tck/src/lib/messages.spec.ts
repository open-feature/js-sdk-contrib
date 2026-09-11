import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { Envelope, Pickle } from '@cucumber/messages';
import { TestStepResultStatus } from '@cucumber/messages';
import { Capability, NO_INTEGER_TYPE_IN_JAVASCRIPT } from './capability';
import type { BackendControl } from './control';
import { ConformanceMessages } from './messages';
import { ConformanceRecorder } from './report';
import { loadTckFeatures } from './runProviderTck';
import { planFeature } from './scenarioRunner';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  controlApi: 'in-process',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

/** What the in-memory suite declares, which is the reference adoption. */
const DECLARED = [Capability.Events, Capability.ConfigurationChange, Capability.Object];

const NOT_APPLICABLE = new Map([[Capability.NumericCoercion, NO_INTEGER_TYPE_IN_JAVASCRIPT]]);

/**
 * Drives the harness's own bookkeeping over the canonical features without running Jest.
 *
 * Every planned scenario is recorded exactly as the runner records it: gated ones skipped, the rest
 * passed. What the runner adds on top -- Jest, step definitions, a provider -- is not what these
 * tests are about.
 */
function run(declared: readonly Capability[], notApplicable = new Map<Capability, string>()) {
  const messages = new ConformanceMessages();
  const features = loadTckFeatures(undefined, messages.newId);
  features.forEach((feature) => messages.addFeature(feature.messages));

  const plans = features.map(({ feature, parsed, messages: compiled }) =>
    planFeature(feature, parsed, compiled.planned, new Set(declared)),
  );
  const recorder = new ConformanceRecorder({
    suiteName: 'unit',
    control,
    declared: new Set(declared),
    notApplicable,
    messages,
  });

  for (const plan of plans) {
    for (const scenario of plan.scenarios) {
      const identity = {
        feature: plan.feature,
        name: scenario.name,
        pickleId: scenario.pickleId,
        ...(scenario.example ? { example: scenario.example } : {}),
      };

      if (scenario.missing.length) {
        recorder.skipped(identity, scenario.missing);
      } else {
        recorder.started(identity)({ durationMs: 1 });
      }
    }
  }

  const ndjson = messages.ndjson();

  return { messages, plans, recorder, ndjson, envelopes: parseNdjson(ndjson) };
}

function parseNdjson(ndjson: string): Envelope[] {
  return ndjson
    .split('\n')
    .filter((line) => line.length)
    .map((line) => JSON.parse(line) as Envelope);
}

/**
 * The status each scenario ended in, keyed by pickle id.
 *
 * Resolved the way a consumer has to resolve it -- pickle to test case, test case to attempt,
 * attempt to step result -- so a test failing here is a consumer being unable to answer the question
 * the report exists to answer.
 */
function statusByPickle(envelopes: readonly Envelope[]): Map<string, { status: string; message?: string }> {
  const pickleOf = new Map<string, string>();
  for (const { testCase } of envelopes) {
    if (testCase) {
      pickleOf.set(testCase.id, testCase.pickleId);
    }
  }

  const testCaseOf = new Map<string, string>();
  for (const { testCaseStarted } of envelopes) {
    if (testCaseStarted) {
      testCaseOf.set(testCaseStarted.id, testCaseStarted.testCaseId);
    }
  }

  const statuses = new Map<string, { status: string; message?: string }>();
  for (const { testStepFinished } of envelopes) {
    if (!testStepFinished) {
      continue;
    }
    const testCaseId = testCaseOf.get(testStepFinished.testCaseStartedId);
    const pickleId = testCaseId ? pickleOf.get(testCaseId) : undefined;
    if (pickleId) {
      statuses.set(pickleId, {
        status: testStepFinished.testStepResult.status,
        message: testStepFinished.testStepResult.message,
      });
    }
  }

  return statuses;
}

function pickles(envelopes: readonly Envelope[]): Pickle[] {
  return envelopes.flatMap((envelope) => (envelope.pickle ? [envelope.pickle] : []));
}

/**
 * The Cucumber Messages JSON schema, as shipped by `@cucumber/messages`.
 *
 * The package exports only its entry point, so the schema directory is found by walking up from the
 * resolved module rather than required by subpath.
 */
function messagesSchemaDir(): string {
  let dir = dirname(require.resolve('@cucumber/messages'));

  for (let level = 0; level < 6; level += 1) {
    const candidate = join(dir, 'schema');
    try {
      if (readdirSync(candidate).includes('Envelope.json')) {
        return candidate;
      }
    } catch {
      // Not here. Keep walking.
    }
    dir = dirname(dir);
  }

  throw new Error("tck: could not locate @cucumber/messages' JSON schema directory");
}

describe('the results stream', () => {
  const { envelopes, ndjson, plans } = run(DECLARED, NOT_APPLICABLE);
  const planned = plans.flatMap((plan) => plan.scenarios.map((scenario) => ({ plan, scenario })));

  it('is valid Cucumber Messages, checked against the schema the protocol ships', () => {
    // The whole point of carrying results in a standard format is that a standard consumer can read
    // them, so this is checked against the protocol's own JSON schema rather than against this
    // library's idea of it.
    const dir = messagesSchemaDir();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    for (const entry of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      ajv.addSchema(JSON.parse(readFileSync(join(dir, entry), 'utf8')) as object, entry);
    }

    const validate = ajv.getSchema('Envelope.json');
    expect(validate).toBeDefined();

    const lines = ndjson.split('\n').filter((line) => line.length);
    expect(lines.length).toBeGreaterThan(planned.length);

    for (const line of lines) {
      const envelope: unknown = JSON.parse(line);
      if (!validate?.(envelope)) {
        throw new Error(`invalid envelope ${line}: ${JSON.stringify(validate?.errors)}`);
      }
    }
  });

  it('is newline-delimited JSON, one envelope per line', () => {
    expect(ndjson.endsWith('\n')).toBe(true);
    for (const line of ndjson.split('\n').filter((entry) => entry.length)) {
      expect(Object.keys(JSON.parse(line) as object)).toHaveLength(1);
    }
  });

  it('names the harness, the runtime and the protocol version', () => {
    const meta = envelopes.find((envelope) => envelope.meta)?.meta;

    expect(meta?.implementation.name).toBe('@openfeature/tck');
    expect(meta?.protocolVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta?.runtime.name).toBe('node.js');
  });

  it('carries the executed feature source, so the stream says what was asked', () => {
    const sources = envelopes.flatMap((envelope) => (envelope.source ? [envelope.source] : []));

    expect(sources.map((source) => source.uri)).toEqual([
      'specification/assets/provider-tck/gherkin/errors.feature',
      'specification/assets/provider-tck/gherkin/evaluation.feature',
      'specification/assets/provider-tck/gherkin/events.feature',
      'specification/assets/provider-tck/gherkin/lifecycle.feature',
      'specification/assets/provider-tck/gherkin/metadata.feature',
    ]);
    for (const source of sources) {
      expect(source.data).toContain('Feature:');
      expect(source.mediaType).toBe('text/x.cucumber.gherkin+plain');
    }
  });

  it('accounts for every scenario in the suite, gated ones included, exactly once', () => {
    const statuses = statusByPickle(envelopes);
    const testCases = envelopes.flatMap((envelope) => (envelope.testCase ? [envelope.testCase] : []));

    expect(pickles(envelopes)).toHaveLength(planned.length);
    expect(testCases).toHaveLength(planned.length);
    expect(new Set(testCases.map((testCase) => testCase.pickleId)).size).toBe(planned.length);
    expect(statuses.size).toBe(planned.length);
    expect(envelopes.filter((envelope) => envelope.testCaseStarted).length).toBe(planned.length);
    expect(envelopes.filter((envelope) => envelope.testCaseFinished).length).toBe(planned.length);
  });

  it('reports a capability-gated scenario as SKIPPED and never as passed', () => {
    // The rule Appendix F exists to enforce, and the one a runner's own summary is most likely to
    // get wrong: godog counts a capability skip in its passed tally.
    const statuses = statusByPickle(envelopes);
    const gated = planned.filter(({ scenario }) => scenario.missing.length);

    expect(gated.length).toBeGreaterThan(0);
    for (const { scenario } of gated) {
      const result = statuses.get(scenario.pickleId);

      expect(result?.status).toBe(TestStepResultStatus.SKIPPED);
      for (const capability of scenario.missing) {
        expect(result?.message).toContain(capability);
      }
    }
  });

  it('says why a scenario was skipped, and distinguishes cannot from does not', () => {
    // Both are skips: a status a consumer has to special-case is a status that gets read as a pass
    // by something. The declaration in the envelope and this sentence carry the difference.
    const statuses = statusByPickle(envelopes);
    const reasons = new Set(
      planned
        .filter(({ scenario }) => scenario.missing.length)
        .map(({ scenario }) => statuses.get(scenario.pickleId)?.message ?? ''),
    );

    expect([...reasons].some((reason) => reason.includes('does not declare'))).toBe(true);
    expect(
      [...reasons].some(
        (reason) => reason.includes('cannot hold') && reason.includes('JavaScript has no integer type'),
      ),
    ).toBe(true);
  });

  it('gives every row of a Scenario Outline its own identity', () => {
    // The eleven rows of errors.feature's type-mismatch matrix share a name -- and share their
    // expanded name too, because the outline's title has no placeholders in it. The row is
    // identified by the AST node the pickle points at, which is the TableRow in the
    // GherkinDocument.
    const matrix = pickles(envelopes).filter(
      (pickle) =>
        pickle.uri.endsWith('errors.feature') && pickle.name === 'Requesting the wrong type returns the code default',
    );

    expect(matrix).toHaveLength(11);
    expect(new Set(matrix.map((pickle) => pickle.name)).size).toBe(1);
    expect(new Set(matrix.map((pickle) => pickle.astNodeIds[1])).size).toBe(11);
    for (const pickle of matrix) {
      expect(pickle.astNodeIds).toHaveLength(2);
      expect(statusByPickle(envelopes).get(pickle.id)?.status).toBe(TestStepResultStatus.PASSED);
    }
  });

  it('resolves an outline row back to its Examples row through the GherkinDocument', () => {
    // What a consumer does with the row identity: the second AST node id is a TableRow, and the
    // document carries its cells. Nothing has to agree on a naming convention for this to work.
    const document = envelopes.find((envelope) =>
      envelope.gherkinDocument?.uri?.endsWith('errors.feature'),
    )?.gherkinDocument;
    const rows = new Map(
      (document?.feature?.children ?? [])
        .flatMap((child) => (child.scenario ? child.scenario.examples : []))
        .flatMap((examples) =>
          examples.tableBody.map((row) => [row.id, row.cells.map((cell) => cell.value)] as [string, string[]]),
        ),
    );

    const matrix = pickles(envelopes).filter(
      (pickle) =>
        pickle.uri.endsWith('errors.feature') && pickle.name === 'Requesting the wrong type returns the code default',
    );

    expect(matrix.map((pickle) => rows.get(pickle.astNodeIds[1]))).toEqual([
      ['string-flag', 'Boolean', 'false'],
      ['string-flag', 'Integer', '1'],
      ['string-flag', 'Float', '0.1'],
      ['wrong-flag', 'Boolean', 'false'],
      ['boolean-flag', 'String', 'fallback'],
      ['boolean-flag', 'Integer', '1'],
      ['boolean-flag', 'Float', '0.1'],
      ['integer-flag', 'Boolean', 'false'],
      ['integer-flag', 'String', 'fallback'],
      ['float-flag', 'Boolean', 'false'],
      ['float-flag', 'String', 'fallback'],
    ]);
  });

  it('carries every scenario tag, including the ones on an Examples block', () => {
    // A consumer works out which capability gated a skip from the tags and the declaration, so a
    // tag missing from the stream makes a skip unexplainable.
    const tagsOf = new Map(
      pickles(envelopes).map((pickle) => [pickle.id, pickle.tags.map((tag) => tag.name).sort()] as const),
    );

    for (const { scenario } of planned) {
      expect(tagsOf.get(scenario.pickleId)).toEqual([...scenario.tags].sort());
    }

    // events.feature is tagged at the feature level; the @object rows of errors.feature are tagged
    // on their Examples block, which is the case a scenario-level read would miss.
    expect([...tagsOf.values()].filter((tags) => tags.includes(Capability.Events))).not.toHaveLength(0);
    expect([...tagsOf.values()].filter((tags) => tags.includes(Capability.Object)).length).toBeGreaterThan(1);
  });

  it('ends the run with a verdict that a passing suite makes true', () => {
    const finished = envelopes.find((envelope) => envelope.testRunFinished)?.testRunFinished;

    // Skips do not make a run unsuccessful; only a failure does, and nothing here failed.
    expect(finished?.success).toBe(true);
    expect(envelopes.find((envelope) => envelope.testRunStarted)).toBeDefined();
  });
});

describe('recording an outcome', () => {
  const scenario = (pickleId: string) => ({ feature: 'events', name: 'synthetic', pickleId });

  /** A stream with one scenario in it, built without a feature file. */
  const oneScenario = () => {
    const messages = new ConformanceMessages();
    messages.addFeature({
      envelopes: [],
      planned: [
        {
          pickle: {
            id: 'p1',
            uri: 'synthetic.feature',
            name: 'synthetic',
            language: 'en',
            steps: [],
            tags: [],
            astNodeIds: ['a1'],
          },
        },
      ],
    });

    const recorder = new ConformanceRecorder({
      suiteName: 'unit',
      control,
      declared: new Set([Capability.Events]),
      notApplicable: new Map(),
      messages,
    });

    return { messages, recorder };
  };

  it('reports a failure with what failed', () => {
    const { messages, recorder } = oneScenario();
    recorder.started(scenario('p1'))({ durationMs: 3, error: new Error('boom') });

    const result = statusByPickle(parseNdjson(messages.ndjson())).get('p1');

    expect(result?.status).toBe(TestStepResultStatus.FAILED);
    expect(result?.message).toBe('boom');
  });

  it('reports a scenario that never finished as failed rather than passed', () => {
    // A Jest timeout kills the test body, so the completion callback never runs. The test case is
    // written when the scenario is *defined* precisely so this cannot become a silent omission.
    const { messages, recorder } = oneScenario();
    recorder.started(scenario('p1'));

    const result = statusByPickle(parseNdjson(messages.ndjson())).get('p1');

    expect(result?.status).toBe(TestStepResultStatus.FAILED);
    expect(result?.message).toContain('never reported an outcome');
  });

  it('reports a skip the TCK did not ask for as a failure', () => {
    // jest-cucumber also skips a scenario whose steps are pending. This suite has none, so there is
    // no honest outcome for it other than a failure.
    const { messages, recorder } = oneScenario();
    recorder.skippedUnexpectedly(scenario('p1'), 'the runner skipped this scenario');

    expect(statusByPickle(parseNdjson(messages.ndjson())).get('p1')?.status).toBe(TestStepResultStatus.FAILED);
  });

  it('refuses to record an outcome for a scenario that was never registered', () => {
    // The stream would otherwise be missing an outcome the accounting believes it has.
    const { recorder } = oneScenario();

    expect(() => recorder.started(scenario('nope'))).toThrow(/no test case was built/);
  });

  it('marks the run unsuccessful when a scenario failed', () => {
    const { messages, recorder } = oneScenario();
    recorder.started(scenario('p1'))({ durationMs: 1, error: new Error('boom') });

    const finished = parseNdjson(messages.ndjson()).find((envelope) => envelope.testRunFinished)?.testRunFinished;

    expect(finished?.success).toBe(false);
  });
});

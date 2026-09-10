import { arch, platform, release } from 'node:os';
import { generateMessages } from '@cucumber/gherkin';
import type { Envelope, GherkinDocument, Meta, Pickle, Scenario, TableRow, TestStepResult } from '@cucumber/messages';
import { IdGenerator, SourceMediaType, TestStepResultStatus, TimeConversion, version } from '@cucumber/messages';
import { ownVersion } from './versions';

/**
 * The results of a conformance run, as a Cucumber Messages stream.
 *
 * The specification deliberately does not define a result format. Per-scenario outcomes, tags,
 * Scenario Outline row identity and the executed feature source are all already specified by
 * Cucumber Messages, so the report carries a Messages stream and the OpenFeature envelope only says
 * where it is. See https://github.com/open-feature/spec/issues/424.
 *
 * The stream is constructed here because **jest-cucumber has no output layer at all** -- it is a
 * binding from Gherkin to Jest and emits no report of any kind. What makes that cheap rather than
 * painful is that the harness already plans every scenario before the run (see
 * {@link planFeature}) and already owns the `test`/`test.skip` calls, so the plan is exactly the
 * right place to build `Pickle` and `TestCase` messages from, and the runner seam is exactly the
 * right place to record their outcomes. `@cucumber/gherkin` produces the `Source`,
 * `GherkinDocument` and `Pickle` messages straight from the feature files, so nothing here
 * hand-rolls a message object or invents an id.
 */

/** The media type of every canonical feature file. None of them is Markdown. */
const MEDIA_TYPE = SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN;

/** Names this harness as the implementation that produced a stream. */
const IMPLEMENTATION = '@openfeature/tck';

/** The statuses that make a run unsuccessful. A skip is not one of them. */
const FAILING: readonly TestStepResultStatus[] = [
  TestStepResultStatus.FAILED,
  TestStepResultStatus.AMBIGUOUS,
  TestStepResultStatus.UNDEFINED,
  TestStepResultStatus.PENDING,
  TestStepResultStatus.UNKNOWN,
];

/** One scenario the Gherkin compiler produced from a feature file. */
export interface PickledScenario {
  /**
   * The pickle, which **is** the scenario's identity in the stream.
   *
   * `pickle.id` is unique per scenario, including per row of a Scenario Outline, and
   * `pickle.astNodeIds` points at the AST nodes it came from: one entry for a plain scenario, and
   * for an outline row a second entry naming the `TableRow` in the `GherkinDocument`. That is what
   * distinguishes the eleven rows of `errors.feature`'s type-mismatch matrix, which share a name
   * even after substitution because the outline's title has no placeholders in it.
   */
  pickle: Pickle;
  /**
   * The `Examples` row this scenario came from, keyed by column header, or absent for a scenario
   * that is not an outline row.
   *
   * It is not emitted -- the stream already identifies the row, and better. It is read here so the
   * harness can name a row in its own diagnostics, where an AST node id is useless to a reader.
   */
  example?: Record<string, string>;
}

/** One feature file's static messages, and the scenarios it defines. */
export interface FeatureMessages {
  /** `Source`, `GherkinDocument` and one `Pickle` per scenario, in that order. */
  envelopes: readonly Envelope[];
  /**
   * Every scenario the feature defines, in the order the harness plans them: every plain scenario
   * in file order, then every row of every outline. That is the order `autoBindSteps` defines
   * scenarios in, which is what lets the plan pair them up positionally.
   */
  planned: readonly PickledScenario[];
}

/**
 * Compiles a feature file into the messages that describe it.
 *
 * The parse is `@cucumber/gherkin`'s, the same library jest-cucumber parses with, so the pickles
 * and the scenarios Jest runs derive from one grammar. They are still checked against each other
 * before the run rather than assumed to line up.
 */
export function readFeatureMessages(uri: string, source: string, newId: IdGenerator.NewId): FeatureMessages {
  const envelopes = generateMessages(source, uri, MEDIA_TYPE, {
    includeSource: true,
    includeGherkinDocument: true,
    includePickles: true,
    newId,
  });

  // generateMessages reports a syntax error as a message rather than by throwing, which would leave
  // a feature silently contributing no scenarios at all.
  const failures = envelopes.flatMap((envelope) => (envelope.parseError ? [envelope.parseError.message] : []));
  if (failures.length) {
    throw new Error(`tck: ${uri} could not be parsed: ${failures.join('; ')}`);
  }

  const document = envelopes.find((envelope) => envelope.gherkinDocument)?.gherkinDocument;
  if (!document?.feature) {
    throw new Error(`tck: ${uri} contains no Feature`);
  }

  const pickles = envelopes.flatMap((envelope) => (envelope.pickle ? [envelope.pickle] : []));
  const byScenario = new Map<string, Pickle[]>();
  for (const pickle of pickles) {
    const scenarioId = pickle.astNodeIds[0];
    byScenario.set(scenarioId, [...(byScenario.get(scenarioId) ?? []), pickle]);
  }

  const scenarios = astScenarios(document);
  // A scenario with no Examples block compiles to exactly one pickle; one with Examples compiles to
  // one per body row. That is the compiler's own test for an outline, so it is used here rather than
  // matching on the keyword, which is dialect-dependent.
  const plain = scenarios.filter((scenario) => scenario.examples.length === 0);
  const outlines = scenarios.filter((scenario) => scenario.examples.length > 0);
  const rows = exampleRows(scenarios);

  const planned: PickledScenario[] = [
    ...plain.flatMap((scenario) => (byScenario.get(scenario.id) ?? []).map((pickle) => ({ pickle }))),
    ...outlines.flatMap((scenario) =>
      (byScenario.get(scenario.id) ?? []).map((pickle) => ({
        pickle,
        ...(rows.get(pickle.astNodeIds[1] ?? '') ? { example: rows.get(pickle.astNodeIds[1] ?? '') } : {}),
      })),
    ),
  ];

  if (planned.length !== pickles.length) {
    throw new Error(
      `tck: ${uri} compiles to ${pickles.length} scenarios but only ${planned.length} of ` +
        `them could be traced back to a Scenario in the document. The report identifies a scenario ` +
        `by its pickle, so it cannot be built.`,
    );
  }

  return { envelopes, planned };
}

/** Every `Scenario` in a document, in file order, including those nested in a `Rule`. */
function astScenarios(document: GherkinDocument): Scenario[] {
  // A Rule groups scenarios under a heading; its children are scenarios like any other. No
  // canonical feature uses one today, and ignoring them would silently drop scenarios.
  return (document.feature?.children ?? [])
    .flatMap((child) => (child.rule ? child.rule.children : [child]))
    .flatMap((child) => (child.scenario ? [child.scenario] : []));
}

/** Every Examples row in a document, keyed by the `TableRow` id a pickle names it with. */
function exampleRows(scenarios: readonly Scenario[]): Map<string, Record<string, string>> {
  const rows = new Map<string, Record<string, string>>();

  for (const scenario of scenarios) {
    for (const examples of scenario.examples) {
      const headers = (examples.tableHeader?.cells ?? []).map((cell) => cell.value);
      for (const row of examples.tableBody) {
        rows.set(row.id, rowValues(headers, row));
      }
    }
  }

  return rows;
}

/**
 * One Examples row keyed by column header, with the cell contents verbatim as strings.
 *
 * Gherkin has no types, so `1` stays `"1"` and nothing here decides otherwise. The cell count is
 * checked even though the parser rejects an inconsistent table before this can see one: a row keyed
 * wrongly reads as a fact about a scenario that did not run, which is worse than a loud failure.
 */
function rowValues(headers: readonly string[], row: TableRow): Record<string, string> {
  if (row.cells.length !== headers.length) {
    throw new Error(
      `tck: the Examples row at line ${row.location.line} has ${row.cells.length} cells ` +
        `but its header has ${headers.length}`,
    );
  }

  return Object.fromEntries(headers.map((header, position) => [header, row.cells[position].value]));
}

/** What a test case's single step reports when the scenario settles. */
export interface Outcome {
  status: TestStepResultStatus;
  /** For a skip, why it was skipped. For a failure, what failed. */
  message?: string;
  durationMs?: number;
}

/** Completes a test case that was registered when its scenario was defined. */
export type CompleteTestCase = (outcome: Outcome) => void;

/**
 * Accumulates a Cucumber Messages stream for one suite.
 *
 * Everything known before the run -- the feature sources, their ASTs, their pickles and a test case
 * per pickle -- is built when the features are registered, and the outcomes are filled in as the
 * run produces them. A scenario is therefore present in the stream from the moment it is *defined*,
 * so one Jest never finishes still appears, with a result that says so, rather than vanishing.
 */
export class ConformanceMessages {
  private readonly startedAt = Date.now();
  private readonly staticEnvelopes: Envelope[] = [];
  private readonly execution: Envelope[] = [];
  /** The test case built for each pickle, and the single step that carries its result. */
  private readonly testCases = new Map<string, { testCaseId: string; testStepId: string }>();
  /** The result object of each test case, kept mutable so a scenario can be completed later. */
  private readonly results = new Map<string, TestStepResult>();

  constructor(readonly newId: IdGenerator.NewId = IdGenerator.incrementing()) {}

  /**
   * Adds a feature and a test case for every scenario in it.
   *
   * Registering the two together is what guarantees that no scenario reaches the stream without a
   * test case to carry its outcome.
   */
  addFeature(feature: FeatureMessages): void {
    this.staticEnvelopes.push(...feature.envelopes);

    for (const { pickle } of feature.planned) {
      const testCaseId = this.newId();
      const testStepId = this.newId();

      this.testCases.set(pickle.id, { testCaseId, testStepId });
      this.staticEnvelopes.push({
        testCase: {
          id: testCaseId,
          pickleId: pickle.id,
          // One step per test case, not one per Gherkin step, and that is a deliberate limit rather
          // than an oversight. jest-cucumber runs a whole scenario as a single Jest test and reports
          // one outcome for it: it never says which step failed. A step per pickle step would have
          // to invent per-step results to fill in -- marking them all FAILED over-claims, and
          // marking one of them FAILED picks a step at random -- so the stream carries the
          // granularity the runner actually has. The steps themselves are still in the stream, on
          // the Pickle, with the outline row already substituted into them.
          testSteps: [{ id: testStepId }],
        },
      });
    }
  }

  /**
   * Records the outcome of a scenario, and returns a callback that revises it.
   *
   * The initial outcome is written immediately so that a scenario which never settles -- a Jest
   * timeout, a crashed worker -- is reported as whatever the caller considers safe rather than
   * being absent. The callback overwrites it in place when the scenario does settle.
   */
  record(pickleId: string, initial: Outcome): CompleteTestCase {
    const testCase = this.testCases.get(pickleId);
    if (!testCase) {
      throw new Error(
        `tck: no test case was built for pickle ${pickleId}, so its outcome cannot be ` +
          `recorded. Every scenario is registered with its feature before the run.`,
      );
    }

    const timestamp = TimeConversion.millisecondsSinceEpochToTimestamp(Date.now());
    const testCaseStartedId = this.newId();
    const result: TestStepResult = {
      status: initial.status,
      duration: TimeConversion.millisecondsToDuration(initial.durationMs ?? 0),
      ...(initial.message ? { message: initial.message } : {}),
    };

    this.results.set(testCase.testCaseId, result);
    this.execution.push(
      { testCaseStarted: { id: testCaseStartedId, testCaseId: testCase.testCaseId, attempt: 0, timestamp } },
      { testStepFinished: { testCaseStartedId, testStepId: testCase.testStepId, testStepResult: result, timestamp } },
      { testCaseFinished: { testCaseStartedId, timestamp, willBeRetried: false } },
    );

    return (outcome) => {
      result.status = outcome.status;
      result.duration = TimeConversion.millisecondsToDuration(outcome.durationMs ?? 0);
      result.message = outcome.message;
    };
  }

  /** How many test cases ended in each status, for a summary a human reads. */
  get statusCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const result of this.results.values()) {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * The stream as newline-delimited JSON, one `Envelope` per line.
   *
   * Order is everything known before the run, then the run: `Meta`, then each feature's `Source`,
   * `GherkinDocument`, `Pickle`s and `TestCase`s, then `TestRunStarted`, the per-scenario messages,
   * and `TestRunFinished`.
   */
  ndjson(): string {
    const finished = Date.now();
    const stream: Envelope[] = [
      { meta: this.meta() },
      ...this.staticEnvelopes,
      { testRunStarted: { timestamp: TimeConversion.millisecondsSinceEpochToTimestamp(this.startedAt) } },
      ...this.execution,
      {
        testRunFinished: {
          // A skip does not make a run unsuccessful. It is the answer to a question this provider
          // was never asked, and treating it as a failure would punish a provider for declaring its
          // capabilities honestly -- which is the thing the declaration exists to make safe.
          success: [...this.results.values()].every((result) => !FAILING.includes(result.status)),
          timestamp: TimeConversion.millisecondsSinceEpochToTimestamp(finished),
        },
      },
    ];

    return `${stream.map((envelope) => JSON.stringify(envelope)).join('\n')}\n`;
  }

  private meta(): Meta {
    return {
      // The version of the Messages protocol the stream conforms to, which is the version of the
      // library that produced it rather than anything this harness chooses.
      protocolVersion: version,
      implementation: { name: IMPLEMENTATION, version: ownVersion() },
      runtime: { name: 'node.js', version: process.versions.node },
      os: { name: platform(), version: release() },
      cpu: { name: arch() },
    };
  }
}

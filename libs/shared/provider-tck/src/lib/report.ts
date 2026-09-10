import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestStepResultStatus } from '@cucumber/messages';
import type { Capability } from './capability';
import type { BackendControl } from './control';
import type { CompleteTestCase, ConformanceMessages, Outcome } from './messages';
import { SPEC_REVISION } from './revision';
import { packageVersion, ownVersion } from './versions';

/**
 * Names the directory a conformance report is written to.
 *
 * It is an environment variable rather than a {@link TckOptions} field so that emitting a report is
 * a property of the *run* and not of the code: CI sets it, a developer running the suite locally
 * does not, and no adopter has to change a line to publish one. Each suite writes
 * `<dir>/<name>.json` and `<dir>/<name>.ndjson`, so two suites in one run -- flagd's RPC and
 * in-process resolvers, say -- each produce their own pair without colliding.
 *
 * Unset means no report, which is the default and is not an error.
 */
export const REPORT_DIR_ENV = 'PROVIDER_TCK_REPORT_DIR';

/** The major version of the report schema this emitter produces. */
const REPORT_SCHEMA_VERSION = '1';

/** Which TCK implementation produced the report. Fixed, and the same string in every report. */
const TCK_IMPLEMENTATION = 'js-sdk-contrib/libs/shared/provider-tck';

const SDK_PACKAGE = '@openfeature/server-sdk';

/** The results format this emitter writes, as the schema names it. */
const RESULTS_FORMAT = 'cucumber-messages';

/**
 * One run of the suite against one provider in one configuration.
 *
 * This is an **envelope**: it says what was tested, what the provider claims, and where the results
 * are. It does not contain the results. Per-scenario outcomes, tags, Scenario Outline row identity
 * and the executed feature source are all already specified by Cucumber Messages, so they are
 * carried in a Messages stream that {@link results} points at, and this document stays the part
 * that is genuinely OpenFeature's: the subject under test and the capability declaration.
 *
 * The shape is fixed by the schema in the specification repository, and this type is deliberately a
 * transcription of it rather than a convenient TypeScript representation: the point of the format
 * is that every language emits the same document.
 *
 * @see https://github.com/open-feature/spec/issues/424
 */
export interface ConformanceReport {
  schemaVersion: string;
  provider: {
    name: string;
    version?: string;
    language: 'javascript';
    configuration?: string;
  };
  sdk: { name: string; version: string };
  tck: {
    implementation: string;
    version: string;
    specRevision: string;
    specRelease?: string;
  };
  backend?: { description?: string; controlApi?: 'http' | 'in-process' };
  /**
   * The capability set this provider claims.
   *
   * An *input* to reading the results rather than a summary of them, which is why it cannot be
   * derived from the stream and has to be stated here. A skipped test case in the stream says the
   * question was not put to this provider; only the declaration says whether that is because the
   * provider declines the capability or because the capability cannot hold for it at all.
   */
  declaration: {
    declared: string[];
    notApplicable?: Record<string, string>;
  };
  results: {
    format: typeof RESULTS_FORMAT;
    /** Where to fetch the results: a path relative to this document. */
    location: string;
    digest?: string;
  };
}

/**
 * Identifies the scenario an outcome belongs to.
 *
 * The pickle id is the identity, and the rest is for a human reading a diagnostic. Feature and name
 * alone do not identify a scenario: eleven rows of `errors.feature`'s type-mismatch matrix share
 * both.
 */
export interface ScenarioIdentity {
  feature: string;
  name: string;
  /** The pickle this scenario is, in the emitted Messages stream. */
  pickleId: string;
  /** The Examples row, for an outline row, so a diagnostic can name it as the feature file does. */
  example?: Record<string, string>;
}

/** What the recorder needs to know that is not a scenario outcome. */
export interface RecorderContext {
  /** The suite name, which is reported as the provider *configuration*. */
  suiteName: string;
  control: BackendControl;
  declared: ReadonlySet<Capability>;
  /** Capabilities that cannot hold for this provider at all, each with the reason it cannot. */
  notApplicable: ReadonlyMap<Capability, string>;
  /** The stream the outcomes are recorded into. */
  messages: ConformanceMessages;
  /** What the provider called itself, or `undefined` if no scenario ever registered one. */
  observedProviderName?: () => string | undefined;
}

/**
 * The reason recorded for a scenario that was defined but never reported an outcome.
 *
 * Every scenario is registered when it is *defined*, not when it runs, so a scenario Jest never
 * completed still appears in the stream. It is reported as failed rather than passed, because the
 * one thing a conformance report must never do is claim a result it does not have.
 */
const UNREPORTED =
  'the scenario was defined but never reported an outcome: it was filtered out (jest -t) or interrupted';

/**
 * Records the outcome of every scenario in a suite into a Messages stream, and builds the envelope
 * that points at it.
 *
 * The stream is the load-bearing part. Appendix F requires that a scenario skipped for an
 * undeclared capability is never reported as passed; recording every scenario as its own test case
 * makes that rule checkable by a consumer rather than dependent on the runner's summary being
 * trustworthy.
 */
export class ConformanceRecorder {
  private readonly recorded: ScenarioIdentity[] = [];

  constructor(private readonly context: RecorderContext) {}

  /**
   * Records a scenario the capability gate stopped before it could run.
   *
   * SKIPPED, always, whichever kind of skip it was. The two kinds are distinguished by the reason
   * on the result and by the declaration in the envelope, not by a status: a status a consumer has
   * to special-case is a status that gets read as a pass by something.
   */
  skipped(scenario: ScenarioIdentity, missing: readonly Capability[]): void {
    this.register(scenario, { status: TestStepResultStatus.SKIPPED, message: this.skipReason(missing) });
  }

  /**
   * Registers a scenario that is about to run and returns the callback that completes it.
   *
   * Call this when the scenario is *defined*. The record exists from that moment, so a scenario
   * that never finishes -- a Jest timeout, a crashed worker -- is still accounted for, as a failure
   * with a reason saying so.
   */
  started(scenario: ScenarioIdentity): (completion: { durationMs: number; error?: unknown }) => void {
    const complete = this.register(scenario, { status: TestStepResultStatus.FAILED, message: UNREPORTED });

    return ({ durationMs, error }) =>
      complete(
        error === undefined
          ? { status: TestStepResultStatus.PASSED, durationMs }
          : {
              status: TestStepResultStatus.FAILED,
              durationMs,
              message: error instanceof Error ? error.message : String(error),
            },
      );
  }

  /**
   * Records a scenario the runner skipped for a reason the TCK did not ask for.
   *
   * There is no honest outcome for this, so it is reported as a failure. It should not happen: the
   * only skip this suite arranges is the capability gate.
   */
  skippedUnexpectedly(scenario: ScenarioIdentity, reason: string): void {
    this.register(scenario, { status: TestStepResultStatus.FAILED, message: reason });
  }

  /** Every scenario recorded so far, in the order it was recorded. */
  get results(): readonly ScenarioIdentity[] {
    return this.recorded;
  }

  /** How many scenarios ended in each Cucumber status, for a line a human reads. */
  get statusCounts(): Record<string, number> {
    return this.context.messages.statusCounts;
  }

  /** The Messages stream the outcomes were recorded into. */
  get messages(): ConformanceMessages {
    return this.context.messages;
  }

  build(results: ConformanceReport['results']): ConformanceReport {
    const notApplicable: Record<string, string> = Object.fromEntries(this.context.notApplicable);

    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      provider: {
        // What the provider calls itself, not the suite name. The suite name is chosen to read well
        // in a failure message -- 'flagd-rpc' -- which makes it the configuration, and it is
        // reported as such below. One provider with two materially different modes therefore
        // produces two reports that are not interchangeable.
        name: this.context.observedProviderName?.() || this.context.suiteName,
        language: 'javascript',
        configuration: this.context.suiteName,
      },
      sdk: { name: SDK_PACKAGE, version: packageVersion(SDK_PACKAGE) },
      tck: {
        implementation: TCK_IMPLEMENTATION,
        version: ownVersion(),
        // Captured at build time from the submodule, which the published package does not carry.
        // 'unknown' rather than an empty string because the field is required and the schema asks
        // for at least seven characters; a build with no git says so instead of failing to validate.
        specRevision: SPEC_REVISION || 'unknown',
      },
      backend: {
        description: this.context.control.description,
        ...(this.context.control.controlApi ? { controlApi: this.context.control.controlApi } : {}),
      },
      declaration: {
        declared: [...this.context.declared].sort(),
        ...(Object.keys(notApplicable).length ? { notApplicable } : {}),
      },
      results,
    };
  }

  /**
   * Adds a scenario to the stream and to the accounting, and returns its completion callback.
   *
   * The stream first: if it rejects the scenario the accounting must not claim it, or the run would
   * pass its own coverage check while the results were missing an outcome.
   */
  private register(scenario: ScenarioIdentity, initial: Outcome): CompleteTestCase {
    const complete = this.context.messages.record(scenario.pickleId, initial);
    this.recorded.push(scenario);

    return complete;
  }

  /**
   * Why a scenario was skipped.
   *
   * A capability the provider chose not to declare and one that cannot hold for it at all are
   * different statements, and both are skips. The distinction lives in this sentence and in the
   * envelope's declaration rather than in the status, because it is a fact about the provider
   * rather than about the run: `@strict-numeric-typing` is unsatisfiable in JavaScript, and that is
   * true of every scenario carrying it in every run of every JavaScript provider.
   */
  private skipReason(missing: readonly Capability[]): string {
    if (missing.length === 0) {
      return 'skipped by the capability gate, which named no capability';
    }

    const tags = missing.join(' ');
    const inapplicable = missing.filter((capability) => this.context.notApplicable.has(capability));

    // The stronger statement wins when a scenario is gated by both, so a provider cannot hide a gap
    // behind an inapplicable tag that happens to sit on the same scenario.
    return inapplicable.length === missing.length
      ? `requires ${tags}, which cannot hold for this provider: ` +
          `${inapplicable.map((capability) => this.context.notApplicable.get(capability)).join('; ')}`
      : `requires ${tags}, which this provider does not declare`;
  }
}

/**
 * Reports every way the recorded outcomes fail to account for exactly the planned scenarios, once
 * each.
 *
 * A report that silently omitted the scenarios it skipped would mislead in precisely the direction
 * the format exists to prevent, and one that recorded a scenario twice -- once correctly and once
 * as passed -- is the bug that bit the Go implementation. Neither is a hypothetical, so the
 * invariant is checked at the end of every run rather than only in a test.
 *
 * Scenarios are tallied by pickle id, which is unique per scenario including per row of a Scenario
 * Outline. Keying on the name would let eleven rows of the type-mismatch matrix cancel out against
 * each other: ten recorded and one dropped would tally as ten expected and ten recorded for a name
 * seen eleven times. Tallies are compared rather than sets, so a duplicate is reported as a
 * duplicate rather than silently absorbed.
 */
export function coverageProblems(
  recorded: readonly ScenarioIdentity[],
  planned: readonly ScenarioIdentity[],
): string[] {
  const tally = (scenarios: readonly ScenarioIdentity[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const scenario of scenarios) {
      counts.set(scenario.pickleId, (counts.get(scenario.pickleId) ?? 0) + 1);
    }
    return counts;
  };

  const names = new Map<string, string>();
  for (const scenario of [...planned, ...recorded]) {
    names.set(scenario.pickleId, scenarioName(scenario));
  }

  const expected = tally(planned);
  const actual = tally(recorded);
  const problems: string[] = [];

  for (const [id, count] of expected) {
    const got = actual.get(id) ?? 0;
    if (got !== count) {
      problems.push(`${names.get(id) ?? id}: expected ${count} outcome(s), recorded ${got}`);
    }
  }
  for (const [id, count] of actual) {
    if (!expected.has(id)) {
      problems.push(`${names.get(id) ?? id}: recorded ${count} outcome(s) for a scenario that was never planned`);
    }
  }

  return problems.sort();
}

/**
 * A scenario's identity as one printable string, for a diagnostic a person has to act on.
 *
 * The example is rendered in Examples-column order rather than sorted, so it reads like the row in
 * the feature file. This is not what identifies a scenario in the report -- the pickle does that.
 */
function scenarioName(scenario: ScenarioIdentity): string {
  const example = scenario.example
    ? ` [${Object.entries(scenario.example)
        .map(([column, value]) => `${column}=${value}`)
        .join(' ')}]`
    : '';

  return `${scenario.feature}.feature: ${scenario.name}${example}`;
}

/** Where a run's two files went. */
export interface WrittenReport {
  /** The envelope: `<dir>/<name>.json`. */
  report: string;
  /** The Cucumber Messages stream the envelope points at: `<dir>/<name>.ndjson`. */
  results: string;
}

/**
 * Writes the report if {@link REPORT_DIR_ENV} is set, and returns where it went.
 *
 * Two files: the results stream, then the envelope naming it and carrying its digest. In that
 * order, so an envelope never points at a file that is not there yet.
 *
 * A failure to write throws rather than being logged and ignored. CI that asked for a report and
 * silently did not get one is how a publishing pipeline ends up serving a stale result forever.
 */
export function writeConformanceReport(recorder: ConformanceRecorder, suiteName: string): WrittenReport | undefined {
  const dir = (process.env[REPORT_DIR_ENV] ?? '').trim();
  if (!dir) {
    return undefined;
  }

  const stem = reportBaseName(suiteName);
  const resultsName = `${stem}.ndjson`;
  const written: WrittenReport = { report: join(dir, `${stem}.json`), results: join(dir, resultsName) };

  const ndjson = recorder.messages.ndjson();
  const envelope = recorder.build({
    format: RESULTS_FORMAT,
    // Relative to the envelope, which is the sibling file it was just written next to. A path
    // rather than a URI so a published pair can be moved as a unit.
    location: resultsName,
    digest: `sha256:${createHash('sha256').update(ndjson, 'utf8').digest('hex')}`,
  });

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(written.results, ndjson, 'utf8');
    writeFileSync(written.report, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new Error(
      `provider-tck [${suiteName}]: could not write the conformance report to ${dir}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return written;
}

/**
 * Turns a suite name into the stem both of its files are named after.
 *
 * Suite names are chosen to read well in failure messages rather than to be path-safe, so anything
 * not obviously safe becomes a hyphen. Without this a suite named `flagd/rpc` would silently write
 * outside the directory it was given.
 */
export function reportBaseName(suiteName: string): string {
  const cleaned = suiteName.replace(/[^A-Za-z0-9\-_.]/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'report';
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, parse } from 'node:path';
import type { Capability } from './capability';
import { ALL_CAPABILITIES, capabilityForTag } from './capability';
import type { BackendControl } from './control';
import { ASSETS_TREE, SPEC_REVISION } from './revision';

/**
 * Names the directory a conformance report is written to.
 *
 * It is an environment variable rather than a {@link TckOptions} field so that emitting a report is
 * a property of the *run* and not of the code: CI sets it, a developer running the suite locally
 * does not, and no adopter has to change a line to publish one. Each suite writes
 * `<dir>/<name>.json`, so two suites in one run -- flagd's RPC and in-process resolvers, say -- each
 * produce their own file without colliding.
 *
 * Unset means no report, which is the default and is not an error.
 */
export const REPORT_DIR_ENV = 'PROVIDER_TCK_REPORT_DIR';

/** The major version of the report schema this emitter produces. */
const REPORT_SCHEMA_VERSION = '1';

/** Which TCK implementation produced the report. Fixed, and the same string in every report. */
const TCK_IMPLEMENTATION = 'js-sdk-contrib/libs/shared/tck';

const TCK_PACKAGE = '@openfeature/tck';
const SDK_PACKAGE = '@openfeature/server-sdk';

/**
 * The result of one scenario, or of one capability.
 *
 * There are four rather than two because "did not run" is not one thing. A capability the provider
 * chose not to declare is a different statement from one the language makes impossible, and
 * JavaScript is the language that makes the distinction unavoidable: `@strict-numeric-typing` cannot
 * hold here because there is no integer type, so reporting it as `not-declared` would show every
 * JavaScript provider as missing something no JavaScript provider can have.
 */
export type Outcome = 'passed' | 'failed' | 'not-declared' | 'not-applicable';

/** Per-scenario outcome, as the schema defines it. */
export interface ScenarioResult {
  /** The feature file, without extension: `errors`. */
  feature: string;
  /** The scenario name as the feature file writes it; every row of a Scenario Outline shares it. */
  name: string;
  /**
   * The Examples row this entry came from, keyed by column header, for a scenario originating from a
   * Scenario Outline. Omitted otherwise.
   *
   * It is a field rather than a naming convention because the parameters *are* the identity and they
   * come from the feature file rather than from any runner. Mandating a mangled name instead would
   * put a separator, an ordering and an escaping rule into normative text that four languages must
   * reproduce byte for byte -- and the three implementations had already diverged on exactly that
   * point, emitting the bare name, a pytest id and jest-cucumber's expanded title for the same row.
   *
   * Values are the cell contents verbatim, as strings, because Gherkin has no types: `1` stays
   * `"1"`.
   */
  example?: Record<string, string>;
  tags?: string[];
  outcome: Outcome;
  /** For a skip, why it was skipped. For a failure, what failed. */
  reason?: string;
  durationMs?: number;
}

/** Per-capability outcome, as the schema defines it. */
export interface CapabilityResult {
  state: Outcome;
  reason?: string;
}

/**
 * One run of the suite against one provider in one configuration.
 *
 * The shape is fixed by the schema in the specification repository, and this type is deliberately a
 * transcription of it rather than a convenient TypeScript representation: the point of the format is
 * that every language emits the same document.
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
    assetsTree?: string;
  };
  backend?: { description?: string; controlApi?: 'http' | 'in-process' };
  capabilities: Record<string, CapabilityResult>;
  scenarios: ScenarioResult[];
}

/** Identifies the scenario an outcome belongs to. */
export interface ScenarioIdentity {
  feature: string;
  name: string;
  /** The Examples row, for an outline scenario. Feature and name alone do not identify one. */
  example?: Record<string, string>;
  tags: readonly string[];
}

/** What the recorder needs to know that is not a scenario outcome. */
export interface RecorderContext {
  /** The suite name, which is reported as the provider *configuration*. */
  suiteName: string;
  control: BackendControl;
  declared: ReadonlySet<Capability>;
  notApplicable: ReadonlySet<Capability>;
  /** What the provider called itself, or `undefined` if no scenario ever registered one. */
  observedProviderName?: () => string | undefined;
}

/**
 * The reason recorded for a scenario that was defined but never reported an outcome.
 *
 * Every scenario is registered when it is *defined*, not when it runs, so a scenario Jest never
 * completed still appears in the report. It is reported as failed rather than passed, because the
 * one thing a conformance report must never do is claim a result it does not have.
 */
const UNREPORTED =
  'the scenario was defined but never reported an outcome: it was filtered out (jest -t) or interrupted';

/**
 * Accumulates the outcome of every scenario in a suite and builds the report from it.
 *
 * The per-scenario list is the load-bearing part. Appendix F requires that a scenario skipped for an
 * undeclared capability is never reported as passed; recording the outcome of every scenario
 * individually makes that rule checkable by a consumer rather than dependent on the runner's summary
 * being trustworthy.
 */
export class ConformanceRecorder {
  private readonly scenarios: ScenarioResult[] = [];

  constructor(private readonly context: RecorderContext) {}

  /** Records a scenario the capability gate stopped before it could run. */
  skipped(scenario: ScenarioIdentity, missing: readonly Capability[]): void {
    this.scenarios.push({
      ...identify(scenario),
      ...this.describeSkip(missing),
    });
  }

  /**
   * Registers a scenario that is about to run and returns the callback that completes it.
   *
   * Call this when the scenario is *defined*. The record exists from that moment, so a scenario that
   * never finishes -- a Jest timeout, a crashed worker -- is still accounted for, as a failure with
   * a reason saying so.
   */
  started(scenario: ScenarioIdentity): (completion: { durationMs: number; error?: unknown }) => void {
    const result: ScenarioResult = {
      ...identify(scenario),
      outcome: 'failed',
      reason: UNREPORTED,
    };
    this.scenarios.push(result);

    return ({ durationMs, error }) => {
      result.durationMs = durationMs;
      if (error === undefined) {
        result.outcome = 'passed';
        result.reason = undefined;
      } else {
        result.outcome = 'failed';
        result.reason = error instanceof Error ? error.message : String(error);
      }
    };
  }

  /**
   * Records a scenario the runner skipped for a reason the TCK did not ask for.
   *
   * There is no honest outcome for this, so it is reported as a failure. It should not happen: the
   * only skip this suite arranges is the capability gate.
   */
  skippedUnexpectedly(scenario: ScenarioIdentity, reason: string): void {
    this.scenarios.push({ ...identify(scenario), outcome: 'failed', reason });
  }

  /** Every outcome recorded so far, in the order it was recorded. */
  get results(): readonly ScenarioResult[] {
    return this.scenarios;
  }

  build(): ConformanceReport {
    const scenarios = [...this.scenarios].sort(
      (a, b) => a.feature.localeCompare(b.feature) || a.name.localeCompare(b.name),
    );

    const report: ConformanceReport = {
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
        ...(/^[0-9a-f]{40}$/.test(ASSETS_TREE) ? { assetsTree: ASSETS_TREE } : {}),
      },
      backend: {
        description: this.context.control.description,
        ...(this.context.control.controlApi ? { controlApi: this.context.control.controlApi } : {}),
      },
      capabilities: this.buildCapabilities(scenarios),
      scenarios,
    };

    return report;
  }

  private buildCapabilities(scenarios: readonly ScenarioResult[]): Record<string, CapabilityResult> {
    // A capability is only reported as passed when everything gating on it actually passed.
    const failed = new Set<Capability>();
    for (const scenario of scenarios) {
      if (scenario.outcome !== 'failed') {
        continue;
      }
      for (const tag of scenario.tags ?? []) {
        const capability = capabilityForTag(tag);
        if (capability) {
          failed.add(capability);
        }
      }
    }

    const capabilities: Record<string, CapabilityResult> = {};
    for (const capability of ALL_CAPABILITIES) {
      if (this.context.notApplicable.has(capability)) {
        capabilities[capability] = {
          state: 'not-applicable',
          reason:
            `not applicable to this provider; the ${capability} scenarios were skipped and did not ` +
            `contribute to this result. Unlike 'not-declared' this is not a gap: the question the ` +
            `capability asks cannot be put to this provider at all`,
        };
      } else if (!this.context.declared.has(capability)) {
        capabilities[capability] = {
          state: 'not-declared',
          reason:
            `not declared by this provider's configuration; the ${capability} scenarios were ` +
            `skipped and did not contribute to this result`,
        };
      } else if (failed.has(capability)) {
        capabilities[capability] = { state: 'failed' };
      } else {
        capabilities[capability] = { state: 'passed' };
      }
    }
    return capabilities;
  }

  /**
   * Chooses between the two ways of not running a scenario.
   *
   * `not-applicable` is claimed only when *every* capability that gated the scenario is one the
   * suite declared inapplicable. If any of them is merely undeclared, the scenario is `not-declared`
   * -- the stronger statement wins, because a provider should not be able to hide a gap behind an
   * inapplicable tag that happens to sit on the same scenario.
   */
  private describeSkip(missing: readonly Capability[]): Pick<ScenarioResult, 'outcome' | 'reason'> {
    if (missing.length === 0) {
      return { outcome: 'not-declared', reason: 'skipped by the capability gate, which named no capability' };
    }

    const inapplicable = missing.every((capability) => this.context.notApplicable.has(capability));
    const tags = missing.join(' ');

    return inapplicable
      ? {
          outcome: 'not-applicable',
          reason: `requires ${tags}, which this suite declares not applicable to this provider`,
        }
      : {
          outcome: 'not-declared',
          reason: `requires ${tags}, which this provider does not declare`,
        };
  }
}

/** Names a scenario for the purpose of checking that it was accounted for exactly once. */
export interface ScenarioKey {
  feature: string;
  name: string;
  example?: Record<string, string>;
}

/**
 * Reports every way the recorded outcomes fail to account for exactly the planned scenarios, once
 * each.
 *
 * A report that silently omitted the scenarios it skipped would mislead in precisely the direction
 * the format exists to prevent, and one that recorded a scenario twice -- once correctly and once as
 * passed -- is the bug that bit the Go implementation. Neither is a hypothetical, so the invariant
 * is checked at the end of every run rather than only in a test.
 *
 * A scenario is keyed by feature, name and example together. Every row of a Scenario Outline shares
 * one name, so keying on the name alone would let eleven rows of the type-mismatch matrix cancel out
 * against each other: ten recorded and one dropped would tally as ten expected and ten recorded for
 * a name seen eleven times. Tallies are still compared rather than sets, so that a duplicate is
 * reported as a duplicate rather than silently absorbed.
 */
export function coverageProblems(recorded: readonly ScenarioKey[], planned: readonly ScenarioKey[]): string[] {
  const tally = (scenarios: readonly ScenarioKey[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const scenario of scenarios) {
      const key = scenarioKey(scenario);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  const expected = tally(planned);
  const actual = tally(recorded);
  const problems: string[] = [];

  for (const [key, count] of expected) {
    const got = actual.get(key) ?? 0;
    if (got !== count) {
      problems.push(`${key}: expected ${count} outcome(s), recorded ${got}`);
    }
  }
  for (const [key, count] of actual) {
    if (!expected.has(key)) {
      problems.push(`${key}: recorded ${count} outcome(s) for a scenario that was never planned`);
    }
  }

  return problems.sort();
}

/**
 * A scenario's identity as one printable string.
 *
 * The example is rendered in Examples-column order rather than sorted, so the key reads like the row
 * in the feature file.
 */
function scenarioKey(scenario: ScenarioKey): string {
  const example = scenario.example
    ? ` [${Object.entries(scenario.example)
        .map(([column, value]) => `${column}=${value}`)
        .join(' ')}]`
    : '';

  return `${scenario.feature}.feature: ${scenario.name}${example}`;
}

function identify(scenario: ScenarioIdentity): Pick<ScenarioResult, 'feature' | 'name' | 'example' | 'tags'> {
  return {
    feature: scenario.feature,
    name: scenario.name,
    ...(scenario.example ? { example: { ...scenario.example } } : {}),
    ...(scenario.tags.length ? { tags: [...scenario.tags] } : {}),
  };
}

/**
 * Writes the report if {@link REPORT_DIR_ENV} is set, and returns where it went.
 *
 * A failure to write throws rather than being logged and ignored. CI that asked for a report and
 * silently did not get one is how a publishing pipeline ends up serving a stale result forever.
 */
export function writeConformanceReport(recorder: ConformanceRecorder, suiteName: string): string | undefined {
  const dir = (process.env[REPORT_DIR_ENV] ?? '').trim();
  if (!dir) {
    return undefined;
  }

  const path = join(dir, reportFileName(suiteName));
  const document = `${JSON.stringify(recorder.build(), null, 2)}\n`;

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, document, 'utf8');
  } catch (error) {
    throw new Error(
      `tck [${suiteName}]: could not write the conformance report to ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return path;
}

/**
 * Turns a suite name into a filename.
 *
 * Suite names are chosen to read well in failure messages rather than to be path-safe, so anything
 * not obviously safe becomes a hyphen. Without this a suite named `flagd/rpc` would silently write
 * outside the directory it was given.
 */
export function reportFileName(suiteName: string): string {
  const cleaned = suiteName.replace(/[^A-Za-z0-9\-_.]/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return `${cleaned || 'report'}.json`;
}

/**
 * Resolves modules from this file's location rather than from the working directory.
 *
 * The suffix is arbitrary: `createRequire` wants a file path, not a directory.
 */
const requireFrom = createRequire(join(__dirname, 'resolve-from-here.js'));

/**
 * The installed version of a package, read at run time rather than declared.
 *
 * Declared is a second place to be wrong: the report would keep claiming 1.17.0 after a dependency
 * bump moved the actual code underneath it. `@openfeature/server-sdk` publishes no `./package.json`
 * export, so the manifest is found by walking up from the resolved entry point.
 */
function packageVersion(packageName: string): string {
  try {
    return manifestVersion(dirname(requireFrom.resolve(packageName)), packageName);
  } catch {
    return 'unknown';
  }
}

/** This library's own version, found by walking up from its compiled or bundled location. */
function ownVersion(): string {
  return manifestVersion(__dirname, TCK_PACKAGE);
}

function manifestVersion(startDir: string, packageName: string): string {
  let dir = startDir;

  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) {
        return manifest.version;
      }
    } catch {
      // No manifest here, or one that cannot be read. Keep walking.
    }

    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) {
      return 'unknown';
    }
    dir = parent;
  }
}

import type { StepDefinitions } from 'jest-cucumber';
import type { TckOptions } from '../options';
import { TckState } from '../state';

/**
 * A scenario's state over a control that does nothing, for a test whose subject is a step.
 *
 * The provider factory throws rather than returning a double: every step tested this way is one
 * whose subject is what the step does with what it was given, and a step that reached for a provider
 * here would be being tested through the wrong seam.
 */
export function stateUnderTest(overrides: Partial<TckOptions> = {}): TckState {
  return new TckState({
    name: 'step-under-test',
    newProvider: () => {
      throw new Error('no provider is registered when a step is tested on its own');
    },
    control: {
      description: 'a control that does nothing',
      prepareScenario: async () => undefined,
      changeFlag: async () => undefined,
    },
    ...overrides,
  });
}

/** One registered step: the matcher jest-cucumber would match on, and the body it would call. */
interface BoundStep {
  matcher: string | RegExp;
  body: (...args: unknown[]) => unknown;
}

/** Runs one Gherkin step, as a scenario would, and resolves with whatever its body returned. */
export type StepRunner = (stepText: string, table?: unknown) => Promise<unknown>;

/**
 * Binds a steps module so a test can run one step by the Gherkin text that triggers it.
 *
 * Dispatch is jest-cucumber's own: a string matcher is compared case-insensitively against the whole
 * step text, a regular expression matches and hands over its capture groups as arguments, and a data
 * table arrives as the last argument. Going through the matcher rather than calling the body is the
 * point — it is the half a scenario cannot check for a step no canonical feature file uses, and a
 * matcher that is subtly wrong would otherwise surface as an undefined step in an adopter's own
 * feature file rather than here.
 *
 * It also refuses an ambiguous step, which jest-cucumber refuses at bind time: two definitions
 * matching one text is a mistake whichever of them a run happens to pick.
 *
 * **Not part of the published API**: excluded from `tsconfig.lib.json`, so it is not in the package.
 */
export function bindSteps(definitions: StepDefinitions): StepRunner {
  const steps: BoundStep[] = [];
  const register = (matcher: string | RegExp, body: (...args: unknown[]) => unknown): void => {
    steps.push({ matcher, body });
  };

  definitions({
    defineStep: register,
    given: register,
    when: register,
    then: register,
    and: register,
    but: register,
    pending: () => undefined,
  });

  return async (stepText, table) => {
    const matches = steps.flatMap((step) => {
      const args = matchStep(stepText, step.matcher);
      return args ? [{ step, args }] : [];
    });

    if (!matches.length) {
      throw new Error(`no step definition matches "${stepText}"`);
    }
    if (matches.length > 1) {
      throw new Error(`${matches.length} step definitions match "${stepText}"; jest-cucumber refuses that`);
    }

    const { step, args } = matches[0];
    return step.body(...args, ...(table === undefined ? [] : [table]));
  };
}

/** The arguments a matcher would be called with, or `undefined` where it does not match at all. */
function matchStep(stepText: string, matcher: string | RegExp): unknown[] | undefined {
  if (typeof matcher === 'string') {
    return stepText.toLocaleLowerCase() === matcher.toLocaleLowerCase() ? [] : undefined;
  }

  const match = stepText.match(matcher);
  return match ? match.slice(1) : undefined;
}

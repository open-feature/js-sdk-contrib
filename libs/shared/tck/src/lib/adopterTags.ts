import { capabilityForTag } from './capability';
import type { TckOptions } from './options';

/**
 * An adopter's own Gherkin tag selection over its {@link TckOptions.extensionFeatures}, resolved and
 * checked.
 *
 * The companion to the capability gate rather than a second copy of it: a capability says what the
 * *provider* can be asked, and this says which of the *adopter's own* scenarios this suite is the one
 * to ask. The motivating case is one set of extension features run by two harnesses — a provider with
 * an RPC mode and an in-process mode — where a scenario belongs to one of them and neither is a
 * conformance claim about the other.
 *
 * Only adopter tags can be named. A {@link Capability} tag is refused, so this can never skip what
 * {@link TckOptions.capabilities} already gates, and canonical scenarios are exempt besides.
 */
export interface AdopterTagSelection {
  /**
   * Tags from {@link TckOptions.includeTags}, deduplicated in declaration order.
   *
   * Empty means no include filter at all, which is not the same as an include naming nothing.
   */
  include: readonly string[];

  /** Tags from {@link TckOptions.excludeTags}, deduplicated in declaration order. */
  exclude: readonly string[];
}

/**
 * Tags are compared as jest-cucumber's own tag filter compares them, which lowercases both sides.
 *
 * The filter built here is what actually skips the scenario and the reason below is only its
 * wording, so comparing differently in the two places is how a scenario comes to be skipped under
 * "a reason the TCK did not ask for". For a conventionally lowercase tag the two are the same rule.
 */
function normalize(tag: string): string {
  return tag.toLowerCase();
}

/** Deduplicated, case-insensitively, keeping the adopter's own spelling and order. */
function unique(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = normalize(tag);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Resolves and checks {@link TckOptions.includeTags} and {@link TckOptions.excludeTags}.
 *
 * Called once at suite start rather than per scenario, so a misconfiguration fails once, before any
 * feature is loaded, instead of once per scenario it happens to touch.
 *
 * @throws if a tag is malformed, names a capability, or is both included and excluded
 */
export function resolveAdopterTags(options: Pick<TckOptions, 'includeTags' | 'excludeTags'>): AdopterTagSelection {
  const include = unique(options.includeTags ?? []);
  const exclude = unique(options.excludeTags ?? []);

  requireAdopterTags('includeTags', include);
  requireAdopterTags('excludeTags', exclude);

  const both = include.filter((tag) => exclude.some((excluded) => normalize(excluded) === normalize(tag)));
  if (both.length) {
    throw new Error(
      `includeTags and excludeTags both name ${both.join(' ')}; a tag is one or the other. ` +
        `Exclusion wins where they overlap, so the include would say nothing: refused rather than ` +
        `applied, because a tag named twice is more likely a mistake than a statement.`,
    );
  }

  return { include, exclude };
}

/**
 * Refuses a malformed tag, and a tag that gates a capability.
 *
 * A capability tag is the one refusal that is about more than spelling: naming `@events` here would
 * let an adopter skip a scenario the capability declaration says it supports, which is the one thing
 * {@link TckOptions.capabilities} exists to decide. The two gates must not be able to contradict
 * each other, so the overlap is refused rather than ordered.
 */
function requireAdopterTags(option: string, tags: readonly string[]): void {
  const malformed = tags.filter((tag) => !tag.startsWith('@') || tag.length < 2 || tag.trim() !== tag);
  if (malformed.length) {
    throw new Error(
      `${option} names ${malformed.map((tag) => `'${tag}'`).join(' ')}; a Gherkin tag starts with ` +
        `'@', has something after it, and carries no surrounding whitespace. Refused rather than ` +
        `trimmed or prefixed: a tag that matches nothing silently selects nothing, and under ` +
        `includeTags that is every extension scenario skipped.`,
    );
  }

  const capabilities = tags.filter((tag) => capabilityForTag(normalize(tag)) !== undefined);
  if (capabilities.length) {
    throw new Error(
      `${option} names the TCK capability tag${capabilities.length === 1 ? '' : 's'} ` +
        `${capabilities.join(' ')}, which gates conformance rather than an adoption's own ` +
        `scenarios. Declare it through capabilities instead; this option selects among the ` +
        `scenarios extensionFeatures adds, and must not be able to skip what a declaration claims.`,
    );
  }
}

/**
 * The jest-cucumber tag filter expression this selection works out to, or `undefined` where it
 * selects everything.
 *
 * Composed with the capability gate's own filter rather than replacing it, and applied **only to
 * extension features**: a canonical scenario is a conformance claim and is not an adopter's to
 * deselect.
 *
 * An include is a filter and not a hint. `(@a or @b)` matches a scenario carrying neither — an
 * untagged one included — exactly as it matches one carrying the wrong tag, so an extension scenario
 * an adopter forgot to tag is skipped rather than quietly run everywhere.
 */
export function adopterTagFilter(selection: AdopterTagSelection): string | undefined {
  const clauses = [
    ...selection.exclude.map((tag) => `not ${tag}`),
    ...(selection.include.length ? [`(${selection.include.join(' or ')})`] : []),
  ];

  return clauses.length ? clauses.join(' and ') : undefined;
}

/**
 * Why this selection skips a scenario carrying `tags`, or `undefined` where it runs.
 *
 * Exclusion wins: a scenario carrying both an excluded and an included tag is skipped, and says so
 * naming the excluded tag. The two are not symmetric claims — an include says which scenarios are
 * this suite's, and an exclude says this one is nobody's.
 *
 * The reason names the tag that caused the skip rather than the option alone, because the reader of
 * a skipped scenario is looking for which line of their own configuration to change.
 */
export function adopterSkipReason(tags: readonly string[], selection: AdopterTagSelection): string | undefined {
  const carried = new Set(tags.map(normalize));

  const excluded = selection.exclude.filter((tag) => carried.has(normalize(tag)));
  if (excluded.length) {
    return `scenario carries ${excluded.join(' ')}, named by excludeTags`;
  }

  if (selection.include.length && !selection.include.some((tag) => carried.has(normalize(tag)))) {
    return `scenario carries none of ${selection.include.join(' ')}, named by includeTags`;
  }

  return undefined;
}

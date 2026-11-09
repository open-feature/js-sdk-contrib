import type { BaseHook, EvaluationDetails, FlagValue, HookContext, Logger } from '@openfeature/core';
import { GeneralError } from '@openfeature/core';
import type { StandardSchemaV1, StandardSchemaV1Issue, StandardSchemaV1Result } from './standard-schema';

/**
 * A map of flag keys to the schema their values must match.
 * Flags without an entry are not validated.
 */
export type SchemaMap = Record<string, StandardSchemaV1>;

export type Options = {
  /**
   * What to do when a flag value does not match its schema.
   * - `'throw'` (default): throw an error, so the SDK returns the default value and reports the error.
   * - `'log'`: log a warning and keep the evaluated value.
   * @default 'throw'
   */
  onInvalid?: 'throw' | 'log';
  /**
   * Optional logger used when `onInvalid` is `'log'`. Defaults to the logger of the hook context.
   */
  logger?: Logger;
};

/**
 * A hook that validates evaluated flag values against a Standard Schema (https://standardschema.dev),
 * so it works with any compliant library, such as Zod, Valibot or ArkType.
 *
 * Validation runs in the `after` stage and is synchronous, so the hook works with both the web and server SDKs.
 * Schemas that validate asynchronously are treated as invalid.
 */
export class SchemaValidationHook implements BaseHook {
  private readonly onInvalid: NonNullable<Options['onInvalid']>;

  /**
   * @param schemas a single schema applied to every flag, or a map of flag keys to schemas
   * @param options hook options
   */
  constructor(
    private readonly schemas: StandardSchemaV1 | SchemaMap,
    private readonly options: Options = {},
  ) {
    this.onInvalid = options.onInvalid ?? 'throw';
  }

  /**
   * Validates the evaluated value against the schema of the flag, if there is one.
   * @param hookContext the context of the evaluation
   * @param evaluationDetails the details of the evaluation, including the evaluated value
   * @throws {GeneralError} if the value is invalid and `onInvalid` is `'throw'`
   */
  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>): void {
    const schema = this.getSchema(hookContext.flagKey);
    if (!schema) {
      return;
    }

    const result = schema['~standard'].validate(evaluationDetails.value);

    if (isAsyncResult(result)) {
      // the web SDK cannot wait for a promise in a hook, so async validation is not supported
      Promise.resolve(result).catch(() => undefined);
      this.handleInvalid(
        hookContext,
        `Schema for flag "${hookContext.flagKey}" validates asynchronously, which is not supported`,
      );
      return;
    }

    if (result.issues) {
      this.handleInvalid(
        hookContext,
        `Value of flag "${hookContext.flagKey}" does not match its schema: ${formatIssues(result.issues)}`,
      );
    }
  }

  /**
   * Returns the schema for a flag: the single schema if one was given, otherwise the entry in the schema map.
   * @param flagKey the key of the evaluated flag
   * @returns the schema, or `undefined` if the flag has no schema
   */
  private getSchema(flagKey: string): StandardSchemaV1 | undefined {
    if (isStandardSchema(this.schemas)) {
      return this.schemas;
    }
    return Object.prototype.hasOwnProperty.call(this.schemas, flagKey) ? this.schemas[flagKey] : undefined;
  }

  /**
   * Logs a warning or throws, depending on the `onInvalid` option.
   * @param hookContext the context of the evaluation, used for its logger
   * @param message the message describing why the value is invalid
   * @throws {GeneralError} if `onInvalid` is `'throw'`
   */
  private handleInvalid(hookContext: HookContext, message: string): void {
    if (this.onInvalid === 'log') {
      (this.options.logger ?? hookContext.logger).warn(message);
      return;
    }
    throw new GeneralError(message);
  }
}

/**
 * Checks whether the hook was given a single schema rather than a schema map.
 * @param value the schema or schema map passed to the hook
 * @returns `true` if the value is a Standard Schema
 */
function isStandardSchema(value: StandardSchemaV1 | SchemaMap): value is StandardSchemaV1 {
  const standard = (value as Partial<StandardSchemaV1>)['~standard'];
  return typeof standard === 'object' && standard !== null && typeof standard.validate === 'function';
}

/**
 * Checks whether a validation result is asynchronous. A synchronous result always has a `value` or `issues`
 * key, so a result with one of those keys is treated as synchronous even if it also has a `then` function.
 * @param result the value returned by the schema's `validate` function
 * @returns `true` if the result is a promise or another thenable
 */
function isAsyncResult(
  result: StandardSchemaV1Result<unknown> | PromiseLike<StandardSchemaV1Result<unknown>>,
): result is PromiseLike<StandardSchemaV1Result<unknown>> {
  if (result instanceof Promise) {
    return true;
  }
  return typeof (result as { then?: unknown }).then === 'function' && !('value' in result) && !('issues' in result);
}

/**
 * Formats validation issues into a single line, prefixing each issue with its path when there is one.
 * @param issues the issues returned by the schema
 * @returns the formatted issues, separated by `; `
 */
function formatIssues(issues: ReadonlyArray<StandardSchemaV1Issue>): string {
  return issues
    .map((issue) => {
      const path = issue.path
        ?.map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment)))
        .join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

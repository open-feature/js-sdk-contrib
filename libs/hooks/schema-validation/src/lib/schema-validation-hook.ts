import type { BaseHook, EvaluationDetails, FlagValue, HookContext, Logger } from '@openfeature/core';
import { GeneralError } from '@openfeature/core';
import type { StandardSchemaV1, StandardSchemaV1Issue } from './standard-schema';

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

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>): void {
    const schema = this.getSchema(hookContext.flagKey);
    if (!schema) {
      return;
    }

    const result = schema['~standard'].validate(evaluationDetails.value);

    if (isPromise(result)) {
      // the web SDK cannot wait for a promise in a hook, so async validation is not supported
      result.catch(() => undefined);
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

  private getSchema(flagKey: string): StandardSchemaV1 | undefined {
    if (isStandardSchema(this.schemas)) {
      return this.schemas;
    }
    return Object.prototype.hasOwnProperty.call(this.schemas, flagKey) ? this.schemas[flagKey] : undefined;
  }

  private handleInvalid(hookContext: HookContext, message: string): void {
    if (this.onInvalid === 'log') {
      (this.options.logger ?? hookContext.logger).warn(message);
      return;
    }
    throw new GeneralError(message);
  }
}

function isStandardSchema(value: StandardSchemaV1 | SchemaMap): value is StandardSchemaV1 {
  const standard = (value as Partial<StandardSchemaV1>)['~standard'];
  return typeof standard === 'object' && standard !== null && typeof standard.validate === 'function';
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === 'function';
}

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

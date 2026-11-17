/**
 * Types from the Standard Schema specification (v1): https://standardschema.dev
 *
 * The spec invites libraries to copy these types instead of depending on `@standard-schema/spec`.
 * They are restated here as plain interfaces; TypeScript compares them structurally, so any compliant
 * schema (Zod, Valibot, ArkType, ...) can be passed to this hook without extra dependencies.
 *
 * Original types: Copyright (c) 2024 Colin McDonnell, MIT License.
 */

/** A Standard Schema compliant schema. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly '~standard': StandardSchemaV1Props<Input, Output>;
}

/** The Standard Schema properties interface. */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  /** The version number of the standard. */
  readonly version: 1;
  /** The vendor name of the schema library. */
  readonly vendor: string;
  /** Validates unknown input values. */
  readonly validate: (
    value: unknown,
    options?: StandardSchemaV1Options | undefined,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
  /** Inferred types associated with the schema. */
  readonly types?: StandardSchemaV1Types<Input, Output> | undefined;
}

/** Options passed to the validate function. */
export interface StandardSchemaV1Options {
  /** Explicit support for additional vendor-specific parameters, if needed. */
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

/** The result interface of the validate function. */
export type StandardSchemaV1Result<Output> = StandardSchemaV1SuccessResult<Output> | StandardSchemaV1FailureResult;

/** The result interface if validation succeeds. */
export interface StandardSchemaV1SuccessResult<Output> {
  /** The typed output value. */
  readonly value: Output;
  /** A falsy value for `issues` indicates success. */
  readonly issues?: undefined;
}

/** The result interface if validation fails. */
export interface StandardSchemaV1FailureResult {
  /** The issues of failed validation. */
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>;
}

/** The issue interface of the failure output. */
export interface StandardSchemaV1Issue {
  /** The error message of the issue. */
  readonly message: string;
  /** The path of the issue, if any. */
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined;
}

/** The path segment interface of the issue. */
export interface StandardSchemaV1PathSegment {
  /** The key representing a path segment. */
  readonly key: PropertyKey;
}

/** The Standard Schema types interface. */
export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
  /** The input type of the schema. */
  readonly input: Input;
  /** The output type of the schema. */
  readonly output: Output;
}

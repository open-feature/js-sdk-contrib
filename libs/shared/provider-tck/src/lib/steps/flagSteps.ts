import type { StepDefinitions } from 'jest-cucumber';
import type { JsonValue } from '@openfeature/server-sdk';
import type { TckState } from '../state';
import { describe as describeValue, parseFlagType, parseValue, valuesEqual } from '../values';

type ObjectRow = { key: string; type: string; value: string };

/** Steps that declare, evaluate and assert flags. */
export const flagSteps =
  (state: TckState): StepDefinitions =>
  ({ given, when, then }) => {
    given(
      /^an? ([A-Za-z]+)-flag with key "([^"]*)" and a default value "([^"]*)"$/,
      (rawType: string, key: string, rawDefault: string) => {
        // The declared type and the flag are independent on purpose: most of errors.feature asks
        // for a flag as a type it is not.
        const type = parseFlagType(rawType);
        state.flag = { key, type, defaultValue: parseValue(type, rawDefault) };
      },
    );

    when('the flag was evaluated with details', async () => {
      const client = state.requireClient();
      const flag = state.requireFlag();

      state.details = undefined;
      state.thrown = undefined;

      try {
        switch (flag.type) {
          case 'Boolean':
            state.details = await client.getBooleanDetails(flag.key, flag.defaultValue as boolean);
            break;
          case 'String':
            state.details = await client.getStringDetails(flag.key, flag.defaultValue as string);
            break;
          // JavaScript has a single number type, so both map to the same call. See
          // Capability.StrictNumericTyping for what that costs.
          case 'Integer':
          case 'Float':
            state.details = await client.getNumberDetails(flag.key, flag.defaultValue as number);
            break;
          case 'Object':
            state.details = await client.getObjectDetails(flag.key, flag.defaultValue as JsonValue);
            break;
        }
      } catch (error) {
        state.thrown = error;
      }
    });

    then(/^the resolved details value should be "([^"]*)"$/, (raw: string) => {
      const flag = state.requireFlag();
      const details = state.requireDetails();
      const expected = parseValue(flag.type, raw);

      if (!valuesEqual(expected, details.value)) {
        const extra = details.errorMessage ? ` (the client also reported: ${details.errorMessage})` : '';
        throw new Error(
          `flag '${flag.key}' resolved to ${describeValue(details.value)}, ` +
            `expected ${describeValue(expected)}${extra}`,
        );
      }
    });

    then(/^the variant should be "([^"]*)"$/, (expected: string) => {
      const details = state.requireDetails();
      if (details.variant !== expected) {
        throw new Error(
          `variant was '${details.variant}', expected '${expected}'. A variant that does not ` +
            `survive the trip from the backend is one of the easiest parts of the contract to drop`,
        );
      }
    });

    then(/^the reason should be "([^"]*)"$/, (expected: string) => {
      const details = state.requireDetails();
      if (details.reason !== expected) {
        throw new Error(`reason was '${details.reason}', expected '${expected}'`);
      }
    });

    then(/^the error-code should be "([^"]*)"$/, (expected: string) => {
      // The empty case matters as much as the populated ones. A provider that reports a plausible
      // value with no error code is the failure mode the suite is most concerned with, because the
      // application has no way to notice.
      const details = state.requireDetails();
      const actual = details.errorCode ?? '';

      if (actual === expected) {
        return;
      }
      if (expected === '') {
        throw new Error(`error-code was '${actual}', expected none`);
      }
      if (actual === '') {
        throw new Error(
          `no error-code was reported, expected '${expected}'. Returning a value without an error ` +
            `code leaves the application unable to tell that anything went wrong`,
        );
      }
      throw new Error(`error-code was '${actual}', expected '${expected}'`);
    });

    then('no exception should have been thrown', () => {
      // The Evaluation API is specified never to throw: an errored evaluation returns the code
      // default with an error code. A provider that rejects instead takes the caller down with it.
      if (state.thrown !== undefined) {
        throw new Error(
          `the evaluation threw ${String(state.thrown)}. A flag evaluation must always resolve to ` +
            `a value and an error code, never reject`,
        );
      }
    });

    then('the resolved object value should contain', (rows: ObjectRow[]) => {
      const details = state.requireDetails();
      const actual = details.value;

      if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
        throw new Error(`resolved object value is ${describeValue(actual)}, which has no members to check`);
      }

      const record = actual as Record<string, unknown>;
      for (const row of rows) {
        const expected = parseValue(parseFlagType(row.type), row.value);
        if (!(row.key in record)) {
          throw new Error(`resolved object value has no member '${row.key}'`);
        }
        if (!valuesEqual(expected, record[row.key])) {
          throw new Error(
            `object member '${row.key}' was ${describeValue(record[row.key])}, ` +
              `expected ${describeValue(expected)}`,
          );
        }
      }
    });

    when('the resolved value is remembered', () => {
      state.remembered = state.requireDetails().value;
      state.hasMemory = true;
    });

    then('the resolved details value should have changed', () => {
      // This is the half of the configuration-change contract providers actually get wrong. Emitting
      // PROVIDER_CONFIGURATION_CHANGED and then continuing to resolve the old value is worse than
      // emitting nothing, because the application acted on a signal that was not true.
      const details = state.requireDetails();
      if (!state.hasMemory) {
        throw new Error(
          'no value was remembered in this scenario: a "the resolved value is remembered" step ' +
            'must come first',
        );
      }
      if (valuesEqual(state.remembered, details.value)) {
        throw new Error(
          `the resolved value is still ${describeValue(details.value)} after the configuration ` +
            `changed. The change was signalled but not applied, so the event told the application ` +
            `something untrue`,
        );
      }
    });

    when('the flag was modified', async () => {
      try {
        await state.options.control.changeFlag();
      } catch (error) {
        throw new Error(
          `could not change flag configuration on ${state.options.control.description}: ` +
            `${(error as Error).message}`,
        );
      }
    });
  };

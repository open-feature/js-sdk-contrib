import type { StepDefinitions } from 'jest-cucumber';
import type { JsonValue } from '@openfeature/server-sdk';
import { Capability } from '../capability';
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
        // The declared type and the flag are independent on purpose: errors.feature asks for flags
        // as types they are not.
        const type = parseFlagType(rawType);
        state.flag = { key, type, defaultValue: parseValue(type, rawDefault) };
      },
    );

    given(/^a context containing a targeting key with value "([^"]*)"$/, (targetingKey: string) => {
      // The wording is Appendix B's, copied rather than improved: a second way to say the same
      // thing is the divergence the appendix exists to prevent.
      state.context = { targetingKey };
    });

    when('the flag was evaluated with details', async () => {
      const client = state.requireClient();
      const flag = state.requireFlag();
      // Passed through on every resolve, and `undefined` where the scenario supplied none -- which
      // is deliberate; see TckState.context.
      const context = state.context;

      state.details = undefined;
      state.thrown = undefined;

      try {
        switch (flag.type) {
          case 'Boolean':
            state.details = await client.getBooleanDetails(flag.key, flag.defaultValue as boolean, context);
            break;
          case 'String':
            state.details = await client.getStringDetails(flag.key, flag.defaultValue as string, context);
            break;
          // One number type, so both map to the same call. See Capability.NumericCoercion.
          case 'Integer':
          case 'Float':
            state.details = await client.getNumberDetails(flag.key, flag.defaultValue as number, context);
            break;
          case 'Object':
            state.details = await client.getObjectDetails(flag.key, flag.defaultValue as JsonValue, context);
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
            `survive the trip from the backend is one of the easiest parts of the contract to drop ` +
            `-- but requirement 2.2.4 is a SHOULD and the field is typed optional, so a backend ` +
            `with no variant concept should leave ${Capability.Variants} undeclared rather than ` +
            `fail here`,
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
      // The empty case matters as much as the populated ones: a provider reporting a plausible value
      // with no error code gives the application no way to notice.
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

    then(/^the error message should be empty$/, () => {
      // A provider that reports a value AND an error message sends two contradictory signals, and an
      // application reading the message believes the wrong one.
      const details = state.requireDetails();
      // Typed `string | undefined`, but a JavaScript provider can hand back `null`, which is as
      // empty as a missing one.
      const message: unknown = details.errorMessage;
      if (message !== undefined && message !== null && message !== '') {
        throw new Error(`an error message was reported alongside the value, expected none: '${String(message)}'`);
      }
    });

    then('no exception should have been thrown', () => {
      // Nothing the scenario asked of the provider may have thrown -- the evaluation and every
      // direct lifecycle call. Each records what it threw rather than propagating, and this is the
      // one step that reads those records back.
      if (!state.hasCalledProvider()) {
        throw new Error(
          'nothing has been asked of the provider in this scenario: a "When the flag was evaluated ' +
            'with details" or "When the provider is shut down" step must come first',
        );
      }

      const thrown = state.exceptions();
      if (thrown.length) {
        const listed = thrown.map(({ what, error }) => `${what} threw ${String(error)}`).join('; ');
        throw new Error(
          `${listed}. A flag evaluation must always resolve to a value and an error code, and a ` +
            `lifecycle call must return, never reject`,
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
      // The half of the configuration-change contract providers get wrong: emitting the event and
      // then continuing to resolve the old value is worse than emitting nothing.
      const details = state.requireDetails();
      if (!state.hasMemory) {
        throw new Error(
          'no value was remembered in this scenario: a "the resolved value is remembered" step ' + 'must come first',
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

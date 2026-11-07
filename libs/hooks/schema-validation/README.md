# Schema Validation Hook

A hook that validates evaluated flag values against a [Standard Schema](https://standardschema.dev).
Any compliant schema library works, including [Zod](https://zod.dev), [Valibot](https://valibot.dev) and [ArkType](https://arktype.io), and the hook itself has no dependency on any of them.

Validation runs in the `after` stage, so it works with both the web and server SDKs.

## Installation

```
$ npm install @openfeature/schema-validation-hook
```

### Peer dependencies

This package only requires the `@openfeature/core` dependency, which is installed automatically by the web and server SDKs.

## Usage

Pass a single schema to validate every flag the hook is attached to:

```ts
import { z } from 'zod';
import { SchemaValidationHook } from '@openfeature/schema-validation-hook';

const themeHook = new SchemaValidationHook(z.enum(['light', 'dark']));

const theme = client.getStringValue('theme', 'light', {}, { hooks: [themeHook] });
```

Or pass a map of flag keys to schemas, and attach the hook to a client or globally. Flags without an entry in the map are not validated:

```ts
import * as v from 'valibot';
import { SchemaValidationHook } from '@openfeature/schema-validation-hook';

OpenFeature.addHooks(
  new SchemaValidationHook({
    theme: v.picklist(['light', 'dark']),
    'rate-limits': v.object({ max: v.number(), windowSeconds: v.number() }),
  }),
);
```

### Invalid values

By default, the hook throws when a value does not match its schema.
The SDK then returns the default value of the evaluation, with the error code `GENERAL` and a message that lists the issues, for example:

```
Value of flag "rate-limits" does not match its schema: max: Expected a number
```

To keep the evaluated value and only log a warning instead, set `onInvalid` to `'log'`:

```ts
new SchemaValidationHook(schemas, { onInvalid: 'log' });
```

The warning goes to the logger of the hook context, or to the `logger` option if one is given.

### Options

| Option      | Type               | Default                 | Description                                        |
| ----------- | ------------------ | ----------------------- | -------------------------------------------------- |
| `onInvalid` | `'throw' \| 'log'` | `'throw'`               | What to do when a value does not match its schema. |
| `logger`    | `Logger`           | the hook context logger | Logger used when `onInvalid` is `'log'`.           |

### Asynchronous schemas

Hooks in the web SDK run synchronously, so schemas that validate asynchronously (for example, Zod schemas with async refinements) are not supported.
They are treated as invalid, with a message saying that asynchronous validation is not supported.

## Building

Run `nx package hooks-schema-validation` to build the library.

## Running unit tests

Run `nx test hooks-schema-validation` to execute the unit tests via [Jest](https://jestjs.io).

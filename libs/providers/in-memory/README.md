# In-Memory Provider

An *extremely* simple OpenFeature provider, intended for simple demos and as a test stub.

Flag values are entirely static - evaluation context is ignored and there's no way to update the flags at runtime. 

Object values are not currently supported (but a PR implementing them would be gratefully received!)

## Installation

```
$ npm install @openfeature/in-memory-provider
```

## Usage

### set up the provider with some flag values
```
import { InMemoryProvider } from '@openfeature/in-memory-provider'
import { OpenFeature } from '@openfeature/js-sdk'

const flags = {
  'a-boolean-flag': true,
  'a-string-flag': 'the flag value',
}
const provider = new InMemoryProvider(flags)
OpenFeature.setProvider(provider)
```

### check a flag's value
```
// create a client
const client = OpenFeature.getClient('my-app');

// get that hardcoded boolean flag
const boolValue = await client.getBooleanValue('a-boolean-flag', false);
```

## Development

Run `nx package providers-in-memory` to build the library.

Run `nx test providers-in-memory` to execute the unit tests via [Jest](https://jestjs.io).

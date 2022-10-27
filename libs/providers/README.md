# OpenFeature JavaScript Providers

Providers are responsible for performing flag evaluation. They provide an abstraction between the underlying flag management system and OpenFeature itself. This allows providers to be changed without requiring a major code refactor. Please see the [spec](https://github.com/open-feature/spec/blob/main/specification/sections/02-providers.md) for more details.

## Add a new provider

1.  `npm ci`
1.  `npm run generate-provider`

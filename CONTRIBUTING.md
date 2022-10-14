# Contributing

## System Requirements

node 16+, npm 8+ are recommended.

## Compilation target(s)

We target `es2015`, and require all modules to publish both ES-modules and CommonJS modules. The generators described below will configure this automatically.

## Adding a module

The project is a monorepo that uses NX to manage it's modules.

The project has some NX generators for creating [hooks](https://docs.openfeature.dev/docs/reference/concepts/hooks) and [providers](https://docs.openfeature.dev/docs/reference/concepts/provider).

`npm run generate-hook` <- generates a hook module
`npm run generate-provider` <- generates a provider module

The script will create the basic code scaffolding, and infrastructure to publish the artifact.

## Documentation

Any published modules must have documentation in their root directory, explaining the basic purpose of the module as well as installation and usage instructions.
Instructions for how to develop a module should also be included (required system dependencies, instructions for testing locally, etc).

## Testing

Any published modules must have reasonable test coverage.
The NX scaffolding will generate stub tests for you when you create your project.

Use `npm run test` to test the entire project.
Use `npx nx test {MODULE NAME}` to test just a single module.

## Versioning and releasing

As described in the [README](./README.md), this project uses release-please, and semantic versioning.
Breaking changes should be identified by using a semantic PR title.

## Dependencies

Keep dependencies to a minimum, especially non-dev dependencies.
The JS-SDK should be a _peer dependency_ of your module.
Run `npm run package`, and then verify the dependencies in `dist/libs/{MODULE_PATH}/package.json` are appropriate.
Keep in mind, though one version of the JS-SDK is used for all modules in testing, each module may have a different peer-dependency requirement for the JS-SDK (e.g: one module may require ^1.2.0 while another might require ^1.4.0).
Be sure to properly express the JS-SDK peer dependency version your module requires.
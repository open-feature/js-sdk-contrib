# Contributing

## Creating a new sub-project

The project is a monorepo that uses NX to manage it's components.

The project has some NX generators for creating [hooks](https://docs.openfeature.dev/docs/reference/concepts/hooks) and [providers](https://docs.openfeature.dev/docs/reference/concepts/provider).

`npm run generate-hook` <- generates a hook component
`npm run generate-provider` <- generates a provider component

The script will create the basic code scaffolding, and infrastructure to publish the artifact.

## Documentation

Any published components must have documentation in their root directory, explaining the basic purpose of the component as well as installation and usage instructions.
Instructions for how to develop a component should also be included (required system dependencies, instructions for testing locally, etc).

## Testing

Any published components must have reasonable test coverage.
The NX scaffolding will generate stub tests for you when you create your project.

## Versioning and releasing

As described in the [README](./README.md), this project uses release-please, and semantic versioning.
Breaking changes should be identified by using a semantic PR title.
Keep in mind, though one version of the JS-SDK is used for all components, each component may have a different peer-dependency requirement for the JS-SDK (e.g: one component may require ^1.2.0 while another might require ^1.4.0).
Be sure to properly express the JS-SDK peer dependency version your component needs. 
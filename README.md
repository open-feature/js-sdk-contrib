# OpenFeature Node Contributions

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)
![Alpha](https://img.shields.io/badge/alpha-release-red)

This repository is intended for OpenFeature contributions which are not included in the [OpenFeature SDK](https://github.com/open-feature/node-sdk).

The project includes:

- [Providers](./libs/providers)
- [Hooks](./libs/hooks)

## Releases

This repo uses _Release Please_ to release packages. Release Please sets up a running PR that tracks all changes for the library components, and maintains the versions according to [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/), generated when [PRs are merged](https://github.com/amannn/action-semantic-pull-request). When Release Please's running PR is merged, any changed artifacts are published.

## License

Apache 2.0 - See [LICENSE](./license) for more information.

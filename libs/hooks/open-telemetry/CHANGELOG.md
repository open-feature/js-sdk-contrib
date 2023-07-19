# Changelog

## [0.2.2](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hooks-v0.2.1...open-telemetry-hooks-v0.2.2) (2023-07-19)


### 🐛 Bug Fixes

* otel metric semantic convs ([#475](https://github.com/open-feature/js-sdk-contrib/issues/475)) ([6febfb0](https://github.com/open-feature/js-sdk-contrib/commit/6febfb0d09849fb4a722af2c1333ebb4b2386684))

## [0.2.1](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hooks-v0.2.0...open-telemetry-hooks-v0.2.1) (2023-07-12)


### 🐛 Bug Fixes

* update README to remove deprecation ([#465](https://github.com/open-feature/js-sdk-contrib/issues/465)) ([ac5b91b](https://github.com/open-feature/js-sdk-contrib/commit/ac5b91b60eaf39b31fc9899f20ad4fef792a50e8))

## [0.2.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hooks-v0.1.0...open-telemetry-hooks-v0.2.0) (2023-07-12)


### ⤴️ Upgrade Instructions

* if upgrading from `@openfeature/open-telemetry-hook`,  import and use `TracingHook` instead of `OpenTelemetryHook`

### ✨ New Features

* add metrics hook ([#448](https://github.com/open-feature/js-sdk-contrib/issues/448)) ([131db1e](https://github.com/open-feature/js-sdk-contrib/commit/131db1ef47962288e1c7723e768296307d06837b))

## [6.0.2](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v6.0.1...open-telemetry-hook-v6.0.2) (2023-07-12)


###  ⚠️ Deprecation warning

* the `@openfeature/open-telemetry-hook` package is now deprecated, use `@openfeature/open-telemetry-hooks` instead

### 🧹 Chore

* correct publish executor ([#378](https://github.com/open-feature/js-sdk-contrib/issues/378)) ([395ed18](https://github.com/open-feature/js-sdk-contrib/commit/395ed186de8811ae249f087821fdbdf8899c19f2))
* **deps:** update dependency @openfeature/js-sdk to v1.3.1 ([#409](https://github.com/open-feature/js-sdk-contrib/issues/409)) ([5bf9932](https://github.com/open-feature/js-sdk-contrib/commit/5bf993208825e3e1eded941decc067125935d912))
* migrate to nx 16 ([#366](https://github.com/open-feature/js-sdk-contrib/issues/366)) ([7a9c201](https://github.com/open-feature/js-sdk-contrib/commit/7a9c201d16fd7f070a1bcd2e359487ba6e7b78d7))


### 🐛 Bug Fixes

* deprecate otel hook ([#449](https://github.com/open-feature/js-sdk-contrib/issues/449)) ([58aa56c](https://github.com/open-feature/js-sdk-contrib/commit/58aa56cdc13ee5177b64a0a1e126b9d31c8d5756))

## [6.0.1](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v6.0.0...open-telemetry-hook-v6.0.1) (2023-01-19)


### Bug Fixes

* module issues with types ([#212](https://github.com/open-feature/js-sdk-contrib/issues/212)) ([d2b97dd](https://github.com/open-feature/js-sdk-contrib/commit/d2b97dd24c952661ce08724a84e4b312860a9211))

## [6.0.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v5.1.1...open-telemetry-hook-v6.0.0) (2022-12-29)


### ⚠ BREAKING CHANGES

* update the otel hook to be spec compliant ([#179](https://github.com/open-feature/js-sdk-contrib/issues/179))

### Features

* update the otel hook to be spec compliant ([#179](https://github.com/open-feature/js-sdk-contrib/issues/179)) ([69b2163](https://github.com/open-feature/js-sdk-contrib/commit/69b2163be1729697ebc69549aa8fb6e61be1b94d))


### Bug Fixes

* fix ESM and web polyfills issue ([#201](https://github.com/open-feature/js-sdk-contrib/issues/201)) ([acee6e1](https://github.com/open-feature/js-sdk-contrib/commit/acee6e1817a7846251f456455a7218bf98efb00e))

## [5.1.1](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v5.1.0...open-telemetry-hook-v5.1.1) (2022-12-09)


### Bug Fixes

* correct dependencies ([#182](https://github.com/open-feature/js-sdk-contrib/issues/182)) ([16cbe42](https://github.com/open-feature/js-sdk-contrib/commit/16cbe421d6255bd95a78c3914890a63adcce831e))

## [5.0.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v4.0.0...open-telemetry-hook-v5.0.0) (2022-10-19)


### ⚠ BREAKING CHANGES

* update OpenFeature SDK version (#137)

### Miscellaneous Chores

* update OpenFeature SDK version ([#137](https://github.com/open-feature/js-sdk-contrib/issues/137)) ([245f024](https://github.com/open-feature/js-sdk-contrib/commit/245f02441d62f7f42627174737943f1556a6a326))

## [4.0.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v3.0.0...open-telemetry-hook-v4.0.0) (2022-10-03)


### ⚠ BREAKING CHANGES

* migrate to sdk 0.5.0 (#114)

### Features

* migrate to sdk 0.5.0 ([#114](https://github.com/open-feature/js-sdk-contrib/issues/114)) ([f9e9a55](https://github.com/open-feature/js-sdk-contrib/commit/f9e9a55ad5a16e99bb169fdf1a8d11c959520f7b))

## [3.0.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v2.0.0...open-telemetry-hook-v3.0.0) (2022-09-20)


### ⚠ BREAKING CHANGES

* update to js-sdk (#108)

### Features

* update to js-sdk ([#108](https://github.com/open-feature/js-sdk-contrib/issues/108)) ([60d6146](https://github.com/open-feature/js-sdk-contrib/commit/60d6146e30d3ca547e940c3ba441d80fd75d886d))

## [2.0.0](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.2.3...open-telemetry-hook-v2.0.0) (2022-08-15)


### ⚠ BREAKING CHANGES

* set openfeature sdk min version to 0.2.0 (#93)

### Features

* Update OTel hook to latest semantic convention ([#65](https://github.com/open-feature/js-sdk-contrib/issues/65)) ([0dd7802](https://github.com/open-feature/js-sdk-contrib/commit/0dd780271fabd7aa7c503a48bff75bebb63b46b9))


### Bug Fixes

* add test ([#71](https://github.com/open-feature/js-sdk-contrib/issues/71)) ([080fc4b](https://github.com/open-feature/js-sdk-contrib/commit/080fc4b3c926728361ad34d6763df7bc2d5ab023))
* change test name ([#75](https://github.com/open-feature/js-sdk-contrib/issues/75)) ([abac20d](https://github.com/open-feature/js-sdk-contrib/commit/abac20d29f54865a18662baacaeb60fb5d8c8175))
* set openfeature sdk min version to 0.2.0 ([#93](https://github.com/open-feature/js-sdk-contrib/issues/93)) ([a733102](https://github.com/open-feature/js-sdk-contrib/commit/a733102f523f9289fdce356a342828cc2e020f48))
* shell scripts in templates ([#73](https://github.com/open-feature/js-sdk-contrib/issues/73)) ([89c8cfe](https://github.com/open-feature/js-sdk-contrib/commit/89c8cfe981348376995f50ca757299077249544e))

## [1.2.3-alpha](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.2.2-alpha...open-telemetry-hook-v1.2.3-alpha) (2022-07-21)


### Bug Fixes

* change test name ([#75](https://github.com/open-feature/js-sdk-contrib/issues/75)) ([abac20d](https://github.com/open-feature/js-sdk-contrib/commit/abac20d29f54865a18662baacaeb60fb5d8c8175))

## [1.2.2-alpha](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.2.1-alpha...open-telemetry-hook-v1.2.2-alpha) (2022-07-21)


### Bug Fixes

* shell scripts in templates ([#73](https://github.com/open-feature/js-sdk-contrib/issues/73)) ([89c8cfe](https://github.com/open-feature/js-sdk-contrib/commit/89c8cfe981348376995f50ca757299077249544e))

## [1.2.1-alpha](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.2.0-alpha...open-telemetry-hook-v1.2.1-alpha) (2022-07-21)


### Bug Fixes

* add test ([#71](https://github.com/open-feature/js-sdk-contrib/issues/71)) ([080fc4b](https://github.com/open-feature/js-sdk-contrib/commit/080fc4b3c926728361ad34d6763df7bc2d5ab023))

## [1.2.0-alpha](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.1.0-alpha...open-telemetry-hook-v1.2.0-alpha) (2022-07-21)


### Features

* Update OTel hook to latest semantic convention ([#65](https://github.com/open-feature/js-sdk-contrib/issues/65)) ([0dd7802](https://github.com/open-feature/js-sdk-contrib/commit/0dd780271fabd7aa7c503a48bff75bebb63b46b9))

## [1.1.0-alpha](https://github.com/open-feature/js-sdk-contrib/compare/open-telemetry-hook-v1.0.6-alpha...open-telemetry-hook-v1.1.0-alpha) (2022-07-21)


### Features

* Update OTel hook to latest semantic convention ([#65](https://github.com/open-feature/js-sdk-contrib/issues/65)) ([0dd7802](https://github.com/open-feature/js-sdk-contrib/commit/0dd780271fabd7aa7c503a48bff75bebb63b46b9))

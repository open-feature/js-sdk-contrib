# Changelog

## [0.2.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.2.1...flagd-core-v0.2.2) (2024-05-23)


### 🐛 Bug Fixes

* update json logic engine and schema ([#914](https://github.com/open-feature/js-sdk-contrib/issues/914)) ([04f0dfd](https://github.com/open-feature/js-sdk-contrib/commit/04f0dfd1427dbd529bd2d650dfa27f25e89f7e07))

## [0.2.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.2.0...flagd-core-v0.2.1) (2024-04-16)


### ✨ New Features

* add targeting validation/warning ([#878](https://github.com/open-feature/js-sdk-contrib/issues/878)) ([2a4dbcf](https://github.com/open-feature/js-sdk-contrib/commit/2a4dbcf0daa6b55e7cc73aa9b4a1fb481054e752))

## [0.2.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.11...flagd-core-v0.2.0) (2024-04-15)


### ⚠ BREAKING CHANGES

* allow overrides for fractional seed ([#870](https://github.com/open-feature/js-sdk-contrib/issues/870))

### ✨ New Features

* allow overrides for fractional seed ([#870](https://github.com/open-feature/js-sdk-contrib/issues/870)) ([6c376b2](https://github.com/open-feature/js-sdk-contrib/commit/6c376b2f525be04c15b5c3bd32d89cc9c4c66729))

## [0.1.11](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.10...flagd-core-v0.1.11) (2024-02-14)


### 🐛 Bug Fixes

* init in-process error, throw on invalid rules ([#767](https://github.com/open-feature/js-sdk-contrib/issues/767)) ([e9f9e74](https://github.com/open-feature/js-sdk-contrib/commit/e9f9e74d66e9f8666eebb8d06141fce713c7914c))

## [0.1.10](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.9...flagd-core-v0.1.10) (2024-01-30)


### 🐛 Bug Fixes

* falsy boolean shorthand logic ([#746](https://github.com/open-feature/js-sdk-contrib/issues/746)) ([0772c90](https://github.com/open-feature/js-sdk-contrib/commit/0772c90c10906e47109567ba1ac35fe8b38fbe74))

## [0.1.9](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.8...flagd-core-v0.1.9) (2024-01-29)


### 🐛 Bug Fixes

* update disabled behavior to match spec  ([#744](https://github.com/open-feature/js-sdk-contrib/issues/744)) ([3f6b4f4](https://github.com/open-feature/js-sdk-contrib/commit/3f6b4f43e7e79a70517d1d654355cf4b82a31188))

## [0.1.8](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.7...flagd-core-v0.1.8) (2024-01-08)


### 🧹 Chore

* throw ParseError on invalid flagd config ([#714](https://github.com/open-feature/js-sdk-contrib/issues/714)) ([837bf08](https://github.com/open-feature/js-sdk-contrib/commit/837bf0887a8b68e6418963160344af1aaeabbf0a))

## [0.1.7](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.6...flagd-core-v0.1.7) (2023-12-18)


### 🐛 Bug Fixes

* re-add browser support ([#706](https://github.com/open-feature/js-sdk-contrib/issues/706)) ([c262c66](https://github.com/open-feature/js-sdk-contrib/commit/c262c66497e0cc7d8b7ea2d9cc5b85f5d31093e6))

## [0.1.6](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.5...flagd-core-v0.1.6) (2023-12-18)


### ✨ New Features

* **flagd-core:** add update config support, returns changed keys ([#703](https://github.com/open-feature/js-sdk-contrib/issues/703)) ([fa393a6](https://github.com/open-feature/js-sdk-contrib/commit/fa393a6c03ddeacc2899db4d4911cb06712211ba))

## [0.1.5](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.4...flagd-core-v0.1.5) (2023-12-15)


### 🐛 Bug Fixes

* treat empty targeting rules as static ([#696](https://github.com/open-feature/js-sdk-contrib/issues/696)) ([8bff89d](https://github.com/open-feature/js-sdk-contrib/commit/8bff89d023486734a739dbdfb016b2966ec43436))

## [0.1.4](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.3...flagd-core-v0.1.4) (2023-12-13)


### 🐛 Bug Fixes

* fixed issue with nested fractional evaluations ([#686](https://github.com/open-feature/js-sdk-contrib/issues/686)) ([e0dbfdb](https://github.com/open-feature/js-sdk-contrib/commit/e0dbfdb2c73b45bdbadb22b4198b0134e395548a))


### 🧹 Chore

* improve logger, parsing and add helpers ([#689](https://github.com/open-feature/js-sdk-contrib/issues/689)) ([fa0a238](https://github.com/open-feature/js-sdk-contrib/commit/fa0a238bc4533e431e2c2969303866e74f4f181f))

## [0.1.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.2...flagd-core-v0.1.3) (2023-12-06)


### 🐛 Bug Fixes

* "in" op by using json-logic-js ([#671](https://github.com/open-feature/js-sdk-contrib/issues/671)) ([4b5e2fe](https://github.com/open-feature/js-sdk-contrib/commit/4b5e2fe5cf89385a8cf5e6be5b4bc0a50d4b791d))
* orphaned grpc connection, semver ~, change events ([#654](https://github.com/open-feature/js-sdk-contrib/issues/654)) ([5afbea7](https://github.com/open-feature/js-sdk-contrib/commit/5afbea754983f95858bf1bdfd15ab51793b0b72e))

## [0.1.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.1...flagd-core-v0.1.2) (2023-11-14)


### 🐛 Bug Fixes

* false positive of a falsy variant value check ([#651](https://github.com/open-feature/js-sdk-contrib/issues/651)) ([1c7dc66](https://github.com/open-feature/js-sdk-contrib/commit/1c7dc660d15e00f84ad303d373417f8bb7b71966))


### 🧹 Chore

* address lint issues ([#642](https://github.com/open-feature/js-sdk-contrib/issues/642)) ([bbd9aee](https://github.com/open-feature/js-sdk-contrib/commit/bbd9aee896dc4a0817f379b799a1b8d331ee76c6))

## [0.1.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-core-v0.1.0...flagd-core-v0.1.1) (2023-11-02)


### ✨ New Features

* flagd-core json logic evaluator ([#623](https://github.com/open-feature/js-sdk-contrib/issues/623)) ([72eacd3](https://github.com/open-feature/js-sdk-contrib/commit/72eacd33ab7147d7348ee125c57282bccd3af9d5))
* Initial version of the flagd js core ([#620](https://github.com/open-feature/js-sdk-contrib/issues/620)) ([8fac8cb](https://github.com/open-feature/js-sdk-contrib/commit/8fac8cb902c8803200b3dbc74eace3d623746b4e))


### 🧹 Chore

* make @openfeature/core peer of flagd/core ([#631](https://github.com/open-feature/js-sdk-contrib/issues/631)) ([3db7c0c](https://github.com/open-feature/js-sdk-contrib/commit/3db7c0c739c84be9fa9cedb87b5e0521a1a0d89c))

# Changelog

## [0.7.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.7.2...flagd-web-provider-v0.7.3) (2025-03-19)


### ✨ New Features

* **flagd:** add flag metadata ([#1151](https://github.com/open-feature/js-sdk-contrib/issues/1151)) ([b1c6d23](https://github.com/open-feature/js-sdk-contrib/commit/b1c6d235565f6cce02519d7c08bb6ad2dd791332))


### 🧹 Chore

* **deps:** update libs/providers/flagd-web/schemas digest to 37baa2c ([#1148](https://github.com/open-feature/js-sdk-contrib/issues/1148)) ([36ec82a](https://github.com/open-feature/js-sdk-contrib/commit/36ec82a5581e436b699d4b8238908fa4d5817deb))
* **deps:** update libs/providers/flagd-web/schemas digest to b81a56e ([#1131](https://github.com/open-feature/js-sdk-contrib/issues/1131)) ([828145a](https://github.com/open-feature/js-sdk-contrib/commit/828145a89da13bbd90bca352a6488aecb62b764b))
* **deps:** update libs/providers/flagd-web/schemas digest to bb76343 ([#1167](https://github.com/open-feature/js-sdk-contrib/issues/1167)) ([cb7bdb1](https://github.com/open-feature/js-sdk-contrib/commit/cb7bdb12a19ea403eb834d0eb552f30b42921b6b))
* removing build dependencies and using testcontainers for container spin up ([#982](https://github.com/open-feature/js-sdk-contrib/issues/982)) ([2d64331](https://github.com/open-feature/js-sdk-contrib/commit/2d6433101b76ba9ad266095fe31b58314f82a105))
* update nx packages ([#1147](https://github.com/open-feature/js-sdk-contrib/issues/1147)) ([7f310fe](https://github.com/open-feature/js-sdk-contrib/commit/7f310fe87101b8aa793e1436e63c7602ccc202e3))
* various gherkin improvements for e2e tests ([#1008](https://github.com/open-feature/js-sdk-contrib/issues/1008)) ([40abd8e](https://github.com/open-feature/js-sdk-contrib/commit/40abd8eca76b47bb5c084b377302821968acd19c))

## [0.7.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.7.1...flagd-web-provider-v0.7.2) (2024-07-08)


### ✨ New Features

* Change fractional custom op from percentage-based to relative weighting. [#946](https://github.com/open-feature/js-sdk-contrib/issues/946) ([#954](https://github.com/open-feature/js-sdk-contrib/issues/954)) ([0e9bc84](https://github.com/open-feature/js-sdk-contrib/commit/0e9bc842cf09de12e8445dcb4e0e8b3623c66099))

## [0.7.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.7.0...flagd-web-provider-v0.7.1) (2024-04-26)


### ✨ New Features

* Add interceptors to flagd options. ([#894](https://github.com/open-feature/js-sdk-contrib/issues/894)) ([878b7b6](https://github.com/open-feature/js-sdk-contrib/commit/878b7b6e11853a8dcc2952e5767b7d275de72313))

## [0.7.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.6.0...flagd-web-provider-v0.7.0) (2024-04-18)


### ⚠ BREAKING CHANGES

* allow overrides for fractional seed ([#870](https://github.com/open-feature/js-sdk-contrib/issues/870))

### ✨ New Features

* allow overrides for fractional seed ([#870](https://github.com/open-feature/js-sdk-contrib/issues/870)) ([6c376b2](https://github.com/open-feature/js-sdk-contrib/commit/6c376b2f525be04c15b5c3bd32d89cc9c4c66729))


### 🧹 Chore

* migrate from bufbuild to connectrpc ([#891](https://github.com/open-feature/js-sdk-contrib/issues/891)) ([df7b89d](https://github.com/open-feature/js-sdk-contrib/commit/df7b89d519da793f64bb6cba0984a7bf4764bafa))

## [0.6.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.5.1...flagd-web-provider-v0.6.0) (2024-03-19)


### ⚠ BREAKING CHANGES

* update OpenFeature SDK peer ([#798](https://github.com/open-feature/js-sdk-contrib/issues/798))

### ✨ New Features

* update OpenFeature SDK peer ([#798](https://github.com/open-feature/js-sdk-contrib/issues/798)) ([ebd16b9](https://github.com/open-feature/js-sdk-contrib/commit/ebd16b9630bcc6b253a7061a144e8d476cd8b586))

## [0.5.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.5.0...flagd-web-provider-v0.5.1) (2024-02-15)


### ✨ New Features

* use updated proto ([#773](https://github.com/open-feature/js-sdk-contrib/issues/773)) ([437bbe4](https://github.com/open-feature/js-sdk-contrib/commit/437bbe4334ef8104d27bb40e9c109164f2a25ca5))

## [0.5.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.4.1...flagd-web-provider-v0.5.0) (2024-02-14)


### ⚠ BREAKING CHANGES

* use new eval/sync protos (requires flagd v0.7.3+)  ([#762](https://github.com/open-feature/js-sdk-contrib/issues/762))

### ✨ New Features

* use new eval/sync protos (requires flagd v0.7.3+)  ([#762](https://github.com/open-feature/js-sdk-contrib/issues/762)) ([4da9deb](https://github.com/open-feature/js-sdk-contrib/commit/4da9deb48c6bd0c106b176fc7e3730cf50e60b6d))

## [0.4.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.4.0...flagd-web-provider-v0.4.1) (2023-12-15)


### 🐛 Bug Fixes

* packaging issues impacting babel/react ([#596](https://github.com/open-feature/js-sdk-contrib/issues/596)) ([0446eab](https://github.com/open-feature/js-sdk-contrib/commit/0446eab5cf9b45ce7de251b4f5feb8df1d499b9d))
* tsc issue with flagd-web proto output ([#695](https://github.com/open-feature/js-sdk-contrib/issues/695)) ([65e448c](https://github.com/open-feature/js-sdk-contrib/commit/65e448ce852bcdb06d76c412dd4577be07a165ce))


### 🧹 Chore

* add e2e tests for flagd ([#554](https://github.com/open-feature/js-sdk-contrib/issues/554)) ([9ecdcdf](https://github.com/open-feature/js-sdk-contrib/commit/9ecdcdf1660fe27afb4b0c58160c7ba687e29be2))
* address lint issues ([#642](https://github.com/open-feature/js-sdk-contrib/issues/642)) ([bbd9aee](https://github.com/open-feature/js-sdk-contrib/commit/bbd9aee896dc4a0817f379b799a1b8d331ee76c6))
* update nx, run migrations ([#552](https://github.com/open-feature/js-sdk-contrib/issues/552)) ([a88d8fc](https://github.com/open-feature/js-sdk-contrib/commit/a88d8fc097789fd7f56011e6ebb66070f52c6e56))
* use spec submodule ([#568](https://github.com/open-feature/js-sdk-contrib/issues/568)) ([3feb18e](https://github.com/open-feature/js-sdk-contrib/commit/3feb18e0ffa77b87e799a2b5250413f03a4c69e9))

## [0.4.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.5...flagd-web-provider-v0.4.0) (2023-07-31)


### ⚠ BREAKING CHANGES

* update required web-sdk peer ([#514](https://github.com/open-feature/js-sdk-contrib/issues/514))

### 🧹 Chore

* fix submodule race ([#509](https://github.com/open-feature/js-sdk-contrib/issues/509)) ([a427a00](https://github.com/open-feature/js-sdk-contrib/commit/a427a0006ada4d54f5d83ae2d3167a87f6635e81))
* update required web-sdk peer ([#514](https://github.com/open-feature/js-sdk-contrib/issues/514)) ([8d45c02](https://github.com/open-feature/js-sdk-contrib/commit/8d45c0245472ddb196ef846a14829d18131d23d0))

## [0.3.5](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.4...flagd-web-provider-v0.3.5) (2023-07-27)


### 🐛 Bug Fixes

* add status to flagd web ([#497](https://github.com/open-feature/js-sdk-contrib/issues/497)) ([276a740](https://github.com/open-feature/js-sdk-contrib/commit/276a740ba4c8320f6633fe104bd0d3e6f2a87d0d))


### 🧹 Chore

* migrate buf ([#456](https://github.com/open-feature/js-sdk-contrib/issues/456)) ([8568af1](https://github.com/open-feature/js-sdk-contrib/commit/8568af1e26f92f4d0e9a942b9fc3e001d919ef03))
* migrate to nx 16 ([#366](https://github.com/open-feature/js-sdk-contrib/issues/366)) ([7a9c201](https://github.com/open-feature/js-sdk-contrib/commit/7a9c201d16fd7f070a1bcd2e359487ba6e7b78d7))

## [0.3.4](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.3...flagd-web-provider-v0.3.4) (2023-04-24)


### 🐛 Bug Fixes

* add shutdown to flagd-web provider ([#325](https://github.com/open-feature/js-sdk-contrib/issues/325)) ([cbc76ed](https://github.com/open-feature/js-sdk-contrib/commit/cbc76edba964d7a8f453334ec8f0c4aca9070c3c))

## [0.3.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.2...flagd-web-provider-v0.3.3) (2023-04-06)


### ✨ New Features

* use new event emitter ([#305](https://github.com/open-feature/js-sdk-contrib/issues/305)) ([7b5613e](https://github.com/open-feature/js-sdk-contrib/commit/7b5613e6b3258b2d74fdc8acf4f0ed6d2cdcf74a))

## [0.3.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.1...flagd-web-provider-v0.3.2) (2023-03-23)


### 🐛 Bug Fixes

* issue where context updates somtimes missed ([#282](https://github.com/open-feature/js-sdk-contrib/issues/282)) ([0a63977](https://github.com/open-feature/js-sdk-contrib/commit/0a639776ee404b271002e259ce63c11ac6102125))

## [0.3.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.3.0...flagd-web-provider-v0.3.1) (2023-03-23)


### 🐛 Bug Fixes

* reconnect, tests ([#280](https://github.com/open-feature/js-sdk-contrib/issues/280)) ([9cb4da9](https://github.com/open-feature/js-sdk-contrib/commit/9cb4da961fe45684630f4045bc1007b10eef75b2))

## [0.3.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.2.0...flagd-web-provider-v0.3.0) (2023-03-22)


### ⚠ BREAKING CHANGES

* use init, events ([#278](https://github.com/open-feature/js-sdk-contrib/issues/278))

### ✨ New Features

* use init, events ([#278](https://github.com/open-feature/js-sdk-contrib/issues/278)) ([5cc817c](https://github.com/open-feature/js-sdk-contrib/commit/5cc817cb15f53365747875cea05f15fef9c37841))

## [0.2.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.1.4...flagd-web-provider-v0.2.0) (2023-03-20)


### ⚠ BREAKING CHANGES

* flagd-web uses bulk resolution ([#238](https://github.com/open-feature/js-sdk-contrib/issues/238))

### 🧹 Chore

* temporarily remove flagd-web ([#215](https://github.com/open-feature/js-sdk-contrib/issues/215)) ([030e026](https://github.com/open-feature/js-sdk-contrib/commit/030e02632885a906a8dd4abd940f5d399e6f58c4))


### ✨ New Features

* flagd-web uses bulk resolution ([#238](https://github.com/open-feature/js-sdk-contrib/issues/238)) ([8aeeb1d](https://github.com/open-feature/js-sdk-contrib/commit/8aeeb1d198f766400b00f8aeda1e3daa84e268bf))

## [0.1.4](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.1.3...flagd-web-provider-v0.1.4) (2023-01-19)


### Bug Fixes

* module issues with types ([#212](https://github.com/open-feature/js-sdk-contrib/issues/212)) ([d2b97dd](https://github.com/open-feature/js-sdk-contrib/commit/d2b97dd24c952661ce08724a84e4b312860a9211))

## [0.1.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.1.2...flagd-web-provider-v0.1.3) (2022-12-29)


### Bug Fixes

* fix ESM and web polyfills issue ([#201](https://github.com/open-feature/js-sdk-contrib/issues/201)) ([acee6e1](https://github.com/open-feature/js-sdk-contrib/commit/acee6e1817a7846251f456455a7218bf98efb00e))

## [0.1.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.1.1...flagd-web-provider-v0.1.2) (2022-12-09)


### Bug Fixes

* correct dependencies ([#182](https://github.com/open-feature/js-sdk-contrib/issues/182)) ([16cbe42](https://github.com/open-feature/js-sdk-contrib/commit/16cbe421d6255bd95a78c3914890a63adcce831e))

## [0.1.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-web-provider-v0.1.0...flagd-web-provider-v0.1.1) (2022-12-09)


### Features

* flagd-web provider ([#142](https://github.com/open-feature/js-sdk-contrib/issues/142)) ([bd83124](https://github.com/open-feature/js-sdk-contrib/commit/bd8312418fbfab16d77a4ec069d3ff9452f7f744))

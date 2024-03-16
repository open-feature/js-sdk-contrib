# Changelog

## [0.12.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.11.1...flagd-provider-v0.12.0) (2024-03-16)


### ⚠ BREAKING CHANGES

* update OpenFeature SDK peer ([#798](https://github.com/open-feature/js-sdk-contrib/issues/798))

### ✨ New Features

* update OpenFeature SDK peer ([#798](https://github.com/open-feature/js-sdk-contrib/issues/798)) ([ebd16b9](https://github.com/open-feature/js-sdk-contrib/commit/ebd16b9630bcc6b253a7061a144e8d476cd8b586))


### 📚 Documentation

* fix resolve type environment variable ([eaf7788](https://github.com/open-feature/js-sdk-contrib/commit/eaf7788e028a0c91cab4d6bf5b5645456aef0904))

## [0.11.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.11.0...flagd-provider-v0.11.1) (2024-02-15)


### ✨ New Features

* use updated proto ([#770](https://github.com/open-feature/js-sdk-contrib/issues/770)) ([5405af5](https://github.com/open-feature/js-sdk-contrib/commit/5405af57d0ecaa64796dc87c90e98d83fe246e6c))

## [0.11.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.5...flagd-provider-v0.11.0) (2024-02-14)


### ⚠ BREAKING CHANGES

* use new eval/sync protos (requires flagd v0.7.3+)  ([#762](https://github.com/open-feature/js-sdk-contrib/issues/762))

### 🐛 Bug Fixes

* init in-process error, throw on invalid rules ([#767](https://github.com/open-feature/js-sdk-contrib/issues/767)) ([e9f9e74](https://github.com/open-feature/js-sdk-contrib/commit/e9f9e74d66e9f8666eebb8d06141fce713c7914c))


### ✨ New Features

* use new eval/sync protos (requires flagd v0.7.3+)  ([#762](https://github.com/open-feature/js-sdk-contrib/issues/762)) ([4da9deb](https://github.com/open-feature/js-sdk-contrib/commit/4da9deb48c6bd0c106b176fc7e3730cf50e60b6d))


### 🧹 Chore

* **deps:** update dependency @grpc/grpc-js to ~1.8.0 || ~1.9.0 || ~1.10.0 ([#764](https://github.com/open-feature/js-sdk-contrib/issues/764)) ([c05bf9d](https://github.com/open-feature/js-sdk-contrib/commit/c05bf9d8b5980f60611e92a2bab024306e397ec0))

## [0.10.5](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.4...flagd-provider-v0.10.5) (2024-01-30)


### ✨ New Features

* add offline mode file path env ([#751](https://github.com/open-feature/js-sdk-contrib/issues/751)) ([4ff73e7](https://github.com/open-feature/js-sdk-contrib/commit/4ff73e787693cd2e783200e6c165352a2906185b))

## [0.10.4](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.3...flagd-provider-v0.10.4) (2024-01-10)


### ✨ New Features

* add flag metadata to in-process evaluator ([#709](https://github.com/open-feature/js-sdk-contrib/issues/709)) ([2a4c50b](https://github.com/open-feature/js-sdk-contrib/commit/2a4c50b9675ca01d2c1976ddfa1b2b080bb90488))
* add offline mode, fix in-process connection edge cases ([#708](https://github.com/open-feature/js-sdk-contrib/issues/708)) ([3d56225](https://github.com/open-feature/js-sdk-contrib/commit/3d5622594befde03e74fafc7857cd7cd49ceeb59))


### 🧹 Chore

* fix lint issues and bump server sdk version ([#715](https://github.com/open-feature/js-sdk-contrib/issues/715)) ([bd57177](https://github.com/open-feature/js-sdk-contrib/commit/bd571770f3a1a01bd62663dc3473273449f96c5c))

## [0.10.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.2...flagd-provider-v0.10.3) (2023-12-13)


### 🧹 Chore

* improve logger, parsing and add helpers ([#689](https://github.com/open-feature/js-sdk-contrib/issues/689)) ([fa0a238](https://github.com/open-feature/js-sdk-contrib/commit/fa0a238bc4533e431e2c2969303866e74f4f181f))
* update min flagd core to ~0.1.4 ([9afcc19](https://github.com/open-feature/js-sdk-contrib/commit/9afcc194e473fcc37efca5c6eb2d21a1dc71f567))

## [0.10.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.1...flagd-provider-v0.10.2) (2023-12-12)


### 🐛 Bug Fixes

* hanging grpc handles after shutdown ([#683](https://github.com/open-feature/js-sdk-contrib/issues/683)) ([848d7ae](https://github.com/open-feature/js-sdk-contrib/commit/848d7ae844ced7938531c9606bdbddb8fa68a2d7))

## [0.10.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.10.0...flagd-provider-v0.10.1) (2023-12-06)


### 🐛 Bug Fixes

* "in" op error, update core ([#675](https://github.com/open-feature/js-sdk-contrib/issues/675)) ([69944a8](https://github.com/open-feature/js-sdk-contrib/commit/69944a8117625b83704284e35a2ad807c63f8420))

## [0.10.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.9.0...flagd-provider-v0.10.0) (2023-11-28)


### ⚠ BREAKING CHANGES

* reconnect, missing and duped events, remove max reconnect ([#660](https://github.com/open-feature/js-sdk-contrib/issues/660))

### 🐛 Bug Fixes

* orphaned grpc connection, semver ~, change events ([#654](https://github.com/open-feature/js-sdk-contrib/issues/654)) ([5afbea7](https://github.com/open-feature/js-sdk-contrib/commit/5afbea754983f95858bf1bdfd15ab51793b0b72e))
* reconnect, missing and duped events, remove max reconnect ([#660](https://github.com/open-feature/js-sdk-contrib/issues/660)) ([8489c2f](https://github.com/open-feature/js-sdk-contrib/commit/8489c2f47ea3a619c3b430edffb00f3cabeb2e1e))


### ✨ New Features

* flagd in-process provider ([#633](https://github.com/open-feature/js-sdk-contrib/issues/633)) ([2213946](https://github.com/open-feature/js-sdk-contrib/commit/2213946d9aa69c9e86325543c8ac60fbc5319d08))


### 🧹 Chore

* **deps:** update dependency @grpc/grpc-js to ~1.8.0 || ~1.9.0 ([#662](https://github.com/open-feature/js-sdk-contrib/issues/662)) ([2b977c2](https://github.com/open-feature/js-sdk-contrib/commit/2b977c266cbb874e0c245e7200237acfceafbb9e))

## [0.9.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.8.3...flagd-provider-v0.9.0) (2023-10-11)


### ⚠ BREAKING CHANGES

* use @openfeature/server-sdk peer ([#608](https://github.com/open-feature/js-sdk-contrib/issues/608))

### 🐛 Bug Fixes

* packaging issues impacting babel/react ([#596](https://github.com/open-feature/js-sdk-contrib/issues/596)) ([0446eab](https://github.com/open-feature/js-sdk-contrib/commit/0446eab5cf9b45ce7de251b4f5feb8df1d499b9d))


### 🧹 Chore

* add e2e tests for flagd ([#554](https://github.com/open-feature/js-sdk-contrib/issues/554)) ([9ecdcdf](https://github.com/open-feature/js-sdk-contrib/commit/9ecdcdf1660fe27afb4b0c58160c7ba687e29be2))
* remove un-needed zero-value handling ([#539](https://github.com/open-feature/js-sdk-contrib/issues/539)) ([552be83](https://github.com/open-feature/js-sdk-contrib/commit/552be8303892c027623ccbb43548568e00c315a6))
* update nx, run migrations ([#552](https://github.com/open-feature/js-sdk-contrib/issues/552)) ([a88d8fc](https://github.com/open-feature/js-sdk-contrib/commit/a88d8fc097789fd7f56011e6ebb66070f52c6e56))
* use @openfeature/server-sdk peer ([#608](https://github.com/open-feature/js-sdk-contrib/issues/608)) ([ae3732a](https://github.com/open-feature/js-sdk-contrib/commit/ae3732a9068f684517db28ea1ae27b29a35e6b16))
* use spec submodule ([#568](https://github.com/open-feature/js-sdk-contrib/issues/568)) ([3feb18e](https://github.com/open-feature/js-sdk-contrib/commit/3feb18e0ffa77b87e799a2b5250413f03a4c69e9))

## [0.8.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.8.2...flagd-provider-v0.8.3) (2023-08-12)


### 🐛 Bug Fixes

* unhandled rejection on init ([#534](https://github.com/open-feature/js-sdk-contrib/issues/534)) ([b24b580](https://github.com/open-feature/js-sdk-contrib/commit/b24b580b20f942f192e7bbd68cc8baf3147d8137))


### 🧹 Chore

* fix submodule race ([#509](https://github.com/open-feature/js-sdk-contrib/issues/509)) ([a427a00](https://github.com/open-feature/js-sdk-contrib/commit/a427a0006ada4d54f5d83ae2d3167a87f6635e81))

## [0.8.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.8.1...flagd-provider-v0.8.2) (2023-07-28)


### ✨ New Features

* add flag metadata ([#502](https://github.com/open-feature/js-sdk-contrib/issues/502)) ([c8a80c6](https://github.com/open-feature/js-sdk-contrib/commit/c8a80c6317779d61808adb75088d6d6710c6d8ea))

## [0.8.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.8.0...flagd-provider-v0.8.1) (2023-07-27)


### 🐛 Bug Fixes

* issue with flagd not disconnecting ([#495](https://github.com/open-feature/js-sdk-contrib/issues/495)) ([ff61206](https://github.com/open-feature/js-sdk-contrib/commit/ff61206f7f51fd5ec30fc85ea2742c0933384330))

## [0.8.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.7...flagd-provider-v0.8.0) (2023-07-27)


### ⚠ BREAKING CHANGES

* events, init, shutdown ([#484](https://github.com/open-feature/js-sdk-contrib/issues/484))
  * constructor arg order changed
  * 1.3.0 minimum js-sdk version

### ✨ New Features

* events, init, shutdown ([#484](https://github.com/open-feature/js-sdk-contrib/issues/484)) ([a73fc76](https://github.com/open-feature/js-sdk-contrib/commit/a73fc7670c66b2108cef8132a94433d75dea3622))


### 🧹 Chore

* migrate buf ([#456](https://github.com/open-feature/js-sdk-contrib/issues/456)) ([8568af1](https://github.com/open-feature/js-sdk-contrib/commit/8568af1e26f92f4d0e9a942b9fc3e001d919ef03))

## [0.7.7](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.6...flagd-provider-v0.7.7) (2023-07-03)


### 🧹 Chore

* migrate to nx 16 ([#366](https://github.com/open-feature/js-sdk-contrib/issues/366)) ([7a9c201](https://github.com/open-feature/js-sdk-contrib/commit/7a9c201d16fd7f070a1bcd2e359487ba6e7b78d7))


### 🐛 Bug Fixes

* **deps:** update dependency lru-cache to v9 ([#321](https://github.com/open-feature/js-sdk-contrib/issues/321)) ([6e247ad](https://github.com/open-feature/js-sdk-contrib/commit/6e247ad2ba14d148ff99ff1d5283ccce5708e366))
* failure to create grpc credentials ([#431](https://github.com/open-feature/js-sdk-contrib/issues/431)) ([71379c8](https://github.com/open-feature/js-sdk-contrib/commit/71379c8d2b2a71f244aeff8ea0c83f1d593aacc9))

## [0.7.6](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.5...flagd-provider-v0.7.6) (2023-04-25)


### 🐛 Bug Fixes

* **deps:** update dependency lru-cache to v8 ([#260](https://github.com/open-feature/js-sdk-contrib/issues/260)) ([e752c4a](https://github.com/open-feature/js-sdk-contrib/commit/e752c4a13efb856e35d424a0938ab83b898ec5b5))
* handling zero value responses (previously undefined) ([#330](https://github.com/open-feature/js-sdk-contrib/issues/330)) ([2db7fa8](https://github.com/open-feature/js-sdk-contrib/commit/2db7fa825bd12d18d0804997e54d0b6aa3cd5a14))

## [0.7.5](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.4...flagd-provider-v0.7.5) (2023-03-02)


### Features

* add standard flagd caching ([1e93b5f](https://github.com/open-feature/js-sdk-contrib/commit/1e93b5f3845beb5b4a523d1f9081a4c538200924))
* add standard flagd caching ([#218](https://github.com/open-feature/js-sdk-contrib/issues/218)) ([1e93b5f](https://github.com/open-feature/js-sdk-contrib/commit/1e93b5f3845beb5b4a523d1f9081a4c538200924))

## [0.7.4](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.3...flagd-provider-v0.7.4) (2023-01-19)


### Bug Fixes

* module issues with types ([#212](https://github.com/open-feature/js-sdk-contrib/issues/212)) ([d2b97dd](https://github.com/open-feature/js-sdk-contrib/commit/d2b97dd24c952661ce08724a84e4b312860a9211))

## [0.7.3](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.2...flagd-provider-v0.7.3) (2022-12-29)


### Bug Fixes

* fix ESM and web polyfills issue ([#201](https://github.com/open-feature/js-sdk-contrib/issues/201)) ([acee6e1](https://github.com/open-feature/js-sdk-contrib/commit/acee6e1817a7846251f456455a7218bf98efb00e))

## [0.7.2](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.1...flagd-provider-v0.7.2) (2022-12-09)


### Bug Fixes

* correct dependencies ([#182](https://github.com/open-feature/js-sdk-contrib/issues/182)) ([16cbe42](https://github.com/open-feature/js-sdk-contrib/commit/16cbe421d6255bd95a78c3914890a63adcce831e))

## [0.7.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.7.0...flagd-provider-v0.7.1) (2022-12-09)


### Miscellaneous Chores

* dependency updates

## [0.7.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.6.0...flagd-provider-v0.7.0) (2022-10-19)


### ⚠ BREAKING CHANGES

* update OpenFeature SDK version (#137)

### Miscellaneous Chores

* update OpenFeature SDK version ([#137](https://github.com/open-feature/js-sdk-contrib/issues/137)) ([245f024](https://github.com/open-feature/js-sdk-contrib/commit/245f02441d62f7f42627174737943f1556a6a326))

## [0.6.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.5.1...flagd-provider-v0.6.0) (2022-10-03)


### ⚠ BREAKING CHANGES

* migrate to sdk 0.5.0 (#114)

### Features

* migrate to sdk 0.5.0 ([#114](https://github.com/open-feature/js-sdk-contrib/issues/114)) ([f9e9a55](https://github.com/open-feature/js-sdk-contrib/commit/f9e9a55ad5a16e99bb169fdf1a8d11c959520f7b))

## [0.5.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.5.0...flagd-provider-v0.5.1) (2022-09-22)


### Bug Fixes

* improved errors, handle undefined context props ([#110](https://github.com/open-feature/js-sdk-contrib/issues/110)) ([ea05b49](https://github.com/open-feature/js-sdk-contrib/commit/ea05b493096664b793fcdcf5c9a66493f25e72a9))

## [0.5.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.4.0...flagd-provider-v0.5.0) (2022-09-20)


### ⚠ BREAKING CHANGES

* add support for environment variables (#107)
* update to js-sdk (#108)
* Fix object parsing, remove HTTP (#102)

### Features

* add support for environment variables ([#107](https://github.com/open-feature/js-sdk-contrib/issues/107)) ([fcc360b](https://github.com/open-feature/js-sdk-contrib/commit/fcc360bffa328a38594ae9dc30da339aaaed8b93))
* add Unix socket support ([#97](https://github.com/open-feature/js-sdk-contrib/issues/97)) ([326e65a](https://github.com/open-feature/js-sdk-contrib/commit/326e65ad1e518302b5a7b6a2498dec53c8c93a43))
* update to js-sdk ([#108](https://github.com/open-feature/js-sdk-contrib/issues/108)) ([60d6146](https://github.com/open-feature/js-sdk-contrib/commit/60d6146e30d3ca547e940c3ba441d80fd75d886d))


### Bug Fixes

* Fix object parsing, remove HTTP ([#102](https://github.com/open-feature/js-sdk-contrib/issues/102)) ([d6db366](https://github.com/open-feature/js-sdk-contrib/commit/d6db366a6ef7eb47230dcc6512f189a48c0b4ef2))

## [0.4.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.3.0...flagd-provider-v0.4.0) (2022-08-15)


### ⚠ BREAKING CHANGES

* set openfeature sdk min version to 0.2.0 (#93)

### Bug Fixes

* set openfeature sdk min version to 0.2.0 ([#93](https://github.com/open-feature/js-sdk-contrib/issues/93)) ([a733102](https://github.com/open-feature/js-sdk-contrib/commit/a733102f523f9289fdce356a342828cc2e020f48))

## [0.3.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.2.1...flagd-provider-v0.3.0) (2022-08-09)


### Features

* change flagD default port to 8013 ([#85](https://github.com/open-feature/js-sdk-contrib/issues/85)) ([9e26840](https://github.com/open-feature/js-sdk-contrib/commit/9e268406509a072b7561910fff6b8ab8bb0265c8))
* update flagd provider to use float api ([#87](https://github.com/open-feature/js-sdk-contrib/issues/87)) ([9f871f1](https://github.com/open-feature/js-sdk-contrib/commit/9f871f1880022297b28601d472da2b4200325127))

## [0.2.1](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.2.0...flagd-provider-v0.2.1) (2022-07-29)


### Bug Fixes

* Add buf dependency to release process ([#80](https://github.com/open-feature/js-sdk-contrib/issues/80)) ([f55bc20](https://github.com/open-feature/js-sdk-contrib/commit/f55bc20362c55441dc0a1d562b95957c8ab8c810))

## [0.2.0](https://github.com/open-feature/js-sdk-contrib/compare/flagd-provider-v0.1.0...flagd-provider-v0.2.0) (2022-07-27)


### Features

* flagd provider ([#66](https://github.com/open-feature/js-sdk-contrib/issues/66)) ([9d6cb86](https://github.com/open-feature/js-sdk-contrib/commit/9d6cb868908264b8661ed95a207397ae67693527))

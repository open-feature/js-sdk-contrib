# Changelog

## [1.0.1](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v1.0.0...ofrep-core-v1.0.1) (2025-03-12)


### 🐛 Bug Fixes

* improper inclusion of test deps ([#1220](https://github.com/open-feature/js-sdk-contrib/issues/1220)) ([f5e3f1f](https://github.com/open-feature/js-sdk-contrib/commit/f5e3f1f3ceff8d82c5f2de9b44414f79c442d602))

## [1.0.0](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.2.0...ofrep-core-v1.0.0) (2025-02-13)


### ✨ New Features

* **ofrep-core:** add abort timeout to fetch call ([#1200](https://github.com/open-feature/js-sdk-contrib/issues/1200)) ([d88c5fe](https://github.com/open-feature/js-sdk-contrib/commit/d88c5fe11f676da796f1ff2b02cb7637d8720e5e))
* support metadata in errors in OFREP ([#1203](https://github.com/open-feature/js-sdk-contrib/issues/1203)) ([ce37b6a](https://github.com/open-feature/js-sdk-contrib/commit/ce37b6adcdc9fca0af386eece00c580542cf7b4b))


### 🧹 Chore

* update nx packages ([#1147](https://github.com/open-feature/js-sdk-contrib/issues/1147)) ([7f310fe](https://github.com/open-feature/js-sdk-contrib/commit/7f310fe87101b8aa793e1436e63c7602ccc202e3))

## [0.2.0](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.5...ofrep-core-v0.2.0) (2024-07-11)


### ⚠ BREAKING CHANGES

* use native headers, optional query params ([#1003](https://github.com/open-feature/js-sdk-contrib/issues/1003))

### ✨ New Features

* use native headers, optional query params ([#1003](https://github.com/open-feature/js-sdk-contrib/issues/1003)) ([383f4f3](https://github.com/open-feature/js-sdk-contrib/commit/383f4f310d0eeed8a72f73ed8a539aeab46e3177))

## [0.1.5](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.4...ofrep-core-v0.1.5) (2024-06-18)


### ✨ New Features

* support relative baseUrls ([#950](https://github.com/open-feature/js-sdk-contrib/issues/950)) ([ceb42cb](https://github.com/open-feature/js-sdk-contrib/commit/ceb42cb335518963a3ca5d21f15f9b439c481f2f))

## [0.1.4](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.3...ofrep-core-v0.1.4) (2024-04-16)


### 🐛 Bug Fixes

* OFREP http set headers ([f0dcf93](https://github.com/open-feature/js-sdk-contrib/commit/f0dcf93ce97d01b79854212919afe5eacd28c860))

## [0.1.3](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.2...ofrep-core-v0.1.3) (2024-04-16)


### 🐛 Bug Fixes

* fixes an issue where OFREP does not send content type headers ([#882](https://github.com/open-feature/js-sdk-contrib/issues/882)) ([b3289e5](https://github.com/open-feature/js-sdk-contrib/commit/b3289e5083e97946f4ab62a6f2f10bb1402e7a55))

## [0.1.2](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.1...ofrep-core-v0.1.2) (2024-04-14)


### 🐛 Bug Fixes

* OFREP web provider failing because of wrong fetch scope ([72c6f67](https://github.com/open-feature/js-sdk-contrib/commit/72c6f6739342bd35c40d7261c96f9ebf84352fbb))


### ✨ New Features

* implement OFREP server provider ([#817](https://github.com/open-feature/js-sdk-contrib/issues/817)) ([5d9f5ff](https://github.com/open-feature/js-sdk-contrib/commit/5d9f5ffa3cebbf54f52f215ccf135edf3ab4cc87))
* OFREP web provider ([#776](https://github.com/open-feature/js-sdk-contrib/issues/776)) ([9626ef4](https://github.com/open-feature/js-sdk-contrib/commit/9626ef43ae8f5252219b3a9bff51b83c4c5e6230))

## [0.1.1](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.1.0...ofrep-core-v0.1.1) (2024-04-05)


### 🐛 Bug Fixes

* Use request time to compute the retry after ([#846](https://github.com/open-feature/js-sdk-contrib/issues/846)) ([ddc2c90](https://github.com/open-feature/js-sdk-contrib/commit/ddc2c9042c82c9066415ce4f6243639ae94d20c5))


### ✨ New Features

* **ofrep:** move error handling and result mapping to ofrep-core ([#822](https://github.com/open-feature/js-sdk-contrib/issues/822)) ([18e18fa](https://github.com/open-feature/js-sdk-contrib/commit/18e18fa5f113d064521165cf3a716913a814e8cc))
* **ofrep:** moves base options to ofrep-core ([#834](https://github.com/open-feature/js-sdk-contrib/issues/834)) ([474059c](https://github.com/open-feature/js-sdk-contrib/commit/474059c207067e437a698a12582582d8b567aabf))
* **ofrep:** ofrep core ([#795](https://github.com/open-feature/js-sdk-contrib/issues/795)) ([17e6d57](https://github.com/open-feature/js-sdk-contrib/commit/17e6d57e43280a73f8c5f30fddc0447a900e3c79))
* **ofrep:** parse Retry-After header in OFREPApiTooManyRequestsError ([#841](https://github.com/open-feature/js-sdk-contrib/issues/841)) ([ba7aa3e](https://github.com/open-feature/js-sdk-contrib/commit/ba7aa3efbc5ffacc2008d4591b2a585df34cbd01))
* **ofrep:** release ofrep core as 0.1.0-experimental ([#849](https://github.com/open-feature/js-sdk-contrib/issues/849)) ([f935d08](https://github.com/open-feature/js-sdk-contrib/commit/f935d08e823ddf199ad93974b7ef4df616c5d436))


### 🧹 Chore

* **main:** release ofrep-core 0.0.2-experimental ([#801](https://github.com/open-feature/js-sdk-contrib/issues/801)) ([029dfe9](https://github.com/open-feature/js-sdk-contrib/commit/029dfe9bddb5da1c6661c85b7d95843db4a35fdd))
* **main:** release ofrep-core 0.0.3-experimental ([#823](https://github.com/open-feature/js-sdk-contrib/issues/823)) ([71069c3](https://github.com/open-feature/js-sdk-contrib/commit/71069c3ed8cbeedade3f168a8dca36fa8e304c2e))
* **main:** release ofrep-core 0.0.4-experimental ([#833](https://github.com/open-feature/js-sdk-contrib/issues/833)) ([a258d3d](https://github.com/open-feature/js-sdk-contrib/commit/a258d3d56f5376bb4f1dbfe42dd725c7540f85ff))
* **main:** release ofrep-core 0.0.5-experimental ([#838](https://github.com/open-feature/js-sdk-contrib/issues/838)) ([35942a2](https://github.com/open-feature/js-sdk-contrib/commit/35942a20e833ec677a46072dea34baa5f60492fc))
* **main:** release ofrep-core 0.0.6-experimental ([#844](https://github.com/open-feature/js-sdk-contrib/issues/844)) ([930aaae](https://github.com/open-feature/js-sdk-contrib/commit/930aaaeec1c36094fdb0231ec80fff38636b4d21))
* **main:** release ofrep-core 0.0.7-experimental ([#847](https://github.com/open-feature/js-sdk-contrib/issues/847)) ([2a89869](https://github.com/open-feature/js-sdk-contrib/commit/2a898695761e65c909ed73aa9f77c84091da9c9d))
* **ofrep:** add more errors to msw tests ([#832](https://github.com/open-feature/js-sdk-contrib/issues/832)) ([c738d85](https://github.com/open-feature/js-sdk-contrib/commit/c738d8576405539b9a2e8f13702b2c35ded9609e))

## [0.0.7-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.6-experimental...ofrep-core-v0.0.7-experimental) (2024-04-04)


### 🐛 Bug Fixes

* Use request time to compute the retry after ([#846](https://github.com/open-feature/js-sdk-contrib/issues/846)) ([ddc2c90](https://github.com/open-feature/js-sdk-contrib/commit/ddc2c9042c82c9066415ce4f6243639ae94d20c5))

## [0.0.6-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.5-experimental...ofrep-core-v0.0.6-experimental) (2024-04-04)


### ✨ New Features

* **ofrep:** parse Retry-After header in OFREPApiTooManyRequestsError ([#841](https://github.com/open-feature/js-sdk-contrib/issues/841)) ([ba7aa3e](https://github.com/open-feature/js-sdk-contrib/commit/ba7aa3efbc5ffacc2008d4591b2a585df34cbd01))

## [0.0.5-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.4-experimental...ofrep-core-v0.0.5-experimental) (2024-04-02)


### ✨ New Features

* **ofrep:** moves base options to ofrep-core ([#834](https://github.com/open-feature/js-sdk-contrib/issues/834)) ([474059c](https://github.com/open-feature/js-sdk-contrib/commit/474059c207067e437a698a12582582d8b567aabf))

## [0.0.4-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.3-experimental...ofrep-core-v0.0.4-experimental) (2024-04-02)


### 🧹 Chore

* **ofrep:** add more errors to msw tests ([#832](https://github.com/open-feature/js-sdk-contrib/issues/832)) ([c738d85](https://github.com/open-feature/js-sdk-contrib/commit/c738d8576405539b9a2e8f13702b2c35ded9609e))

## [0.0.3-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.2-experimental...ofrep-core-v0.0.3-experimental) (2024-03-27)


### ✨ New Features

* **ofrep:** move error handling and result mapping to ofrep-core ([#822](https://github.com/open-feature/js-sdk-contrib/issues/822)) ([18e18fa](https://github.com/open-feature/js-sdk-contrib/commit/18e18fa5f113d064521165cf3a716913a814e8cc))

## [0.0.2-experimental](https://github.com/open-feature/js-sdk-contrib/compare/ofrep-core-v0.0.1-experimental...ofrep-core-v0.0.2-experimental) (2024-03-15)


### ✨ New Features

* **ofrep:** ofrep core ([#795](https://github.com/open-feature/js-sdk-contrib/issues/795)) ([17e6d57](https://github.com/open-feature/js-sdk-contrib/commit/17e6d57e43280a73f8c5f30fddc0447a900e3c79))

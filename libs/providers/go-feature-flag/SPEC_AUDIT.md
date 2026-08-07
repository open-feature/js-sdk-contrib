# GO Feature Flag Provider Specification 1.0 — Conformance Audit

|                            |                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **Package**                | `@openfeature/go-feature-flag-provider`                                                           |
| **Package version**        | `1.4.0` (`libs/providers/go-feature-flag/package.json:3`)                                         |
| **Repository commit**      | `9750615d3846b689f0c5837f29fca6da3abf4c2d`                                                        |
| **Specification**          | GO Feature Flag Provider Specification **1.0** (03/08/2026), `openfeature-provider.md`, 834 lines |
| **Declared tiers**         | **Core**, **Remote**, **In-process**, **WASM**                                                    |
| **Excluded tiers**         | **Optional / §17 Remote cache** — no cache is implemented (see §1.3 justification)                |
| **Audit date**             | 2026-08-06                                                                                        |
| **Requirements evaluated** | 147 (every `GOFF-*` identifier in the specification)                                              |

> ### Working-tree state
>
> Verdicts are anchored to commit `9750615d3846b689f0c5837f29fca6da3abf4c2d`, verified with `git show HEAD:<path>`. Two maintainer changes landed in the working tree while the audit was in progress; both are accounted for below and the report reflects the **current** working tree.
>
> | File                             | Change                                                    | Effect on this report                                                                                                                                                            |
> | -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `scripts/copy-latest-wasm.js:11` | `TARGET_WASM_VERSION` `'0.2.3'` → `'0.2.4'` (uncommitted) | **`GOFF-ENG-001` re-audited: FAIL → PARTIAL.** The declared version is now correct, but it does not resolve to an artefact and breaks the build — see finding **C1**, rewritten. |
> | `package-lock.json`              | `npm install` in the repository root                      | None on any verdict. It supplies the resolved dependency tree, which **replaced** the temporary probe as the evidence source for §1.5 — see §0.2.                                |
>
> All files under `libs/providers/go-feature-flag/src/`, `libs/providers/ofrep/` and `libs/shared/ofrep-core/` are byte-identical to `HEAD`, so the other 146 verdicts describe the working tree and the commit alike.

---

## 0. Audit scope, tiers and delegation

### 0.1 Tier determination (§1.3)

| Tier                     | Applies? | Justification (file:line)                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core**                 | Yes      | Server-side provider: `src/lib/go-feature-flag-provider.ts:29` declares `readonly runsOn = 'server'`; `:24` implements the server SDK `Provider` interface.                                                                                                                                                                                                             |
| **Remote**               | Yes      | `src/lib/evaluator/remote-evaluator.ts:29` constructs an `OFREPProvider`, selected by `src/lib/go-feature-flag-provider.ts:130-132` when `evaluationType === EvaluationType.Remote`.                                                                                                                                                                                    |
| **In-process**           | Yes      | `src/lib/evaluator/inprocess-evaluator.ts:36` implements local evaluation; it is the default branch of `src/lib/go-feature-flag-provider.ts:133-135`.                                                                                                                                                                                                                   |
| **WASM**                 | Yes      | `src/lib/evaluator/inprocess-evaluator.ts:67` instantiates `EvaluateWasm`; `src/lib/wasm/evaluate-wasm.ts:44` calls `WebAssembly.instantiate`.                                                                                                                                                                                                                          |
| **Optional (§17 cache)** | **No**   | No cache exists. Searched `src/` for `cache`, `Cache`, `LRU`, `ttl`, `PROVIDER_CACHE` — the only hits are the word "cache" in `README.md:13` and an unrelated test fixture key. `src/lib/evaluator/remote-evaluator.ts:98-100` returns `false` from `isFlagTrackable`, i.e. no cache-served feature events. §17 therefore reports **N/A** for all seven `GOFF-CACHE-*`. |

### 0.2 Behaviour deferred to `@openfeature/server-sdk` (§1.5)

The specification names language accidents for Python, Java and .NET only. **No JavaScript carve-out is claimed here.** The following behaviours are SDK-defined and are _not_ reported as provider defects:

Evidence is the **resolved dependency tree in this repository** — `@openfeature/server-sdk` **1.19.0** and `@openfeature/core` **1.9.1**, i.e. the floor of the `^1.19.0` peer range declared at `package.json:15-16`. Upstream source: <https://github.com/open-feature/js-sdk>.

| Behaviour                                                                                                                                               | SDK evidence (`node_modules/@openfeature/…`)                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Resolver set is `boolean / string / number / object` — there is **no** integer or float resolver                                                        | `server-sdk/dist/types.d.ts:124` (`resolveIntegerEvaluation` / `resolveFloatEvaluation` occur 0 times in the file) |
| An exception thrown by a resolver is converted into `{value: default, reason: ERROR, errorCode: err.code ?? GENERAL}` and never reaches the application | `server-sdk/dist/cjs/index.js:386-389` and `:475-477`                                                              |
| `provider.initialize()` rejection maps to status `FATAL` **only** when `error.code === 'PROVIDER_FATAL'`, otherwise `ERROR`                             | `core/dist/cjs/index.js:784-789`                                                                                   |
| Evaluations are short-circuited **only** in status `NOT_READY` and `FATAL` — not in `ERROR` or `STALE`                                                  | `server-sdk/dist/cjs/index.js:468-474`                                                                             |
| Provider hooks run `before` in array order, `after`/`error`/`finally` in reverse array order                                                            | `server-sdk/dist/cjs/index.js:349-355`, `:380-390`, `:394-398`                                                     |
| `FlagMetadata` is `Record<string, string \| number \| boolean>`; `JsonValue` admits scalars                                                             | `core/dist/types.d.ts:59` and `:16`                                                                                |
| The event emitter exposes `Ready`, `Error`, `Stale`, `ConfigurationChanged` — `PROVIDER_STALE` **is** available to a server provider                    | `core/dist/cjs/index.js:307`                                                                                       |
| The SDK stamps `providerName` from `provider.metadata.name` onto emitted events                                                                         | `core/dist/cjs/index.js:781`                                                                                       |

> **Method note.** `node_modules` was absent when the audit began, so these facts were first settled against a probe installed outside the repository. After the maintainer ran `npm install`, **every one of them was re-verified against the actually-resolved 1.19.0 / 1.9.1 tree above, and all eight hold identically** — the probe had resolved 1.23.0 / 1.12.0, and no verdict differs between the two. The requirements that depend on this evidence are **GOFF-EVAL-001, -002, -005, -009, -011**, **GOFF-EVT-005, -007, -008**, **GOFF-LIFE-001, -006**, **GOFF-HOOK-001**, **GOFF-META-003** and **GOFF-TRACK-001**. Neither `nx build` nor the test suite was executed.
>
> `@openfeature/ofrep-provider` and `@openfeature/ofrep-core` are **not** installed from the registry — they resolve to the in-repo workspace sources, so §8's delegated verdicts cite `libs/providers/ofrep/` and `libs/shared/ofrep-core/` directly, which is the stronger evidence in any case.

### 0.3 Delegated behaviour (§1.7)

Remote evaluation is delegated to `@openfeature/ofrep-provider` (declared at `package.json:17` as peer `^0.2.4`), which lives in this monorepo at `libs/providers/ofrep` (version `0.2.5`) on top of `libs/shared/ofrep-core` (version `2.3.0`). Per §1.7 the provider remains accountable for that code. Delegated verdicts are marked **(delegated)** and cite the delegate's file:line. One finding — **GOFF-CFG-005**, Critical — has its remediation **upstream** in `libs/providers/ofrep`; **GOFF-EVAL-009** is likewise upstream.

---

## 1. Summary

```text
GO Feature Flag Provider Specification 1.0 — @openfeature/go-feature-flag-provider 1.4.0
TIERS: Core, Remote, In-process, WASM  (Optional/§17: no cache → N/A)
VERDICT: NON-CONFORMANT — 6 Critical, 31 Major, 10 Minor
         (92 PASS, 41 FAIL, 6 PARTIAL, 8 N/A, 0 UNVERIFIABLE — 147 total)
```

> **Remediation in progress.** Counts below track the live working tree, not the original audit. Baseline was 80 PASS / 53 FAIL / 6 PARTIAL / 8 N/A = 59 unmet. **Closed so far: 12 — Step 0 (`ENG-001`), Step 1 (`IP-007`, `IP-008`, `IP-009`, `IP-015`), Step 2 (`IP-006`; `CFG-003` reduced to PARTIAL), Step 3 (`LIFE-002`), Step 4 (`LIFE-006`), Step 5 (`EVT-007`), Step 6 (`EVT-005`, `EVT-006`), Step 7 (`EVT-004`). Remaining: 47.**

### 1.1 Counts by verdict

| Verdict      |   Count |
| ------------ | ------: |
| PASS         |      92 |
| FAIL         |      41 |
| PARTIAL      |       6 |
| N/A          |       8 |
| UNVERIFIABLE |       0 |
| **Total**    | **147** |

Appendix C.1 of the specification recognises only `PASS`, `FAIL` and `N/A`. This audit additionally uses `PARTIAL` where a requirement holds on one code path and breaks on another, because collapsing those to a bare `FAIL` would hide which half works. **For the purposes of the single verdict line, all 6 `PARTIAL` results count as non-conformance**, giving 47 unmet requirements.

### 1.2 Failures by severity

| Severity  |   FAIL | PARTIAL |  Total |
| --------- | -----: | ------: | -----: |
| Critical  |      6 |       0 |  **6** |
| Major     |     25 |       6 | **31** |
| Minor     |     10 |       0 | **10** |
| **Total** | **41** |   **6** | **47** |

### 1.3 Counts by area

| Area                  |   Total |   PASS |   FAIL | PARTIAL |   N/A |
| --------------------- | ------: | -----: | -----: | ------: | ----: |
| `GOFF-ENG` (§1.6)     |       3 |      2 |      1 |       0 |     0 |
| `GOFF-META` (§2)      |       3 |      1 |      2 |       0 |     0 |
| `GOFF-CFG` (§3)       |      10 |      1 |      7 |       2 |     0 |
| `GOFF-LIFE` (§4)      |       7 |      7 |      0 |       0 |     0 |
| `GOFF-EVT` (§5)       |       8 |      7 |      1 |       0 |     0 |
| `GOFF-EVAL` (§6)      |      11 |      8 |      1 |       1 |     1 |
| `GOFF-CTX` (§7)       |       9 |      7 |      2 |       0 |     0 |
| `GOFF-REM` (§8)       |       6 |      6 |      0 |       0 |     0 |
| `GOFF-IP` (§9)        |      17 |     16 |      1 |       0 |     0 |
| `GOFF-WASM` (§10)     |      13 |      7 |      4 |       2 |     0 |
| `GOFF-ERR` (§11)      |       6 |      6 |      0 |       0 |     0 |
| `GOFF-HOOK` (§12)     |       6 |      3 |      3 |       0 |     0 |
| `GOFF-COLL` (§13)     |      23 |     14 |      8 |       1 |     0 |
| `GOFF-TRACK` (§14)    |       5 |      4 |      1 |       0 |     0 |
| `GOFF-AUTH` (§15)     |       4 |      3 |      1 |       0 |     0 |
| `GOFF-FALLBACK` (§16) |       9 |      0 |      9 |       0 |     0 |
| `GOFF-CACHE` (§17)    |       7 |      0 |      0 |       0 |     7 |
| **Total**             | **147** | **92** | **41** |   **6** | **8** |

### 1.4 Headline

Five clusters account for most of the risk:

1. **The flag map can be silently wiped, permanently.** Four distinct refresh paths — a `304` without an `ETag`, an unparseable `200`, a `200` with a null flag map, and the `ETag` write-back — each replace the live configuration with `{}` while advancing the validator, making the empty state permanent (**GOFF-IP-007/-008/-009/-015**). Separately, the engine pin now names the correct `0.2.4` but the `wasm-releases` submodule cannot supply it, so `copy-wasm` — a `dependsOn` of both `test` and `package` — exits 1 (**GOFF-ENG-001**, one commit from resolved).
2. **Polling is off unless the user asks for it.** `flagChangePollingIntervalMs` has no default in code despite being documented as `120000`, so an in-process provider serves its start-up snapshot forever (**GOFF-IP-006**).
3. **No remote fallback exists at all.** The whole of §16 is unimplemented (9 failures, per §C.1 vacuous-satisfaction inheritance). §10.1 routes a guard breach to `PARSE_ERROR` precisely so §16 can turn it into a correct remote answer; with §16 absent, that breach is a hard error to the caller instead.
4. **The `gofeatureflag` reserved namespace is destroyed on every evaluation**, taking caller-supplied `flagList` and `currentDateTime` with it, and the exporter metadata is written to a key the server does not read (**GOFF-CTX-006/-007**).
5. **The data-collector envelope is unattributable and the buffer is unbounded** — no `provider`/`openfeature` keys (**GOFF-COLL-011/-012**) and no cap on retained events (**GOFF-COLL-019**).

Two systemic defects sit underneath: `disableDataCollection` is declared, documented and never read (**GOFF-CFG-009/-010, GOFF-HOOK-006, GOFF-TRACK-003**), and a WebAssembly trap neither discards the poisoned instance nor skips `free` (**GOFF-WASM-008/-012/-013**).

---

## 2. Per-requirement verdict table

Paths are relative to the repository root. `gff/` abbreviates `libs/providers/go-feature-flag/`.

| ID                  | Sev      | Tier       | Verdict     | Evidence                                                                                                                                         | Note                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOFF-ENG-001`      | Critical | WASM       | PASS        | `gff/scripts/copy-latest-wasm.js:11`; submodule gitlink `76bf27bab805b2fdc564a0f8557c03d1af414d70`                                               | Pin declares `0.2.4` and resolves: `nx copy-wasm` exits 0 and the copied binary is byte-identical (sha256 `c051989c…`) to `gofeatureflag-evaluation_0.2.4.wasm`. _Fixed — Step 0._                                                                                                                                                                                                     |
| `GOFF-ENG-002`      | Major    | Core       | PASS        | `gff/scripts/copy-latest-wasm.js:11`, `gff/project.json:20-27`                                                                                   | Single machine-readable constant, consumed by the `copy-wasm` target.                                                                                                                                                                                                                                                                                                                  |
| `GOFF-ENG-003`      | Minor    | Core       | **FAIL**    | `gff/README.md` (whole file), `gff/package.json`                                                                                                 | No statement of the targeted specification version anywhere.                                                                                                                                                                                                                                                                                                                           |
| `GOFF-META-001`     | Minor    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:25-27`                                                                                                  | Name is `"GoFeatureFlagProvider"`, not `"GO Feature Flag Provider"`.                                                                                                                                                                                                                                                                                                                   |
| `GOFF-META-002`     | Minor    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:26`                                                                                                     | Derived by reflection: `GoFeatureFlagProvider.name`.                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-META-003`     | Minor    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:302`; SDK `core@1.9.1 dist/cjs/index.js:781`                                                       | Provider emits no name of its own; the SDK stamps `metadata.name`, so they are equal by construction.                                                                                                                                                                                                                                                                                  |
| `GOFF-CFG-001`      | Major    | Core       | **PARTIAL** | `gff/src/lib/go-feature-flag-provider.ts:160-173`; `gff/src/lib/go-feature-flag-provider-options.ts:78-82`                                       | Required and URL-validated in in-process mode; both checks are skipped in remote mode.                                                                                                                                                                                                                                                                                                 |
| `GOFF-CFG-002`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:130-135`                                                                                                | `switch` default branch returns `InProcessEvaluator`.                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-CFG-003`      | Major    | Core       | **PARTIAL** | `gff/src/lib/helper/constants.ts:22`; `gff/src/lib/evaluator/inprocess-evaluator.ts:74-77`                                                       | `flagChangePollingInterval` now defaults to `120000 ms` as required (Step 2). `dataFlushInterval` still defaults to `120000` where §3.1 requires `60000` — Step 18.                                                                                                                                                                                                                    |
| `GOFF-CFG-004`      | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:44-45`                                                                                                  | Stores the caller's object by reference and then writes `this.options.endpoint`.                                                                                                                                                                                                                                                                                                       |
| `GOFF-CFG-005`      | Critical | Core       | **FAIL**    | `libs/providers/ofrep/src/lib/configuration.ts:17-39, 138-148` (delegated)                                                                       | Endpoint, headers and timeout are read from `OFREP_ENDPOINT` / `OFREP_HEADERS` / `OFREP_TIMEOUT_MS`.                                                                                                                                                                                                                                                                                   |
| `GOFF-CFG-006`      | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider-options.ts:4-58`; `gff/src/lib/service/api.ts:153`                                                         | `dataCollectorBaseURL` is not offered; the collector always uses `endpoint`.                                                                                                                                                                                                                                                                                                           |
| `GOFF-CFG-007`      | Major    | Core       | **FAIL**    | (inherited from `GOFF-CFG-006`, §C.1)                                                                                                            | Governing capability absent.                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-CFG-008`      | Minor    | In-process | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:272`; `gff/src/lib/service/api.ts:60`                                                              | `evaluationFlagList` is not offered; `flags` is always sent as `[]`.                                                                                                                                                                                                                                                                                                                   |
| `GOFF-CFG-009`      | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider-options.ts:33`; `gff/README.md:83`                                                                         | `disableDataCollection` is declared and documented but never read anywhere in `src/`.                                                                                                                                                                                                                                                                                                  |
| `GOFF-CFG-010`      | Minor    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider-options.ts:33`                                                                                             | Same inert option remains exposed rather than deleted.                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-LIFE-001`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:108-116`; SDK `core dist/cjs/index.js:1043-1051`                                                        | `initialize` awaits configuration load and publisher start, and rethrows on failure.                                                                                                                                                                                                                                                                                                   |
| `GOFF-LIFE-002`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:89, 125-131`; `gff/src/lib/wasm/evaluate-wasm.ts:42-45`                                            | `initialize` cancels the existing polling task and joins any refresh in flight before scheduling a new one, so no second chain can attach. `EvaluateWasm.initialize` returns early when an instance is live, so re-initialization cannot abandon one; `dispose` clears the fields, so a deliberate rebuild still works. _Fixed — Step 3._                                              |
| `GOFF-LIFE-003`     | Critical | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:47-53, 71-82`; `gff/src/lib/evaluator/inprocess-evaluator.ts:211-217`                                    | `isRunning` and `periodicRunner` are both reset by a subsequent `start`/`initialize`; no latch survives.                                                                                                                                                                                                                                                                               |
| `GOFF-LIFE-004`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:121-124`                                                                                                | Unconditional in both modes: evaluator disposed (clears polling), publisher stopped (flushes).                                                                                                                                                                                                                                                                                         |
| `GOFF-LIFE-005`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:149-150, 160`                                                                                                        | The shutdown flush is bounded by the configured request timeout via `AbortController`.                                                                                                                                                                                                                                                                                                 |
| `GOFF-LIFE-006`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:259-269`                                                                                           | Reports `PROVIDER_NOT_READY`, and the readiness check still precedes the flag lookup so `FLAG_NOT_FOUND` is never used for an unloaded configuration. _Fixed — Step 4._                                                                                                                                                                                                                |
| `GOFF-LIFE-007`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:296-297`                                                                                           | _Accidental_: single-threaded event loop; `flags` swapped by reference, no guard held across I/O.                                                                                                                                                                                                                                                                                      |
| `GOFF-EVT-001`      | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:132-134`; `gff/src/lib/evaluator/remote-evaluator.ts` (whole file)                                      | The event emitter is passed only to the in-process evaluator; remote mode emits nothing.                                                                                                                                                                                                                                                                                               |
| `GOFF-EVT-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:300-303`                                                                                           | Emitted when the poll yields a different `ETag`.                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-EVT-003`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:300`                                                                                               | `!firstLoad` guard suppresses the initial load.                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-EVT-004`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:34-68, 396-410`                                                                                    | Emission is decided by comparing per-flag serializations of the decoded configuration, not the `ETag`, so a server that omits `ETag` no longer makes every poll look like a change. The event carries `flagsChanged` listing exactly the flags added, removed or modified. Each flag is serialized whole rather than inspected, keeping it opaque per `GOFF-IP-016`. _Fixed — Step 7._ |
| `GOFF-EVT-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:143-160`; `gff/src/lib/helper/constants.ts:27-31`                                                  | Emits `ServerProviderEvents.Stale` once the third consecutive refresh fails, and keeps serving the last known-good configuration throughout — a failed refresh rejects before writing anything. _Fixed — Step 6._                                                                                                                                                                      |
| `GOFF-EVT-006`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:130-141`                                                                                           | Emits `ServerProviderEvents.Ready` on the first successful refresh after going stale, and only then — the counter resets on every success, so recovery is not reported for a provider that never went stale. _Fixed — Step 6._                                                                                                                                                         |
| `GOFF-EVT-007`      | Critical | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:118-129`                                                                                                | An `UnauthorizedException` (401/403) raised during initialization is rethrown as the SDK's `ProviderFatalError`, which carries `code: PROVIDER_FATAL`, so the SDK settles the provider in `FATAL` and short-circuits evaluations. _Fixed — Step 5._                                                                                                                                    |
| `GOFF-EVT-008`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:112-115`; SDK `core dist/cjs/index.js:1056-1057`                                                        | All non-fatal init failures land in `ERROR`.                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-EVAL-001`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:71-103`                                                                                                 | All four SDK resolvers implemented, all asynchronous.                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-EVAL-002`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:184-189`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248-256`                                | Scalars yield `TYPE_MISMATCH` on both paths. See Open question 1 on the SDK's `JsonValue` admitting scalars.                                                                                                                                                                                                                                                                           |
| `GOFF-EVAL-003`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:162`                                                                                               | The single number resolver accepts any JSON number, integral included.                                                                                                                                                                                                                                                                                                                 |
| `GOFF-EVAL-004`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:162`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248`                                        | `typeof value === 'number'` excludes booleans; JS has no `isinstance(True, int)` accident.                                                                                                                                                                                                                                                                                             |
| `GOFF-EVAL-005`     | Major    | Core       | **N/A**     | SDK `server-sdk@1.19.0 dist/types.d.ts:116-128`                                                                                                  | The JS SDK defines no integer resolver — §1.3 makes this N/A.                                                                                                                                                                                                                                                                                                                          |
| `GOFF-EVAL-006`     | Critical | Core       | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:118-122, 184-189`; `libs/shared/ofrep-core/src/lib/helpers.ts:7`                                   | A `null` value yields `TYPE_MISMATCH` on both paths instead of the default with reason/variant/metadata.                                                                                                                                                                                                                                                                               |
| `GOFF-EVAL-007`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:353`                                                                                               | `reason` copied verbatim as a string; no enum parsing.                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-EVAL-008`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:349-356`                                                                                           | Engine returns the caller default with `DISABLED`/`SdkDefault`; passed through untouched (corroborated by `gff/src/lib/go-feature-flag-provider.test.ts:929-952`).                                                                                                                                                                                                                     |
| `GOFF-EVAL-009`     | Major    | Core       | **PARTIAL** | `gff/src/lib/evaluator/inprocess-evaluator.ts:354`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:266-277`                                    | In-process the TS cast is erased and structure survives; the remote path drops every non-primitive entry.                                                                                                                                                                                                                                                                              |
| `GOFF-EVAL-010`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:354`                                                                                               | No key filtering; `gofeatureflag_cacheable` is boolean and survives both paths. Never required.                                                                                                                                                                                                                                                                                        |
| `GOFF-EVAL-011`     | Major    | Core       | PASS        | SDK `server-sdk dist/cjs/index.js:769-772, 856-867`                                                                                              | SDK-defined: thrown resolver errors become default + error code.                                                                                                                                                                                                                                                                                                                       |
| `GOFF-CTX-001`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:254`; `libs/providers/ofrep/src/lib/ofrep-provider.ts:86`                                          | The SDK `EvaluationContext` (with top-level `targetingKey`) is forwarded verbatim.                                                                                                                                                                                                                                                                                                     |
| `GOFF-CTX-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:254`                                                                                               | No wrapper object; attributes stay flat.                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-CTX-003`      | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:226-262`                                                                                           | No targeting-key validation exists on either path; empty/missing keys reach the engine.                                                                                                                                                                                                                                                                                                |
| `GOFF-CTX-004`      | Critical | In-process | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:231`                                                                                                          | _Accidental_: `JSON.stringify` renders integral doubles without a fraction, so the narrowing happens implicitly. See Open question 2.                                                                                                                                                                                                                                                  |
| `GOFF-CTX-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:257, 297`                                                                                          | Enrichment stored and handed to the engine in `flagContext`, which performs the precedence merge (§B.3).                                                                                                                                                                                                                                                                               |
| `GOFF-CTX-006`      | Critical | Core       | **FAIL**    | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:39`                                                                                          | Assigns the entire `gofeatureflag` key, destroying caller `flagList` / `currentDateTime`.                                                                                                                                                                                                                                                                                              |
| `GOFF-CTX-007`      | Major    | Core       | **FAIL**    | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:39`                                                                                          | Metadata written flat under `gofeatureflag`, not under `gofeatureflag.exporterMetadata`.                                                                                                                                                                                                                                                                                               |
| `GOFF-CTX-008`      | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:36-41`                                                                                       | _Accidental_: replacement is unconditional and untyped, so a non-map value is overwritten rather than failing.                                                                                                                                                                                                                                                                         |
| `GOFF-CTX-009`      | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:29-43`                                                                                       | The provider never writes those keys (it destroys them — tracked under `GOFF-CTX-006`).                                                                                                                                                                                                                                                                                                |
| `GOFF-REM-001`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:153, 158-162` (delegated)                                                                       | `POST {baseUrl}/ofrep/v1/evaluate/flags/{flagKey}`.                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-REM-002`      | Major    | Remote     | PASS        | `libs/providers/ofrep/src/lib/ofrep-provider.ts:86`; `ofrep-api.ts:161` (delegated)                                                              | Body is `{"context": {...}}` with flattened attributes.                                                                                                                                                                                                                                                                                                                                |
| `GOFF-REM-003`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:235-264` (delegated)                                                                            | `value`, `reason`, `variant`, `metadata` mapped to `ResolutionDetails`.                                                                                                                                                                                                                                                                                                                |
| `GOFF-REM-004`      | Major    | Remote     | PASS        | `libs/providers/ofrep/src/lib/ofrep-provider.ts:79-83, 90-92`; `ofrep-core/src/lib/api/errors.ts:84-105` (delegated)                             | `Retry-After` parsed as seconds or HTTP-date and enforced via `notBefore`.                                                                                                                                                                                                                                                                                                             |
| `GOFF-REM-005`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:90-147`                                                                                         | No retry loop anywhere in the request path.                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-REM-006`      | Major    | Remote     | PASS        | `gff/src/lib/evaluator/remote-evaluator.ts:25`; `ofrep-core/src/lib/api/ofrep-api.ts:102-113`                                                    | Configured timeout forwarded; the delegate's own default is the same `10000 ms`.                                                                                                                                                                                                                                                                                                       |
| `GOFF-IP-001`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:81-86`                                                                                                               | `POST {endpoint}/v1/flag/configuration`.                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-IP-002`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:60`                                                                                                                  | Body is `{"flags": []}` when no list is supplied.                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-IP-003`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:81`                                                                                                                  | String concatenation onto `endpoint` preserves any path prefix.                                                                                                                                                                                                                                                                                                                        |
| `GOFF-IP-004`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:215-216`; `gff/src/lib/evaluator/inprocess-evaluator.ts:296-297`                                                     | Both `flags` and `evaluationContextEnrichment` are stored.                                                                                                                                                                                                                                                                                                                             |
| `GOFF-IP-005`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:198, 68-70`                                                                                                          | Header value stored raw (quotes intact) and echoed verbatim as `If-None-Match`.                                                                                                                                                                                                                                                                                                        |
| `GOFF-IP-006`       | Critical | In-process | PASS        | `gff/src/lib/helper/constants.ts:24`; `gff/src/lib/evaluator/inprocess-evaluator.ts:74-77, 90`                                                   | Polling is scheduled unconditionally on a resolved interval defaulting to `120000 ms`. The interval is resolved once in the constructor so the initial schedule and every reschedule agree. _Fixed — Step 2._                                                                                                                                                                          |
| `GOFF-IP-007`       | Critical | In-process | PASS        | `gff/src/lib/model/flag-config-response.ts:38, 48`; `gff/src/lib/service/api.ts:101-106`; `gff/src/lib/evaluator/inprocess-evaluator.ts:277-281` | A `304` returns the `NOT_MODIFIED` sentinel before the body or any header is read, and the refresh routine returns on it before touching state. The union return type makes a body on the 304 path unrepresentable. _Fixed — Step 1._                                                                                                                                                  |
| `GOFF-IP-015`       | Major    | In-process | PASS        | `gff/src/lib/model/flag-config-response.ts:38`; `gff/src/lib/evaluator/inprocess-evaluator.ts:277-281`                                           | The sentinel carries no `ETag` to write back, and the early return precedes the write at `:302`. _Fixed — Step 1._                                                                                                                                                                                                                                                                     |
| `GOFF-IP-008`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:226-231`                                                                                                             | A `JSON.parse` failure now throws `ImpossibleToRetrieveConfigurationException`, which `loadConfiguration` propagates as a failed refresh. _Fixed — Step 1._                                                                                                                                                                                                                            |
| `GOFF-IP-009`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:235-239`                                                                                                             | A null or absent flag map throws rather than degrading to `{}`. An explicitly empty map is still accepted as a valid configuration. _Fixed — Step 1._                                                                                                                                                                                                                                  |
| `GOFF-IP-010`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:93-100`                                                                                            | `.catch(...).finally(reschedule)` keeps polling alive through errors.                                                                                                                                                                                                                                                                                                                  |
| `GOFF-IP-011`       | Minor    | In-process | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:98`                                                                                                | Fixed interval; no jitter (searched `src/` for `jitter`, `random`).                                                                                                                                                                                                                                                                                                                    |
| `GOFF-IP-012`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:241-250`                                                                                           | Missing flag returns `FLAG_NOT_FOUND` before the engine is touched.                                                                                                                                                                                                                                                                                                                    |
| `GOFF-IP-013`       | Critical | In-process | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:256-263`                                                                                                      | Every throw becomes `{errorCode: 'GENERAL', reason: 'ERROR'}`; the SDK then returns the caller default.                                                                                                                                                                                                                                                                                |
| `GOFF-IP-014`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:252-260`                                                                                           | Input carries `flagKey`, `flag`, `evalContext` and `flagContext{defaultSdkValue, evaluationContextEnrichment}`.                                                                                                                                                                                                                                                                        |
| `GOFF-IP-016`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:214-216`; `gff/src/lib/wasm/evaluate-wasm.ts:231`; `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                | The `Flag` interface is a compile-time type assertion only; the parsed object is re-serialised untouched. `trackEvents` is the sole field read.                                                                                                                                                                                                                                        |
| `GOFF-IP-017`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:214`                                                                                                                 | No schema validation exists, so unknown fields are tolerated and preserved.                                                                                                                                                                                                                                                                                                            |
| `GOFF-WASM-001`     | Major    | WASM       | **PARTIAL** | `gff/src/lib/wasm/evaluate-wasm.ts:53, 56-58`                                                                                                    | `malloc`/`free`/`evaluate` are checked; `memory` is assigned without any presence check.                                                                                                                                                                                                                                                                                               |
| `GOFF-WASM-002`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/wasm_exec.js:554-568`; `gff/src/lib/wasm/evaluate-wasm.ts:47`                                                                  | `_start` invoked once per instance; exit code `0` is returned, not treated as failure.                                                                                                                                                                                                                                                                                                 |
| `GOFF-WASM-003`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:231, 238`                                                                                                     | `TextEncoder.encode(...).length` is the UTF-8 byte length.                                                                                                                                                                                                                                                                                                                             |
| `GOFF-WASM-004`     | Major    | WASM       | **PARTIAL** | `gff/src/lib/wasm/evaluate-wasm.ts:363-365`                                                                                                      | Length uses BigInt masking (correct); the pointer is narrowed by `& 0xffffffff` on a `Number`, a signed 32-bit operation.                                                                                                                                                                                                                                                              |
| `GOFF-WASM-005`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:238-254`                                                                                                      | Output is read at :241, `free` runs in the `finally` at :250-254 — read before free.                                                                                                                                                                                                                                                                                                   |
| `GOFF-WASM-006`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:252-254, 367-369`                                                                                             | Input freed after the read; output never freed; packed `0` raises `WasmInvalidResultException`.                                                                                                                                                                                                                                                                                        |
| `GOFF-WASM-007`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:234-254`                                                                                                      | _Accidental_: `malloc → evaluate → read → free` contains no `await`, so the single-threaded event loop cannot interleave two calls. No explicit guard.                                                                                                                                                                                                                                 |
| `GOFF-WASM-008`     | Critical | WASM       | **FAIL**    | `gff/src/lib/wasm/evaluate-wasm.ts:256-263`                                                                                                      | A trap is swallowed into a `GENERAL` response; the poisoned instance is retained and reused.                                                                                                                                                                                                                                                                                           |
| `GOFF-WASM-012`     | Critical | WASM       | **FAIL**    | `gff/src/lib/wasm/evaluate-wasm.ts:250-254`                                                                                                      | The `finally` calls `free` on the trapped instance unconditionally.                                                                                                                                                                                                                                                                                                                    |
| `GOFF-WASM-009`     | Major    | WASM       | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:67`; `gff/src/lib/go-feature-flag-provider-options.ts:4-58`                                        | Exactly one instance; no pool and no `wasmEvaluatorPoolSize` option.                                                                                                                                                                                                                                                                                                                   |
| `GOFF-WASM-010`     | Major    | WASM       | PASS        | `gff/scripts/copy-latest-wasm.js:11`                                                                                                             | Single machine-readable pin, value `0.2.4`. Resolvability is `GOFF-ENG-001`'s concern, not this one's.                                                                                                                                                                                                                                                                                 |
| `GOFF-WASM-011`     | Minor    | WASM       | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:57`; `gff/src/lib/wasm/evaluate-wasm.ts:140-147`                                                | `wasmBinaryPath` overrides path resolution.                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-WASM-013`     | Major    | WASM       | **FAIL**    | (inherited from `GOFF-WASM-008` / `-012`, §C.1)                                                                                                  | No trap handling regardless of binary.                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-ERR-001`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:316-339`                                                                                           | Every engine code with an SDK equivalent is mapped to it.                                                                                                                                                                                                                                                                                                                              |
| `GOFF-ERR-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:337-338`                                                                                           | `default:` branch throws `GeneralError`; `FLAG_CONFIG` correctly lands there.                                                                                                                                                                                                                                                                                                          |
| `GOFF-ERR-003`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:323-338`                                                                                           | `response.errorDetails` becomes the error message on every branch.                                                                                                                                                                                                                                                                                                                     |
| `GOFF-ERR-004`      | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:96-114`; `ofrep-core/src/lib/api/ofrep-api.ts:126-140`                                                               | `401/403` distinct from `404`, `400`, `429` and `5xx` on both paths.                                                                                                                                                                                                                                                                                                                   |
| `GOFF-ERR-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:93-94`                                                                                             | Background refresh errors are logged and swallowed.                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-ERR-006`      | Minor    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:115`                                                                                                     | Collector failures logged at error level.                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-HOOK-001`     | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:141-147`                                                                                                | Registered order is `[DataCollector, EnrichEvaluationContext]` — reversed.                                                                                                                                                                                                                                                                                                             |
| `GOFF-HOOK-002`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:52, 141-148`                                                                                            | Hooks are built once in the constructor; `initialize` never touches them.                                                                                                                                                                                                                                                                                                              |
| `GOFF-HOOK-003`     | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:144-147`                                                                                                | The enrichment hook is registered only when `exporterMetadata` is truthy.                                                                                                                                                                                                                                                                                                              |
| `GOFF-HOOK-004`     | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:29-43`                                                                                       | Only `before`; returns a spread copy rather than mutating.                                                                                                                                                                                                                                                                                                                             |
| `GOFF-HOOK-005`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:40, 71`                                                                                                 | Both `after` and `error` implemented.                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-HOOK-006`     | Major    | Core       | **FAIL**    | `gff/src/lib/hook/data-collector-hook.ts:46-49, 78-81`                                                                                           | Both stages gate on trackability only; `disableDataCollection` is never consulted.                                                                                                                                                                                                                                                                                                     |
| `GOFF-COLL-001`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:153`                                                                                                                 | `POST {endpoint}/v1/data/collector` — the required fallback when `dataCollectorBaseURL` is unset.                                                                                                                                                                                                                                                                                      |
| `GOFF-COLL-002`     | Critical | Core       | PASS        | `gff/src/lib/service/api.ts:133-136`; `gff/src/lib/model/exporter-request.ts:10-15`                                                              | Keys are exactly `meta` and `events`.                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-COLL-003`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:53, 86`                                                                                                 | `kind: 'feature'`.                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-COLL-004`     | Critical | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:54, 87`; `gff/src/lib/model/feature-event.ts:35`                                                        | Serialised as `default`.                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-COLL-005`     | Major    | Core       | **FAIL**    | `gff/src/lib/helper/event-util.ts:9`                                                                                                             | An absent evaluation context yields `anonymousUser`; the normative table requires `user`.                                                                                                                                                                                                                                                                                              |
| `GOFF-COLL-006`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:59, 90`; `gff/src/lib/helper/constants.ts:25`                                                           | Targeting key or the `undefined-targetingKey` sentinel.                                                                                                                                                                                                                                                                                                                                |
| `GOFF-COLL-007`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:54, 91`                                                                                                 | `Math.floor(Date.now() / 1000)`.                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-COLL-008`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:58, 88`                                                                                                 | `details.variant ?? 'SdkDefault'`.                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-COLL-009`     | Minor    | Core       | **FAIL**    | `gff/src/lib/hook/data-collector-hook.ts:51-60`; `gff/src/lib/model/feature-event.ts:51`                                                         | `version` is declared on the event type but never populated.                                                                                                                                                                                                                                                                                                                           |
| `GOFF-COLL-010`     | Minor    | Core       | **FAIL**    | `gff/src/lib/model/feature-event.ts:6-52`                                                                                                        | No `source` field exists (searched `src/` for `INPROCESS`, `PROVIDER_CACHE`, `source:`).                                                                                                                                                                                                                                                                                               |
| `GOFF-COLL-011`     | Major    | Core       | **FAIL**    | `gff/src/lib/service/api.ts:134`; `gff/src/lib/model/exporter-metadata.ts:21-23`                                                                 | `meta` carries only user metadata; `provider` and `openfeature` are never added.                                                                                                                                                                                                                                                                                                       |
| `GOFF-COLL-012`     | Minor    | Core       | **FAIL**    | (inherited from `GOFF-COLL-011`, §C.1)                                                                                                           | No `provider` key to hold `javascript`.                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-COLL-013`     | Major    | Core       | **PARTIAL** | `gff/src/lib/model/exporter-metadata.ts:12-15`                                                                                                   | Types are constrained at compile time only; `add()` performs no runtime validation and nothing is rejected at construction.                                                                                                                                                                                                                                                            |
| `GOFF-COLL-014`     | Major    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:59-65, 89-97, 71-82`                                                                                     | Interval, `maxPendingEvents` threshold and shutdown all flush.                                                                                                                                                                                                                                                                                                                         |
| `GOFF-COLL-015`     | Minor    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:60, 107-109`                                                                                             | _Accidental_: `runPublisher` does call `publishEvents` on start, but the empty-buffer guard returns before any HTTP call.                                                                                                                                                                                                                                                              |
| `GOFF-COLL-016`     | Major    | Core       | **FAIL**    | `gff/src/lib/service/event-publisher.ts:104-119`                                                                                                 | No in-flight flag; a timer flush can overlap an over-threshold flush.                                                                                                                                                                                                                                                                                                                  |
| `GOFF-COLL-017`     | Critical | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:110-113`                                                                                                 | Buffer is swapped synchronously before the `await`; no lock spans the HTTP call.                                                                                                                                                                                                                                                                                                       |
| `GOFF-COLL-018`     | Major    | Core       | **FAIL**    | `gff/src/lib/service/event-publisher.ts:117`                                                                                                     | The failed batch is appended to the tail, behind anything enqueued during the flight.                                                                                                                                                                                                                                                                                                  |
| `GOFF-COLL-019`     | Critical | Core       | **FAIL**    | `gff/src/lib/service/event-publisher.ts:17, 90, 117`                                                                                             | The array is never capped and nothing is discarded on overflow.                                                                                                                                                                                                                                                                                                                        |
| `GOFF-COLL-020`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                                                                                               | `flag.trackEvents ?? true`.                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-COLL-021`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:199-203`                                                                                           | Unknown flag returns `true`.                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-COLL-022`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                                                                                               | Explicit `trackEvents: false` suppresses the event.                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-COLL-023`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/remote-evaluator.ts:98-100`                                                                                               | Remote mode reports nothing trackable, so no double counting.                                                                                                                                                                                                                                                                                                                          |
| `GOFF-TRACK-001`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:24, 56-68`                                                                                              | Implements the SDK `Tracking` interface.                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-TRACK-002`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:56-68, 111`                                                                                             | `track` is mode-independent and the publisher starts in both modes.                                                                                                                                                                                                                                                                                                                    |
| `GOFF-TRACK-003`    | Major    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider.ts:56-68`                                                                                                  | `disableDataCollection` is never consulted before enqueuing.                                                                                                                                                                                                                                                                                                                           |
| `GOFF-TRACK-004`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:59, 63`; `gff/src/lib/model/tracking-event.ts:11, 41`                                                   | `kind: 'tracking'`, details under `trackingEventDetails`.                                                                                                                                                                                                                                                                                                                              |
| `GOFF-TRACK-005`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:60-65`                                                                                                  | Carries `evaluationContext` and reuses the §13 rules — including the defective `getContextKind` (tracked under `GOFF-COLL-005`).                                                                                                                                                                                                                                                       |
| `GOFF-AUTH-001`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:73-75`; `gff/src/lib/helper/constants.ts:10`                                                                         | `Authorization: Bearer {apiKey}`.                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-AUTH-002`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:73-75, 145-147`; `gff/src/lib/evaluator/remote-evaluator.ts:20-22`                                                   | Applied to configuration, collection and evaluation.                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-AUTH-003`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:73`; `gff/src/lib/evaluator/remote-evaluator.ts:20`                                                                  | Truthiness guard means empty/unset sends no header.                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-AUTH-004`     | Minor    | Core       | **FAIL**    | `gff/src/lib/go-feature-flag-provider-options.ts:4-58`; `gff/src/lib/evaluator/remote-evaluator.ts:19-22`                                        | No option for additional headers; the remote header list is hardcoded.                                                                                                                                                                                                                                                                                                                 |
| `GOFF-FALLBACK-001` | Major    | In-process | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:226-263`                                                                                           | No remote retry path exists (searched `src/` for `fallback`, `evaluated_remotely`, OFREP use in the in-process evaluator).                                                                                                                                                                                                                                                             |
| `GOFF-FALLBACK-002` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | No trigger to evaluate.                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-FALLBACK-003` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | Prohibition inherits the parent FAIL.                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-FALLBACK-004` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-FALLBACK-005` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-FALLBACK-006` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | Prohibition inherits the parent FAIL.                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-FALLBACK-007` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | `gofeatureflag_evaluated_remotely` appears nowhere in `src/`.                                                                                                                                                                                                                                                                                                                          |
| `GOFF-FALLBACK-008` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-FALLBACK-009` | Major    | In-process | **FAIL**    | (inherited from `-001`, §C.1)                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-001`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | No remote cache implemented.                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-CACHE-002`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-003`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-004`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-005`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-006`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CACHE-007`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 3. Findings

Ordered Critical → Major → Minor. Fixes are **described, not applied**.

### 3.1 Critical

---

#### ✅ C1 — `GOFF-ENG-001` · **RESOLVED in Step 0**

_Resolved by advancing the `wasm-releases` gitlink to `76bf27bab805b2fdc564a0f8557c03d1af414d70` ("Publish evaluation WASM files for 0.2.4"). `nx copy-wasm` now exits 0, and the copied binary is byte-identical to `gofeatureflag-evaluation_0.2.4.wasm` (sha256 `c051989c1f565864c50745856f0b0bcd435226c13db4ece4c4ee5352dc8938e5`). The full 143-test suite passes on the new engine. Original finding retained below for the record._

<details>
<summary>Original finding — The pin named `0.2.4`, but the submodule could not supply it</summary>

**Spec:** "The provider **MUST** evaluate using engine `modules/core v0.7.2`. A WASM-based provider satisfies this by pinning WASM module `0.2.4`, which embeds that core version." §1.6 adds: "Evidence for `GOFF-ENG-001` is the **pinned version declaration**, not the binary itself … an audit verifies **the pin and the code path that consumes it**."

**Code — the pin (satisfied).** `scripts/copy-latest-wasm.js:11` now reads `const TARGET_WASM_VERSION = '0.2.4';` — the mandated version, in a single machine-readable location. At the audited commit this was `'0.2.3'`; the maintainer corrected it during the audit.

**Code — the consuming path (not satisfied).** The declaration does not resolve to a file:

- `copy-latest-wasm.js:17` runs `git submodule update --init wasm-releases`. Without `--remote`, that checks out the gitlink recorded in the superproject — `1eda3b7f5b6696554acf454a488bc33da5f5a062` (`git submodule status`) — and _resets_ the submodule to it even if a newer commit is already present locally.
- That commit's `evaluation/` directory contains `gofeatureflag-evaluation_0.1.3` through `_0.2.3` only. **`gofeatureflag-evaluation_0.2.4.wasm` is not there** (verified via the GitHub contents API at `?ref=1eda3b7f5b…`).
- `copy-latest-wasm.js:22` therefore builds the filename `gofeatureflag-evaluation_0.2.4.wasm`, `:29` finds it missing, `:30-36` prints the available files, and `:37` calls `process.exit(1)`.

The artefact _does_ exist upstream — it is present in `evaluation/` on the default branch (checked at head commit `76bf27bab805b2fdc564a0f8557c03d1af414d70`). Only the submodule gitlink is stale.

**Consequence:** `copy-wasm` now exits non-zero, and `project.json:32-51` makes it a `dependsOn` of **both** `test` and `package`. So the provider currently cannot be built or tested at all, and no `.wasm` is copied into `src/lib/wasm/wasm-module/` for `EvaluateWasm` to load (`evaluate-wasm.ts:14, 96-113`). This is a louder failure than the original `0.2.3` — CI stops rather than silently shipping a stale engine — but it is still a failure, and it is one commit away from being fixed.

Once the submodule is advanced, the original concern is genuinely resolved: `0.2.3` was the last binary carrying **none** of the §10.1 guard rails (1 MB shadow stack; structured `PARSE_ERROR` instead of a trap on deep nesting, oversized queries and long operand arrays), so moving to `0.2.4` removes the interaction that made C12/C13 and M1 acute.

**Smallest fix — one commit:**

```bash
git -C libs/providers/go-feature-flag/wasm-releases fetch origin
git -C libs/providers/go-feature-flag/wasm-releases checkout 76bf27bab805b2fdc564a0f8557c03d1af414d70
git add libs/providers/go-feature-flag/wasm-releases   # records the new gitlink
npx nx copy-wasm providers-go-feature-flag             # must now exit 0
```

Verify by confirming `src/lib/wasm/wasm-module/gofeatureflag-evaluation.wasm` exists afterwards, then re-audit this requirement to **PASS**.

> **Scope note.** Advancing the binary changes only _which_ engine is bundled. It does **not** discharge **C12** (`GOFF-WASM-008`, trapped instance reused), **C13** (`GOFF-WASM-012`, `free` on a trapped instance) or **M29** (`GOFF-WASM-013`), which requires trap handling _"regardless of which binary it bundles"_ — the guards reduce traps, they do not eliminate them.

</details>

---

#### C2 — `GOFF-CFG-005` · Endpoint and credentials are read from environment variables

**Spec:** "The provider **MUST NOT** read environment variables to determine the endpoint or credentials. A feature-flag provider silently retargeting itself based on ambient environment is a security surprise."

**Code:** In remote mode, `src/lib/evaluator/remote-evaluator.ts:23-29` builds an `OFREPProvider`. Its constructor calls `getConfig` at `libs/providers/ofrep/src/lib/configuration.ts:138`, which merges `getEnvVarConfig()` (`:14-42`) reading **`OFREP_ENDPOINT`** (`:17-26`), **`OFREP_HEADERS`** (`:37-39`) and **`OFREP_TIMEOUT_MS`** (`:28-35`). The endpoint precedence is `providedOptions.baseUrl ?? envVarConfig.baseUrl ?? ''` (`:145`), and headers are merged with the environment as the _base_ layer (`:146`, `:105-131`).

This is reachable by design, not by accident: `src/lib/go-feature-flag-provider-options.ts:60-63` documents it — _"The evaluation type remote does not require an endpoint, because it can be set by the environment variable OFREP_ENDPOINT"_ — and `src/lib/go-feature-flag-provider.ts:160` deliberately exempts remote mode from the mandatory-endpoint check.

**Consequence:** A process that sets `OFREP_ENDPOINT` retargets every flag evaluation to a host the application never named. `OFREP_HEADERS` is worse: it seeds the header map, so when `apiKey` is unset the provider will send an `Authorization` header sourced entirely from the ambient environment. Both are exactly the silent-retargeting surprise the requirement prohibits.

**Smallest fix:** In `RemoteEvaluator`, make `endpoint` mandatory and pass it explicitly, and pass a complete `headers` array so nothing can be inherited — i.e. stop routing through the env-reading `getConfig` layer. Remediation for the general case lies **upstream** in `libs/providers/ofrep/src/lib/configuration.ts`, which is where the env lookup would have to become opt-in; the local fix above closes it for this provider without waiting on that.

---

#### ✅ C3 — `GOFF-IP-006` · **RESOLVED in Step 2**

_Polling is now scheduled unconditionally on an interval resolved once in the constructor, defaulting to `120000 ms`. Resolving it once matters: `poll()` reschedules from the same field, so handing the raw option to `setTimeout` would have turned an unset interval into a zero delay — a tight loop against the relay proxy. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **MUST** poll for configuration changes on the configured interval. Polling **MUST** be active by default; it **MUST NOT** require explicit opt-in."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:79-81`:

```ts
if (this.options.flagChangePollingIntervalMs && this.options.flagChangePollingIntervalMs > 0) {
  this.periodicRunner = setTimeout(() => this.poll(), this.options.flagChangePollingIntervalMs);
}
```

No default is applied anywhere: `src/lib/helper/constants.ts` defines `DEFAULT_FLUSH_INTERVAL_MS` and `DEFAULT_MAX_PENDING_EVENTS` but no polling constant, and `src/lib/go-feature-flag-provider-options.ts:15` only declares the field with a `@default 120000` JSDoc tag that no code reads.

**Consequence:** A provider constructed the documented way — `new GoFeatureFlagProvider({endpoint})` — fetches the flag configuration exactly once and then serves that snapshot for the process lifetime. Flag changes never arrive, `PROVIDER_CONFIGURATION_CHANGED` never fires, and nothing in the logs indicates it. Anyone reading `README.md:80` will believe polling runs every 120 s.

**Smallest fix:** Default the value: `const interval = this.options.flagChangePollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;` (adding `DEFAULT_POLLING_INTERVAL_MS = 120000` to `constants.ts`) and schedule unconditionally. Note `src/lib/go-feature-flag-provider.ts:175-177` already rejects non-positive values, so the guard is redundant once a default exists.

---

</details>

---

#### ✅ C4 — `GOFF-IP-007` · **RESOLVED in Step 1**

_The API layer now returns a `NOT_MODIFIED` sentinel for a 304, before reading the body or any header, and `loadConfiguration` returns on it before touching state. `retrieveFlagConfiguration` returns `FlagConfigResponse | NotModified`, so the compiler rejects any access to `.flags` that has not first discriminated the 304 case — the 304 branch is structurally incapable of carrying a configuration. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "A `304 Not Modified` response **MUST NOT** write flags, enrichment or timestamps — **regardless of whether the response echoed an `ETag` header**. The 304 path **MUST** be structurally incapable of carrying a configuration body: the transport layer **MUST** signal 'not modified' by a distinct type or sentinel rather than by an empty response object."

**Code:** `src/lib/service/api.ts:90-95` handles `304` in the _same_ `switch` branch as `200`, and `:202-211` returns an ordinary `FlagConfigResponse` whose `flags` and `evaluationContextEnrichment` are `{}` — precisely the "empty response object" the requirement forbids. Downstream, `src/lib/evaluator/inprocess-evaluator.ts:278` guards only on ETag equality:

```ts
if (this.etag && this.etag === flagConfigResponse.etag) {
  return;
}
```

When the `304` carries no `ETag` header, `flagConfigResponse.etag` is `undefined` (`api.ts:198`), the guard is false, and lines `294-297` execute: `this.flags = flagConfigResponse.flags || {}` → `{}`, and `this.evaluationContextEnrichment` → `{}`. The `lastUpdated` guard at `:284-291` does not save it either, because a `304` without `Last-Modified` yields `new Date(0)`, which that check explicitly skips.

**Consequence:** Every flag disappears from the local configuration. Because `GOFF-IP-012` then reports `FLAG_NOT_FOUND` for every key, every evaluation in the process returns the caller's default with an error that blames the caller's flag key. Nothing recovers this until the server next sends a full `200` with a body.

**Smallest fix:** Give the transport a distinct signal — return `null` (or a `NotModified` sentinel type) from `retrieveFlagConfiguration` for status `304`, and have `loadConfiguration` return immediately on it, before touching any state. The tip box under §9.2 recommends exactly this shape.

---

</details>

---

#### ✅ C5 — `GOFF-IP-008` · **RESOLVED in Step 1**

_A `JSON.parse` failure now throws `ImpossibleToRetrieveConfigurationException` instead of degrading to empty flags, so the refresh fails and both the configuration and the stored `ETag` survive. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "A `200` response whose body cannot be parsed **MUST** be treated as a failed refresh: the previous configuration **MUST** be preserved and the stored `ETag` **MUST NOT** advance."

**Code:** `src/lib/service/api.ts:213-220`:

```ts
try {
  const goffResp = JSON.parse(body) as FlagConfigResponse;
  result.evaluationContextEnrichment = goffResp.evaluationContextEnrichment || {};
  result.flags = goffResp.flags || {};
} catch (error) {
  this.logger?.warn(`Failed to parse flag configuration response: ${error}. ...`);
  // Return the default result with empty flags and enrichment
}
return result;
```

The parse failure is downgraded to a warning and the function returns a _successful-looking_ result with `flags: {}` and the new `ETag` from `:198`. `inprocess-evaluator.ts:294-296` then commits both.

**Consequence:** A truncated response, an HTML error page from an intervening proxy, or a gzip mishap silently empties the flag map — and because the `ETag` advanced, the next poll gets a `304` and the empty state becomes permanent for the process lifetime. Every evaluation degrades to `FLAG_NOT_FOUND`.

**Smallest fix:** Re-throw as `ImpossibleToRetrieveConfigurationException` instead of swallowing; `loadConfiguration`'s existing `catch` (`:304-307`) already propagates it as a failed refresh and `poll` (`:93-94`) already keeps polling alive.

---

</details>

---

#### ✅ C6 — `GOFF-IP-009` · **RESOLVED in Step 1**

_A null or absent flag map now throws rather than degrading to `{}`. An explicitly empty map is still accepted, since a relay proxy serving no flags is a valid configuration rather than a failure. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "A `200` response whose decoded flag map is null or absent **MUST** likewise be treated as a failed refresh. Accepting it wipes every flag, and advancing the `ETag` makes the empty state permanent."

**Code:** `src/lib/service/api.ts:216` — `result.flags = goffResp.flags || {};`. A body of `{}` or `{"flags": null}` parses cleanly and produces `flags: {}`, indistinguishable from a genuine empty configuration. `inprocess-evaluator.ts:294-296` writes both the empty map and the new `ETag`.

**Consequence:** Identical to C5 and permanent for the same reason: the advanced `ETag` means the next poll returns `304`, so the provider never asks for a full body again.

**Smallest fix:** Distinguish absent from empty — check `goffResp.flags === undefined || goffResp.flags === null` and throw `ImpossibleToRetrieveConfigurationException` rather than defaulting to `{}`.

---

</details>

---

#### ✅ C7 — `GOFF-LIFE-002` · **RESOLVED in Step 3**

_`initialize` now cancels the existing polling task and awaits any refresh in flight before scheduling a new one. Cancelling the timer alone was not sufficient: a refresh mid-flight reschedules itself based on `periodicRunner`, so it would have attached to the newly installed timer and produced the very duplicate chain being prevented. `EvaluateWasm.initialize` returns early while an instance is live. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Initialization **MUST** be safe to call more than once. A second call **MUST** cancel and join any existing polling task, **MUST NOT** start a duplicate one, and **MUST NOT** leak or double-instantiate the evaluation engine."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:73-87` has no guard whatsoever. A second call re-runs `await this.evaluationEngine.initialize()` (`:74`), which at `src/lib/wasm/evaluate-wasm.ts:44-47` performs a fresh `WebAssembly.instantiate` and a second `this.go.run(...)` on the _same_ `Go` object constructed once at `:30` — the previous instance is abandoned without `dispose`. Line `:80` then overwrites `this.periodicRunner` with a new `setTimeout` while the previous timer chain is still live and self-rescheduling (`:95-100`).

Contrast `EventPublisher.start()` at `src/lib/service/event-publisher.ts:48-50`, which _does_ carry the `if (this.isRunning) return;` guard — the evaluator simply lacks the equivalent.

**Consequence:** Every re-initialization (e.g. `OpenFeature.setProviderAndWait` called again for the same domain) permanently doubles the polling rate against the relay proxy and leaks a WebAssembly instance plus its linear memory. Neither is observable until the process is under memory pressure or the proxy starts rate-limiting.

**Smallest fix:** At the top of `initialize()`, `clearTimeout(this.periodicRunner); this.periodicRunner = undefined;` and skip `evaluationEngine.initialize()` when `wasmExports` is already populated (or `dispose()` the previous instance first).

---

</details>

---

#### ✅ C8 — `GOFF-EVT-007` · **RESOLVED in Step 5**

_An `UnauthorizedException` raised during initialization is now rethrown as the SDK's `ProviderFatalError`, preserving the original as `cause`. Every other initialization failure is rethrown untouched and still settles in `ERROR`, so `GOFF-EVT-008` is unaffected — both halves are pinned by tests asserting the resulting provider status. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Authentication failure (`401`, `403`) during initialization **MUST** put the provider in `PROVIDER_FATAL`. Credentials cannot be repaired by retrying."

**Code:** `src/lib/service/api.ts:98-102` throws `UnauthorizedException` for both statuses. That class (`src/lib/exception/unauthorized-exception.ts:3`) extends `GoFeatureFlagException` (`go-feature-flag-exception.ts:1`), which extends plain `Error` and sets only `name`. It carries no `code` property. The SDK's status mapping (`@openfeature/core@1.9.1 dist/cjs/index.js:786`) is `if (error?.code === 'PROVIDER_FATAL') → FATAL; else → ERROR`, so the provider settles in `ERROR`.

**Consequence:** A provider with a bad API key looks recoverable. It stays in `ERROR`, evaluations are _not_ short-circuited (`server-sdk dist/cjs/index.js:849-855` short-circuits only `NOT_READY` and `FATAL`), and every call falls through to `genericEvaluate`, returning defaults with `GENERAL`. Operators see a transient-looking error where the specification wants an unmistakable terminal one.

**Smallest fix:** Have `InProcessEvaluator.initialize` (or the provider's `initialize` catch at `go-feature-flag-provider.ts:112-115`) translate `UnauthorizedException` into the SDK's `ProviderFatalError` before rethrowing.

---

</details>

---

#### C9 — `GOFF-CTX-006` · The enrichment hook replaces the whole `gofeatureflag` namespace

**Spec:** "The provider **MUST** merge into `gofeatureflag`, setting or replacing only `exporterMetadata` and preserving every sibling key. Replacing the whole object silently destroys caller-supplied `flagList` and `currentDateTime`."

**Code:** `src/lib/hook/enrich-evaluation-context-hook.ts:34-41`:

```ts
const enrichedContext = { ...context.context };
if (this.metadata) {
  const metadataAsObject = this.metadata?.asObject() ?? {};
  if (Object.keys(metadataAsObject).length > 0) {
    enrichedContext['gofeatureflag'] = metadataAsObject; // whole-key assignment
  }
}
```

The SDK then shallow-merges the hook's return value into the accumulated context (`server-sdk dist/cjs/index.js:786-789`), so the assignment wins outright.

**Consequence:** A caller who sets `gofeatureflag.currentDateTime` to test a scheduled rollout, or `gofeatureflag.flagList` to narrow a bulk evaluation, has that input silently discarded on every evaluation as soon as any `exporterMetadata` is configured. The evaluation still succeeds — with the wrong inputs.

**Smallest fix:** Merge instead of assign:
`enrichedContext['gofeatureflag'] = { ...(typeof existing === 'object' && existing !== null && !Array.isArray(existing) ? existing : {}), exporterMetadata: metadataAsObject };`
This also fixes `GOFF-CTX-007` (M11) and keeps `GOFF-CTX-008` satisfied by the non-map branch.

---

#### C10 — `GOFF-EVAL-006` · A `null` evaluation result becomes `TYPE_MISMATCH` on both paths

**Spec:** "A `null` evaluation result **MUST** return the caller's default value, preserving the engine's reason, variant and metadata. It **MUST NOT** return the language's zero value."

**Code:** In-process, every resolver type-tests the value and throws on failure — `src/lib/evaluator/inprocess-evaluator.ts:118-122` (`typeof null !== 'boolean'`), `:140-144`, `:162-166`, and `:184-189` which rejects `null` explicitly (`response.value !== null && ...`). Remote is the same in substance: `libs/shared/ofrep-core/src/lib/helpers.ts:7` defines `isDefined` as `typeof value !== 'undefined'`, so `null` is _defined_ and falls through to the `typeof result.value !== typeof defaultValue` comparison at `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248` — `'object' !== 'boolean'` → `TYPE_MISMATCH`.

**Consequence:** A flag whose variation value is JSON `null` reports a type error attributed to the caller instead of returning the default with the engine's `reason`, `variant` and `metadata` intact. The caller loses the diagnostic context the specification wants preserved, and telemetry records a type mismatch that never happened.

**Smallest fix:** In each in-process resolver, test `response.value === null || response.value === undefined` _before_ the `typeof` check and return `this.prepareResponse(response, flagKey, defaultValue)`. Upstream, the delegate's `isDefined` should treat `null` as undefined (or `toResolutionDetails` should null-check first).

---

#### ✅ C11 — `GOFF-LIFE-006` · **RESOLVED in Step 4**

_The pre-ready branch now reports `PROVIDER_NOT_READY`, which `handleError` already mapped to `ProviderNotReadyError`. The prohibition half was already satisfied and is now pinned by a test. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Until a flag configuration has been successfully loaded at least once, evaluations **MUST** report `PROVIDER_NOT_READY`. They **MUST NOT** report `FLAG_NOT_FOUND`, which misattributes an infrastructure failure to the caller's flag key."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:232-240` returns `errorCode: ErrorCode.GENERAL` with the message _"Provider is not initialized, impossible to retrieve configuration"_. The prohibition half is honoured — that check sits at `:232`, before the flag lookup at `:241` — so `FLAG_NOT_FOUND` is never reported. The positive half is not: the code is `GENERAL`.

This path is reachable in normal operation. When `initialize()` fails, `configurationState` becomes `ERROR` (`:84`) and the SDK's status becomes `ERROR`, which `shortCircuitIfNotReady` (`server-sdk dist/cjs/index.js:849-855`) does **not** intercept — so calls reach the resolver and get `GENERAL`.

**Consequence:** Callers and dashboards that branch on `PROVIDER_NOT_READY` — the one code that means "wait and retry, this is not your fault" — see the catch-all `GENERAL` instead. The distinction between a not-yet-ready provider and a genuine evaluation fault is lost.

**Smallest fix:** Change the `errorCode` at `:236` to `ErrorCode.PROVIDER_NOT_READY`; `handleError` already maps it to `ProviderNotReadyError` at `:333-334`.

---

</details>

---

#### C12 — `GOFF-WASM-008` · A trapped instance is retained and reused

**Spec:** "If evaluation traps, the instance **MUST** be discarded and rebuilt. A trap does not unwind the module's shadow-stack pointer, so a trapped instance is permanently poisoned and **MUST NOT** be returned to a pool or reused."

**Code:** `src/lib/wasm/evaluate-wasm.ts:256-263` catches _everything_ — including a `WebAssembly.RuntimeError` from `evaluateFunction(...)` at `:282` — and returns a `GENERAL` error response. `this.wasmExports` and `this.wasmMemory` are left untouched, so the next `evaluate()` call finds them populated at `:226` and reuses the same poisoned instance.

**Consequence:** The first trap poisons the module for the process lifetime. Every subsequent evaluation runs against a corrupted shadow stack: results become non-deterministic, `malloc` may fault at arbitrary addresses, and each failure surfaces as an opaque `GENERAL`. The provider does not recover without a restart.

**Smallest fix:** In the `catch`, set `this.wasmExports = null; this.wasmMemory = null;` before returning, so the guard at `:226-228` rebuilds on the next call.

---

#### C13 — `GOFF-WASM-012` · `free` is called on the trapped instance

**Spec:** "After a trap the host **MUST NOT** call `free` on the trapped instance. Running further code on it faults inside `malloc` at a wrapped address and masks the original error."

**Code:** `src/lib/wasm/evaluate-wasm.ts:250-255`:

```ts
} finally {
  // Free the allocated memory
  if (inputPtr !== 0) {
    this.callWasmFree(inputPtr);
  }
}
```

A `finally` runs on the trap path as well as the success path, so `free` is invoked on an instance whose shadow-stack pointer is unwound.

**Consequence:** The secondary fault inside `free` replaces the original trap in the thrown error, so the `GENERAL` response returned to the caller describes a memory-management symptom rather than the real cause. Diagnosing why evaluation traps becomes materially harder — and the mandated ordering of §16 ("catch the trap, discard and rebuild the instance, _then_ fall back") is unreachable.

**Smallest fix:** Track whether `callWasmEvaluate` completed and free only on that path — replace the `finally` with an explicit `callWasmFree` after the successful read, plus instance teardown (C12) in the `catch`.

---

#### C14 — `GOFF-COLL-019` · The event buffer is uncapped

**Spec:** "The buffer **MUST** be capped at twice `maxPendingEvents`, discarding **oldest** events on overflow. An uncapped buffer is an unbounded memory leak during a collector outage."

**Code:** `src/lib/service/event-publisher.ts:17` declares `private readonly events: ExportEvent[] = []`. `addEvent` (`:89-97`) pushes unconditionally, and the failure path at `:117` pushes the entire failed batch straight back in. Nothing anywhere trims the array — the only length check (`:91`) triggers a _flush_, not a discard.

**Consequence:** While the data collector is unreachable, every evaluation and every `track()` call appends an event that is never removed: each flush attempt drains the array and then puts the whole batch back. Memory grows without bound for the duration of the outage, and the failing publish grows in size with it. On a busy service this ends in an OOM kill.

**Smallest fix:** After the push in `addEvent` and after the re-queue at `:117`, trim from the front: `const cap = 2 * (this.options.maxPendingEvents ?? DEFAULT_MAX_PENDING_EVENTS); if (this.events.length > cap) this.events.splice(0, this.events.length - cap);`

---

### 3.2 Major

---

#### M1 — `GOFF-FALLBACK-001` · Remote fallback is entirely unimplemented

**Spec:** "When in-process evaluation returns raw engine code `PARSE_ERROR` or `GENERAL`, the provider **MUST** retry the evaluation remotely via OFREP and return the remote result."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:226-263` returns the engine response directly to `handleError`, which throws (`:316-339`). There is no OFREP client in the in-process path — `InProcessEvaluator` never imports `OFREPProvider` or `RemoteEvaluator`, and searching `src/` for `fallback` finds only an unrelated comment about WASM path resolution (`evaluate-wasm.ts:133`) and a marketing claim in `README.md:14`.

**Consequence:** Every failure mode §16 is designed to rescue becomes a hard error returned to the application. §10.1 is explicit that a guard breach surfaces as `PARSE_ERROR` and that "[§16] turns [it] into a remote evaluation. That is the intended outcome" — so on `0.2.4` a context the embedded engine cannot handle still fails here, where a conformant provider resolves it correctly against the relay proxy. On any pre-`0.2.4` binary it is worse: the breach traps instead of returning `PARSE_ERROR`, and C12/C13 then poison the instance. Nothing degrades gracefully either way.

**Smallest fix:** In `genericEvaluate`, when the raw `errorCode` is `PARSE_ERROR` or `GENERAL` (and not `FLAG_CONFIG`), delegate to a lazily constructed `RemoteEvaluator`, log at warning level, and stamp `gofeatureflag_evaluated_remotely: true` into the returned metadata; on remote failure return the original in-process response.

---

#### M2–M9 — `GOFF-FALLBACK-002` … `-009` · Inherited from M1

Per §C.1 ("Vacuous satisfaction"), a requirement whose precondition cannot occur because the governing capability is absent inherits that capability's verdict. All eight remaining §16 requirements therefore report **FAIL**, not PASS:

| ID     | Requirement (abridged)                                                             | Why it cannot pass                                   |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `-002` | Trigger evaluated against the **raw** engine code, before SDK mapping              | No trigger exists.                                   |
| `-003` | `FLAG_CONFIG` **MUST NOT** trigger a fallback                                      | Prohibition; inherits M1 (explicitly named in §C.1). |
| `-004` | Fallback attempted on **every** qualifying occurrence                              | No fallback occurs.                                  |
| `-005` | On remote failure, return the **original** in-process error and log the remote one | No remote call to fail.                              |
| `-006` | A fallback result **MUST NOT** emit a feature event                                | Prohibition; inherits M1 (explicitly named in §C.1). |
| `-007` | Fallback result carries `gofeatureflag_evaluated_remotely: true`                   | Absent from `src/` entirely.                         |
| `-008` | Each fallback logged at warning level                                              | Nothing to log.                                      |
| `-009` | Auth and timeout apply identically to the fallback request                         | No request is made.                                  |

All eight are fixed by M1 alone; each then needs its specific behaviour verified rather than a separate change.

---

#### M10 — `GOFF-CFG-009` and `GOFF-CFG-010` · `disableDataCollection` is declared, documented, and never read

**Spec:** `GOFF-CFG-009`: "An option that the provider declares and documents **MUST** be honoured. A declared option that is never read is a defect regardless of its default." `GOFF-CFG-010`: "The provider **MUST NOT** expose options for capabilities it does not implement. Vestigial options from removed features **MUST** be deleted rather than left inert."

**Code:** Declared at `src/lib/go-feature-flag-provider-options.ts:33` with the doc comment "Whether to disable data collection. @default false", documented at `README.md:83` as "Disable data collection entirely" and demonstrated at `README.md:135`. Grepping the whole of `src/` for `disableDataCollection` returns the declaration plus two test files (`go-feature-flag-provider-options.spec.ts:39,48,56,63` and `go-feature-flag-provider.test.ts:374`) — and **no production read site**.

**Consequence:** A user who sets `disableDataCollection: true` — to satisfy a privacy requirement, or to stop traffic to a collector they do not run — still has every evaluation and every tracking event posted to `/v1/data/collector`. The option's presence in the README makes this actively misleading rather than merely missing. This is also the root cause of M17 (`GOFF-HOOK-006`) and M22 (`GOFF-TRACK-003`).

**Smallest fix:** One read site each in `DataCollectorHook.after`/`.error` and `GoFeatureFlagProvider.track`, gating on the option; or, if the capability is genuinely not wanted, delete the option and both README rows.

---

#### M11 — `GOFF-CTX-007` · `exporterMetadata` is written flat under `gofeatureflag`

**Spec:** "`exporterMetadata` **MUST** be nested under `gofeatureflag.exporterMetadata`. Writing the metadata flat under `gofeatureflag` means the server never reads it."

**Code:** `src/lib/hook/enrich-evaluation-context-hook.ts:39` — `enrichedContext['gofeatureflag'] = metadataAsObject;`. `metadataAsObject` is the flat user map from `src/lib/model/exporter-metadata.ts:21-23`, so the wire shape is `{"gofeatureflag": {"environment": "production", ...}}` where the server expects `{"gofeatureflag": {"exporterMetadata": {"environment": "production", ...}}}`.

**Consequence:** Every value a user configures via `ExporterMetadata` is dropped by the relay proxy. Exported evaluation events carry none of the environment/version/region tags the user configured, and the failure is completely silent — the request succeeds, the metadata simply never appears downstream.

**Smallest fix:** The same one-line change as C9 nests the map under `exporterMetadata`.

---

#### M12 — `GOFF-COLL-011` · The `meta` envelope omits `provider` and `openfeature`

**Spec:** "The `meta` envelope **MUST** always contain `provider` and `openfeature: true`, whether or not the user configured any metadata. Without them events cannot be attributed to an SDK."

**Code:** `src/lib/service/api.ts:132-136` builds `{meta: exporterMetadata?.asObject() ?? {}, events: eventsList}`. `ExporterMetadata.asObject()` (`src/lib/model/exporter-metadata.ts:21-23`) returns only what the user added. Searching `src/` for `openfeature:` and `'javascript'` finds nothing. When no metadata is configured, `event-publisher.ts:113` passes a fresh empty `ExporterMetadata`, so `meta` is literally `{}`.

**Consequence:** The relay proxy cannot attribute any exported event to an SDK or a language. Per-SDK breakdowns in the collector are empty for this provider, and `GOFF-COLL-012` (`provider: "javascript"`) is unsatisfiable while this holds.

**Smallest fix:** In `sendEventToDataCollector`, seed the envelope: `meta: { ...(exporterMetadata?.asObject() ?? {}), provider: 'javascript', openfeature: true }`. This fixes M13 in the same line.

---

#### M13 — `GOFF-COLL-012` · No `provider` identifier (inherited from M12)

**Spec:** "`provider` **MUST** be the lowercase language identifier: `python`, `java`, `dotnet`, `go`, `javascript`, `kotlin`, `php`, `ruby`, `rust`."

Inherited FAIL per §C.1: the governing key does not exist (M12). Listed separately because the specification numbers it separately, and because it is Minor where M12 is Major. Fixed by M12's one-line change.

---

#### M14 — `GOFF-COLL-005` · An absent evaluation context yields `anonymousUser`

**Spec:** "`contextKind` **MUST** be derived from the `anonymous` attribute per the table below. Only a boolean `true` yields `anonymousUser`; a truthiness test is not sufficient." The normative table maps **"evaluation context absent" → `user`**.

**Code:** `src/lib/helper/event-util.ts:8-10`:

```ts
export const getContextKind = (context?: EvaluationContext): string => {
  return !context || context['anonymous'] === true ? 'anonymousUser' : 'user';
};
```

The identity test on `anonymous` is correct — boolean `false`, absent and non-boolean values all fall to `'user'`, matching four of the five table rows. The `!context` disjunct inverts the fifth: an absent context returns `anonymousUser` where the table requires `user`.

**Consequence:** Every event produced without an evaluation context is mis-bucketed as an anonymous user. This affects both feature events (`data-collector-hook.ts:52, 84`) and tracking events (`go-feature-flag-provider.ts:61`), so analytics that segment on `contextKind` systematically overstate anonymous traffic.

**Smallest fix:** Drop the `!context ||` disjunct — `context?.['anonymous'] === true ? 'anonymousUser' : 'user'`.

---

#### M15 — `GOFF-EVT-001` · Provider events are emitted in in-process mode only

**Spec:** "Provider events **MUST** be emitted identically in both evaluation modes. A capability present in one mode and silently absent in the other is a defect."

**Code:** `src/lib/go-feature-flag-provider.ts:130-135` passes `this.events` only to `InProcessEvaluator`; `RemoteEvaluator`'s constructor (`src/lib/evaluator/remote-evaluator.ts:17-30`) takes no emitter, and the file contains no `emit` call.

**Consequence:** An application that registers a `PROVIDER_CONFIGURATION_CHANGED` handler and works in in-process mode goes silent when switched to remote — with no error and no log line. Switching evaluation modes is presented as a configuration choice but silently changes the provider's observable event contract.

**Smallest fix:** Pass the emitter to `RemoteEvaluator` and drive configuration-changed events from the OFREP bulk/SSE path, or document the gap explicitly if remote mode is intended to be event-free — the specification requires the former.

---

#### ✅ M16 — `GOFF-EVT-004` · **RESOLVED in Step 7**

_The emit decision is now made on content. The `ETag`-equality short-circuit was removed rather than kept alongside the comparison, so there is a single path deciding whether a configuration changed._

_Per-flag serializations of the served and newly retrieved configurations are compared on each refresh, so the emitted `ConfigChangeEvent` carries `flagsChanged` naming exactly the flags added, removed or modified — the payload the SDK's own event type defines and which consumers use to invalidate selectively. A change to `evaluationContextEnrichment` reports every flag, since the enrichment is merged into the context of every evaluation and cannot be attributed to a subset. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`PROVIDER_CONFIGURATION_CHANGED` **MUST NOT** be emitted when the configuration is unchanged. A provider that cannot distinguish 'changed' from 'fetched' — for instance because the server sends no `ETag` — **MUST** compare content rather than emit unconditionally."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:278` is the only change detection: `if (this.etag && this.etag === flagConfigResponse.etag) return;`. There is no comparison of `flags` or `evaluationContextEnrichment` anywhere in `loadConfiguration`. When the server omits `ETag`, both sides are `undefined`, the guard short-circuits on `this.etag` being falsy, and `:300-303` emits.

**Consequence:** Against a relay proxy or intermediary that does not emit `ETag`, every poll (default 120 s once C3 is fixed) fires `PROVIDER_CONFIGURATION_CHANGED`. Handlers that rebuild caches or re-render on that event run continuously for a configuration that never changed.

**Smallest fix:** Before emitting, compare content — e.g. hash or `JSON.stringify` the incoming `flags` + `evaluationContextEnrichment` against the stored copies and emit only on a genuine difference. This is also the structural precondition for `GOFF-IP-007`'s "compare content rather than emit unconditionally" guidance.

---

</details>

---

#### ✅ M17 — `GOFF-EVT-005` · **RESOLVED in Step 6**

_A consecutive-failure counter now emits `Stale` on the third failure and only once per stale episode; the counter resets on any success, so a recovered provider needs three fresh failures to go stale again. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **SHOULD** emit `PROVIDER_STALE` after **3** consecutive failed configuration refreshes, and **MUST** continue serving the last known-good configuration."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:92-101` logs the error and reschedules; there is no failure counter. Searching `src/` for `Stale` returns nothing. The second clause _is_ satisfied — a failed refresh leaves `this.flags` untouched (`:304-307` rethrows before any write) — but the emission is absent. `ServerProviderEvents.Stale` is available to server providers (`@openfeature/core@1.9.1 dist/types.d.ts:188`, `dist/cjs/index.js:307`), so this is not an SDK limitation.

**Consequence:** A provider that has lost contact with the relay proxy is indistinguishable from a healthy one. It keeps serving a snapshot that silently ages, and no signal reaches the application or the SDK's status tracker.

**Smallest fix:** Add a `consecutiveFailures` counter, incremented in `poll`'s `catch` and reset on success; emit `ServerProviderEvents.Stale` when it reaches 3.

---

</details>

---

#### ✅ M18 — `GOFF-EVT-006` · **RESOLVED in Step 6**

_`Ready` is emitted on the first successful refresh after going stale. Guarded on the stale flag rather than the counter, so a provider that merely had one or two transient failures never announces a recovery it did not need. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "On recovery from stale, the provider **MUST** emit an event returning it to ready."

Inherited FAIL per §C.1 — there is no stale state to recover from. Fixed alongside M17 by emitting `ServerProviderEvents.Ready` when the failure counter resets from ≥ 3 to 0.

---

</details>

---

#### M19 — `GOFF-HOOK-001` · Hook order is reversed

**Spec:** "The provider's hooks **MUST** be observable by the time initialization completes, in the order **`[EnrichEvaluationContext, DataCollector]`**."

**Code:** `src/lib/go-feature-flag-provider.ts:141-148` pushes `DataCollectorHook` first (`:142`) and `EnrichEvaluationContextHook` second (`:145`), producing `[DataCollector, EnrichEvaluationContext]`. The observability half passes — both are registered in the constructor, so they exist before `initialize()` is even called.

**Consequence:** The SDK runs provider `before` hooks in array order and `after`/`error`/`finally` in reverse (`server-sdk dist/cjs/index.js:732-738, 777-801`). Because `DataCollectorHook` implements no `before` stage, enrichment still reaches the resolver today — but the _after_ order is inverted relative to the specification, and the arrangement is fragile: adding a `before` stage to the data-collector hook (to read enriched context, the obvious future change) would immediately produce events built from unenriched context.

**Smallest fix:** Swap the two `push` calls.

---

#### M20 — `GOFF-HOOK-003` · The enrichment hook is registered conditionally

**Spec:** "The enrichment hook **MUST** be registered unconditionally. Because `exporterMetadata` always contains the reserved keys of `GOFF-COLL-010`, it always has something to contribute."

**Code:** `src/lib/go-feature-flag-provider.ts:144-147` wraps the registration in `if (this.options.exporterMetadata)`. The hook itself already handles the empty case gracefully (`enrich-evaluation-context-hook.ts:14-18` constructs an empty `ExporterMetadata` when none is supplied), so the guard adds nothing but the defect.

**Consequence:** With no `exporterMetadata` configured — the default — the hook never runs, so the provider has no place to inject the reserved keys `GOFF-COLL-010` describes. The gap is currently invisible only because those keys are not implemented either (see M12); fixing M12 without this leaves the metadata unattached in the common configuration.

**Smallest fix:** Register unconditionally: move the `push` out of the `if`, passing `this.options.exporterMetadata` (which the hook already tolerates being `undefined`).

---

#### M21 — `GOFF-HOOK-006` · Neither hook stage honours `disableDataCollection`

**Spec:** "Both stages **MUST** honour `disableDataCollection` and the flag's trackability. Gating only one stage produces partial telemetry that looks like data loss."

**Code:** `src/lib/hook/data-collector-hook.ts:46-49` and `:78-81` gate on `this.evaluator.isFlagTrackable(...)` only. The hook never receives the options object (constructor at `:22-31` takes an evaluator and a publisher), so it has no access to the flag. Trackability itself is handled correctly on both stages — this is purely the `disableDataCollection` half.

**Consequence:** As M10: the option has no effect on evaluation telemetry.

**Smallest fix:** Pass `options` (or a boolean) into `DataCollectorHook` and short-circuit both stages when data collection is disabled.

---

#### M22 — `GOFF-TRACK-003` · Tracking events ignore `disableDataCollection`

**Spec:** "Tracking events **MUST** honour `disableDataCollection`."

**Code:** `src/lib/go-feature-flag-provider.ts:56-68` builds the `TrackingEvent` and calls `this.eventPublisher.addEvent(event)` with no gate.

**Consequence:** As M10, for the tracking path. A user who disabled data collection still emits custom events to the relay proxy.

**Smallest fix:** `if (this.options.disableDataCollection) return;` at the top of `track`.

---

#### M23 — `GOFF-COLL-016` · Flushing is not single-flight

**Spec:** "Flushing **MUST** be single-flight — concurrent publishes **MUST NOT** overlap."

**Code:** `src/lib/service/event-publisher.ts:104-119` has no in-flight flag. Two callers exist: the periodic runner (`:60`) and the `maxPendingEvents` threshold in `addEvent` (`:91-96`, fire-and-forget). The synchronous buffer swap at `:110-111` prevents the _same_ events being sent twice, but does not prevent a second HTTP POST starting while the first is still awaiting at `:113`.

**Consequence:** During a slow or hanging collector, publishes pile up: each threshold crossing starts another concurrent POST against an endpoint that is already struggling. Combined with C14 (uncapped buffer) this amplifies an outage rather than backing off.

**Smallest fix:** Add `private publishing = false;`, return early from `publishEvents` when set, and clear it in a `finally`.

---

#### M24 — `GOFF-COLL-018` · A failed batch is re-queued out of chronological order

**Spec:** "A failed batch **MUST** be re-queued preserving chronological order."

**Code:** `src/lib/service/event-publisher.ts:114-118`:

```ts
} catch (error) {
  this.logger?.error('An error occurred while publishing events:', error);
  // Re-add events to the collection on failure
  this.events.push(...eventsToPublish);
}
```

`push` appends. Any event enqueued by `addEvent` while the failed POST was in flight already sits in `this.events`, so the older re-queued batch lands _behind_ it.

**Consequence:** The collector receives events out of order after any transient failure. Since `creationDate` is second-granularity (`data-collector-hook.ts:54`), downstream ordering that relies on arrival order — or on the batch sequence — sees evaluations transposed across the failure boundary.

**Smallest fix:** `this.events.unshift(...eventsToPublish);` — and apply the C14 cap afterwards, trimming from the front so the discard-oldest rule still holds.

---

#### M25 — `GOFF-CFG-003` · Two option defaults diverge from the normative table

**Spec:** "Every option listed in §3.1 that the provider supports **MUST** use the default value given there." §3.1 specifies `dataFlushInterval` = `60000 ms` and `flagChangePollingInterval` = `120000 ms`.

**Code:** `src/lib/helper/constants.ts:22` — `DEFAULT_FLUSH_INTERVAL_MS = 120000`, applied at `src/lib/service/event-publisher.ts:62`. That is double the mandated value, and `src/lib/go-feature-flag-provider-options.ts:20` documents the wrong number too (`@default 120000`), as does `README.md:81`. Separately, `flagChangePollingIntervalMs` has no default at all (see C3), which is a `GOFF-CFG-003` failure in its own right as well as a `GOFF-IP-006` one.

Verified as correct: `timeout` `10000` (`api.ts:45`; remote path `ofrep-api.ts:47`), `maxPendingEvents` `10000` (`constants.ts:23`), `evaluationType` in-process (`go-feature-flag-provider.ts:133`), `apiKey` none, `exporterMetadata` empty, `endpoint` required (in-process).

**Consequence:** Evaluation telemetry reaches the collector at half the mandated rate, so dashboards lag twice as far behind reality as on a conformant provider — the fleet-inconsistency §3 exists to prevent.

**Smallest fix:** `DEFAULT_FLUSH_INTERVAL_MS = 60000`, and correct the JSDoc at `go-feature-flag-provider-options.ts:20` and `README.md:81`.

---

#### M26 — `GOFF-CFG-004` · The caller's options object is mutated

**Spec:** "The provider **MUST NOT** mutate the caller's options object or any collection it contains. Normalisation **MUST** operate on a copy."

**Code:** `src/lib/go-feature-flag-provider.ts:44-45`:

```ts
this.options = options; // same reference
this.options.endpoint = this.options.endpoint?.replace(/\/+$/, ''); // writes through
```

**Consequence:** A caller who builds one options object and constructs two providers from it — or who reads `options.endpoint` afterwards, or shares a frozen config module — observes the provider silently rewriting their input. Under `Object.freeze`, the assignment throws in strict mode, turning a normalisation detail into a construction failure.

**Smallest fix:** `this.options = { ...options, endpoint: options.endpoint?.replace(/\/+$/, '') };`

---

#### M27 — `GOFF-CFG-006` and `GOFF-CFG-007` · `dataCollectorBaseURL` is not supported

**Spec:** `GOFF-CFG-006`: "`dataCollectorBaseURL` **SHOULD** be supported. Where supported it **MUST** override the base URL for the data-collector endpoint **only** … and it **MUST** fall back to `endpoint` when unset." `GOFF-CFG-007` governs the same option's replacement semantics.

**Code:** The option appears nowhere in `src/lib/go-feature-flag-provider-options.ts:4-58`, and `src/lib/service/api.ts:153` hardcodes `${this.endpoint}/v1/data/collector`. `GOFF-CFG-007` is an inherited FAIL per §C.1.

**Consequence:** Deployments that route evaluation traffic to a local side-car but exports to a central collector cannot be configured. The fallback behaviour is accidentally correct (`endpoint` is used), so `GOFF-COLL-001` still passes — only the override is missing.

**Smallest fix:** Add `dataCollectorBaseURL?: string` and use `this.dataCollectorBaseURL ?? this.endpoint` at `api.ts:153`, leaving `:81` on `endpoint`. Authentication and timeout already apply uniformly in that method, satisfying `GOFF-CFG-007` once the option exists.

---

#### M28 — `GOFF-WASM-009` · No instance pool

**Spec:** "The instance pool **SHOULD** default to the host's CPU core count and **SHOULD** be configurable."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:67` constructs exactly one `EvaluateWasm`, held for the evaluator's lifetime. `wasmEvaluatorPoolSize` does not exist in `src/lib/go-feature-flag-provider-options.ts`; searching `src/` for `pool` returns nothing.

**Consequence:** All evaluation is serialised through one instance. On Node this is partly masked by the single-threaded event loop (which is what makes `GOFF-WASM-007` pass accidentally), but it forecloses `worker_threads` parallelism and makes a single slow evaluation a head-of-line block for every concurrent request.

**Smallest fix:** Add `wasmEvaluatorPoolSize?: number` defaulting to `os.cpus().length`, and hold an array of `EvaluateWasm` instances with a simple acquire/release queue. This is also the natural place to implement the discard-and-rebuild of C12.

---

#### M29 — `GOFF-WASM-013` · Trap handling absent regardless of binary (inherited from C12/C13)

**Spec:** "The host **MUST** implement trap handling (`GOFF-WASM-008`, `-012`) regardless of which binary it bundles. The guards reduce traps but do not eliminate them, and older binaries carrying none of them remain in the field."

Inherited FAIL, and the one §10 requirement the engine bump does **not** touch. The requirement is explicit that trap handling is owed "regardless of which binary it bundles", because "[t]he guards reduce traps but do not eliminate them". Moving to `0.2.4` lowers the probability of reaching C12/C13; it does not remove the defect, and it does not help the deployments still pinned to an older binary. Fixed only by C12 and C13.

---

#### M30 — `GOFF-CFG-001` (PARTIAL) · `endpoint` is neither required nor validated in remote mode

**Spec:** "`endpoint` **MUST** be required and validated at construction time. An absent or malformed value **MUST** raise a configuration error before any network activity."

**Code:** `src/lib/go-feature-flag-provider.ts:160` requires `endpoint` only when `evaluationType !== EvaluationType.Remote`, and `:164` applies the URL validation under the same condition. The type definition makes the exemption explicit (`go-feature-flag-provider-options.ts:78-82`: `endpoint?: string` when `evaluationType: EvaluationType.Remote`).

**Consequence:** In remote mode a missing endpoint is not a configuration error — it is an invitation to `OFREP_ENDPOINT` (C2). A malformed one is caught, but late and by the delegate (`libs/providers/ofrep/src/lib/ofrep-provider.ts:27-32`), producing a generic `Error` rather than the provider's own `InvalidOptionsException`.

**Smallest fix:** Drop the `evaluationType !== Remote` conditions at `:160` and `:164`, and collapse the options union so `endpoint` is unconditionally required. This closes C2 at the same time.

---

#### M31 — `GOFF-EVAL-009` (PARTIAL) · Remote evaluation drops non-primitive flag metadata

**Spec:** "Flag metadata **MUST** be passed through with its structure intact. Values **MUST NOT** be coerced to strings."

**Code:** In-process passes metadata through untouched — `src/lib/evaluator/inprocess-evaluator.ts:354` is a TypeScript cast (`response.metadata as Record<string, string | number | boolean>`), erased at runtime, so nested objects survive. The remote path does not: `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:266-277` filters the entry list to `['string','number','boolean']` and rebuilds the object, discarding every other key.

**Consequence:** A flag carrying structured metadata resolves with those keys present in in-process mode and absent in remote mode — the same flag, the same context, two different metadata maps. Nothing is coerced to a string (the literal prohibition holds); the loss is by omission. Note that the SDK's `FlagMetadata` type is `Record<string, string | number | boolean>` (`@openfeature/core@1.9.1 dist/types.d.ts:59`), so a fully structure-preserving remote path cannot be expressed in the SDK's own type — see Open question 3.

**Remediation lies upstream** in `libs/shared/ofrep-core`. Recorded here per §1.7's requirement that an audit note where the fix lives.

---

#### M32 — `GOFF-WASM-001` (PARTIAL) · The `memory` export is never validated

**Spec:** "The host **MUST** resolve the exports `memory`, `malloc`, `free` and `evaluate`, and **MUST** fail initialization if any is absent."

**Code:** `src/lib/wasm/evaluate-wasm.ts:53` assigns `this.wasmMemory = this.wasmExports['memory'] as WebAssembly.Memory` with no check, while `:56-58` validates the other three:

```ts
if (!this.wasmExports['malloc'] || !this.wasmExports['free'] || !this.wasmExports['evaluate']) {
  throw new WasmFunctionNotFoundException('Required WASM functions not found');
}
```

**Consequence:** A binary without a `memory` export initializes "successfully" with `wasmMemory` undefined. The failure then surfaces at the first evaluation as the guard at `:226-228` re-enters `initialize()` on every call — re-instantiating the module each time (compounding C7) — before failing in `writeStringToMemory` (`:342-343`) with "WASM memory not available", far from the real cause.

**Smallest fix:** Add `!this.wasmExports['memory']` to the condition at `:56`.

---

#### M33 — `GOFF-WASM-004` (PARTIAL) · Pointer unpacking narrows to signed 32-bit

**Spec:** "The packed `i64` result **MUST** be unpacked as pointer in the high 32 bits and length in the low 32 bits, using arithmetic wide enough not to overflow."

**Code:** `src/lib/wasm/evaluate-wasm.ts:363-365`:

```ts
const MASK = BigInt(2 ** 32) - BigInt(1);
const ptr = Number(evaluateRes >> BigInt(32)) & 0xffffffff; // signed 32-bit narrowing
const outputStringLength = Number(evaluateRes & MASK); // correct
```

The length is computed entirely in BigInt and is correct. The pointer is not: JavaScript's `&` coerces its operands to _signed_ 32-bit integers, so any address at or above `0x80000000` (2 GiB) yields a negative `ptr`, and `readFromMemory` then indexes the buffer out of range at `:379`.

**Consequence:** Correct for every address below 2 GiB, which covers realistic linear-memory sizes for this module — so this is latent rather than currently reachable. It becomes a wrong-value or crash the moment the module's memory grows past 2 GiB.

**Smallest fix:** Keep it in BigInt: `const ptr = Number((evaluateRes >> BigInt(32)) & MASK);`

---

#### M34 — `GOFF-COLL-013` (PARTIAL) · `exporterMetadata` values are validated at compile time only

**Spec:** "`exporterMetadata` values **MUST** be restricted to string, boolean, integer or floating-point, and an invalid value **MUST** be rejected at construction time."

**Code:** `src/lib/model/exporter-metadata.ts:12-15`:

```ts
add(key: string, value: string | boolean | number): ExporterMetadata {
  this.metadata[key] = value;
  return this;
}
```

The type restriction is correct and matches the specification exactly, but it is erased at runtime — `add` performs no check and never throws, and `asObject()` (`:21-23`) only freezes a shallow copy.

**Consequence:** A TypeScript consumer is protected. A JavaScript consumer, or any TypeScript caller passing an `any`, can insert an object or array; it is serialised into the `meta` envelope at `src/lib/service/api.ts:134` and rejected — or silently mangled — by the relay proxy, with no diagnostic on the client side.

**Smallest fix:** Add a runtime `typeof` guard in `add` throwing `InvalidOptionsException` for anything outside `string | boolean | number`.

---

### 3.3 Minor

---

#### m1 — `GOFF-META-001` · Metadata name is `GoFeatureFlagProvider`

**Spec:** "The provider metadata name **MUST** be exactly `GO Feature Flag Provider`."

**Code:** `src/lib/go-feature-flag-provider.ts:25-27` — `metadata = { name: GoFeatureFlagProvider.name }` evaluates to the string `"GoFeatureFlagProvider"`.

**Consequence:** Every cross-language dashboard, log line and SDK event that keys on provider name shows a different value for the JavaScript provider than for the other seven. **A test pins this**: `src/lib/go-feature-flag-provider.test.ts:55` asserts `expect(provider.metadata.name).toBe('GoFeatureFlagProvider')`.

**Smallest fix:** `metadata = { name: 'GO Feature Flag Provider' };` and update the assertion at `go-feature-flag-provider.test.ts:55`.

---

#### m2 — `GOFF-META-002` · The name is derived by runtime reflection

**Spec:** "The metadata name **MUST** be a literal constant. It **MUST NOT** be derived by runtime reflection on a class or type name, which is unstable under minification and obfuscation."

**Code:** `src/lib/go-feature-flag-provider.ts:26` — `GoFeatureFlagProvider.name`, the exact construct the requirement names.

**Consequence:** The value changes under a minifier that mangles class names — a bundled consumer can see `metadata.name` become `"e"` or `"t"`. The package ships CJS and ESM builds (`project.json:61`) that downstream bundlers routinely minify, so this is reachable in practice, and the failure is silent.

**Smallest fix:** Same as m1 — the string literal fixes both.

---

#### m3 — `GOFF-ENG-003` · No statement of the targeted specification version

**Spec:** "The provider **SHOULD** document which specification version it targets."

**Code:** Searched `README.md` (229 lines) and `package.json` — neither mentions a specification version. The closest claim is `README.md:16`, "OpenFeature Compliance: Full compliance with OpenFeature specification", which refers to a different document and, given this report, is not accurate about this one either.

**Smallest fix:** Add a line to `README.md` naming the targeted GO Feature Flag Provider Specification version.

---

#### m4 — `GOFF-CFG-008` · `evaluationFlagList` is not supported

**Spec:** "`evaluationFlagList` **SHOULD** be supported, and when non-empty **MUST** be transmitted as the `flags` array of the flag-configuration request."

**Code:** The option is absent from `src/lib/go-feature-flag-provider-options.ts`. `src/lib/evaluator/inprocess-evaluator.ts:272` calls `this.api.retrieveFlagConfiguration(this.etag, undefined)` — the second parameter is always `undefined` — so `api.ts:60` always sends `{"flags": []}`. The transport already supports the list; only the option and its wiring are missing.

**Consequence:** A service that uses three flags from a configuration of several thousand must download and hold all of them on every poll.

**Smallest fix:** Add `evaluationFlagList?: string[]` and pass it as the second argument at `inprocess-evaluator.ts:272`.

---

#### m5 — `GOFF-CFG-010` · A vestigial option is left inert

Covered in full under **M10**; listed here because the specification numbers it separately and rates it Minor.

---

#### m6 — `GOFF-IP-011` · No polling jitter

**Spec:** "The provider **SHOULD** apply jitter to the polling interval so that a restarted fleet does not poll in lockstep."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:98` reschedules with the exact configured interval. Searching `src/` for `jitter` and `random` returns nothing.

**Consequence:** After a fleet-wide rolling restart, every replica polls `/v1/flag/configuration` on the same phase, producing a periodic spike against the relay proxy proportional to the fleet size.

**Smallest fix:** Multiply the interval by a small random factor (e.g. `interval * (0.9 + Math.random() * 0.2)`) at `:98`.

---

#### m7 — `GOFF-COLL-009` · `version` is never populated on feature events

**Spec:** "`version` **MUST** be populated from flag metadata when present."

**Code:** `src/lib/model/feature-event.ts:47-51` declares the field with a doc comment, but neither `DataCollectorHook.after` (`:51-60`) nor `.error` (`:83-92`) sets it — even though `details.flagMetadata` is available on the `after` path and `FlagBase` declares `version` (`src/lib/model/flag-base.ts:47`).

**Consequence:** Exported events cannot be attributed to a flag version, so a collector cannot correlate a behaviour change with the configuration change that caused it.

**Smallest fix:** Set `version: details.flagMetadata?.['version'] as string | undefined` in the `after` stage.

---

#### m8 — `GOFF-COLL-010` · No `source` field on feature events

**Spec:** "`source` **MUST** be `INPROCESS` for a locally evaluated flag, or `PROVIDER_CACHE` for a value served from a remote-mode cache. `SERVER` is reserved for the relay proxy."

**Code:** `src/lib/model/feature-event.ts:6-52` has no `source` member and neither hook stage emits one. Searching `src/` for `INPROCESS`, `PROVIDER_CACHE` and `source:` returns nothing.

**Consequence:** The collector cannot distinguish locally evaluated events from relay-proxy-recorded ones, so in-process and remote traffic cannot be told apart in exported data.

**Smallest fix:** Add `source: 'INPROCESS'` to the `FeatureEvent` type and set it in both stages of `DataCollectorHook` — correct unconditionally here, since only the in-process evaluator reports flags as trackable (`remote-evaluator.ts:98-100`).

---

#### m9 — `GOFF-COLL-012` · No `provider` identifier

Covered under **M13** / **M12**.

---

#### m10 — `GOFF-AUTH-004` · No support for arbitrary additional headers

**Spec:** "The provider **SHOULD** allow arbitrary additional headers, for deployments behind gateways requiring their own authentication."

**Code:** `src/lib/go-feature-flag-provider-options.ts:4-58` offers no headers option. `src/lib/service/api.ts:63-65` and `:140-142` build a fixed header map, and `src/lib/evaluator/remote-evaluator.ts:19-22` hardcodes the array it passes to OFREP — even though `OFREPProviderBaseOptions` supports both `headers` and `headersFactory` (`libs/shared/ofrep-core/src/lib/provider/ofrep-provider-options.ts:26-30`).

**Consequence:** A relay proxy behind an API gateway that requires its own header (a Cloudflare Access token, an `X-Api-Gateway-Key`) cannot be reached at all. The capability exists one layer down and is simply not exposed.

**Smallest fix:** Add `headers?: Record<string, string>` (or `[string, string][]`) to the options and merge it into all three request builders.

---

### 3.4 Documentation contradicting code (§C.2)

The specification requires these to be reported in their own right, and §C.3 makes source authoritative over documentation.

| #   | Documentation claim                                                                                                                                                                 | Contradicting code                                                                                                                                            | Reported as                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | `README.md:80` — `flagChangePollingIntervalMs` default `120000`                                                                                                                     | `src/lib/evaluator/inprocess-evaluator.ts:79-81` applies no default; polling is disabled when the option is unset                                             | `GOFF-CFG-009` (declared option not honoured) — see **C3**, **M25** |
| D2  | `README.md:81` and `src/lib/go-feature-flag-provider-options.ts:20` — `dataFlushInterval` default `120000`                                                                          | `src/lib/helper/constants.ts:22` — the code agrees with the docs but both contradict the spec's `60000`                                                       | `GOFF-CFG-003` — see **M25**                                        |
| D3  | `README.md:83, 135` — `disableDataCollection` "Disable data collection entirely"                                                                                                    | Never read in `src/`                                                                                                                                          | `GOFF-CFG-009` — see **M10**                                        |
| D4  | `README.md:13` — "**Caching**: Intelligent caching with automatic cache invalidation"                                                                                               | No cache exists anywhere in `src/` (§0.1)                                                                                                                     | Minor finding, no requirement identifier                            |
| D5  | `README.md:14` — "**Error Handling**: Robust error handling with fallback mechanisms"                                                                                               | No fallback path exists; §16 is entirely unimplemented (**M1**)                                                                                               | Minor finding, no requirement identifier                            |
| D6  | `src/lib/go-feature-flag-provider-options.ts:60-63` — "The evaluation type remote does not require an endpoint, because it can be set by the environment variable `OFREP_ENDPOINT`" | Documents as intended behaviour precisely what `GOFF-CFG-005` forbids                                                                                         | `GOFF-CFG-005` — see **C2**                                         |
| D7  | `scripts/README.md:22` — "`TARGET_WASM_VERSION`: The explicit version to use (e.g., `'v1.45.6'`)"                                                                                   | `scripts/copy-latest-wasm.js:11` uses the `0.2.x` WASM-module scheme, not the `v1.x` relay-proxy scheme; the documented example would not resolve to any file | Minor finding, no requirement identifier                            |

D4 and D5 are the more consequential pair: both advertise capabilities the package does not have, in the feature list a prospective user reads first.

### 3.5 Tests asserting non-conformant behaviour (§C.2)

A green suite pinning a defect raises the cost of remediation and indicates the behaviour was deliberate. **Five cases** — the original audit found three; remediation surfaced two more, recorded here as they were hit:

| Test                                                                                                           | Assertion                                                                                                                                                                                                                                                | Requirement it pins                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/go-feature-flag-provider.test.ts:50-55` — _"should validate metadata name"_                           | `expect(provider.metadata.name).toBe('GoFeatureFlagProvider')`                                                                                                                                                                                           | `GOFF-META-001`, `GOFF-META-002` (**m1**, **m2**)                                                                                  |
| `src/lib/hook/enrich-evaluation-context-hook.test.ts:84-110` — _"should merge metadata with existing context"_ | Seeds `gofeatureflag: { existing: 'value' }`, then asserts `result['gofeatureflag']` **equals** `metadata.asObject()` — i.e. asserts the sibling key is destroyed. The comment on line 108 states the intent: _"should override existing gofeatureflag"_ | `GOFF-CTX-006`, `GOFF-CTX-007` (**C9**, **M11**)                                                                                   |
| `src/lib/service/api.test.ts` — _"should handle 304 response without flags and context"_                       | Asserted a `304` returns a normal result object with `flags: {}` and the echoed `etag` — the "empty response object" shape `GOFF-IP-007` explicitly forbids                                                                                              | `GOFF-IP-007`, `GOFF-IP-015` (**C4**) — ✅ **replaced in Step 1** by `"should return the NOT_MODIFIED sentinel on a 304 response"` |
| `src/lib/go-feature-flag-provider.test.ts` — _"Should error if flag configuration endpoint return a 401"_      | Asserted the rejection is an `UnauthorizedException`, i.e. a plain error carrying no `code`, which is exactly what kept the provider out of `FATAL`                                                                                                      | `GOFF-EVT-007` (**C8**) — ✅ **replaced in Step 5** by a test asserting `ProviderStatus.FATAL`                                     |
| `src/lib/go-feature-flag-provider.test.ts` — _"Should error if flag configuration endpoint return a 403"_      | As above, for 403                                                                                                                                                                                                                                        | `GOFF-EVT-007` (**C8**) — ✅ **replaced in Step 5**                                                                                |

The second is the most consequential: it does not merely tolerate the `GOFF-CTX-006` defect, it asserts the destructive behaviour as the expected outcome, so any correct fix breaks the suite.

The two authentication cases are a milder form of the same pattern: they assert _that_ initialization fails, but pin the exact error type that made the failure look recoverable. Both were rewritten in Step 5 to assert the resulting provider **status**, which is the property the specification actually constrains.

---

## 4. Open questions

Ambiguities encountered during the audit. Each states the requirement it blocks, why it is ambiguous, the options, and the assumption made so the audit could continue.

1. **`GOFF-EVAL-002` — does "including scalars" apply to a canonical type that admits scalars?**
   The requirement says the object resolver "**MUST** accept exactly what its SDK's canonical structure type can represent, and **MUST** report `TYPE_MISMATCH` for anything it cannot — including scalars." In JavaScript the canonical type is `JsonValue`, which **does** include scalars (`@openfeature/core@1.9.1 dist/types.d.ts:16`: `PrimitiveValue | JsonObject | JsonArray`), so the two clauses point in opposite directions.
   _Options:_ (a) the first clause governs — scalars are representable, so they must be accepted; (b) the second clause governs — the object resolver is for structures, so scalars are always `TYPE_MISMATCH`.
   _Assumption made:_ (b), matching the requirement's explicit "including scalars" and the behaviour of both code paths (`inprocess-evaluator.ts:184-189`; `ofrep-api.ts:248`). **Verdict recorded: PASS.** Under reading (a) it would be FAIL, so this is the one verdict that flips entirely on the interpretation.

2. **`GOFF-CTX-004` — what exactly does "normalise attributes exactly as the engine's own entry point does" require?**
   The requirement names one concrete behaviour (narrowing integral floating-point values to integers) but scopes itself to whatever the engine's entry point does, which is not enumerated in the specification and lives in engine source outside this repository. This provider performs no explicit normalisation at all; `JSON.stringify` at `evaluate-wasm.ts:231` happens to render `30.0` as `30`, satisfying the named behaviour.
   _Options:_ (a) the named behaviour is the whole requirement → PASS; (b) it is one example of a larger normalisation contract → UNVERIFIABLE without the engine's entry-point source.
   _Assumption made:_ (a). **Verdict recorded: PASS**, annotated _accidental_ since no normalisation step exists.

3. **`GOFF-EVAL-009` — is dropping non-primitive metadata an SDK accident (§1.5) or a delegate defect (§1.7)?**
   The JS SDK's `FlagMetadata` is `Record<string, string | number | boolean>` (`core dist/types.d.ts:95`), so structured metadata cannot be represented in the SDK's own type — arguably §1.5 territory. But §1.5's list of known accidents names only Python, Java and .NET, and the audit brief forbids inventing a JavaScript carve-out. Meanwhile §1.7 makes the provider accountable for the delegate that does the dropping (`ofrep-api.ts:266-277`).
   _Options:_ (a) SDK-defined → N/A; (b) delegate defect → FAIL; (c) split verdict.
   _Assumption made:_ (c) **PARTIAL** — in-process preserves structure at runtime, remote does not — with the SDK type constraint and the upstream remediation both recorded, per §1.7's requirement to note where the fix lives.

4. **`GOFF-ENG-002` — does a constant in a build script count as "a single machine-readable location"?**
   The requirement lists "a version file, build property or dependency manifest". The pin lives in `scripts/copy-latest-wasm.js:11` as a JavaScript `const` — single, greppable and machine-parseable, but it is neither a manifest nor a declarative build property, and the binary it selects is gitignored.
   _Options:_ (a) a build-script constant is a build property → PASS; (b) only declarative locations qualify → FAIL.
   _Assumption made:_ (a). **Verdict recorded: PASS**, independently of `GOFF-ENG-001`, which turns on whether the declared version _resolves_ — a separate question from where it is declared.

5. **Appendix B fixtures — is "tested against them unmodified" auditable from this repository alone?**
   Appendix B states the fixtures are canonical, live in the go-feature-flag repository, and that "a provider whose local copy has diverged from canon is non-conformant regardless of whether its own tests pass." This package carries local copies at `src/lib/testdata/flag-configuration/` and `src/lib/testdata/ofrep-response/`. Appendix B carries no `GOFF-*` identifier, so there is no requirement row to record a verdict against, and confirming divergence would require fetching `openfeature/providers/python-provider/tests/mock_responses/config/valid-all-types.json` and `openfeature/provider_tests/flags.yaml` from the upstream repository — outside the audit's declared evidence scope.
   _Assumption made:_ treated as non-normative for verdict purposes and **not** scored. The local fixtures were read and are consistent with §B.2's expectations for the cases they cover (`go-feature-flag-provider.test.ts:929-952` matches the `disabled_bool` row exactly). If a fixture-divergence check is wanted, it needs its own requirement identifier or an explicit instruction to fetch canon.

6. **`GOFF-WASM-007` — does a single-threaded runtime satisfy "one instance MUST serve one call at a time"?**
   The requirement is about reentrancy, and Node's event loop makes the `malloc → evaluate → read → free` sequence (`evaluate-wasm.ts:234-254`, no `await` inside) atomic with respect to other JavaScript. But there is no explicit guard, so the property holds by runtime accident and would break the moment an `await` were introduced into that sequence.
   _Options:_ (a) the property holds however it is achieved → PASS; (b) an explicit guard is required → FAIL.
   _Assumption made:_ (a), recorded as **PASS (accidental)** per §C.1's accidental-satisfaction rule, which exists precisely so that "the next refactor will break them" is visible in the report.

7. **`GOFF-LIFE-005` — what bound counts as "bounding how long shutdown waits"?**
   `onClose` awaits a final flush whose HTTP request is abort-bounded by the configured `timeout` (`api.ts:149-150`), but there is no separate shutdown deadline; with the default `10000 ms` timeout a shutdown can block for ten seconds.
   _Options:_ (a) any finite bound satisfies it → PASS; (b) a dedicated, typically shorter shutdown budget is required → FAIL.
   _Assumption made:_ (a). **Verdict recorded: PASS.** Note this interacts with C14: with an uncapped buffer the shutdown flush can be arbitrarily _large_, even though it remains time-bounded.

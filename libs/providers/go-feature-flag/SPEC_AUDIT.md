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
VERDICT: NON-CONFORMANT — 3 Critical, 29 Major, 10 Minor
         (97 PASS, 35 FAIL, 7 PARTIAL, 8 N/A, 0 UNVERIFIABLE — 147 total)
```

> **Remediation in progress.** Counts below track the live working tree, not the original audit. Baseline was 80 PASS / 53 FAIL / 6 PARTIAL / 8 N/A = 59 unmet. **Closed so far: 12 (plus `IP-012` corrected and re-fixed in Step 7b) — Step 0 (`ENG-001`), Step 1 (`IP-007`, `IP-008`, `IP-009`, `IP-015`), Step 2 (`IP-006`; `CFG-003` reduced to PARTIAL), Step 3 (`LIFE-002`), Step 4 (`LIFE-006`), Step 5 (`EVT-007`), Step 6 (`EVT-005`, `EVT-006`), Step 7 (`EVT-004`), Step 7b (`IP-012`, re-opened then fixed), Step 8 (`EVAL-006` in-process half — now PARTIAL, remote half is X1). Step 9 (`CTX-006`, `CTX-007`), Step 10 (`WASM-008`, `WASM-012`, `WASM-013`), Step 11 (`WASM-001`, `WASM-004`), Step 12 (`COLL-016`, `COLL-018`, `COLL-019`), Step 13 (`HOOK-001`, `HOOK-003`), Step 15 (`COLL-011` only — `COLL-012` remains open on the `provider` value, see M13; pulled forward), Step 14 (`CFG-009`, `CFG-010`, `HOOK-006`, `TRACK-003`), Step 16 (`COLL-005`), Step 17 (`COLL-009`, `COLL-010`), Step 18 (`CFG-003`, `CFG-004`), Step 19 (`CFG-005`, `CFG-001`, `AUTH-004`), Step 19b (`AUTH-004` re-based on a GOFF-native option; `AUTH-001` **opened** by decision D6), Step 20 (`CFG-006`, `CFG-007`), Step 21 (`CFG-008`), Step 22 (`FALLBACK-001`…`-009`), Step 23 (`META-001`, `META-002`), Step 24 (`IP-011`), Step 25 (`COLL-013`), Step 26 (`EVT-001`), Step 27 (`ENG-003`). Remaining: 5.**

### 1.1 Counts by verdict

| Verdict      |   Count |
| ------------ | ------: |
| PASS         |     134 |
| FAIL         |       3 |
| PARTIAL      |       2 |
| N/A          |       8 |
| UNVERIFIABLE |       0 |
| **Total**    | **147** |

Appendix C.1 of the specification recognises only `PASS`, `FAIL` and `N/A`. This audit additionally uses `PARTIAL` where a requirement holds on one code path and breaks on another, because collapsing those to a bare `FAIL` would hide which half works. **For the purposes of the single verdict line, both `PARTIAL` results count as non-conformance**, giving 5 unmet requirements.

### 1.2 Failures by severity

| Severity  |  FAIL | PARTIAL | Total |
| --------- | ----: | ------: | ----: |
| Critical  |     0 |       1 | **1** |
| Major     |     2 |       1 | **3** |
| Minor     |     1 |       0 | **1** |
| **Total** | **3** |   **2** | **5** |

### 1.3 Counts by area

| Area                  |   Total |    PASS |  FAIL | PARTIAL |   N/A |
| --------------------- | ------: | ------: | ----: | ------: | ----: |
| `GOFF-ENG` (§1.6)     |       3 |       3 |     0 |       0 |     0 |
| `GOFF-META` (§2)      |       3 |       3 |     0 |       0 |     0 |
| `GOFF-CFG` (§3)       |      10 |      10 |     0 |       0 |     0 |
| `GOFF-LIFE` (§4)      |       7 |       7 |     0 |       0 |     0 |
| `GOFF-EVT` (§5)       |       8 |       8 |     0 |       0 |     0 |
| `GOFF-EVAL` (§6)      |      11 |       8 |     0 |       2 |     1 |
| `GOFF-CTX` (§7)       |       9 |       9 |     0 |       0 |     0 |
| `GOFF-REM` (§8)       |       6 |       6 |     0 |       0 |     0 |
| `GOFF-IP` (§9)        |      17 |      17 |     0 |       0 |     0 |
| `GOFF-WASM` (§10)     |      13 |      12 |     1 |       0 |     0 |
| `GOFF-ERR` (§11)      |       6 |       6 |     0 |       0 |     0 |
| `GOFF-HOOK` (§12)     |       6 |       6 |     0 |       0 |     0 |
| `GOFF-COLL` (§13)     |      23 |      22 |     1 |       0 |     0 |
| `GOFF-TRACK` (§14)    |       5 |       5 |     0 |       0 |     0 |
| `GOFF-AUTH` (§15)     |       4 |       3 |     1 |       0 |     0 |
| `GOFF-FALLBACK` (§16) |       9 |       9 |     0 |       0 |     0 |
| `GOFF-CACHE` (§17)    |       7 |       0 |     0 |       0 |     7 |
| **Total**             | **147** | **134** | **3** |   **2** | **8** |

### 1.4 Headline

**All 28 planned remediation steps have landed.** Of the 59 requirements the original audit found unmet, 54 are closed. The five that remain are not defects awaiting a fix — each is a decision, a cross-package change, or a deliberate deferral:

| ID              | Sev      | Status  | What it needs                                                                                                                                                                                                                            |
| --------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOFF-EVAL-006` | Critical | PARTIAL | **Cross-package.** In-process closed in Step 8; the remote half is a defect in `libs/shared/ofrep-core` (`isDefined` treats JSON `null` as defined), needing its own PR and release — see **X1**.                                        |
| `GOFF-EVAL-009` | Major    | PARTIAL | **Cross-package.** In-process preserves structured flag metadata; the delegate filters it to primitives — see **X2** and Open Question 3.                                                                                                |
| `GOFF-WASM-009` | Major    | FAIL    | **Deferred by decision D3.** `SHOULD`-level, no correctness impact: `WASM-007` holds because Node's event loop already serialises the `malloc → evaluate → read → free` sequence, so a pool buys throughput only under `worker_threads`. |
| `GOFF-AUTH-001` | Major    | FAIL    | **Open by decision D6.** The provider sends `X-API-Key`, which a conformant relay proxy accepts and resolves first; the requirement names `Authorization: Bearer`. One line to change if the decision is revisited — see **m10b**.       |
| `GOFF-COLL-012` | Minor    | FAIL    | **Awaiting a decision.** `provider` is `nodejs`; the requirement enumerates nine language identifiers and the one for this language is `javascript`. Either change the constant or amend the specification — see **M13**.                |

The original headline named five clusters of risk. All five are closed: the flag map can no longer be wiped by a `304`, an unparseable body or a null map (**IP-007/-008/-009/-015**, Step 1); polling is on by default and jittered (**IP-006**, **IP-011**, Steps 2 and 24); §16 remote fallback is implemented in full (**FALLBACK-001**…**-009**, Step 22); the reserved `gofeatureflag` namespace is merged rather than overwritten (**CTX-006/-007**, Step 9); and the data-collector envelope is attributable with a bounded buffer (**COLL-011**, **COLL-019**, Steps 12 and 15). The two systemic defects underneath are closed too — `disableDataCollection` is honoured on every telemetry path (Step 14), and a WebAssembly trap now discards the poisoned instance instead of calling `free` on it (Step 10).

Two further items are recorded but score no requirement row: remote mode cannot reach `FATAL` on bad credentials at start-up, because its `initialize` contacts nothing (see **M15**); and Appendix B fixture divergence was not checked, being outside the declared evidence scope (Open Question 5).

---

## 2. Per-requirement verdict table

Paths are relative to the repository root. `gff/` abbreviates `libs/providers/go-feature-flag/`.

| ID                  | Sev      | Tier       | Verdict     | Evidence                                                                                                                                                                                                                                                        | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | -------- | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOFF-ENG-001`      | Critical | WASM       | PASS        | `gff/scripts/copy-latest-wasm.js:11`; submodule gitlink `76bf27bab805b2fdc564a0f8557c03d1af414d70`                                                                                                                                                              | Pin declares `0.2.4` and resolves: `nx copy-wasm` exits 0 and the copied binary is byte-identical (sha256 `c051989c…`) to `gofeatureflag-evaluation_0.2.4.wasm`. _Fixed — Step 0._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-ENG-002`      | Major    | Core       | PASS        | `gff/scripts/copy-latest-wasm.js:11`, `gff/project.json:20-27`                                                                                                                                                                                                  | Single machine-readable constant, consumed by the `copy-wasm` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-ENG-003`      | Minor    | Core       | **PASS**    | `gff/README.md:16-21` ("Specification")                                                                                                                                                                                                                         | Names the targeted specification version, the WASM module and the engine core it embeds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-META-001`     | Minor    | Core       | **PASS**    | `gff/src/lib/go-feature-flag-provider.ts:28`                                                                                                                                                                                                                    | Name is the literal `'GO Feature Flag Provider'`, exactly as required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-META-002`     | Minor    | Core       | **PASS**    | `gff/src/lib/go-feature-flag-provider.ts:28`                                                                                                                                                                                                                    | A literal constant; the `GoFeatureFlagProvider.name` reflection is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-META-003`     | Minor    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:302`; SDK `core@1.9.1 dist/cjs/index.js:781`                                                                                                                                                                      | Provider emits no name of its own; the SDK stamps `metadata.name`, so they are equal by construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-CFG-001`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:201-215`; `gff/src/lib/go-feature-flag-provider-options.ts:74-88`                                                                                                                                                      | Required and URL-validated in both modes; the options union no longer exempts remote. _Fixed — Step 19 (breaking)._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-CFG-002`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:130-135`                                                                                                                                                                                                               | `switch` default branch returns `InProcessEvaluator`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-CFG-003`      | Major    | Core       | PASS        | `gff/src/lib/helper/constants.ts:22`; `gff/src/lib/evaluator/inprocess-evaluator.ts:74-77`                                                                                                                                                                      | Both halves now match §3.1: `flagChangePollingInterval` defaults to `120000 ms` (Step 2) and `dataFlushInterval` to `60000 ms` (Step 18). The JSDoc and `README.md` were corrected with the constant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-CFG-004`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:48-51`                                                                                                                                                                                                                 | Normalisation operates on a shallow copy, and every downstream consumer is constructed from that copy rather than from the caller's object. _Fixed — Step 18._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-CFG-005`      | Critical | Core       | PASS        | `gff/src/lib/evaluator/remote-evaluator.ts:28-47, 93`                                                                                                                                                                                                           | The delegate is constructed with all three variables deleted from `process.env` and restored in a `finally`, so nothing it reads can come from the environment. Closed locally per D1 rather than upstream. _Fixed — Step 19._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-CFG-006`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:28`; `gff/src/lib/service/api.ts:57, 179`                                                                                                                                                                      | The option exists, overrides the collector base **only** — configuration stays on `endpoint` (`api.ts:96`) — and falls back to `endpoint` when unset. _Fixed — Step 20._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-CFG-007`      | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:179`; `gff/src/lib/go-feature-flag-provider.ts:52-54, 231-233`                                                                                                                                                                      | It replaces the whole base — scheme, host, port and path prefix — and the header map, `apiKey` and abort timeout are built once in that method, so they apply to the overridden base identically. Trailing slashes are trimmed and the value is URL-validated at construction, as `endpoint` is. _Fixed — Step 20._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-CFG-008`      | Minor    | In-process | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:50`; `gff/src/lib/evaluator/inprocess-evaluator.ts:93, 385`                                                                                                                                                    | The option is offered and transmitted as the `flags` array on every refresh, not just the first. An empty list normalises to unset, since the relay proxy already reads an empty `flags` array as "send everything". _Fixed — Step 21._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-CFG-009`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:60, 171`; `gff/src/lib/hook/data-collector-hook.ts:46-51`                                                                                                                                                              | `disableDataCollection` is now read on every path that produces telemetry: both `DataCollectorHook` stages and `GoFeatureFlagProvider.track`. _Fixed — Step 14._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CFG-010`      | Minor    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:33`; `gff/src/lib/hook/data-collector-hook.ts:47`                                                                                                                                                              | The option is no longer inert — the capability it names is implemented, so exposing it is correct rather than vestigial. _Fixed — Step 14._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-LIFE-001`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:108-116`; SDK `core dist/cjs/index.js:1043-1051`                                                                                                                                                                       | `initialize` awaits configuration load and publisher start, and rethrows on failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-LIFE-002`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:89, 125-131`; `gff/src/lib/wasm/evaluate-wasm.ts:42-45`                                                                                                                                                           | `initialize` cancels the existing polling task and joins any refresh in flight before scheduling a new one, so no second chain can attach. `EvaluateWasm.initialize` returns early when an instance is live, so re-initialization cannot abandon one; `dispose` clears the fields, so a deliberate rebuild still works. _Fixed — Step 3._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-LIFE-003`     | Critical | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:47-53, 71-82`; `gff/src/lib/evaluator/inprocess-evaluator.ts:211-217`                                                                                                                                                   | `isRunning` and `periodicRunner` are both reset by a subsequent `start`/`initialize`; no latch survives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-LIFE-004`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:121-124`                                                                                                                                                                                                               | Unconditional in both modes: evaluator disposed (clears polling), publisher stopped (flushes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-LIFE-005`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:149-150, 160`                                                                                                                                                                                                                       | The shutdown flush is bounded by the configured request timeout via `AbortController`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-LIFE-006`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:259-269`                                                                                                                                                                                                          | Reports `PROVIDER_NOT_READY`, and the readiness check still precedes the flag lookup so `FLAG_NOT_FOUND` is never used for an unloaded configuration. _Fixed — Step 4._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-LIFE-007`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:296-297`                                                                                                                                                                                                          | _Accidental_: single-threaded event loop; `flags` swapped by reference, no guard held across I/O.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-EVT-001`      | Major    | Core       | **PASS**    | `gff/src/lib/go-feature-flag-provider.ts:157`; `gff/src/lib/evaluator/remote-evaluator.ts:158-168, 172-203`                                                                                                                                                     | Both modes receive the emitter and report health and recovery; each reports the condition its mode can actually reach — `Stale` in-process, `Error` remote. `ConfigurationChanged` is inapplicable to remote mode, not absent — see M15.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-EVT-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:300-303`                                                                                                                                                                                                          | Emitted when the poll yields a different `ETag`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-EVT-003`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:300`                                                                                                                                                                                                              | `!firstLoad` guard suppresses the initial load.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-EVT-004`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:34-68, 396-410`                                                                                                                                                                                                   | Emission is decided by comparing per-flag serializations of the decoded configuration, not the `ETag`, so a server that omits `ETag` no longer makes every poll look like a change. The event carries `flagsChanged` listing exactly the flags added, removed or modified. Each flag is serialized whole rather than inspected, keeping it opaque per `GOFF-IP-016`. _Fixed — Step 7._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-EVT-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:143-160`; `gff/src/lib/helper/constants.ts:27-31`                                                                                                                                                                 | Emits `ServerProviderEvents.Stale` once the third consecutive refresh fails, and keeps serving the last known-good configuration throughout — a failed refresh rejects before writing anything. _Fixed — Step 6._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-EVT-006`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:130-141`                                                                                                                                                                                                          | Emits `ServerProviderEvents.Ready` on the first successful refresh after going stale, and only then — the counter resets on every success, so recovery is not reported for a provider that never went stale. _Fixed — Step 6._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-EVT-007`      | Critical | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:118-129`                                                                                                                                                                                                               | An `UnauthorizedException` (401/403) raised during initialization is rethrown as the SDK's `ProviderFatalError`, which carries `code: PROVIDER_FATAL`, so the SDK settles the provider in `FATAL` and short-circuits evaluations. _Fixed — Step 5._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-EVT-008`      | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:112-115`; SDK `core dist/cjs/index.js:1056-1057`                                                                                                                                                                       | All non-fatal init failures land in `ERROR`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-EVAL-001`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:71-103`                                                                                                                                                                                                                | All four SDK resolvers implemented, all asynchronous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-EVAL-002`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:184-189`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248-256`                                                                                                                                               | Scalars yield `TYPE_MISMATCH` on both paths. Open question 1 is **resolved by upstream evidence**: OpenFeature Conditional Requirement 2.2.2.1's own example signature is `resolveStructureValue(string flagKey, JsonObject defaultValue, …)` — `JsonObject`, not `JsonValue` — and `types.md` defines Structure as "Structured data … such as JSON or YAML". The SDK's widening to `JsonValue` is an implementation choice, not the spec's structure type, so rejecting scalars is correct.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-EVAL-003`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:162`                                                                                                                                                                                                              | The single number resolver accepts any JSON number, integral included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-EVAL-004`     | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:162`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248`                                                                                                                                                       | `typeof value === 'number'` excludes booleans; JS has no `isinstance(True, int)` accident.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-EVAL-005`     | Major    | Core       | **N/A**     | SDK `server-sdk@1.19.0 dist/types.d.ts:116-128`                                                                                                                                                                                                                 | The JS SDK defines no integer resolver — §1.3 makes this N/A.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GOFF-EVAL-006`     | Critical | Core       | **PARTIAL** | `gff/src/lib/evaluator/inprocess-evaluator.ts:197-203, 226-232, 255-261, 284-290, 447-449`; `libs/shared/ofrep-core/src/lib/helpers.ts:7`; SDK `server-sdk dist/cjs/index.js:346-390`; OpenFeature 2.2.3, 1.3.4, 1.4.10, `types.md` Resolution Reason `DEFAULT` | In-process: a null or absent value now returns the caller's default with the engine's reason, variant and metadata preserved, and a genuinely wrong type still reports `TYPE_MISMATCH`. Remote is unchanged — `isDefined` treats `null` as defined, so it still falls through to the `typeof` comparison and reports `TYPE_MISMATCH`. **Upstream-grounded:** the OpenFeature type system admits no null flag value (`value (boolean \| string \| number \| structure, required)`), 2.2.3 requires the resolved value, and the `DEFAULT` reason is defined for the case where "dynamic evaluation yielded no result" — i.e. fall back, do not error. The guard must live in the provider because `OpenFeatureClient.evaluate` performs **no** runtime type check (1.3.4 is a `SHOULD` the JS SDK does not implement), so a `null` would reach the application author verbatim. _In-process fixed — Step 8; remote half tracked as X1._ |
| `GOFF-EVAL-007`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:353`                                                                                                                                                                                                              | `reason` copied verbatim as a string; no enum parsing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-EVAL-008`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:349-356`                                                                                                                                                                                                          | Engine returns the caller default with `DISABLED`/`SdkDefault`; passed through untouched (corroborated by `gff/src/lib/go-feature-flag-provider.test.ts:929-952`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-EVAL-009`     | Major    | Core       | **PARTIAL** | `gff/src/lib/evaluator/inprocess-evaluator.ts:354`; `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:266-277`                                                                                                                                                   | In-process the TS cast is erased and structure survives; the remote path drops every non-primitive entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-EVAL-010`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:354`                                                                                                                                                                                                              | No key filtering; `gofeatureflag_cacheable` is boolean and survives both paths. Never required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-EVAL-011`     | Major    | Core       | PASS        | SDK `server-sdk dist/cjs/index.js:769-772, 856-867`                                                                                                                                                                                                             | SDK-defined: thrown resolver errors become default + error code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-CTX-001`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:254`; `libs/providers/ofrep/src/lib/ofrep-provider.ts:86`                                                                                                                                                         | The SDK `EvaluationContext` (with top-level `targetingKey`) is forwarded verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-CTX-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:254`                                                                                                                                                                                                              | No wrapper object; attributes stay flat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-CTX-003`      | Critical | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:226-262`                                                                                                                                                                                                          | No targeting-key validation exists on either path; empty/missing keys reach the engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-CTX-004`      | Critical | In-process | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:231`                                                                                                                                                                                                                         | _Accidental_: `JSON.stringify` renders integral doubles without a fraction, so the narrowing happens implicitly. See Open question 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-CTX-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:257, 297`                                                                                                                                                                                                         | Enrichment stored and handed to the engine in `flagContext`, which performs the precedence merge (§B.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-CTX-006`      | Critical | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:41-49`                                                                                                                                                                                                      | The namespace is merged into rather than assigned, so caller-owned `flagList` and `currentDateTime` survive; only `exporterMetadata` is set or replaced. _Fixed — Step 9._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-CTX-007`      | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:46`; `gff/src/lib/helper/constants.ts:40`                                                                                                                                                                   | Metadata is written to `gofeatureflag.exporterMetadata`, the key the relay proxy reads, rather than flat into the namespace. _Fixed — Step 9._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-CTX-008`      | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:6-19`                                                                                                                                                                                                       | A non-map `gofeatureflag` is replaced rather than failing the evaluation. Now explicit rather than accidental: strings, arrays, numbers and null are each covered by a test. _Reinforced — Step 9._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-CTX-009`      | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:41-49`                                                                                                                                                                                                      | The hook writes only `exporterMetadata`; `flagList` and `currentDateTime` are never authored by the provider, and are now preserved rather than destroyed. _Reinforced — Step 9._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-REM-001`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:153, 158-162` (delegated)                                                                                                                                                                                      | `POST {baseUrl}/ofrep/v1/evaluate/flags/{flagKey}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-REM-002`      | Major    | Remote     | PASS        | `libs/providers/ofrep/src/lib/ofrep-provider.ts:86`; `ofrep-api.ts:161` (delegated)                                                                                                                                                                             | Body is `{"context": {...}}` with flattened attributes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-REM-003`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:235-264` (delegated)                                                                                                                                                                                           | `value`, `reason`, `variant`, `metadata` mapped to `ResolutionDetails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-REM-004`      | Major    | Remote     | PASS        | `libs/providers/ofrep/src/lib/ofrep-provider.ts:79-83, 90-92`; `ofrep-core/src/lib/api/errors.ts:84-105` (delegated)                                                                                                                                            | `Retry-After` parsed as seconds or HTTP-date and enforced via `notBefore`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-REM-005`      | Major    | Remote     | PASS        | `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:90-147`                                                                                                                                                                                                        | No retry loop anywhere in the request path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-REM-006`      | Major    | Remote     | PASS        | `gff/src/lib/evaluator/remote-evaluator.ts:25`; `ofrep-core/src/lib/api/ofrep-api.ts:102-113`                                                                                                                                                                   | Configured timeout forwarded; the delegate's own default is the same `10000 ms`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-IP-001`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:81-86`                                                                                                                                                                                                                              | `POST {endpoint}/v1/flag/configuration`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-IP-002`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:60`                                                                                                                                                                                                                                 | Body is `{"flags": []}` when no list is supplied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-IP-003`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:81`                                                                                                                                                                                                                                 | String concatenation onto `endpoint` preserves any path prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-IP-004`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:215-216`; `gff/src/lib/evaluator/inprocess-evaluator.ts:296-297`                                                                                                                                                                    | Both `flags` and `evaluationContextEnrichment` are stored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-IP-005`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:198, 68-70`                                                                                                                                                                                                                         | Header value stored raw (quotes intact) and echoed verbatim as `If-None-Match`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-IP-006`       | Critical | In-process | PASS        | `gff/src/lib/helper/constants.ts:24`; `gff/src/lib/evaluator/inprocess-evaluator.ts:74-77, 90`                                                                                                                                                                  | Polling is scheduled unconditionally on a resolved interval defaulting to `120000 ms`. The interval is resolved once in the constructor so the initial schedule and every reschedule agree. _Fixed — Step 2._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GOFF-IP-007`       | Critical | In-process | PASS        | `gff/src/lib/model/flag-config-response.ts:38, 48`; `gff/src/lib/service/api.ts:101-106`; `gff/src/lib/evaluator/inprocess-evaluator.ts:277-281`                                                                                                                | A `304` returns the `NOT_MODIFIED` sentinel before the body or any header is read, and the refresh routine returns on it before touching state. The union return type makes a body on the 304 path unrepresentable. _Fixed — Step 1._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-IP-015`       | Major    | In-process | PASS        | `gff/src/lib/model/flag-config-response.ts:38`; `gff/src/lib/evaluator/inprocess-evaluator.ts:277-281`                                                                                                                                                          | The sentinel carries no `ETag` to write back, and the early return precedes the write at `:302`. _Fixed — Step 1._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-IP-008`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:226-231`                                                                                                                                                                                                                            | A `JSON.parse` failure now throws `ImpossibleToRetrieveConfigurationException`, which `loadConfiguration` propagates as a failed refresh. _Fixed — Step 1._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-IP-009`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:235-239`                                                                                                                                                                                                                            | A null or absent flag map throws rather than degrading to `{}`. An explicitly empty map is still accepted as a valid configuration. _Fixed — Step 1._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-IP-010`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:93-100`                                                                                                                                                                                                           | `.catch(...).finally(reschedule)` keeps polling alive through errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-IP-011`       | Minor    | In-process | **PASS**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:146-149`, applied at `:130` and `:166`; `gff/src/lib/helper/constants.ts:61`                                                                                                                                      | Every delay is drawn from ±10% of the configured interval — the first one included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-IP-012`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:55, 389`; `gff/src/lib/helper/flag-serialization.ts:3-19`                                                                                                                                                         | A missing flag returns `FLAG_NOT_FOUND` before the engine is touched. The flag map is stored null-prototype, so a key naming an `Object.prototype` member cannot resolve to the inherited member. **Originally recorded PASS in error** — the original audit checked the `!flag` guard but not the prototype chain behind the lookup. _Corrected and fixed — Step 7b._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-IP-013`       | Critical | In-process | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:256-263`                                                                                                                                                                                                                     | Every throw becomes `{errorCode: 'GENERAL', reason: 'ERROR'}`; the SDK then returns the caller default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-IP-014`       | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:252-260`                                                                                                                                                                                                          | Input carries `flagKey`, `flag`, `evalContext` and `flagContext{defaultSdkValue, evaluationContextEnrichment}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-IP-016`       | Critical | In-process | PASS        | `gff/src/lib/service/api.ts:214-216`; `gff/src/lib/wasm/evaluate-wasm.ts:231`; `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                                                                                                                               | The `Flag` interface is a compile-time type assertion only; the parsed object is re-serialised untouched. `trackEvents` is the sole field read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-IP-017`       | Major    | In-process | PASS        | `gff/src/lib/service/api.ts:214`                                                                                                                                                                                                                                | No schema validation exists, so unknown fields are tolerated and preserved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-WASM-001`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:13, 88-91`                                                                                                                                                                                                                   | All four exports — `memory` included — are resolved from a single list and initialization fails naming whichever is absent. The check runs before `go.run` and before any field is stored, so a rejected module leaves no partial instance. _Fixed — Step 11._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-WASM-002`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/wasm_exec.js:554-568`; `gff/src/lib/wasm/evaluate-wasm.ts:47`                                                                                                                                                                                 | `_start` invoked once per instance; exit code `0` is returned, not treated as failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-WASM-003`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:231, 238`                                                                                                                                                                                                                    | `TextEncoder.encode(...).length` is the UTF-8 byte length.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-WASM-004`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:27-31, 429`                                                                                                                                                                                                                  | Both halves are masked in BigInt and converted to `Number` afterwards, so a pointer stays non-negative across the whole 32-bit range. Unpacking is a pure function so the range above 2 GiB is testable without a module that large. _Fixed — Step 11._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-WASM-005`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:238-254`                                                                                                                                                                                                                     | Output is read at :241, `free` runs in the `finally` at :250-254 — read before free.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-WASM-006`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:252-254, 367-369`                                                                                                                                                                                                            | Input freed after the read; output never freed; packed `0` raises `WasmInvalidResultException`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-WASM-007`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:234-254`                                                                                                                                                                                                                     | _Accidental_: `malloc → evaluate → read → free` contains no `await`, so the single-threaded event loop cannot interleave two calls. No explicit guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-WASM-008`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:283-303`; `:52-56`                                                                                                                                                                                                           | A fault in any call into the instance discards it, so the next evaluation rebuilds. The Go runtime is recreated per instantiation, since it holds references into the instance it was started with. _Fixed — Step 10._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-WASM-012`     | Critical | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:283-297`                                                                                                                                                                                                                     | Nothing is run on the instance after a fault, `free` included; the `finally` releasing the input is reachable only once `evaluate` has returned normally. _Fixed — Step 10._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-WASM-009`     | Major    | WASM       | **FAIL**    | `gff/src/lib/evaluator/inprocess-evaluator.ts:67`; `gff/src/lib/go-feature-flag-provider-options.ts:4-58`                                                                                                                                                       | Exactly one instance; no pool and no `wasmEvaluatorPoolSize` option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-WASM-010`     | Major    | WASM       | PASS        | `gff/scripts/copy-latest-wasm.js:11`                                                                                                                                                                                                                            | Single machine-readable pin, value `0.2.4`. Resolvability is `GOFF-ENG-001`'s concern, not this one's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOFF-WASM-011`     | Minor    | WASM       | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:57`; `gff/src/lib/wasm/evaluate-wasm.ts:140-147`                                                                                                                                                               | `wasmBinaryPath` overrides path resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-WASM-013`     | Major    | WASM       | PASS        | `gff/src/lib/wasm/evaluate-wasm.ts:283-303`                                                                                                                                                                                                                     | Trap handling is implemented in the host and is independent of which binary is bundled. _Fixed — Step 10._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-ERR-001`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:316-339`                                                                                                                                                                                                          | Every engine code with an SDK equivalent is mapped to it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-ERR-002`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:337-338`                                                                                                                                                                                                          | `default:` branch throws `GeneralError`; `FLAG_CONFIG` correctly lands there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GOFF-ERR-003`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:323-338`                                                                                                                                                                                                          | `response.errorDetails` becomes the error message on every branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-ERR-004`      | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:96-114`; `ofrep-core/src/lib/api/ofrep-api.ts:126-140`                                                                                                                                                                              | `401/403` distinct from `404`, `400`, `429` and `5xx` on both paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-ERR-005`      | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:93-94`                                                                                                                                                                                                            | Background refresh errors are logged and swallowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-ERR-006`      | Minor    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:115`                                                                                                                                                                                                                    | Collector failures logged at error level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-HOOK-001`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:52, 162-165`                                                                                                                                                                                                           | Registered order is `[EnrichEvaluationContext, DataCollector]`, in the constructor, so both are observable before `initialize()` runs. _Fixed — Step 13._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-HOOK-002`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:52, 141-148`                                                                                                                                                                                                           | Hooks are built once in the constructor; `initialize` never touches them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-HOOK-003`     | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:162`                                                                                                                                                                                                                   | The enrichment hook is registered unconditionally; the hook itself builds an empty `ExporterMetadata` when the caller supplied none. _Fixed — Step 13._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-HOOK-004`     | Major    | Core       | PASS        | `gff/src/lib/hook/enrich-evaluation-context-hook.ts:29-43`                                                                                                                                                                                                      | Only `before`; returns a spread copy rather than mutating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-HOOK-005`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:40, 71`                                                                                                                                                                                                                | Both `after` and `error` implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-HOOK-006`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:46-51, 66, 98`                                                                                                                                                                                                         | Both stages route through one `shouldCollect` predicate covering `disableDataCollection` and trackability, so neither can be gated without the other. _Fixed — Step 14._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-COLL-001`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:153`                                                                                                                                                                                                                                | `POST {endpoint}/v1/data/collector` — the required fallback when `dataCollectorBaseURL` is unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-COLL-002`     | Critical | Core       | PASS        | `gff/src/lib/service/api.ts:133-136`; `gff/src/lib/model/exporter-request.ts:10-15`                                                                                                                                                                             | Keys are exactly `meta` and `events`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GOFF-COLL-003`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:53, 86`                                                                                                                                                                                                                | `kind: 'feature'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-COLL-004`     | Critical | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:54, 87`; `gff/src/lib/model/feature-event.ts:35`                                                                                                                                                                       | Serialised as `default`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-COLL-005`     | Major    | Core       | PASS        | `gff/src/lib/helper/event-util.ts:14`                                                                                                                                                                                                                           | All five rows of the normative table hold: only a boolean `true` yields `anonymousUser`, and an absent context now yields `user`. _Fixed — Step 16._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-COLL-006`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:59, 90`; `gff/src/lib/helper/constants.ts:25`                                                                                                                                                                          | Targeting key or the `undefined-targetingKey` sentinel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-COLL-007`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:54, 91`                                                                                                                                                                                                                | `Math.floor(Date.now() / 1000)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-COLL-008`     | Major    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:58, 88`                                                                                                                                                                                                                | `details.variant ?? 'SdkDefault'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-COLL-009`     | Minor    | Core       | PASS        | `gff/src/lib/hook/data-collector-hook.ts:18-27, 108`                                                                                                                                                                                                            | `version` is read from the resolution metadata on the `after` stage, narrowing string and number and rejecting anything else. The `error` stage receives no metadata, which the requirement's "when present" allows. _Fixed — Step 17._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-COLL-010`     | Minor    | Core       | PASS        | `gff/src/lib/model/feature-event.ts:59`; `gff/src/lib/hook/data-collector-hook.ts:111, 145`                                                                                                                                                                     | `source` is a required field on `FeatureEvent`, set to `INPROCESS` by both stages — unconditionally correct because the remote evaluator reports every flag as untrackable. `SERVER` is excluded from the union, since the specification reserves it for the relay proxy. _Fixed — Step 17._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-COLL-011`     | Major    | Core       | PASS        | `gff/src/lib/helper/constants.ts:52-55`; `gff/src/lib/model/exporter-metadata.ts:29`                                                                                                                                                                            | `asObject()` always appends `provider` and `openfeature: true`, so the `meta` envelope carries them whether or not the caller configured metadata. Seeded in `ExporterMetadata` rather than in the envelope so the evaluation-context copy the enrichment hook writes carries them too. _Fixed — Step 15._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-COLL-012`     | Minor    | Core       | **FAIL**    | `gff/src/lib/helper/constants.ts:53`                                                                                                                                                                                                                            | The key now exists and cannot be shadowed, but its value is `nodejs`, which is not one of the nine identifiers the requirement enumerates (`javascript` is the one for this language). Set deliberately by the maintainer during Step 15 — see finding M13. _Open: awaiting a decision._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-COLL-013`     | Major    | Core       | **PASS**    | `gff/src/lib/model/exporter-metadata.ts:11-12, 52-58`                                                                                                                                                                                                           | `add()` accepts JSON scalars — string, boolean, integer and float — and rejects the rest with `InvalidOptionsException` where the value enters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOFF-COLL-014`     | Major    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:59-65, 89-97, 71-82`                                                                                                                                                                                                    | Interval, `maxPendingEvents` threshold and shutdown all flush.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-COLL-015`     | Minor    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:60, 107-109`                                                                                                                                                                                                            | _Accidental_: `runPublisher` does call `publishEvents` on start, but the empty-buffer guard returns before any HTTP call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-COLL-016`     | Major    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:23, 138-140, 149-153`                                                                                                                                                                                                   | `publishEvents` returns early while `inFlight` is set, and the handle is assigned before the first suspension point so a threshold flush cannot slip past it. `stop` joins it before the final flush. _Fixed — Step 12._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-COLL-017`     | Critical | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:110-113`                                                                                                                                                                                                                | Buffer is swapped synchronously before the `await`; no lock spans the HTTP call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOFF-COLL-018`     | Major    | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:170`                                                                                                                                                                                                                    | The failed batch is returned with `unshift`, ahead of anything `addEvent` buffered while the POST was in flight. _Fixed — Step 12._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-COLL-019`     | Critical | Core       | PASS        | `gff/src/lib/service/event-publisher.ts:102-110, 119, 171`                                                                                                                                                                                                      | `enforceCap` trims to `2 × maxPendingEvents`, discarding oldest first, and runs on both growth paths — the `addEvent` push and the failed-batch re-queue. Discards are logged. _Fixed — Step 12._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-COLL-020`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                                                                                                                                                                                                              | `flag.trackEvents ?? true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-COLL-021`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:199-203`                                                                                                                                                                                                          | Unknown flag returns `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-COLL-022`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:205`                                                                                                                                                                                                              | Explicit `trackEvents: false` suppresses the event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-COLL-023`     | Major    | Core       | PASS        | `gff/src/lib/evaluator/remote-evaluator.ts:98-100`                                                                                                                                                                                                              | Remote mode reports nothing trackable, so no double counting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GOFF-TRACK-001`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:24, 56-68`                                                                                                                                                                                                             | Implements the SDK `Tracking` interface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-TRACK-002`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:56-68, 111`                                                                                                                                                                                                            | `track` is mode-independent and the publisher starts in both modes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-TRACK-003`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:60-62`                                                                                                                                                                                                                 | `track` returns before building the event when data collection is disabled. _Fixed — Step 14._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-TRACK-004`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:59, 63`; `gff/src/lib/model/tracking-event.ts:11, 41`                                                                                                                                                                  | `kind: 'tracking'`, details under `trackingEventDetails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOFF-TRACK-005`    | Major    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider.ts:60-65`                                                                                                                                                                                                                 | Carries `evaluationContext` and reuses the §13 rules, including `getContextKind`, which is now correct for all five rows of the normative table (`GOFF-COLL-005`, Step 16).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-AUTH-001`     | Major    | Core       | **FAIL**    | `gff/src/lib/helper/constants.ts:17`; `gff/src/lib/service/api.ts:87, 165`; `gff/src/lib/evaluator/remote-evaluator.ts:65`                                                                                                                                      | **Deliberate, per maintainer decision D6.** The provider authenticates with `X-API-Key: {apiKey}` everywhere. The requirement names `Authorization: Bearer` specifically, so this is recorded as unmet rather than reinterpreted — see finding m10b. _Not planned._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-AUTH-002`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:87, 165`; `gff/src/lib/evaluator/remote-evaluator.ts:65`                                                                                                                                                                            | One header applied to configuration, collection and evaluation alike. §15 is explicit that this is assessed independently of `AUTH-001`: "a provider sending the wrong header consistently fails one requirement, not two." _Restored — Step 19b._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOFF-AUTH-003`     | Major    | Core       | PASS        | `gff/src/lib/service/api.ts:86, 164`; `gff/src/lib/evaluator/remote-evaluator.ts:64`                                                                                                                                                                            | A truthiness guard on all three paths means an empty or unset `apiKey` sends no authentication header. Scoped to the **provider's own** behaviour: a caller who writes `X-API-Key` into `headers` while no `apiKey` is configured gets it sent, which is explicit configuration rather than the ambient kind `GOFF-CFG-005` prohibits — the same standing `Authorization` has. _Step 19b._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-AUTH-004`     | Minor    | Core       | PASS        | `gff/src/lib/go-feature-flag-provider-options.ts:88`; `gff/src/lib/helper/headers.ts:22-46`                                                                                                                                                                     | A GOFF-native `headers` option is merged into all three request builders — configuration, collection and remote evaluation — so it holds in **both** evaluation modes, which §15's Core tier requires. _Fixed — Step 19b._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GOFF-FALLBACK-001` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:515-545`; `gff/src/lib/helper/constants.ts:74`                                                                                                                                                                    | All four resolvers hand a qualifying failure to `RemoteEvaluator` and return its answer. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOFF-FALLBACK-002` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:520`                                                                                                                                                                                                              | The trigger reads `response.errorCode` — the raw engine code — before `handleError` maps it onto the SDK enumeration. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-FALLBACK-003` | Major    | In-process | PASS        | `gff/src/lib/helper/constants.ts:74`                                                                                                                                                                                                                            | The trigger set is exactly `PARSE_ERROR` and `GENERAL`; `FLAG_CONFIG` is deliberately absent, with a test pinning it. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-FALLBACK-004` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:515-545`                                                                                                                                                                                                          | No circuit breaker and no memoised failure state: every qualifying evaluation attempts the fallback. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOFF-FALLBACK-005` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:539-543`                                                                                                                                                                                                          | A failed remote call is logged and `undefined` returned, so the original in-process response continues to `handleError` and the caller sees the root cause. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GOFF-FALLBACK-006` | Major    | In-process | PASS        | `gff/src/lib/hook/data-collector-hook.ts:101-103`                                                                                                                                                                                                               | `after` returns before building an event when the result carries the fallback marker. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOFF-FALLBACK-007` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:536`; `gff/src/lib/helper/constants.ts:64`                                                                                                                                                                        | `gofeatureflag_evaluated_remotely: true` is merged into the relay proxy's own metadata rather than replacing it. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GOFF-FALLBACK-008` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:524-526`                                                                                                                                                                                                          | Every fallback logs at warning level, naming the flag and the raw engine code. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-FALLBACK-009` | Major    | In-process | PASS        | `gff/src/lib/evaluator/inprocess-evaluator.ts:530`                                                                                                                                                                                                              | The fallback evaluator is built from the same options object the provider was given, so authentication and timeout are identical by construction. _Fixed — Step 22._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOFF-CACHE-001`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | No remote cache implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GOFF-CACHE-002`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-CACHE-003`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-CACHE-004`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-CACHE-005`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-CACHE-006`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GOFF-CACHE-007`    | Major    | Optional   | N/A         | §0.1 above                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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

#### ✅ C2 — `GOFF-CFG-005` · **RESOLVED in Step 19**

_`RemoteEvaluator` constructs the delegate inside `withoutOfrepEnvironment` (`remote-evaluator.ts:28-47, 93`), which deletes `OFREP_ENDPOINT`, `OFREP_HEADERS` and `OFREP_TIMEOUT_MS` and restores them in a `finally`. `getConfig` and every read it performs are synchronous, as is the `OFREPProvider` constructor, so on a single-threaded runtime no other JavaScript observes the gap. `delete` rather than assignment, because `process.env.X = undefined` stores the string `"undefined"` and passes the delegate's truthiness guard._

_Passing an explicit `baseUrl` would not have been enough on its own: `getConfig` merges `OFREP_HEADERS` **underneath** the headers we supply and overrides only on key collision, so an injected header with a name we do not set would have survived. Closed locally per **D1** rather than upstream. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **MUST NOT** read environment variables to determine the endpoint or credentials. A feature-flag provider silently retargeting itself based on ambient environment is a security surprise."

**Code:** In remote mode, `src/lib/evaluator/remote-evaluator.ts:23-29` builds an `OFREPProvider`. Its constructor calls `getConfig` at `libs/providers/ofrep/src/lib/configuration.ts:138`, which merges `getEnvVarConfig()` (`:14-42`) reading **`OFREP_ENDPOINT`** (`:17-26`), **`OFREP_HEADERS`** (`:37-39`) and **`OFREP_TIMEOUT_MS`** (`:28-35`). The endpoint precedence is `providedOptions.baseUrl ?? envVarConfig.baseUrl ?? ''` (`:145`), and headers are merged with the environment as the _base_ layer (`:146`, `:105-131`).

This is reachable by design, not by accident: `src/lib/go-feature-flag-provider-options.ts:60-63` documents it — _"The evaluation type remote does not require an endpoint, because it can be set by the environment variable OFREP_ENDPOINT"_ — and `src/lib/go-feature-flag-provider.ts:160` deliberately exempts remote mode from the mandatory-endpoint check.

**Consequence:** A process that sets `OFREP_ENDPOINT` retargets every flag evaluation to a host the application never named. `OFREP_HEADERS` is worse: it seeds the header map, so when `apiKey` is unset the provider will send an `Authorization` header sourced entirely from the ambient environment. Both are exactly the silent-retargeting surprise the requirement prohibits.

**Smallest fix:** In `RemoteEvaluator`, make `endpoint` mandatory and pass it explicitly, and pass a complete `headers` array so nothing can be inherited — i.e. stop routing through the env-reading `getConfig` layer. Remediation for the general case lies **upstream** in `libs/providers/ofrep/src/lib/configuration.ts`, which is where the env lookup would have to become opt-in; the local fix above closes it for this provider without waiting on that.

---

</details>

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

#### ✅ C9 — `GOFF-CTX-006` · **RESOLVED in Step 9**

_The namespace is merged into rather than assigned, so caller-owned `flagList` and `currentDateTime` survive. The key and the metadata sub-key are now named constants, so the two places that must agree on the wire contract cannot drift apart. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### 🟡 C10 — `GOFF-EVAL-006` · **IN-PROCESS HALF RESOLVED in Step 8**

_All four in-process resolvers now test for a value-less result before the type check and return the caller's default, preserving the engine's reason, variant and metadata. `handleError` runs first, so only a successful evaluation that produced no value reaches the guard — a genuinely wrong type still reports `TYPE_MISMATCH`._

_The remote path is unchanged and this finding stays open until **X1** lands in `libs/shared/ofrep-core`. Original finding retained below._

**Upstream verification of the fix's direction.** `GOFF-EVAL-006` is not a GOFF-local rule; it is the application of the OpenFeature specification to this provider, and the specification admits **no null flag value at all**:

- `types.md` → Resolution Details: `value (boolean | string | number | structure, **required**)`. There is no null/nil type anywhere in the spec's type system (Boolean, String, Number, Structure, Datetime). A full-text search of `types.md`, `glossary.md`, `01-flag-evaluation.md`, `02-providers.md`, `04-hooks.md` and `appendix-a` finds `null` **only** in 2.2.6 and 2.3.3, both about the `error code` / `error message` fields being null-or-falsy — never about `value`.
- Requirement **2.2.3**: "In cases of normal execution, the `provider` **MUST** populate the `resolution details` structure's `value` field with the resolved flag value."
- Requirement **1.4.10**: "Flag evaluation calls must always return the `default value` in the event of abnormal execution."

**Why the default, and not `TYPE_MISMATCH`.** `types.md` → Resolution Reason defines `DEFAULT` as "The resolved value fell back to a pre-configured value (no dynamic evaluation occurred **or dynamic evaluation yielded no result**)" — the second clause is exactly a null engine result, and the prescribed answer is fall-back, not error. Raising `TYPE_MISMATCH` would route the evaluation through the SDK's `getErrorEvaluationDetails`, which discards the provider's `variant` and forces `reason: ERROR`, directly violating this requirement's "preserving the engine's reason, variant and metadata".

**Why the guard has to live in the provider.** `OpenFeatureClient.evaluate` (`server-sdk dist/cjs/index.js:346-390`) performs **no runtime type validation** — it branches only on `resolutionDetails.errorCode` and otherwise passes the provider's `resolution` through verbatim. Requirement 1.3.4 is a `SHOULD` that the JS SDK does not implement, and `JsonValue` admits `null` (`core dist/types.d.ts:8,16`), so `{ value: null }` both compiles and reaches the application author unconverted. There is no SDK-side safety net. (The `TypeMismatchError` at `server-sdk dist/cjs/index.js:159` is inside `InMemoryProvider` guarding its own fixtures, not a client-side check.)

**One divergence noted, deliberately not changed.** This requirement mandates preserving the engine's `reason`, so `{reason: "TARGETING_MATCH", value: null}` yields the default under `reason: TARGETING_MATCH`, where OpenFeature's `DEFAULT` reason arguably fits better. The requirement is explicit and internally consistent with `GOFF-EVAL-008`, which uses the same preserve-the-engine's-reason pattern for disabled flags, so the current behaviour stands.

**The `variant` question, raised in review and resolved against the engine source.** Since the value served is the caller's default, should the variant be forced to `SdkDefault`? **No** — `SdkDefault` is engine-owned (`modules/core/flag/constant.go`: `const VariationSDKDefault string = "SdkDefault"`) and `InternalFlag.Value()` sets it itself on _every_ path where the engine serves `flagContext.DefaultSdkValue` (disabled/experimentation-over, targeting-key missing, scheduled-rollout error, `selectVariation` error, plus `evaluation.go`'s type-mismatch branch). Preserving the variant is therefore precisely how `SdkDefault` gets reported, and is already what makes `GOFF-EVAL-008` pass without a provider-side special case.

The only path that reaches this guard with no error code is `GetVariationValue` returning nil — the selected variation's configured value is JSON `null`, or a rule names a variation absent from `variations`. There the engine reports the **selected variation's name** with the real reason, and that name is the only field identifying which variation is misconfigured. Overwriting it with `SdkDefault` would discard it and contradict this requirement's "preserving the engine's … variant". Counter-argument recorded but not adopted: OpenFeature **2.2.4** asks for a variant "corresponding to the returned flag value", which `varB` alongside the caller's default does not — but 2.2.4 is a `SHOULD` against this requirement's `MUST`.

Pinned by `inprocess-evaluator.test.ts` → `null evaluation results`, whose fixture now uses the engine's real shape (`variationType: 'null_variation'`, `reason: 'STATIC'`) instead of the earlier `SdkDefault` fixture, which could not distinguish preservation from a hardcoded sentinel. Forcing `variant: 'SdkDefault'` in the guard fails 6 tests; under the old fixture it failed none.

<details>
<summary>Original finding</summary>

**Spec:** "A `null` evaluation result **MUST** return the caller's default value, preserving the engine's reason, variant and metadata. It **MUST NOT** return the language's zero value."

**Code:** In-process, every resolver type-tests the value and throws on failure — `src/lib/evaluator/inprocess-evaluator.ts:118-122` (`typeof null !== 'boolean'`), `:140-144`, `:162-166`, and `:184-189` which rejects `null` explicitly (`response.value !== null && ...`). Remote is the same in substance: `libs/shared/ofrep-core/src/lib/helpers.ts:7` defines `isDefined` as `typeof value !== 'undefined'`, so `null` is _defined_ and falls through to the `typeof result.value !== typeof defaultValue` comparison at `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:248` — `'object' !== 'boolean'` → `TYPE_MISMATCH`.

**Consequence:** A flag whose variation value is JSON `null` reports a type error attributed to the caller instead of returning the default with the engine's `reason`, `variant` and `metadata` intact. The caller loses the diagnostic context the specification wants preserved, and telemetry records a type mismatch that never happened.

**Smallest fix:** In each in-process resolver, test `response.value === null || response.value === undefined` _before_ the `typeof` check and return `this.prepareResponse(response, flagKey, defaultValue)`. Upstream, the delegate's `isDefined` should treat `null` as undefined (or `toResolutionDetails` should null-check first).

---

</details>

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

#### ✅ C12 — `GOFF-WASM-008` · **RESOLVED in Step 10**

_Any fault in a call into the instance discards it, so the next evaluation rebuilds. The Go runtime is now recreated per instantiation too: it holds references into the instance it was started with, so reusing one across a rebuild would point the new module at the old memory. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "If evaluation traps, the instance **MUST** be discarded and rebuilt. A trap does not unwind the module's shadow-stack pointer, so a trapped instance is permanently poisoned and **MUST NOT** be returned to a pool or reused."

**Code:** `src/lib/wasm/evaluate-wasm.ts:256-263` catches _everything_ — including a `WebAssembly.RuntimeError` from `evaluateFunction(...)` at `:282` — and returns a `GENERAL` error response. `this.wasmExports` and `this.wasmMemory` are left untouched, so the next `evaluate()` call finds them populated at `:226` and reuses the same poisoned instance.

**Consequence:** The first trap poisons the module for the process lifetime. Every subsequent evaluation runs against a corrupted shadow stack: results become non-deterministic, `malloc` may fault at arbitrary addresses, and each failure surfaces as an opaque `GENERAL`. The provider does not recover without a restart.

**Smallest fix:** In the `catch`, set `this.wasmExports = null; this.wasmMemory = null;` before returning, so the guard at `:226-228` rebuilds on the next call.

---

</details>

---

#### ✅ C13 — `GOFF-WASM-012` · **RESOLVED in Step 10**

_The `finally` that released the input ran on the trap path too. It is now reachable only once `evaluate` has returned normally, so nothing at all runs on a faulted instance. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ C14 — `GOFF-COLL-019` · **RESOLVED in Step 12**

_`enforceCap` (`event-publisher.ts:102-110`) trims the buffer to `2 × maxPendingEvents`, discarding oldest first, and runs on both paths that can grow it — the push in `addEvent` (`:119`) and the failed-batch re-queue (`:171`). The threshold and the cap now derive from one accessor (`:91`), so they cannot drift apart. Discards are logged at warning level rather than being silent. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The buffer **MUST** be capped at twice `maxPendingEvents`, discarding **oldest** events on overflow. An uncapped buffer is an unbounded memory leak during a collector outage."

**Code:** `src/lib/service/event-publisher.ts:17` declares `private readonly events: ExportEvent[] = []`. `addEvent` (`:89-97`) pushes unconditionally, and the failure path at `:117` pushes the entire failed batch straight back in. Nothing anywhere trims the array — the only length check (`:91`) triggers a _flush_, not a discard.

**Consequence:** While the data collector is unreachable, every evaluation and every `track()` call appends an event that is never removed: each flush attempt drains the array and then puts the whole batch back. Memory grows without bound for the duration of the outage, and the failing publish grows in size with it. On a busy service this ends in an OOM kill.

**Smallest fix:** After the push in `addEvent` and after the re-queue at `:117`, trim from the front: `const cap = 2 * (this.options.maxPendingEvents ?? DEFAULT_MAX_PENDING_EVENTS); if (this.events.length > cap) this.events.splice(0, this.events.length - cap);`

---

</details>

---

### 3.2 Major

---

#### ✅ M1 — `GOFF-FALLBACK-001` · **RESOLVED in Step 22**

_The fallback exists: `genericEvaluate` hands the evaluation to a lazily built `RemoteEvaluator` on a raw engine `PARSE_ERROR` or `GENERAL`, reusing the same options object so the authentication and timeout are identical by construction. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "When in-process evaluation returns raw engine code `PARSE_ERROR` or `GENERAL`, the provider **MUST** retry the evaluation remotely via OFREP and return the remote result."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:226-263` returns the engine response directly to `handleError`, which throws (`:316-339`). There is no OFREP client in the in-process path — `InProcessEvaluator` never imports `OFREPProvider` or `RemoteEvaluator`, and searching `src/` for `fallback` finds only an unrelated comment about WASM path resolution (`evaluate-wasm.ts:133`) and a marketing claim in `README.md:14`.

**Consequence:** Every failure mode §16 is designed to rescue becomes a hard error returned to the application. §10.1 is explicit that a guard breach surfaces as `PARSE_ERROR` and that "[§16] turns [it] into a remote evaluation. That is the intended outcome" — so on `0.2.4` a context the embedded engine cannot handle still fails here, where a conformant provider resolves it correctly against the relay proxy. On any pre-`0.2.4` binary it is worse: the breach traps instead of returning `PARSE_ERROR`, and C12/C13 then poison the instance. Nothing degrades gracefully either way.

**Smallest fix:** In `genericEvaluate`, when the raw `errorCode` is `PARSE_ERROR` or `GENERAL` (and not `FLAG_CONFIG`), delegate to a lazily constructed `RemoteEvaluator`, log at warning level, and stamp `gofeatureflag_evaluated_remotely: true` into the returned metadata; on remote failure return the original in-process response.

---

</details>

---

#### ✅ M2–M9 — `GOFF-FALLBACK-002` … `-009` · **RESOLVED in Step 22**

_Closed with M1: the trigger is read before the error code is mapped, `FLAG_CONFIG` never falls back, there is no circuit breaker, a remote failure returns the original in-process result, and a fallback result is stamped `gofeatureflag_evaluated_remotely` so the data-collector hook skips it. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ M10 — `GOFF-CFG-009` and `GOFF-CFG-010` · **RESOLVED in Step 14**

_The option is read on every path that produces telemetry: both `DataCollectorHook` stages via `shouldCollect` (`data-collector-hook.ts:46-51`) and `GoFeatureFlagProvider.track` (`:60-62`). `CFG-010` closes with it — the option is no longer vestigial now that the capability it names is implemented. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** `GOFF-CFG-009`: "An option that the provider declares and documents **MUST** be honoured. A declared option that is never read is a defect regardless of its default." `GOFF-CFG-010`: "The provider **MUST NOT** expose options for capabilities it does not implement. Vestigial options from removed features **MUST** be deleted rather than left inert."

**Code:** Declared at `src/lib/go-feature-flag-provider-options.ts:33` with the doc comment "Whether to disable data collection. @default false", documented at `README.md:83` as "Disable data collection entirely" and demonstrated at `README.md:135`. Grepping the whole of `src/` for `disableDataCollection` returns the declaration plus two test files (`go-feature-flag-provider-options.spec.ts:39,48,56,63` and `go-feature-flag-provider.test.ts:374`) — and **no production read site**.

**Consequence:** A user who sets `disableDataCollection: true` — to satisfy a privacy requirement, or to stop traffic to a collector they do not run — still has every evaluation and every tracking event posted to `/v1/data/collector`. The option's presence in the README makes this actively misleading rather than merely missing. This is also the root cause of M17 (`GOFF-HOOK-006`) and M22 (`GOFF-TRACK-003`).

**Smallest fix:** One read site each in `DataCollectorHook.after`/`.error` and `GoFeatureFlagProvider.track`, gating on the option; or, if the capability is genuinely not wanted, delete the option and both README rows.

---

</details>

---

#### ✅ M11 — `GOFF-CTX-007` · **RESOLVED in Step 9**

_Fixed by the same change as C9: the metadata is written to `gofeatureflag.exporterMetadata`, the key the relay proxy actually reads. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`exporterMetadata` **MUST** be nested under `gofeatureflag.exporterMetadata`. Writing the metadata flat under `gofeatureflag` means the server never reads it."

**Code:** `src/lib/hook/enrich-evaluation-context-hook.ts:39` — `enrichedContext['gofeatureflag'] = metadataAsObject;`. `metadataAsObject` is the flat user map from `src/lib/model/exporter-metadata.ts:21-23`, so the wire shape is `{"gofeatureflag": {"environment": "production", ...}}` where the server expects `{"gofeatureflag": {"exporterMetadata": {"environment": "production", ...}}}`.

**Consequence:** Every value a user configures via `ExporterMetadata` is dropped by the relay proxy. Exported evaluation events carry none of the environment/version/region tags the user configured, and the failure is completely silent — the request succeeds, the metadata simply never appears downstream.

**Smallest fix:** The same one-line change as C9 nests the map under `exporterMetadata`.

---

</details>

---

#### ✅ M12 — `GOFF-COLL-011` · **RESOLVED in Step 15**

_`ExporterMetadata.asObject()` (`exporter-metadata.ts:29`) always appends `RESERVED_EXPORTER_METADATA` (`constants.ts:52-55`), so the envelope carries `provider` and `openfeature: true` even when the caller configured nothing. Seeded in the model rather than in `sendEventToDataCollector` as the audit suggested: the envelope is not the only consumer — the enrichment hook writes the same object into `gofeatureflag.exporterMetadata`, which is what the relay proxy reads for in-process exports, and seeding only the envelope would have left that copy unattributable. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The `meta` envelope **MUST** always contain `provider` and `openfeature: true`, whether or not the user configured any metadata. Without them events cannot be attributed to an SDK."

**Code:** `src/lib/service/api.ts:132-136` builds `{meta: exporterMetadata?.asObject() ?? {}, events: eventsList}`. `ExporterMetadata.asObject()` (`src/lib/model/exporter-metadata.ts:21-23`) returns only what the user added. Searching `src/` for `openfeature:` and `'javascript'` finds nothing. When no metadata is configured, `event-publisher.ts:113` passes a fresh empty `ExporterMetadata`, so `meta` is literally `{}`.

**Consequence:** The relay proxy cannot attribute any exported event to an SDK or a language. Per-SDK breakdowns in the collector are empty for this provider, and `GOFF-COLL-012` (`provider: "javascript"`) is unsatisfiable while this holds.

**Smallest fix:** In `sendEventToDataCollector`, seed the envelope: `meta: { ...(exporterMetadata?.asObject() ?? {}), provider: 'javascript', openfeature: true }`. This fixes M13 in the same line.

---

</details>

---

#### ⚠️ M13 — `GOFF-COLL-012` · **STILL OPEN after Step 15 — value mismatch**

_The structural half is done: `provider` exists, is always present, and is applied after the caller's own entries so `add('provider', …)` cannot shadow it (`exporter-metadata.ts:29`). The **value** is not conformant. `constants.ts:53` holds `'nodejs'`, set deliberately by the maintainer; the requirement enumerates nine identifiers and the one for this language is **`javascript`**. `nodejs` appears nowhere in the specification (checked the whole document, not just this row) — it names a runtime, not a language, and this package also ships to non-Node runtimes via the `FetchAPI` abstraction._

_Two ways to close it: change the constant to `javascript`, or raise a specification amendment adding `nodejs` to the enumerated list. Recorded as **FAIL** until one of those happens, because a conformance report that calls this satisfied would be wrong. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`provider` **MUST** be the lowercase language identifier: `python`, `java`, `dotnet`, `go`, `javascript`, `kotlin`, `php`, `ruby`, `rust`."

Inherited FAIL per §C.1: the governing key does not exist (M12). Listed separately because the specification numbers it separately, and because it is Minor where M12 is Major. Fixed by M12's one-line change.

---

</details>

---

#### ✅ M14 — `GOFF-COLL-005` · **RESOLVED in Step 16**

_The `!context ||` disjunct is gone (`event-util.ts:14`), so an absent context yields `user` like the other four rows. The identity test on `anonymous` was already right and is kept — a new `event-util.test.ts` transcribes the normative table row for row, including the two rows a truthiness test would get wrong (`'true'` and `1`). Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ M15 — `GOFF-EVT-001` · **RESOLVED in Step 26**

_`getEvaluator` now passes `this.events` to both branches (`go-feature-flag-provider.ts:157`), and `RemoteEvaluator` reports its health on every evaluation (`remote-evaluator.ts:158-168, 172-203`): the first failure emits `Error`, the next success emits `Ready`, and each is emitted once per episode._

_**`ERROR`, not `STALE`, and on the first failure rather than a threshold — decided by the maintainer, and it follows from what the two modes hold.** Staleness means the provider is still serving a last-known-good snapshot that is ageing; that is exactly why the in-process path absorbs two failures before saying anything, since it keeps answering correctly throughout. Remote mode caches nothing. A relay proxy it cannot reach is not a provider serving older data, it is a provider that cannot evaluate at all — so `STALE` describes a condition that cannot arise here, and waiting for a second failure would only delay a signal the application needs immediately. A test asserts `Stale` is never emitted from this path, so a later change that reaches for it fails rather than passing quietly._

_The status is recoverable, not fatal: the SDK short-circuits evaluations only in `NOT_READY` and `FATAL` (§0.2), so calls keep arriving and the next success returns the provider to `READY` unattended._

_**What counts as a failure, and why.** The delegate already draws the line this needs. A failure the server described — `FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `TARGETING_KEY_MISSING` — comes back as resolution details carrying an `errorCode`; a failure to obtain any answer at all — network, timeout, `401`, `429`, unparseable body — is thrown (`ofrep-core/src/lib/api/ofrep-api.ts:211-232`). Only the second kind says anything about the health of the relay proxy, so only the second kind is counted. A flag that does not exist is not a broken provider, and reporting the whole provider in error over one missing key would be a worse defect than the one being fixed._

_The emitted payload carries the underlying cause. A transport failure reaches this code wrapped in an `OFREPApiFetchError` whose own message is the constant `"The OFREP request failed."`, so the wrapper is unwrapped before reporting — otherwise a handler is told the provider broke and nothing about why._

_**The emitter is optional.** The §16 fallback builds a `RemoteEvaluator` inside the in-process evaluator (`inprocess-evaluator.ts:544`) and passes none, so a fallback cannot report the provider broken for a relay proxy the in-process path is not depending on — that path already reports its own health from the polling loop._

_**`PROVIDER_CONFIGURATION_CHANGED` is recorded as inapplicable rather than unimplemented.** Remote mode holds no configuration: every evaluation is a round trip, there is nothing cached to change and no poll to detect a change on. `GOFF-EVT-002`/`-003`/`-004` constrain a configuration this mode does not have, so there is no event to withhold and nothing a consumer can observe in one mode but not the other. This is the reading the plan flagged as its lowest-confidence point; it is recorded explicitly here rather than left implicit in a PASS._

_**One asymmetry this step does not close, recorded so it is not mistaken for covered:** `GOFF-EVT-007` puts the provider in `FATAL` on a `401`/`403` during initialization, but `RemoteEvaluator.initialize` contacts nothing (`remote-evaluator.ts:253-256`), so remote mode cannot reach `FATAL` at start-up — bad credentials surface on the first evaluation instead. That is a §4 lifecycle question rather than a §5 event-parity one, and closing it means adding a start-up probe request that remote mode does not otherwise make. Not in scope for this step._

<details>
<summary>Original finding</summary>

**Spec:** "Provider events **MUST** be emitted identically in both evaluation modes. A capability present in one mode and silently absent in the other is a defect."

**Code:** `src/lib/go-feature-flag-provider.ts:130-135` passes `this.events` only to `InProcessEvaluator`; `RemoteEvaluator`'s constructor (`src/lib/evaluator/remote-evaluator.ts:17-30`) takes no emitter, and the file contains no `emit` call.

**Consequence:** An application that registers a `PROVIDER_CONFIGURATION_CHANGED` handler and works in in-process mode goes silent when switched to remote — with no error and no log line. Switching evaluation modes is presented as a configuration choice but silently changes the provider's observable event contract.

**Smallest fix:** Pass the emitter to `RemoteEvaluator` and drive configuration-changed events from the OFREP bulk/SSE path, or document the gap explicitly if remote mode is intended to be event-free — the specification requires the former.

---

</details>

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

#### ✅ M19 — `GOFF-HOOK-001` · **RESOLVED in Step 13**

_The two `push` calls are swapped (`go-feature-flag-provider.ts:162-165`), giving `[EnrichEvaluationContext, DataCollector]`. Both still run in the constructor (`:52`), so the observability half is unchanged. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider's hooks **MUST** be observable by the time initialization completes, in the order **`[EnrichEvaluationContext, DataCollector]`**."

**Code:** `src/lib/go-feature-flag-provider.ts:141-148` pushes `DataCollectorHook` first (`:142`) and `EnrichEvaluationContextHook` second (`:145`), producing `[DataCollector, EnrichEvaluationContext]`. The observability half passes — both are registered in the constructor, so they exist before `initialize()` is even called.

**Consequence:** The SDK runs provider `before` hooks in array order and `after`/`error`/`finally` in reverse (`server-sdk dist/cjs/index.js:732-738, 777-801`). Because `DataCollectorHook` implements no `before` stage, enrichment still reaches the resolver today — but the _after_ order is inverted relative to the specification, and the arrangement is fragile: adding a `before` stage to the data-collector hook (to read enriched context, the obvious future change) would immediately produce events built from unenriched context.

**Smallest fix:** Swap the two `push` calls.

---

</details>

---

#### ✅ M20 — `GOFF-HOOK-003` · **RESOLVED in Step 13**

_Registered unconditionally (`go-feature-flag-provider.ts:162`), passing `options.exporterMetadata` straight through — the hook already constructs an empty `ExporterMetadata` when that is `undefined`. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The enrichment hook **MUST** be registered unconditionally. Because `exporterMetadata` always contains the reserved keys of `GOFF-COLL-010`, it always has something to contribute."

**Code:** `src/lib/go-feature-flag-provider.ts:144-147` wraps the registration in `if (this.options.exporterMetadata)`. The hook itself already handles the empty case gracefully (`enrich-evaluation-context-hook.ts:14-18` constructs an empty `ExporterMetadata` when none is supplied), so the guard adds nothing but the defect.

**Consequence:** With no `exporterMetadata` configured — the default — the hook never runs, so the provider has no place to inject the reserved keys `GOFF-COLL-010` describes. The gap is currently invisible only because those keys are not implemented either (see M12); fixing M12 without this leaves the metadata unattached in the common configuration.

**Smallest fix:** Register unconditionally: move the `push` out of the `if`, passing `this.options.exporterMetadata` (which the hook already tolerates being `undefined`).

---

</details>

---

#### ✅ M21 — `GOFF-HOOK-006` · **RESOLVED in Step 14**

_Both stages route through a single `shouldCollect` predicate (`data-collector-hook.ts:46-51`, called at `:66` and `:98`) covering `disableDataCollection` and trackability together, so neither stage can be gated without the other — which is exactly what the requirement's "gating only one stage produces partial telemetry" guards against. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Both stages **MUST** honour `disableDataCollection` and the flag's trackability. Gating only one stage produces partial telemetry that looks like data loss."

**Code:** `src/lib/hook/data-collector-hook.ts:46-49` and `:78-81` gate on `this.evaluator.isFlagTrackable(...)` only. The hook never receives the options object (constructor at `:22-31` takes an evaluator and a publisher), so it has no access to the flag. Trackability itself is handled correctly on both stages — this is purely the `disableDataCollection` half.

**Consequence:** As M10: the option has no effect on evaluation telemetry.

**Smallest fix:** Pass `options` (or a boolean) into `DataCollectorHook` and short-circuit both stages when data collection is disabled.

---

</details>

---

#### ✅ M22 — `GOFF-TRACK-003` · **RESOLVED in Step 14**

_`track` returns before building the event when data collection is disabled (`go-feature-flag-provider.ts:60-62`). Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Tracking events **MUST** honour `disableDataCollection`."

**Code:** `src/lib/go-feature-flag-provider.ts:56-68` builds the `TrackingEvent` and calls `this.eventPublisher.addEvent(event)` with no gate.

**Consequence:** As M10, for the tracking path. A user who disabled data collection still emits custom events to the relay proxy.

**Smallest fix:** `if (this.options.disableDataCollection) return;` at the top of `track`.

---

</details>

---

#### ✅ M23 — `GOFF-COLL-016` · **RESOLVED in Step 12**

_`publishEvents` returns early while `inFlight` is set (`event-publisher.ts:138-140`). The handle is a promise rather than a boolean so `stop` can join it (`:85`) before the shutdown flush — with a bare flag, single-flight would have turned that flush into a no-op and dropped everything buffered at shutdown, trading this defect for a worse one. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Flushing **MUST** be single-flight — concurrent publishes **MUST NOT** overlap."

**Code:** `src/lib/service/event-publisher.ts:104-119` has no in-flight flag. Two callers exist: the periodic runner (`:60`) and the `maxPendingEvents` threshold in `addEvent` (`:91-96`, fire-and-forget). The synchronous buffer swap at `:110-111` prevents the _same_ events being sent twice, but does not prevent a second HTTP POST starting while the first is still awaiting at `:113`.

**Consequence:** During a slow or hanging collector, publishes pile up: each threshold crossing starts another concurrent POST against an endpoint that is already struggling. Combined with C14 (uncapped buffer) this amplifies an outage rather than backing off.

**Smallest fix:** Add `private publishing = false;`, return early from `publishEvents` when set, and clear it in a `finally`.

---

</details>

---

#### ✅ M24 — `GOFF-COLL-018` · **RESOLVED in Step 12**

_The failed batch is returned with `unshift` (`event-publisher.ts:170`), ahead of anything `addEvent` buffered while the POST was in flight, and the C14 cap is applied immediately afterwards (`:171`) so the discard-oldest rule still trims from the head. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ M25 — `GOFF-CFG-003` · **RESOLVED in Step 18**

_`DEFAULT_FLUSH_INTERVAL_MS` is now `60000` (`constants.ts:22`), matching §3.1, with the JSDoc and `README.md` corrected alongside it. The other half — `flagChangePollingInterval` — was closed in Step 2, so this row moves PARTIAL → PASS. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "Every option listed in §3.1 that the provider supports **MUST** use the default value given there." §3.1 specifies `dataFlushInterval` = `60000 ms` and `flagChangePollingInterval` = `120000 ms`.

**Code:** `src/lib/helper/constants.ts:22` — `DEFAULT_FLUSH_INTERVAL_MS = 120000`, applied at `src/lib/service/event-publisher.ts:62`. That is double the mandated value, and `src/lib/go-feature-flag-provider-options.ts:20` documents the wrong number too (`@default 120000`), as does `README.md:81`. Separately, `flagChangePollingIntervalMs` has no default at all (see C3), which is a `GOFF-CFG-003` failure in its own right as well as a `GOFF-IP-006` one.

Verified as correct: `timeout` `10000` (`api.ts:45`; remote path `ofrep-api.ts:47`), `maxPendingEvents` `10000` (`constants.ts:23`), `evaluationType` in-process (`go-feature-flag-provider.ts:133`), `apiKey` none, `exporterMetadata` empty, `endpoint` required (in-process).

**Consequence:** Evaluation telemetry reaches the collector at half the mandated rate, so dashboards lag twice as far behind reality as on a conformant provider — the fleet-inconsistency §3 exists to prevent.

**Smallest fix:** `DEFAULT_FLUSH_INTERVAL_MS = 60000`, and correct the JSDoc at `go-feature-flag-provider-options.ts:20` and `README.md:81`.

---

</details>

---

#### ✅ M26 — `GOFF-CFG-004` · **RESOLVED in Step 18**

_The constructor takes a shallow copy and normalises the endpoint on it (`go-feature-flag-provider.ts:48-51`). The load-bearing half is what follows: `GoFeatureFlagApi`, the evaluator and the `EventPublisher` are all constructed from `this.options` rather than from `options`. The old code got away with passing the caller's object to them precisely because it had already mutated it in place, so copying without redirecting them would have left every outbound URL built from the un-normalised endpoint. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **MUST NOT** mutate the caller's options object or any collection it contains. Normalisation **MUST** operate on a copy."

**Code:** `src/lib/go-feature-flag-provider.ts:44-45`:

```ts
this.options = options; // same reference
this.options.endpoint = this.options.endpoint?.replace(/\/+$/, ''); // writes through
```

**Consequence:** A caller who builds one options object and constructs two providers from it — or who reads `options.endpoint` afterwards, or shares a frozen config module — observes the provider silently rewriting their input. Under `Object.freeze`, the assignment throws in strict mode, turning a normalisation detail into a construction failure.

**Smallest fix:** `this.options = { ...options, endpoint: options.endpoint?.replace(/\/+$/, '') };`

---

</details>

---

#### ✅ M27 — `GOFF-CFG-006` and `GOFF-CFG-007` · **RESOLVED in Step 20**

_`dataCollectorBaseURL` (`go-feature-flag-provider-options.ts:28`) resolves to `endpoint` when unset (`api.ts:57`) and is used for the collector URL alone (`:179`); the configuration request still builds from `endpoint` (`:96`), which is what makes this an override of one endpoint rather than of the relay proxy as a whole._

_`CFG-007` follows without extra work for the credentials — the header map, `apiKey` and abort timeout are built once inside `sendEventToDataCollector`, so they apply to whatever base it targets. Beyond the audit's suggested fix, the value is trailing-slash-trimmed and URL-validated at construction alongside `endpoint` (`go-feature-flag-provider.ts:52-54, 231-233`): it replaces the whole base, so a malformed value would otherwise have surfaced much later as a failed flush rather than as a configuration error. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** `GOFF-CFG-006`: "`dataCollectorBaseURL` **SHOULD** be supported. Where supported it **MUST** override the base URL for the data-collector endpoint **only** … and it **MUST** fall back to `endpoint` when unset." `GOFF-CFG-007` governs the same option's replacement semantics.

**Code:** The option appears nowhere in `src/lib/go-feature-flag-provider-options.ts:4-58`, and `src/lib/service/api.ts:153` hardcodes `${this.endpoint}/v1/data/collector`. `GOFF-CFG-007` is an inherited FAIL per §C.1.

**Consequence:** Deployments that route evaluation traffic to a local side-car but exports to a central collector cannot be configured. The fallback behaviour is accidentally correct (`endpoint` is used), so `GOFF-COLL-001` still passes — only the override is missing.

**Smallest fix:** Add `dataCollectorBaseURL?: string` and use `this.dataCollectorBaseURL ?? this.endpoint` at `api.ts:153`, leaving `:81` on `endpoint`. Authentication and timeout already apply uniformly in that method, satisfying `GOFF-CFG-007` once the option exists.

---

</details>

---

#### M28 — `GOFF-WASM-009` · No instance pool

**Spec:** "The instance pool **SHOULD** default to the host's CPU core count and **SHOULD** be configurable."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:67` constructs exactly one `EvaluateWasm`, held for the evaluator's lifetime. `wasmEvaluatorPoolSize` does not exist in `src/lib/go-feature-flag-provider-options.ts`; searching `src/` for `pool` returns nothing.

**Consequence:** All evaluation is serialised through one instance. On Node this is partly masked by the single-threaded event loop (which is what makes `GOFF-WASM-007` pass accidentally), but it forecloses `worker_threads` parallelism and makes a single slow evaluation a head-of-line block for every concurrent request.

**Smallest fix:** Add `wasmEvaluatorPoolSize?: number` defaulting to `os.cpus().length`, and hold an array of `EvaluateWasm` instances with a simple acquire/release queue. This is also the natural place to implement the discard-and-rebuild of C12.

---

#### ✅ M29 — `GOFF-WASM-013` · **RESOLVED in Step 10**

_Trap handling now lives in the host and is independent of which binary is bundled, which is what the requirement asks for — the `0.2.4` guards reduce traps but do not eliminate them. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The host **MUST** implement trap handling (`GOFF-WASM-008`, `-012`) regardless of which binary it bundles. The guards reduce traps but do not eliminate them, and older binaries carrying none of them remain in the field."

Inherited FAIL, and the one §10 requirement the engine bump does **not** touch. The requirement is explicit that trap handling is owed "regardless of which binary it bundles", because "[t]he guards reduce traps but do not eliminate them". Moving to `0.2.4` lowers the probability of reaching C12/C13; it does not remove the defect, and it does not help the deployments still pinned to an older binary. Fixed only by C12 and C13.

---

</details>

---

#### ✅ M30 — `GOFF-CFG-001` · **RESOLVED in Step 19**

_The options union is collapsed so `endpoint` is required in both modes (`go-feature-flag-provider-options.ts:74-88`), and both the presence and URL checks now run unconditionally (`go-feature-flag-provider.ts:201-215`). Breaking. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`endpoint` **MUST** be required and validated at construction time. An absent or malformed value **MUST** raise a configuration error before any network activity."

**Code:** `src/lib/go-feature-flag-provider.ts:160` requires `endpoint` only when `evaluationType !== EvaluationType.Remote`, and `:164` applies the URL validation under the same condition. The type definition makes the exemption explicit (`go-feature-flag-provider-options.ts:78-82`: `endpoint?: string` when `evaluationType: EvaluationType.Remote`).

**Consequence:** In remote mode a missing endpoint is not a configuration error — it is an invitation to `OFREP_ENDPOINT` (C2). A malformed one is caught, but late and by the delegate (`libs/providers/ofrep/src/lib/ofrep-provider.ts:27-32`), producing a generic `Error` rather than the provider's own `InvalidOptionsException`.

**Smallest fix:** Drop the `evaluationType !== Remote` conditions at `:160` and `:164`, and collapse the options union so `endpoint` is unconditionally required. This closes C2 at the same time.

---

</details>

---

#### M31 — `GOFF-EVAL-009` (PARTIAL) · Remote evaluation drops non-primitive flag metadata

**Spec:** "Flag metadata **MUST** be passed through with its structure intact. Values **MUST NOT** be coerced to strings."

**Code:** In-process passes metadata through untouched — `src/lib/evaluator/inprocess-evaluator.ts:354` is a TypeScript cast (`response.metadata as Record<string, string | number | boolean>`), erased at runtime, so nested objects survive. The remote path does not: `libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:266-277` filters the entry list to `['string','number','boolean']` and rebuilds the object, discarding every other key.

**Consequence:** A flag carrying structured metadata resolves with those keys present in in-process mode and absent in remote mode — the same flag, the same context, two different metadata maps. Nothing is coerced to a string (the literal prohibition holds); the loss is by omission. Note that the SDK's `FlagMetadata` type is `Record<string, string | number | boolean>` (`@openfeature/core@1.9.1 dist/types.d.ts:59`), so a fully structure-preserving remote path cannot be expressed in the SDK's own type — see Open question 3.

**Remediation lies upstream** in `libs/shared/ofrep-core`. Recorded here per §1.7's requirement that an audit note where the fix lives.

---

#### ✅ M32 — `GOFF-WASM-001` · **RESOLVED in Step 11**

_All four exports are resolved from one list (`evaluate-wasm.ts:13`) and initialization fails naming whichever is absent (`:88-91`). The check was also moved ahead of `go.run` and ahead of every field assignment, so a rejected module leaves `wasmExports` and `wasmMemory` null rather than the half-assigned state that made the original defect silent. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ M33 — `GOFF-WASM-004` · **RESOLVED in Step 11**

_Unpacking moved into a pure `unpackEvaluateResult` (`evaluate-wasm.ts:27-31`) that masks both halves in BigInt before converting, so a pointer stays non-negative across the whole 32-bit range. Extracting it is what makes the requirement testable: proving the fix through an evaluation would need a module holding more than 2 GiB of linear memory. `readFromMemory` (`:444`) additionally rejects an output slice extending past the end of the memory — without that, an out-of-range pointer reads `undefined` per index, which stores as `0`, so the caller got a run of NUL bytes and an opaque JSON parse error. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

#### ✅ M34 — `GOFF-COLL-013` · **RESOLVED in Step 25**

_`add()` now checks the value where it enters (`exporter-metadata.ts:52-58`) and throws `InvalidOptionsException` naming the key and what arrived. "Construction time" is read as the point the metadata object is built — `add` is the only way in, so guarding it leaves no path to an invalid envelope._

_The accepted set is the JSON scalars: string, boolean, and number covering **both** the requirement's "integer" and "floating-point" — JavaScript draws no distinction between them and neither does the envelope, so the guard is `Number.isFinite`, never `Number.isInteger`. What is rejected is what would nest the envelope (objects, arrays) or what JSON cannot render (`null`, `undefined`, `NaN`, the infinities). The last three the plan did not call out: `typeof` classes them as `number`, so a `typeof`-only guard would admit them, and `JSON.stringify` renders each as `null` — precisely the silent mangling this requirement exists to prevent._

_Twenty-two new tests, including a table of float shapes (negative, exponent notation, integral-valued, `MAX_SAFE_INTEGER`), a row asserting empty string, `false` and `0` still pass — a truthiness-based guard would reject all three — and one asserting the envelope survives a JSON round trip unchanged with every value a scalar, which is the flat-object property stated end to end. Original finding retained below._

<details>
<summary>Original finding</summary>

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

</details>

---

### 3.3 Minor

---

#### ✅ m1 — `GOFF-META-001` · **RESOLVED in Step 23**

_`go-feature-flag-provider.ts:28` is now the literal `'GO Feature Flag Provider'`. The pinning assertion at `go-feature-flag-provider.test.ts:246` was updated with the fix rather than before it, per §3.5. Breaking for anyone keying on the old name — hence `feat(go-feature-flag)!:` and the 2.0.0 bump (decision D2). Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider metadata name **MUST** be exactly `GO Feature Flag Provider`."

**Code:** `src/lib/go-feature-flag-provider.ts:25-27` — `metadata = { name: GoFeatureFlagProvider.name }` evaluates to the string `"GoFeatureFlagProvider"`.

**Consequence:** Every cross-language dashboard, log line and SDK event that keys on provider name shows a different value for the JavaScript provider than for the other seven. **A test pins this**: `src/lib/go-feature-flag-provider.test.ts:55` asserts `expect(provider.metadata.name).toBe('GoFeatureFlagProvider')`.

**Smallest fix:** `metadata = { name: 'GO Feature Flag Provider' };` and update the assertion at `go-feature-flag-provider.test.ts:55`.

---

</details>

---

#### ✅ m2 — `GOFF-META-002` · **RESOLVED in Step 23**

_The same literal closes this one. A new test asserts `metadata.name !== GoFeatureFlagProvider.name`, which is the property the requirement actually constrains — it fails if anyone reintroduces the reflection, where an equality check on the literal alone would not. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The metadata name **MUST** be a literal constant. It **MUST NOT** be derived by runtime reflection on a class or type name, which is unstable under minification and obfuscation."

**Code:** `src/lib/go-feature-flag-provider.ts:26` — `GoFeatureFlagProvider.name`, the exact construct the requirement names.

**Consequence:** The value changes under a minifier that mangles class names — a bundled consumer can see `metadata.name` become `"e"` or `"t"`. The package ships CJS and ESM builds (`project.json:61`) that downstream bundlers routinely minify, so this is reachable in practice, and the failure is silent.

**Smallest fix:** Same as m1 — the string literal fixes both.

---

</details>

---

#### ✅ m3 — `GOFF-ENG-003` · **RESOLVED in Step 27**

_A "Specification" section (`README.md:16-20`) names the targeted specification version, the pinned WASM module and the engine core it embeds, with a pointer to where the pin lives — so the `GOFF-ENG-001`/`-002` declaration is discoverable from the front page rather than only from a build script._

_The same step removed the two claims §3.4 recorded as contradicting the code. **D4** — "Caching: Intelligent caching with automatic cache invalidation" — is gone from the feature list, and so is a second instance the original audit missed: "Performance: Fastest evaluation with local caching" under *InProcess Evaluation*, which advertised the same non-existent cache further down the page. Holding the polled configuration in memory is not a cache; nothing is keyed, expired or invalidated. **D5** — "Error Handling: Robust error handling with fallback mechanisms" — became true in Step 22 and is now stated concretely rather than as a slogan: what triggers the fallback, that it reuses the same endpoint, credentials and timeout, and that fallback results are excluded from data collection. The inaccurate "Full compliance with OpenFeature specification" line is replaced by the Specification section, which makes a claim that can actually be checked._

_The options table was swept against `go-feature-flag-provider-options.ts` and needed no change — all fourteen options are documented, and Steps 2 and 18–21 had already brought the defaults into line. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **SHOULD** document which specification version it targets."

**Code:** Searched `README.md` (229 lines) and `package.json` — neither mentions a specification version. The closest claim is `README.md:16`, "OpenFeature Compliance: Full compliance with OpenFeature specification", which refers to a different document and, given this report, is not accurate about this one either.

**Smallest fix:** Add a line to `README.md` naming the targeted GO Feature Flag Provider Specification version.

---

</details>

---

#### ✅ m4 — `GOFF-CFG-008` · **RESOLVED in Step 21**

_`evaluationFlagList` (`go-feature-flag-provider-options.ts:50`) is resolved once in the evaluator's constructor (`inprocess-evaluator.ts:93`) and passed on every refresh (`:385`), not only the first — a poll that dropped it would have pulled the whole configuration back without any visible symptom, so there is a test asserting the second call carries it too._

_An empty list is normalised to `undefined`. The relay proxy already reads an empty `flags` array as "send everything", so the two spellings of that intent are collapsed deliberately rather than left to coincide. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`evaluationFlagList` **SHOULD** be supported, and when non-empty **MUST** be transmitted as the `flags` array of the flag-configuration request."

**Code:** The option is absent from `src/lib/go-feature-flag-provider-options.ts`. `src/lib/evaluator/inprocess-evaluator.ts:272` calls `this.api.retrieveFlagConfiguration(this.etag, undefined)` — the second parameter is always `undefined` — so `api.ts:60` always sends `{"flags": []}`. The transport already supports the list; only the option and its wiring are missing.

**Consequence:** A service that uses three flags from a configuration of several thousand must download and hold all of them on every poll.

**Smallest fix:** Add `evaluationFlagList?: string[]` and pass it as the second argument at `inprocess-evaluator.ts:272`.

---

</details>

---

#### ✅ m5 — `GOFF-CFG-010` · **RESOLVED in Step 14**

_`disableDataCollection` is read on every telemetry path — both hook stages and `track`. Original finding retained below._

<details>
<summary>Original finding</summary>

Covered in full under **M10**; listed here because the specification numbers it separately and rates it Minor.

---

</details>

---

#### ✅ m6 — `GOFF-IP-011` · **RESOLVED in Step 24**

_`nextPollDelayMs()` (`inprocess-evaluator.ts:146-149`) draws each delay from ±`POLLING_JITTER_RATIO` of the configured interval, and both scheduling sites use it — `:130` in `initialize` and `:166` in `poll`'s reschedule. Jittering the first delay matters as much as the reschedules: a rolling restart is what aligns the replicas in the first place, so a provider that jittered only reschedules would still spike on the first poll._

_Testing note: jitter made every `advanceTimersByTime(interval)` in the suite a coin flip. `Math.random` is now seeded to `0.5` in the two affected suites' `beforeEach` — the midpoint of the window, which yields exactly the configured interval and leaves the existing assertions meaningful — and four new tests drive the ends of the window explicitly, one of them over real draws to confirm the ±10% bound holds across the distribution and that the delays genuinely vary. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **SHOULD** apply jitter to the polling interval so that a restarted fleet does not poll in lockstep."

**Code:** `src/lib/evaluator/inprocess-evaluator.ts:98` reschedules with the exact configured interval. Searching `src/` for `jitter` and `random` returns nothing.

**Consequence:** After a fleet-wide rolling restart, every replica polls `/v1/flag/configuration` on the same phase, producing a periodic spike against the relay proxy proportional to the fleet size.

**Smallest fix:** Multiply the interval by a small random factor (e.g. `interval * (0.9 + Math.random() * 0.2)`) at `:98`.

---

</details>

---

#### ✅ m7 — `GOFF-COLL-009` · **RESOLVED in Step 17**

_A `readVersion` helper (`data-collector-hook.ts:18-27`) reads the version from the resolution metadata on the `after` stage (`:108`). It narrows rather than casting as the audit suggested: `FlagMetadata` values are `string | number | boolean`, so a cast would have put a raw number into a string-typed field at runtime, and would have stringified a boolean into `"true"`. The `error` stage receives no metadata, which "when present" allows. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`version` **MUST** be populated from flag metadata when present."

**Code:** `src/lib/model/feature-event.ts:47-51` declares the field with a doc comment, but neither `DataCollectorHook.after` (`:51-60`) nor `.error` (`:83-92`) sets it — even though `details.flagMetadata` is available on the `after` path and `FlagBase` declares `version` (`src/lib/model/flag-base.ts:47`).

**Consequence:** Exported events cannot be attributed to a flag version, so a collector cannot correlate a behaviour change with the configuration change that caused it.

**Smallest fix:** Set `version: details.flagMetadata?.['version'] as string | undefined` in the `after` stage.

---

</details>

---

#### ✅ m8 — `GOFF-COLL-010` · **RESOLVED in Step 17**

_`source` is a **required** field on `FeatureEvent` (`feature-event.ts:59`), set to `INPROCESS` by both stages (`data-collector-hook.ts:111, 145`). Required rather than optional so the compiler rejects any future event built without stating its provenance — it flagged both production sites the moment the field was added, and removing it from one stage now fails to compile rather than fails a test. `SERVER` is excluded from the union because the specification reserves it for the relay proxy's own records. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "`source` **MUST** be `INPROCESS` for a locally evaluated flag, or `PROVIDER_CACHE` for a value served from a remote-mode cache. `SERVER` is reserved for the relay proxy."

**Code:** `src/lib/model/feature-event.ts:6-52` has no `source` member and neither hook stage emits one. Searching `src/` for `INPROCESS`, `PROVIDER_CACHE` and `source:` returns nothing.

**Consequence:** The collector cannot distinguish locally evaluated events from relay-proxy-recorded ones, so in-process and remote traffic cannot be told apart in exported data.

**Smallest fix:** Add `source: 'INPROCESS'` to the `FeatureEvent` type and set it in both stages of `DataCollectorHook` — correct unconditionally here, since only the in-process evaluator reports flags as trackable (`remote-evaluator.ts:98-100`).

---

</details>

---

#### m9 — `GOFF-COLL-012` · No `provider` identifier

Covered under **M13** / **M12**.

---

#### ✅ m10 — `GOFF-AUTH-004` · **RESOLVED in Step 19b**

_A GOFF-native `headers?: Record<string, string>` option (`go-feature-flag-provider-options.ts:88`) is merged by `buildRequestHeaders` (`helper/headers.ts:22-46`) into **all three** request builders — flag configuration (`api.ts:90`), data collection (`api.ts:168`) and remote evaluation (`remote-evaluator.ts:68`). §15 is Tier Core and the requirement names no evaluation mode, so the Step 19 version — an `ofrepOptions` passthrough reaching only the remote path — met half of it._

_Step 19b also removed the delegate's type from the exported options. `GoFeatureFlagProviderOptions` is public and `@openfeature/ofrep-provider` is a peer dependency, so a consumer who had not installed it would have found an unresolved type in the published declarations. The peer dependency itself remains — `remote-evaluator.ts` still imports `OFREPProvider` at runtime; what changed is that no OFREP type appears in the public type graph._

_Two rules govern the merge. Anything the provider is already sending wins, case-insensitively — which is what protects `X-API-Key` while `apiKey` is set, and only while it is set. Separately, `Content-Type` and `If-None-Match` are dropped unconditionally (`constants.ts:33`): they are transport details, and each is absent from the provider's own map in exactly the case a caller value would do damage — `Content-Type` on the remote path because the delegate sets it, `If-None-Match` when the poller holds no etag._

_The case-insensitivity is load-bearing rather than tidy: a `Record` holds `X-API-Key` and `x-api-key` as distinct keys and `fetch` comma-joins them, so a naive spread would put `x-api-key: "caller, real"` on the wire. Original finding retained below._

<details>
<summary>Original finding</summary>

**Spec:** "The provider **SHOULD** allow arbitrary additional headers, for deployments behind gateways requiring their own authentication."

**Code:** `src/lib/go-feature-flag-provider-options.ts:4-58` offers no headers option. `src/lib/service/api.ts:63-65` and `:140-142` build a fixed header map, and `src/lib/evaluator/remote-evaluator.ts:19-22` hardcodes the array it passes to OFREP — even though `OFREPProviderBaseOptions` supports both `headers` and `headersFactory` (`libs/shared/ofrep-core/src/lib/provider/ofrep-provider-options.ts:26-30`).

**Consequence:** A relay proxy behind an API gateway that requires its own header (a Cloudflare Access token, an `X-Api-Gateway-Key`) cannot be reached at all. The capability exists one layer down and is simply not exposed.

---

</details>

**Smallest fix:** Add `headers?: Record<string, string>` (or `[string, string][]`) to the options and merge it into all three request builders.

---

#### ⚠️ m10b — `GOFF-AUTH-001` · **OPEN by decision (D6)**

**Spec:** "When `apiKey` is set, the provider **MUST** send `Authorization: Bearer {apiKey}`." (Major)

**Code:** `src/lib/helper/constants.ts:17` defines `HTTP_HEADER_API_KEY = 'X-API-Key'`, applied at `src/lib/service/api.ts:87` (flag configuration), `:165` (data collection) and `src/lib/evaluator/remote-evaluator.ts:65` (remote evaluation).

**Status:** Not a defect discovered by this audit — a maintainer decision taken in Step 19b (**D6**), recorded here so the report stays truthful rather than reinterpreting the requirement to fit the code.

**Why it works anyway:** §15's own migration note states that "[t]he relay proxy accepts **both** `X-API-Key` and `Authorization: Bearer`, resolving `X-API-Key` first." So this authenticates correctly against a conformant relay proxy. The note exists to tell providers they may migrate _to_ `Authorization: Bearer` unilaterally; this provider has chosen not to.

**What it costs:** exactly one row. `GOFF-AUTH-002` is assessed independently and **passes**, because the specification says in terms: "a provider sending the wrong header consistently fails one requirement, not two, and the distinction tells a maintainer whether the fix is one line or several." Here it is one line — `constants.ts:17`.

**To close it:** change `HTTP_HEADER_API_KEY` to `Authorization` and prefix the value with `Bearer `. The four `api.test.ts` assertions and the `remote-evaluator.test.ts` `custom headers` suite pin the current behaviour and would need updating with it.

---

### 3.4 Documentation contradicting code (§C.2)

The specification requires these to be reported in their own right, and §C.3 makes source authoritative over documentation.

| #   | Documentation claim                                                                                                                                                   | Contradicting code                                                                                                                                            | Reported as                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | `README.md:80` — `flagChangePollingIntervalMs` default `120000`                                                                                                       | `src/lib/evaluator/inprocess-evaluator.ts:79-81` applies no default; polling is disabled when the option is unset                                             | `GOFF-CFG-009` (declared option not honoured) — see **C3**, **M25** |
| D2  | ✅ **Resolved in Step 18** — `README.md:81`, `src/lib/go-feature-flag-provider-options.ts:20` and `src/lib/helper/constants.ts:22` all now read `60000`               | —                                                                                                                                                             | `GOFF-CFG-003` — see **M25**                                        |
| D3  | `README.md:83, 135` — `disableDataCollection` "Disable data collection entirely"                                                                                      | Never read in `src/`                                                                                                                                          | `GOFF-CFG-009` — see **M10**                                        |
| D4  | ✅ **Resolved in Step 27** — the claim is deleted, along with a second instance the original audit missed at `README.md:122`, "Fastest evaluation with local caching" | —                                                                                                                                                             | Minor finding, no requirement identifier                            |
| D5  | ✅ **Resolved in Steps 22 and 27** — the fallback now exists, and the README states what triggers it rather than sloganising                                          | —                                                                                                                                                             | Minor finding, no requirement identifier                            |
| D6  | ✅ **Resolved in Step 19** — the comment is deleted and `endpoint` is required in both modes                                                                          | —                                                                                                                                                             | `GOFF-CFG-005` — see **C2**                                         |
| D7  | `scripts/README.md:22` — "`TARGET_WASM_VERSION`: The explicit version to use (e.g., `'v1.45.6'`)"                                                                     | `scripts/copy-latest-wasm.js:11` uses the `0.2.x` WASM-module scheme, not the `v1.x` relay-proxy scheme; the documented example would not resolve to any file | Minor finding, no requirement identifier                            |

D4 and D5 are the more consequential pair: both advertise capabilities the package does not have, in the feature list a prospective user reads first.

### 3.4b Verdicts corrected during remediation

The original audit recorded these as satisfied; verifying them while fixing neighbouring code showed otherwise. Recorded here rather than silently amended, because a wrong `PASS` is a defect in this report as much as in the provider.

| ID                | Originally | Actually                   | Why the original verdict was wrong                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`GOFF-IP-012`** | PASS       | **FAIL**, fixed in Step 7b | The audit confirmed the `!flag` guard preceded the engine call, but not what the lookup itself returns. `this.flags` is decoded with `JSON.parse` and so inherits from `Object.prototype`, so a flag named `toString`, `constructor`, `valueOf` or `hasOwnProperty` resolved to the inherited member — truthy, so it passed the guard and reached the engine. Both halves of the requirement were broken: no `FLAG_NOT_FOUND`, and the engine _was_ invoked. |

### 3.5 Tests asserting non-conformant behaviour (§C.2)

A green suite pinning a defect raises the cost of remediation and indicates the behaviour was deliberate. **Five cases** — the original audit found three; remediation surfaced two more, recorded here as they were hit:

| Test                                                                                                           | Assertion                                                                                                                                                                                                                                                | Requirement it pins                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/go-feature-flag-provider.test.ts:50-55` — _"should validate metadata name"_                           | `expect(provider.metadata.name).toBe('GoFeatureFlagProvider')`                                                                                                                                                                                           | `GOFF-META-001`, `GOFF-META-002` (**m1**, **m2**) — ✅ **updated in Step 23**; a second test now asserts the name is _not_ the reflected class name   |
| `src/lib/hook/enrich-evaluation-context-hook.test.ts:84-110` — _"should merge metadata with existing context"_ | Seeds `gofeatureflag: { existing: 'value' }`, then asserts `result['gofeatureflag']` **equals** `metadata.asObject()` — i.e. asserts the sibling key is destroyed. The comment on line 108 states the intent: _"should override existing gofeatureflag"_ | `GOFF-CTX-006`, `GOFF-CTX-007` (**C9**, **M11**) — ✅ **replaced in Step 9** by tests asserting the caller's `flagList` and `currentDateTime` survive |
| `src/lib/service/api.test.ts` — _"should handle 304 response without flags and context"_                       | Asserted a `304` returns a normal result object with `flags: {}` and the echoed `etag` — the "empty response object" shape `GOFF-IP-007` explicitly forbids                                                                                              | `GOFF-IP-007`, `GOFF-IP-015` (**C4**) — ✅ **replaced in Step 1** by `"should return the NOT_MODIFIED sentinel on a 304 response"`                    |
| `src/lib/go-feature-flag-provider.test.ts` — _"Should error if flag configuration endpoint return a 401"_      | Asserted the rejection is an `UnauthorizedException`, i.e. a plain error carrying no `code`, which is exactly what kept the provider out of `FATAL`                                                                                                      | `GOFF-EVT-007` (**C8**) — ✅ **replaced in Step 5** by a test asserting `ProviderStatus.FATAL`                                                        |
| `src/lib/go-feature-flag-provider.test.ts` — _"Should error if flag configuration endpoint return a 403"_      | As above, for 403                                                                                                                                                                                                                                        | `GOFF-EVT-007` (**C8**) — ✅ **replaced in Step 5**                                                                                                   |

The second is the most consequential: it does not merely tolerate the `GOFF-CTX-006` defect, it asserts the destructive behaviour as the expected outcome, so any correct fix breaks the suite.

The two authentication cases are a milder form of the same pattern: they assert _that_ initialization fails, but pin the exact error type that made the failure look recoverable. Both were rewritten in Step 5 to assert the resulting provider **status**, which is the property the specification actually constrains.

---

## 4. Open questions

Ambiguities encountered during the audit. Each states the requirement it blocks, why it is ambiguous, the options, and the assumption made so the audit could continue.

1. **`GOFF-EVAL-002` — does "including scalars" apply to a canonical type that admits scalars?**
   The requirement says the object resolver "**MUST** accept exactly what its SDK's canonical structure type can represent, and **MUST** report `TYPE_MISMATCH` for anything it cannot — including scalars." In JavaScript the canonical type is `JsonValue`, which **does** include scalars (`@openfeature/core@1.9.1 dist/types.d.ts:16`: `PrimitiveValue | JsonObject | JsonArray`), so the two clauses point in opposite directions.
   _Options:_ (a) the first clause governs — scalars are representable, so they must be accepted; (b) the second clause governs — the object resolver is for structures, so scalars are always `TYPE_MISMATCH`.
   _Assumption made:_ (b), matching the requirement's explicit "including scalars" and the behaviour of both code paths (`inprocess-evaluator.ts:184-189`; `ofrep-api.ts:248`). **Verdict recorded: PASS.** Under reading (a) it would be FAIL, so this is the one verdict that flips entirely on the interpretation.

   > **RESOLVED — reading (b) confirmed against the OpenFeature specification.** The assumption is no longer load-bearing:
   >
   > - Conditional Requirement **2.2.2.1**'s own TypeScript example signature is `ResolutionDetails resolveStructureValue(string flagKey, JsonObject defaultValue, context: EvaluationContext)` — **`JsonObject`**, not `JsonValue`.
   > - `types.md` defines **Structure** as "Structured data, presented however is idiomatic in the implementation language, such as JSON or YAML" — the spec's structure type is structured data, not any JSON node.
   > - Requirement **1.3.4** makes a returned value that "does not match the expected type … abnormal execution".
   >
   > The JS SDK's `resolveObjectEvaluation<T extends JsonValue>` widens the parameter to any JSON node (`@openfeature/core dist/types.d.ts:16`); that widening is an SDK implementation choice, not the specification's structure type. Rejecting scalars is therefore correct and the **PASS is now justified rather than assumed**.

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

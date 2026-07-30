import type { EvaluationDetails, FlagValue, Hook, HookContext, Logger } from '@openfeature/web-sdk';
import { StandardResolutionReasons } from '@openfeature/web-sdk';
import type { FlagsmithClientProvider } from './flagsmith-client-provider';
import { EXPOSURE_TRACKING_EVENT } from './tracking';

/**
 * Records a Flagsmith exposure as a side effect of a flag evaluation, so one call both
 * resolves the flag and marks the identity as exposed to its variant — the OpenFeature
 * equivalent of Flagsmith's `getExperimentFlag()`:
 *
 * ```typescript
 * const details = client.getStringDetails('my_experiment_flag', 'control', { hooks: [exposureHook] });
 * ```
 *
 * Attaching the hook at a call site is the experiment declaration: evaluations without it
 * never record exposures, keeping exposure decoupled from evaluation. Exposures only fire
 * for multivariate flags resolved with reason `TARGETING_MATCH` (enabled, server-sourced,
 * identified), and are deduped per identity/flag/variant for the hook instance's lifetime.
 *
 * @experimental Tracking is an experimental OpenFeature capability (spec §6).
 */
export class FlagsmithExposureHook implements Hook {
  private readonly _seen = new Set<string>();

  constructor(
    private readonly _provider: FlagsmithClientProvider,
    private readonly _logger?: Logger,
  ) {}

  after(hookContext: Readonly<HookContext>, details: EvaluationDetails<FlagValue>) {
    const logger = this._logger ?? hookContext.logger;
    try {
      const { flagKey, variant, reason } = details;
      if (typeof variant !== 'string') {
        return;
      }
      if (reason !== StandardResolutionReasons.TARGETING_MATCH) {
        logger?.debug(`Exposure for "${flagKey}" skipped: resolution reason is ${reason}, not TARGETING_MATCH.`);
        return;
      }
      const dedupeKey = JSON.stringify([hookContext.context.targetingKey, flagKey, variant]);
      if (this._seen.has(dedupeKey)) {
        return;
      }
      this._seen.add(dedupeKey);
      this._provider.track(EXPOSURE_TRACKING_EVENT, hookContext.context, { flagKey, variant });
    } catch (error) {
      logger?.warn(`Failed to record the exposure for "${details.flagKey}": ${error}`);
    }
  }
}

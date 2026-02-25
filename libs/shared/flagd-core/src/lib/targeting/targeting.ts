import { LogicEngine } from 'json-logic-engine';
import { endsWith, startsWith, endsWithRule, startsWithRule } from './string-comp';
import { semVer, semVerRule } from './sem-ver';
import { fractional, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, loggerSymbol, timestampPropertyKey } from './common';
import type { EvaluationContextWithLogger } from './common';
import type { EvaluationContext, Logger, JsonValue } from '@openfeature/core';
import type { FlagdCoreOptions } from '../options';

export class Targeting {
  /**
   * Compiled logic function (used when useInterpreter is false)
   */
  private readonly _compiledLogic?: { <T extends JsonValue>(ctx: EvaluationContextWithLogger): T };

  /**
   * Logic engine and raw logic (used when useInterpreter is true)
   */
  private readonly _engine?: LogicEngine;
  private readonly _logic?: unknown;

  private readonly _useInterpreter: boolean;

  constructor(
    logic: unknown,
    private logger: Logger,
    options: FlagdCoreOptions = {},
  ) {
    this._useInterpreter = options.disableDynamicCodeGeneration ?? false;

    const engine = new LogicEngine();
    engine.addMethod(startsWithRule, startsWith);
    engine.addMethod(endsWithRule, endsWith);
    engine.addMethod(semVerRule, semVer);
    engine.addMethod(fractionalRule, fractional);

    if (this._useInterpreter) {
      // Interpreter mode: store engine and logic for .run() calls
      // This is compatible with Cloudflare Workers (no new Function())
      this._engine = engine;
      this._logic = logic;
    } else {
      // Compilation mode: compile logic into a native function
      // This is faster but uses new Function() which is blocked in Workers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._compiledLogic = engine.build(logic) as any;
    }
  }

  evaluate<T extends JsonValue>(flagKey: string, ctx: EvaluationContext, logger: Logger = this.logger): T {
    if (Object.hasOwn(ctx, flagdPropertyKey)) {
      logger.debug(`overwriting ${flagdPropertyKey} property in the context`);
    }

    const evaluationContext = {
      ...ctx,
      [flagdPropertyKey]: {
        [flagKeyPropertyKey]: flagKey,
        [timestampPropertyKey]: Math.floor(Date.now() / 1000),
      },
      /**
       * Inject the current logger into the context. This is used in custom methods.
       * The symbol is used to prevent collisions with other properties and is omitted
       * when context is serialized.
       */
      [loggerSymbol]: logger,
    };

    if (this._useInterpreter) {
      // Use interpreter mode (.run())
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this._engine!.run(this._logic, evaluationContext) as T;
    } else {
      // Use compiled mode
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this._compiledLogic!(evaluationContext);
    }
  }
}

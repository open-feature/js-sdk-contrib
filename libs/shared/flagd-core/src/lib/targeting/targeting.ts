import { LogicEngine } from 'json-logic-engine';
import { endsWith, startsWith, endsWithRule, startsWithRule } from './string-comp';
import { semVer, semVerRule } from './sem-ver';
import { fractional, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, loggerSymbol, timestampPropertyKey } from './common';
import type { EvaluationContextWithLogger } from './common';
import type { EvaluationContext, Logger, JsonValue } from '@openfeature/core';
import type { FlagdCoreOptions } from '../options';

export class Targeting {
  // Compiled logic function (used when useInterpreter is false)
  private readonly _compiledLogic?: { <T extends JsonValue>(ctx: EvaluationContextWithLogger): T };

  // Logic engine and raw logic (used when useInterpreter is true)
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
      // Interpreter mode: store engine and logic for .run() calls.
      // Compatible with edge function runtimes that restrict dynamic code evaluation.
      //
      // Eagerly validate that all methods referenced in the logic tree are registered.
      // This ensures invalid rules (e.g. unknown methods) are detected at flag-load
      // time — consistent with compiled mode — so that the caller gets PARSE_ERROR
      // rather than a deferred GENERAL error at evaluation time.
      Targeting.validateMethods(logic, engine);
      this._engine = engine;
      this._logic = logic;
    } else {
      // Compilation mode: compile logic into a native function.
      // Faster, but uses new Function() which is blocked in some edge runtimes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._compiledLogic = engine.build(logic) as any;
    }
  }

  /**
   * Recursively walks the json-logic tree and throws if any referenced method
   * is not registered on the engine. This mirrors the validation that
   * engine.build() performs at compile time, ensuring consistent PARSE_ERROR
   * behavior in interpreter mode.
   */
  private static validateMethods(logic: unknown, engine: LogicEngine): void {
    if (logic === null || typeof logic !== 'object') {
      return;
    }

    if (Array.isArray(logic)) {
      for (const item of logic) {
        Targeting.validateMethods(item, engine);
      }
      return;
    }

    const keys = Object.keys(logic);
    if (keys.length === 0) {
      return;
    }
    const method = keys[0];
    if (!(method in engine.methods) && !engine.isData(logic as Record<string, unknown>, method)) {
      throw new Error(`Method '${method}' was not found in the Logic Engine.`);
    }

    const args = (logic as Record<string, unknown>)[method];
    if (Array.isArray(args)) {
      for (const arg of args) {
        Targeting.validateMethods(arg, engine);
      }
    } else {
      Targeting.validateMethods(args, engine);
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

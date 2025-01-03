import { LogicEngine } from 'json-logic-engine';
import { endsWith, startsWith, endsWithRule, startsWithRule } from './string-comp';
import { semVer, semVerRule } from './sem-ver';
import { fractional, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, loggerSymbol, timestampPropertyKey } from './common';
import type { EvaluationContextWithLogger } from './common';
import type { EvaluationContext, Logger, JsonValue } from '@openfeature/core';

export class Targeting {
  private readonly _logicEngine: { <T extends JsonValue>(ctx: EvaluationContextWithLogger): T };

  constructor(
    logic: unknown,
    private logger: Logger,
  ) {
    const engine = new LogicEngine();
    engine.addMethod(startsWithRule, startsWith);
    engine.addMethod(endsWithRule, endsWith);
    engine.addMethod(semVerRule, semVer);
    engine.addMethod(fractionalRule, fractional);

    // JSON logic engine returns a generic Function interface, so we cast it to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._logicEngine = engine.build(logic) as any;
  }

  evaluate<T extends JsonValue>(flagKey: string, ctx: EvaluationContext, logger: Logger = this.logger): T {
    if (Object.hasOwn(ctx, flagdPropertyKey)) {
      this.logger.debug(`overwriting ${flagdPropertyKey} property in the context`);
    }

    return this._logicEngine({
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
    });
  }
}

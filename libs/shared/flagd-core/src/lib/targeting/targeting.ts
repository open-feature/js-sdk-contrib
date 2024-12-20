import { LogicEngine } from 'json-logic-engine';
import { stringCompareFactory, endsWithRule, startsWithRule } from './string-comp';
import { semVerFactory, semVerRule } from './sem-ver';
import { fractionalFactory, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, timestampPropertyKey } from './common';
import type { EvaluationContext, Logger, JsonValue } from '@openfeature/core';

export class Targeting {
  private readonly _logicEngine: { (ctx: EvaluationContext): JsonValue };

  constructor(
    logic: unknown,
    private logger: Logger,
  ) {
    const engine = new LogicEngine();
    const { endsWithHandler, startsWithHandler } = stringCompareFactory(logger);
    engine.addMethod(startsWithRule, startsWithHandler);
    engine.addMethod(endsWithRule, endsWithHandler);
    engine.addMethod(semVerRule, semVerFactory(logger));
    engine.addMethod(fractionalRule, fractionalFactory(logger), { useContext: true });

    // JSON logic engine returns a generic Function interface, so we cast it to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._logicEngine = engine.build(logic) as any;
  }

  evaluate(flagKey: string, ctx: EvaluationContext): JsonValue {
    if (Object.hasOwn(ctx, flagdPropertyKey)) {
      this.logger.warn(`overwriting ${flagdPropertyKey} property in the context`);
    }

    return this._logicEngine({
      ...ctx,
      [flagdPropertyKey]: {
        [flagKeyPropertyKey]: flagKey,
        [timestampPropertyKey]: Math.floor(Date.now() / 1000),
      },
    });
  }
}

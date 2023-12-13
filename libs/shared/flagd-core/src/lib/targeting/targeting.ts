import { LogicEngine } from 'json-logic-engine';
import { stringCompareOperators, endsWithRule, startsWithRule } from './string-comp';
import { semVerOperator, semVerRule } from './sem-ver';
import { fractionalOperator, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, timestampPropertyKey } from './common';
import { type Logger } from '@openfeature/core';
export class Targeting {
  private readonly _logicEngine: LogicEngine;

  constructor(private logger: Logger) {
    const engine = new LogicEngine();
    const { endsWithHandler, startsWithHandler } = stringCompareOperators(logger);
    engine.addMethod(startsWithRule, startsWithHandler);
    engine.addMethod(endsWithRule, endsWithHandler);
    engine.addMethod(semVerRule, semVerOperator(logger));
    engine.addMethod(fractionalRule, fractionalOperator(logger));

    this._logicEngine = engine;
  }

  applyTargeting(flagKey: string, logic: unknown, data: object): unknown {
    if (Object.hasOwn(data, flagdPropertyKey)) {
      this.logger.warn(`overwriting ${flagdPropertyKey} property in the context`);
    }

    const ctxData = {
      ...data,
      [flagdPropertyKey]: {
        [flagKeyPropertyKey]: flagKey,
        [timestampPropertyKey]: Math.floor(Date.now() / 1000),
      },
    };

    return this._logicEngine.run(logic, ctxData);
  }
}

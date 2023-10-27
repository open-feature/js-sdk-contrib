import {LogicEngine,} from "json-logic-engine";
import {endsWithHandler, endsWithRule, startsWithHandler, startsWithRule} from "./string-comp";
import {semVer, semVerRule} from "./sem-ver";
import {fractional, fractionalRule} from "./fractional";
import {flagdPropertyKey, flagKeyPropertyKey, timestampPropertyKey} from "./common";

export class Targeting {
  private readonly _logicEngine: LogicEngine;

  constructor() {
    const engine = new LogicEngine();
    engine.addMethod(startsWithRule, startsWithHandler);
    engine.addMethod(endsWithRule, endsWithHandler);
    engine.addMethod(semVerRule, semVer);
    engine.addMethod(fractionalRule, fractional);

    this._logicEngine = engine;
  }

  applyTargeting(flagKey: string, logic: any, data: Record<any, any>): any {
    const ctxData = {
      [flagdPropertyKey]: {
        [flagKeyPropertyKey]: flagKey,
        [timestampPropertyKey]: Date.now(),
      },
      ...data
    }

    return this._logicEngine.run(logic, ctxData);
  }
}

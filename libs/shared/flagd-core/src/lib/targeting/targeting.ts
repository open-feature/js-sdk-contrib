import {LogicEngine,} from "json-logic-engine";
import {endsWithHandler, endsWithRule, startsWithHandler, startsWithRule} from "./string-comp";
import {semVer, semVerRule} from "./sem-ver";
import {fractional, fractionalRule} from "./fractional";

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

  applyTargeting(logic: any, data?: any): any {
    return this._logicEngine.run(logic, data)
  }
}

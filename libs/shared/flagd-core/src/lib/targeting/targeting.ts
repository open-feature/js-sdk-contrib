import {LogicEngine,} from "json-logic-engine";

export class Targeting {
  private readonly _logicEngine: LogicEngine;

  constructor() {
    const engine = new LogicEngine();
    engine.addMethod('starts_with', startsWith);
    engine.addMethod('ends_with', endsWith);

    this._logicEngine = engine;
  }

  apply(logic: any, data?: any): any {
    return this._logicEngine.run(logic, data)
  }
}


function startsWith(data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  const params = Array.from(data);

  if (params.length != 2) {
    return false
  }

  return params[0].startsWith(<string>params[1])
}

function endsWith(data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  const params = Array.from(data);

  if (params.length != 2) {
    return false
  }

  return params[0].endsWith(<string>params[1])
}

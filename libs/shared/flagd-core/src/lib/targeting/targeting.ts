import { endsWithHandler, endsWithRule, startsWithHandler, startsWithRule } from './string-comp';
import { semVer, semVerRule } from './sem-ver';
import { fractional, fractionalRule } from './fractional';
import { flagdPropertyKey, flagKeyPropertyKey, timestampPropertyKey } from './common';
import * as jsonLogic from 'json-logic-js';

jsonLogic.add_operation(startsWithRule, startsWithHandler);
jsonLogic.add_operation(endsWithRule, endsWithHandler);
jsonLogic.add_operation(semVerRule, semVer);
jsonLogic.add_operation(fractionalRule, fractional);

export class Targeting {
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  applyTargeting(flagKey: string, logic: { [key: string]: any }, data: object): unknown {
    if (Object.hasOwn(data, flagdPropertyKey)) {
      console.warn(`overwriting ${flagdPropertyKey} property in the context`);
    }

    const ctxData = {
      ...data,
      [flagdPropertyKey]: {
        [flagKeyPropertyKey]: flagKey,
        [timestampPropertyKey]: Math.floor(Date.now() / 1000),
      },
    };

    // we need access to the context/$flagd object in the "fractional" rule, so set it at arg zero if it's not there
    if (logic[fractionalRule] && !logic[fractionalRule]?.[0]?.[flagdPropertyKey]) {
      logic[fractionalRule] = [ctxData, ...logic[fractionalRule]];
    }

    return jsonLogic.apply(logic, ctxData);
  }
}

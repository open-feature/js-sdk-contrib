import {EvaluationContext, EvaluationContextValue} from '@openfeature/js-sdk';
import {LDContext, LDContextCommon, LDLogger, LDSingleKindContext,} from 'launchdarkly-js-client-sdk';

const LDContextBuiltIns = {
  name: 'string',
  anonymous: 'boolean',
};

/**
 * Convert attributes, potentially recursively, into appropriate types.
 * @param logger Logger to use if issues are encountered.
 * @param key The key for the attribute.
 * @param value The value of the attribute.
 * @param object Object to place the value in.
 * @param visited Carry visited keys of the object
 */
function convertAttributes(
  logger: LDLogger,
  key: string,
  value: any,
  object: any,
  visited: any[],
): any {
  if (visited.includes(value)) {
    // Prevent cycles by not visiting the same object
    // with in the same branch. Different branches
    // may contain the same object.
    logger.error('Detected a cycle within the evaluation context. The '
      + 'affected part of the context will not be included in evaluation.');
    return;
  }
  // This method is recursively populating objects, so we are intentionally
  // re-assigning to a parameter to prevent generating many intermediate objects.
  if (value instanceof Date) {
    // eslint-disable-next-line no-param-reassign
    object[key] = value.toISOString();
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    // eslint-disable-next-line no-param-reassign
    object[key] = {};
    Object.entries(value).forEach(([objectKey, objectValue]) => {
      convertAttributes(logger, objectKey, objectValue, object[key], [...visited, value]);
    });
  } else {
    // eslint-disable-next-line no-param-reassign
    object[key] = value;
  }
}

/**
 * Translate the common part of a context. This could either be the attributes
 * of a single context, or it could be the attributes of a nested context
 * in a multi-context.
 * @param logger Logger to use if issues are encountered.
 * @param inCommon The source context information. Could be an EvaluationContext, or a value
 * within an Evaluation context.
 * @param inTargetingKey The targetingKey, either it or the key may be used.
 * @returns A populated common context.
 */
function translateContextCommon(
  logger: LDLogger,
  inCommon: Record<string, EvaluationContextValue>,
  inTargetingKey: string | undefined,
): LDContextCommon {
  const keyAttr = inCommon['key'] as string;
  const finalKey = inTargetingKey ?? keyAttr;

  if (keyAttr != null && inTargetingKey != null) {
    logger.warn("The EvaluationContext contained both a 'targetingKey' and a 'key' attribute. The"
      + " 'key' attribute will be discarded.");
  }

  if (finalKey == null) {
    logger.error("The EvaluationContext must contain either a 'targetingKey' or a 'key' and the "
      + 'type must be a string.');
  }

  const convertedContext: LDContextCommon = { key: finalKey };
  Object.entries(inCommon).forEach(([key, value]) => {
    if (key === 'targetingKey' || key === 'key') {
      return;
    }
    if (key === 'privateAttributes') {
      // eslint-disable-next-line no-underscore-dangle
      convertedContext._meta = {
        privateAttributes: value as string[],
      };
    } else if (key in LDContextBuiltIns) {
      // @ts-ignore previous if ensures key is an index of LDContextBuiltIns
      if (typeof value === LDContextBuiltIns[key]) {
        convertedContext[key] = value;
      } else {
        // If the type does not match, then discard.
        // @ts-ignore previous if ensures key is an index of LDContextBuiltIns
        logger.error(`The attribute '${key}' must be of type ${LDContextBuiltIns[key]}`);
      }
    } else {
      convertAttributes(logger, key, value, convertedContext, [inCommon]);
    }
  });

  return convertedContext;
}

/**
 * Convert an OpenFeature evaluation context into an LDContext.
 * @param logger Logger.
 * @param evalContext The OpenFeature evaluation context to translate.
 * @returns An LDContext based on the evaluation context.
 *
 * @internal
 */
export default function translateContext(
  logger: LDLogger,
  evalContext: EvaluationContext,
): LDContext {
  let finalKind = 'user';

  // A multi-context.
  if (evalContext['kind'] === 'multi') {
    return Object.entries(evalContext)
      .reduce((acc: any, [key, value]: [string, EvaluationContextValue]) => {
        if (key === 'kind') {
          acc.kind = value;
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          const valueRecord = value as Record<string, EvaluationContextValue>;
          acc[key] = translateContextCommon(
            logger,
            valueRecord,
            valueRecord['targetingKey'] as string,
          );
        } else {
          logger.error('Top level attributes in a multi-kind context should be Structure types.');
        }
        return acc;
      }, {});
  } if (evalContext['kind'] !== undefined && typeof evalContext['kind'] === 'string') {
    // Single context with specified kind.
    finalKind = evalContext['kind'];
  } else if (evalContext['kind'] !== undefined && typeof evalContext['kind'] !== 'string') {
    logger.warn("Specified 'kind' of context was not a string.");
  }

  return {
    kind: finalKind,
    ...translateContextCommon(logger, evalContext, evalContext.targetingKey),
  } as LDSingleKindContext;
}

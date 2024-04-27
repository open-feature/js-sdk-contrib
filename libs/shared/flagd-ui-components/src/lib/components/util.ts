import { Arg, Op } from '../constants';

export const getKey = (obj: Op | undefined): string => {
  return Object.keys(obj || {})[0];
};

export const getArgs = <T>(obj: Op | undefined): T => {
  return obj?.[Object.keys(obj)[0]] as T;
};

export const getFirstArg = <T>(obj: Op | undefined): T => {
  return getArgs<Array<T>>(obj)?.[0];
};

export const isPrimitive = (obj: Arg): boolean => {
  return typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'string';
};

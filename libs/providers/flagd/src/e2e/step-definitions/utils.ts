import { CacheOption, ResolverType } from "../../lib/configuration";

export function mapValueToType(value: string, type: string): any {
  switch (type) {
    case 'String':
      if (value == 'null') {
        return undefined;
      }
      return value;
    case 'Integer':
      return Number.parseInt(value);
    case 'Float':
      return Number.parseFloat(value);
    case 'Long':
      return Number.parseFloat(value);
    case 'Boolean':
      return value.toLowerCase() === 'true';
    case 'ResolverType':
      return value.toLowerCase() as ResolverType;
    case 'CacheType':
      return value as CacheOption;
    case 'Object':
      if (value == 'null') {
        return undefined;
      }
      return JSON.parse(value);
    default:
      throw new Error('type not supported');
  }
}

export function waitFor<T>(check: () => T, options: { timeout?: number; interval?: number } = {}): Promise<T> {
  const { timeout = 5000, interval = 50 } = options; // Default 5s timeout, 50ms polling interval

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkCondition = () => {
      try {
        const result = check();
        resolve(result); // If condition passes, resolve the promise
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout while waiting for condition'));
        } else {
          setTimeout(checkCondition, interval); // Retry after interval
        }
      }
    };

    checkCondition();
  });
}

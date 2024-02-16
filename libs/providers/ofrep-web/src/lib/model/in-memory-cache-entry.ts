import { FlagValue, ResolutionDetails } from '@openfeature/web-sdk';

export interface InMemoryCacheEntry<U extends FlagValue> extends ResolutionDetails<U> {
  ETag: string;
}

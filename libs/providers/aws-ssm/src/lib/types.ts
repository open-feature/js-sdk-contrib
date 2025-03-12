import { SSMClientConfig } from '@aws-sdk/client-ssm';
import { LRUCache } from 'lru-cache';

export type AwsSsmProviderConfig = {
  ssmClientConfig: SSMClientConfig;
  cacheOpts: LRUCacheOpts;
};

export type LRUCacheOpts = {
  enabled: boolean;
  ttl: number;
  size: number;
};

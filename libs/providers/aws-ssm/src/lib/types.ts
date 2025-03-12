import { SSMClientConfig } from '@aws-sdk/client-ssm';
import { LRUCache } from 'lru-cache';

export type AwsSsmProviderConfig = {
  ssmClientConfig: SSMClientConfig;
  cacheOpts: LRUCacheConfig;
};

export type LRUCacheConfig = {
  enabled: boolean;
  ttl: number;
  size: number;
};

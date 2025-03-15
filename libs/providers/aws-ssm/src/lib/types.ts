import { SSMClientConfig } from '@aws-sdk/client-ssm';

export type AwsSsmProviderConfig = {
  ssmClientConfig: SSMClientConfig;
  cacheOpts: LRUCacheConfig;
};

export type LRUCacheConfig = {
  enabled: boolean;
  ttl: number;
  size: number;
};

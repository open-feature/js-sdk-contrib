import { SSMClientConfig } from '@aws-sdk/client-ssm';

export type AwsSsmProviderConfig = {
  ssmClientConfig: SSMClientConfig;
  cacheOpts: LRUCacheConfig;
  enableDecryption?: boolean;
};

export type LRUCacheConfig = {
  enabled: boolean;
  ttl?: number;
  size?: number;
};

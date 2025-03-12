import { SSMClientConfig } from '@aws-sdk/client-ssm';

export type AwsSsmProviderConfig = {
  ssmClientConfig: SSMClientConfig;
};

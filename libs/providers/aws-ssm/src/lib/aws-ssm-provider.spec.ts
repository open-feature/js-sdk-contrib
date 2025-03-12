import { SSMClient, SSMClientConfig } from '@aws-sdk/client-ssm';
import { AwsSsmProvider } from './aws-ssm-provider';

const MOCK_SSM_CLIENT_CONFIG: SSMClientConfig = {
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'accessKeyId',
    secretAccessKey: 'secretAccessKey',
  },
};

describe(AwsSsmProvider.name, () => {
  it('should pass', () => {
    expect(true);
  });
});

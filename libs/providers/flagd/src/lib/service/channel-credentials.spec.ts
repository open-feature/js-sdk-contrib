import type { ChannelCredentials } from '@grpc/grpc-js';
import { ServiceClient } from '../../proto/ts/flagd/evaluation/v2/evaluation';
import { FlagSyncServiceClient } from '../../proto/ts/flagd/sync/v1/sync';
import type { FlagdGrpcConfig } from '../configuration';
import { GRPCService } from './grpc/grpc-service';
import { GrpcFetch } from './in-process/grpc/grpc-fetch';

jest.mock('../../proto/ts/flagd/evaluation/v2/evaluation', () => ({
  ...jest.requireActual('../../proto/ts/flagd/evaluation/v2/evaluation'),
  ServiceClient: jest.fn(),
}));
jest.mock('../../proto/ts/flagd/sync/v1/sync', () => ({
  ...jest.requireActual('../../proto/ts/flagd/sync/v1/sync'),
  FlagSyncServiceClient: jest.fn(),
}));

describe('channelCredentials', () => {
  const channelCredentials = {} as ChannelCredentials;
  const config: FlagdGrpcConfig = {
    host: 'localhost',
    port: 8013,
    tls: true,
    certPath: '/does/not/exist.pem',
    channelCredentials,
    deadlineMs: 500,
    streamDeadlineMs: 600000,
  };

  it.each([
    ['rpc', () => new GRPCService(config), ServiceClient],
    ['in-process', () => new GrpcFetch(config, jest.fn()), FlagSyncServiceClient],
  ])('is passed to the %s gRPC client in place of tls and certPath', (_resolver, build, client) => {
    build();

    expect(client).toHaveBeenCalledWith(expect.any(String), channelCredentials, expect.anything());
  });
});

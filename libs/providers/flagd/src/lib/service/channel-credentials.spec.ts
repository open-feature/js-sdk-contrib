import { credentials } from '@grpc/grpc-js';
import type { FlagdGrpcConfig } from '../configuration';
import { GRPCService } from './grpc/grpc-service';
import { GrpcFetch } from './in-process/grpc/grpc-fetch';

describe('channelCredentials', () => {
  const config: FlagdGrpcConfig = {
    host: 'localhost',
    port: 8013,
    tls: true,
    channelCredentials: credentials.createInsecure(),
    deadlineMs: 500,
    streamDeadlineMs: 600000,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['rpc', () => new GRPCService(config)],
    ['in-process', () => new GrpcFetch(config, jest.fn())],
  ])('%s resolver uses them instead of building credentials from tls and certPath', (_resolver, build) => {
    const createSsl = jest.spyOn(credentials, 'createSsl');
    const createInsecure = jest.spyOn(credentials, 'createInsecure');

    build();

    expect(createSsl).not.toHaveBeenCalled();
    expect(createInsecure).not.toHaveBeenCalled();
  });
});

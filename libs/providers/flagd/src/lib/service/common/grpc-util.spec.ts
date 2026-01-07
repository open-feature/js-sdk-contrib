import { buildClientOptions } from './grpc-util';
import type { Config } from '../../configuration';

describe('buildClientOptions', () => {
  const baseConfig: Config = {
    host: 'localhost',
    port: 8013,
    tls: false,
    deadlineMs: 500,
    socketPath: '',
  };

  it('should return undefined when no relevant options are set', () => {
    expect(buildClientOptions(baseConfig)).toBeUndefined();
  });

  it.each([
    {
      configKey: 'defaultAuthority',
      value: 'test-authority',
      grpcKey: 'grpc.default_authority',
      expected: 'test-authority',
    },
    { configKey: 'keepAliveTime', value: 10000, grpcKey: 'grpc.keepalive_time_ms', expected: 10000 },
  ])('should include $configKey when set to valid value', ({ configKey, value, grpcKey, expected }) => {
    const config = { ...baseConfig, [configKey]: value };
    expect(buildClientOptions(config)).toEqual({ [grpcKey]: expected });
  });

  it.each([
    { configKey: 'keepAliveTime', value: 0, description: 'zero' },
    { configKey: 'keepAliveTime', value: -1, description: 'negative' },
  ])('should exclude $configKey when $description', ({ configKey, value }) => {
    const config = { ...baseConfig, [configKey]: value };
    expect(buildClientOptions(config)).toBeUndefined();
  });

  it('should combine multiple options', () => {
    const config: Config = { ...baseConfig, defaultAuthority: 'my-authority', keepAliveTime: 5000 };
    expect(buildClientOptions(config)).toEqual({
      'grpc.default_authority': 'my-authority',
      'grpc.keepalive_time_ms': 5000,
    });
  });
});

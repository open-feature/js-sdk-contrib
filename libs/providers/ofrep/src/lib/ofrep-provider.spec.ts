import { OfrepProvider } from './ofrep-provider';

// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';

describe('OfrepProvider', () => {
  let provider: OfrepProvider;

  beforeAll(() => {
    server.listen();
    provider = new OfrepProvider('https://localhost:8080');
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('should be and instance of OfrepProvider', () => {
    expect(new OfrepProvider('https://localhost:8080')).toBeInstanceOf(OfrepProvider);
  });

  it('should run successful evaluation of basic boolean flag', async () => {
    const flag = await provider.resolveBooleanEvaluation('my-flag', false, {});
    expect(flag.value).toEqual(true);
  });

  it('should run successful evaluation of targeted boolean flag', async () => {
    const flag = await provider.resolveBooleanEvaluation('my-flag', false, {
      targetingKey: 'user1',
      customValue: 'custom',
    });
    expect(flag).toEqual({ flagMetadata: {}, reason: 'TARGETING_MATCH', value: true, variant: 'default' });
  });
});

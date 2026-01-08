import type { DataFetch } from './data-fetch';
import { InProcessService } from './in-process-service';

describe('In-process-service', () => {
  const dataFetcher: DataFetch = {
    connect: jest.fn((dataFillCallback: (flags: string) => void) => {
      dataFillCallback(
        '{"flags":{"booleanFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"intFlag":{"state":"ENABLED","variants":{"first":1,"second":2},"defaultVariant":"first","metadata":{"scope":"overridden"}}},"metadata":{"flagSetId": "dev"}}',
      );
    }),
    disconnect: jest.fn(),
  } as unknown as DataFetch;

  it('should sync and allow to resolve flags', async () => {
    // given
    const service = new InProcessService(
      { deadlineMs: 500, host: '', port: 0, tls: false, streamDeadlineMs: 600000 },
      jest.fn(),
      dataFetcher,
    );

    // when
    await service.connect(jest.fn, jest.fn, jest.fn);

    // then
    const resolveBoolean = await service.resolveBoolean('booleanFlag', false, {}, console);

    expect(resolveBoolean.value).toBeTruthy();
    expect(resolveBoolean.variant).toBe('on');
    expect(resolveBoolean.reason).toBe('STATIC');
    expect(resolveBoolean.flagMetadata).toMatchObject({ flagSetId: 'dev' });
  });

  describe('flag metadata', () => {
    it('should include scope as flag metadata', async () => {
      // given
      const selector = 'devFlags';
      const service = new InProcessService(
        { deadlineMs: 500, host: '', port: 0, tls: false, selector, streamDeadlineMs: 600000 },
        jest.fn(),
        dataFetcher,
      );

      // when
      await service.connect(jest.fn, jest.fn, jest.fn);

      // then
      const resolveBoolean = await service.resolveBoolean('booleanFlag', false, {}, console);
      expect(resolveBoolean.flagMetadata).toMatchObject({ scope: selector, flagSetId: 'dev' });
    });

    it('should not override existing scope in flag metadata', async () => {
      // given
      const selector = 'devFlags';
      const service = new InProcessService(
        { deadlineMs: 500, host: '', port: 0, tls: false, selector, streamDeadlineMs: 600000 },
        jest.fn(),
        dataFetcher,
      );

      // when
      await service.connect(jest.fn, jest.fn, jest.fn);

      // then
      const resolveBoolean = await service.resolveNumber('intFlag', 0, {}, console);
      expect(resolveBoolean.flagMetadata).toMatchObject({ scope: 'overridden', flagSetId: 'dev' });
    });
  });
});

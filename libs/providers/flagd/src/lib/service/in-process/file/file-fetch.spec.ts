import type { Logger } from '@openfeature/server-sdk';
// the ambient `jest` global (see jest.esm-setup.ts) lacks unstable_mockModule in its @types/jest typings; import the real, fully-typed jest here instead.
import { jest } from '@jest/globals';
// type-only import: erased at compile time, so the real module still loads only via the dynamic import below, after the fs mock is registered.
import type { FileFetch as FileFetchClass } from './file-fetch';
import { FlagdCore } from '@openfeature/flagd-core';

// FileFetch uses named imports from 'fs' (watchFile/unwatchFile); under ESM those can only be mocked via jest.unstable_mockModule + a dynamic import (jest.mock/jest.spyOn do not work for ESM named bindings).
const readFileMock = jest.fn<() => Promise<string>>();
const watchFileMock = jest.fn<(path: string, listener: () => unknown) => void>();
const unwatchFileMock = jest.fn();

jest.unstable_mockModule('fs', () => {
  const mod = {
    promises: { readFile: readFileMock },
    watchFile: watchFileMock,
    unwatchFile: unwatchFileMock,
  };
  return { __esModule: true, ...mod, default: mod };
});

let FileFetch: typeof FileFetchClass;

const reconnectCallbackMock = jest.fn<() => void>();
const changedCallbackMock = jest.fn<(flagKeys: string[]) => void>();
const dataFillCallbackMock = jest.fn<(flags: string) => string[]>();
const loggerMock: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

beforeAll(async () => {
  ({ FileFetch } = await import('./file-fetch'));
});

describe('FileFetch', () => {
  let flagdCore: FlagdCore;
  let fileFetch: InstanceType<typeof FileFetch>;
  let dataFillCallback: (flags: string) => string[];

  beforeEach(() => {
    flagdCore = new FlagdCore();
    fileFetch = new FileFetch('./flags.json', loggerMock);
    dataFillCallback = (flags: string) => {
      return flagdCore.setConfigurations(flags);
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should connect to the file and setup the watcher', async () => {
    const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
    readFileMock.mockResolvedValue(flags);

    await fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock);

    expect(dataFillCallbackMock).toHaveBeenCalledWith(flags);
    expect(watchFileMock).toHaveBeenCalledWith('./flags.json', expect.any(Function));
  });

  it('should throw because of invalid json', async () => {
    const flags = 'this is not JSON';
    readFileMock.mockResolvedValue(flags);

    await expect(fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow();
    expect(watchFileMock).not.toHaveBeenCalled();
  });

  it('should throw an error if the file is not found', async () => {
    readFileMock.mockRejectedValue({ code: 'ENOENT' });

    await expect(fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow(
      'File not found: ./flags.json',
    );
  });

  it('should throw an error if the file is not accessible', async () => {
    readFileMock.mockRejectedValue({ code: 'EACCES' });

    await expect(fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow(
      'File not accessible: ./flags.json',
    );
  });

  it('should close the watcher on disconnect', async () => {
    readFileMock.mockResolvedValue(
      '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}',
    );

    await fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock);
    await fileFetch.disconnect();

    expect(watchFileMock).toHaveBeenCalled();
    expect(unwatchFileMock).toHaveBeenCalledWith('./flags.json');
  });

  describe('on file change', () => {
    it('should call changedCallback with the changed flags', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      const changedFlags =
        '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"}}}';
      readFileMock.mockResolvedValueOnce(flags);

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      readFileMock.mockResolvedValueOnce(changedFlags);
      // Manually call the callback that is passed to watchFile;
      await watchFileMock.mock.calls[0][1]();

      expect(changedCallbackMock).toHaveBeenCalledWith(['flag']);
    });

    it('should call skip changedCallback because no flag has changed', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      readFileMock.mockResolvedValue(flags);

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      // Manually call the callback that is passed to watchFile;
      await watchFileMock.mock.calls[0][1]();

      expect(changedCallbackMock).not.toHaveBeenCalled();
    });

    it('should log an error if the file could not be read', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      readFileMock.mockResolvedValue(flags);

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      readFileMock.mockRejectedValueOnce(new Error('Error reading file'));
      // Manually call the callback that is passed to watchFile;
      await watchFileMock.mock.calls[0][1]();

      expect(changedCallbackMock).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});

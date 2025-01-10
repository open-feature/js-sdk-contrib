import fs from 'fs';
import { FileFetch } from './file-fetch';
import { FlagdCore } from '@openfeature/flagd-core';
import { Logger } from '@openfeature/server-sdk';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
  },
}));

const dataFillCallbackMock = jest.fn();
const reconnectCallbackMock = jest.fn();
const changedCallbackMock = jest.fn();
const loggerMock: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('FileFetch', () => {
  let flagdCore: FlagdCore;
  let fileFetch: FileFetch;
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
    mockReadFile(flags);
    const watchMock = jest.fn();

    fs.watchFile = watchMock as jest.MockedFunction<typeof fs.watchFile>;

    await fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock);

    expect(dataFillCallbackMock).toHaveBeenCalledWith(flags);
    expect(watchMock).toHaveBeenCalledWith('./flags.json', expect.any(Function));
  });

  it('should throw because of invalid json', async () => {
    const flags = 'this is not JSON';
    mockReadFile(flags);
    const watchSpy = jest.spyOn(fs, 'watchFile');

    await expect(fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow();
    expect(watchSpy).not.toHaveBeenCalled();
  });

  it('should throw an error if the file is not found', async () => {
    const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
    mockReadFile.mockRejectedValue({ code: 'ENOENT' });

    await expect(fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow(
      'File not found: ./flags.json',
    );
  });

  it('should throw an error if the file is not accessible', async () => {
    const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
    mockReadFile.mockRejectedValue({ code: 'EACCES' });

    await expect(fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock)).rejects.toThrow(
      'File not accessible: ./flags.json',
    );
  });

  it('should close the watcher on disconnect', async () => {
    const watchSpy = jest.spyOn(fs, 'watchFile');
    const unwatchSpy = jest.spyOn(fs, 'unwatchFile');

    await fileFetch.connect(dataFillCallbackMock, reconnectCallbackMock, changedCallbackMock);
    await fileFetch.disconnect();

    expect(watchSpy).toHaveBeenCalled();
    expect(unwatchSpy).toHaveBeenCalledWith('./flags.json');
  });

  describe('on file change', () => {
    it('should call changedCallback with the changed flags', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      const changedFlags =
        '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"}}}';
      const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
      mockReadFile.mockResolvedValueOnce(flags);
      const watchMock = jest.fn();
      fs.watchFile = watchMock as jest.MockedFunction<typeof fs.watchFile>;

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      mockReadFile.mockResolvedValueOnce(changedFlags);
      // Manually call the callback that is passed to fs.watchFile;
      await watchMock.mock.calls[0][1]();

      expect(changedCallbackMock).toHaveBeenCalledWith(['flag']);
    });

    it('should call skip changedCallback because no flag has changed', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
      mockReadFile.mockResolvedValue(flags);
      const watchMock = jest.fn();
      fs.watchFile = watchMock as jest.MockedFunction<typeof fs.watchFile>;

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      // Manually call the callback that is passed to fs.watchFile;
      await watchMock.mock.calls[0][1]();

      expect(changedCallbackMock).not.toHaveBeenCalled();
    });

    it('should log an error if the file could not be read', async () => {
      const flags = '{"flags":{"flag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"}}}';
      const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
      mockReadFile.mockResolvedValue(flags);
      const watchMock = jest.fn();
      fs.watchFile = watchMock as jest.MockedFunction<typeof fs.watchFile>;

      await fileFetch.connect(dataFillCallback, reconnectCallbackMock, changedCallbackMock);
      mockReadFile.mockRejectedValueOnce(new Error('Error reading file'));
      // Manually call the callback that is passed to fs.watchFile;
      await watchMock.mock.calls[0][1]();

      expect(changedCallbackMock).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});

// Helper function to mock fs.promise.readFile
function mockReadFile(flags: string): void {
  const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
  mockReadFile.mockResolvedValue(flags);
}

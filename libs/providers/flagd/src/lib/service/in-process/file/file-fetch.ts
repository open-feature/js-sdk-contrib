import { Logger, OpenFeatureError } from '@openfeature/core';
import { DataFetch } from '../data-fetch';
import { promises as fsPromises, watch, type FSWatcher } from 'fs';
import { GeneralError } from '@openfeature/core';

const encoding = 'utf8';

export class FileFetch implements DataFetch {
  private _filename: string;
  private _watcher: FSWatcher | null = null;
  private _logger: Logger | undefined;

  constructor(filename: string, logger?: Logger) {
    this._filename = filename;
    this._logger = logger;
  }

  async connect(
    dataFillCallback: (flags: string) => string[],
    _: () => void,
    changedCallback: (flagsChanged: string[]) => void,
  ): Promise<void> {
    this._logger?.debug('Starting file sync connection');
    try {
      const output = await fsPromises.readFile(this._filename, encoding);
      // Don't emit the change event for the initial read
      dataFillCallback(output);

      this._watcher = watch(this._filename, { encoding }, async () => {
        try {
          const data = await fsPromises.readFile(this._filename, encoding);
          const changes = dataFillCallback(data);
          if (changes.length > 0) {
            changedCallback(changes);
          }
        } catch (err) {
          this._logger?.error(`Error reading file: ${err}`);
        }
      });
    } catch (err) {
      if (err instanceof OpenFeatureError) {
        throw err;
      } else {
        switch ((err as { code?: string })?.code) {
          case 'ENOENT':
            throw new GeneralError(`File not found: ${this._filename}`);
          case 'EACCES':
            throw new GeneralError(`File not accessible: ${this._filename}`);
          default:
            this._logger?.debug(`Error reading file: ${err}`);
            throw new GeneralError();
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this._watcher?.close();
  }
}

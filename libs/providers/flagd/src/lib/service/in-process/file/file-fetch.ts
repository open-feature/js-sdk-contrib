import { Logger } from '@openfeature/core';
import { Config } from '../../../configuration';
import { DataFetch } from '../data-fetch';
import * as fs from 'fs';

export class FileFetch implements DataFetch {
  private _filename: string;
  private _watcher: fs.FSWatcher | null = null;
  private _logger: Logger | undefined;

  constructor(filename: string, logger?: Logger) {
    this._filename = filename;
  }

  connect(
    dataFillCallback: (flags: string) => string[],
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.readFile(this._filename, 'utf8', (err, data) => {
        if (err) {
          console.error(`Error reading file: ${err}`);
          disconnectCallback();
          reject(err);
        } else {
          console.log('file loaded, calling dataFillCallback');
          dataFillCallback(data);
          // TODO see if this should be moved to the watcher
          resolve();
        }
      });

      console.log('setting up watcher');
      this._watcher = fs.watch(this._filename, (eventType, filename) => {
        console.log('watcher event', eventType, filename);
        if (eventType === 'change') {
          fs.readFile(this._filename, 'utf8', (err, data) => {
            if (err) {
              console.error(`Error reading file: ${err}`);
              disconnectCallback();
              // reject(err);
            } else {
              console.log('file changed, calling dataFillCallback');
              const changes = dataFillCallback(data);
              if (changes.length > 0) {
                changedCallback(changes);
              }
            }
          });
        }
      });

      this._watcher.on('error', (err) => {
        console.error(`Error watching file: ${err}`);
        disconnectCallback();
        // reject(err);
      });

      console.log('calling dataFillCallback');
      // resolve();
    });
  }

  async disconnect(): Promise<void> {
    this._watcher?.close();
  }
}

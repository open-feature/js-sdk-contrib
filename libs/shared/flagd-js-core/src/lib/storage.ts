import {FlagdFlag} from "./model/flagd-flag";
import {parse} from "./model/parser";

export interface Storage {
  setConfigurations(cfg: string): void;

  getFlag(key: string): FlagdFlag | undefined
}

export class StorageImpl implements Storage {

  private _flags: Map<string, FlagdFlag>

  constructor() {
    this._flags = new Map<string, FlagdFlag>();
  }

  getFlag(key: string): FlagdFlag | undefined {
    return this._flags.get(key);
  }

  setConfigurations(cfg: string): void {
    this._flags =  parse(cfg)
  }
}

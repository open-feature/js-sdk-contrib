import {FeatureFlag} from "./model/feature-flag";
import {parse} from "./model/parser";

export interface Storage {
  setConfigurations(cfg: string): void;

  getFlag(key: string): FeatureFlag | undefined
}

export class StorageImpl implements Storage {

  private _flags: Map<string, FeatureFlag>

  constructor() {
    this._flags = new Map<string, FeatureFlag>();
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._flags.get(key);
  }

  setConfigurations(cfg: string): void {
    this._flags =  parse(cfg)
  }
}

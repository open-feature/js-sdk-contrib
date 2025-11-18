import {Hook} from "@openfeature/web-sdk";

export class SyncMetadataHook implements Hook<any> {
  contextSupplier: () => { [key: string]: any } | null;

  constructor(getContext: () => { [key: string]: any } | null) {
    this.contextSupplier = getContext;
  }

  public before(): any {
    return this.contextSupplier();
  }
}

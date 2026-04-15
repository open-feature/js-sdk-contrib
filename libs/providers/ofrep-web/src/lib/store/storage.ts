import { Logger } from "@openfeature/core";
import { FlagCache } from "../model/in-memory-cache";
import MurmurHash3 from 'imurmurhash';

export class Storage {
    /**
     * Bump this version when the storage format changes.
     */
    private readonly version = 'v1';

    private _disabled: boolean;
    private _logger?: Logger;
    private _prefix: string;
    constructor(
        disableLocalCache: boolean = false, 
        cachePrefix: string = 'ofrep-web-provider', 
        logger?: Logger
    ) {
        this._logger = logger;
        this._disabled = disableLocalCache ?? false;
        this._prefix = cachePrefix;
    }

    get disabled(): boolean {
        return this._disabled;
    }

    /**
     * Stores the flag cache in the local storage.
     * @param key the hashed targeting key to store the flag cache under
     * @param value the flag cache to store
     */
    store(key: string, value: FlagCache): void {
        if (this._disabled) {
            return;
        }
        try {
            localStorage.setItem(`${this._prefix}:${this.getStorageKey(key)}`, JSON.stringify(value));
        } catch (error) {
            this._logger?.error(`Error storing flag cache in local storage: ${error}`);
        }
    }

    /**
     *
     * @param key the hashed targeting key to retrieve the flag cache from
     * @returns
     */
    retrieve(key: string): FlagCache | undefined {
        if (this._disabled) {
            return undefined;
        }
        try {
            const storageKey = this.getStorageKey(key);
            const value = localStorage.getItem(`${this._prefix}:${storageKey}`);
            if (!value) {
                return undefined;
            }
            return JSON.parse(value) as FlagCache;
        } catch (error) {
            this._logger?.error(`Error retrieving flag cache from local storage: ${error}`);
            return undefined;
        }
    }

    getStorageKey(targetingKey: string): string {
        return `${this._prefix}:${this.version}:${MurmurHash3(targetingKey).result().toString()}`;
    }

    clear(targetingKey: string): void {
        if (this._disabled) {
            return;
        }
        try {
            localStorage.removeItem(`${this._prefix}:${this.getStorageKey(targetingKey)}`);
        } catch (error) {
            this._logger?.error(`Error clearing flag cache from local storage: ${error}`);
        }
    }
}
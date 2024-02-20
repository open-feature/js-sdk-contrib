import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  ProviderStatus,
  ProviderMetadata,
  GeneralError,
} from '@openfeature/web-sdk';
import { IContext, IConfig, UnleashClient, LocalStorageProvider, IStorageProvider } from 'unleash-proxy-client';
import isEmpty from 'lodash.isempty';
export class UnleashClientProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'unleash-client-provider',
  };

  private readonly unleashOptions: IConfig;
  private _client?: UnleashClient;
  private readonly storageProvider: IStorageProvider;

  /*
   * implement status field/accessor
   * https://openfeature.dev/specification/sections/providers#requirement-242
   * */
  private _status: ProviderStatus = ProviderStatus.NOT_READY;

  set status(status: ProviderStatus) {
    this._status = status;
  }

  get status() {
    return this._status;
  }

  private get client(): UnleashClient {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  constructor(
    private readonly envKey: string,
    { storageProvider, ...unleashOptions }: IConfig,
  ) {
    if (storageProvider) {
      this.storageProvider = storageProvider;
    } else {
      this.storageProvider = new LocalStorageProvider();
    }
    this.unleashOptions = { ...unleashOptions, storageProvider: this.storageProvider };
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const _context = isEmpty(context) ? { anonymous: true } : this.translateContext(context);
    this._client = new UnleashClient(this.unleashOptions);

    try {
      this.client.on('ready', async () => {
        await this.client.start();
        this.status = ProviderStatus.READY;
      });
    } catch {
      this.status = ProviderStatus.ERROR;
    }
  }

  readonly runsOn = 'client';

  hooks = [];

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    throw new Error('Method not implemented.');
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    throw new Error('Method not implemented.');
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    throw new Error('Method not implemented.');
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    throw new Error('Method not implemented.');
  }

  onClose(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client.stop();
      } catch (e) {
        reject(new GeneralError());
      }
      resolve();
    });
  }
}

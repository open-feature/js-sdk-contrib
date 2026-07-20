import type { TokenCredential } from '@azure/identity';
import type { SettingSelector } from '@azure/app-configuration-provider';

/**
 * Options shared by every way of configuring the provider.
 */
export interface AzureAppConfigurationCommonOptions {
  /**
   * Feature flag selectors used to filter which feature flags are loaded from the store.
   * Defaults to a single selector matching all feature flags with no label (`[{ keyFilter: '*' }]`).
   */
  selectors?: SettingSelector[];

  /**
   * Whether the provider periodically refreshes feature flags from Azure App Configuration.
   * When enabled, a `ProviderEvents.ConfigurationChanged` event is emitted whenever a refresh
   * detects a change.
   *
   * @defaultValue true
   */
  enableRefresh?: boolean;

  /**
   * The interval, in milliseconds, at which the provider polls Azure App Configuration for
   * changes when `enableRefresh` is `true`. Must be greater than 1000 (1 second).
   *
   * @defaultValue 30000
   */
  refreshIntervalInMs?: number;
}

/**
 * Configure the provider using an Azure App Configuration connection string.
 */
export interface AzureAppConfigurationConnectionStringConfig extends AzureAppConfigurationCommonOptions {
  /**
   * The connection string for the Azure App Configuration store.
   */
  connectionString: string;
}

/**
 * Configure the provider using an endpoint and a token credential (e.g. `DefaultAzureCredential`).
 */
export interface AzureAppConfigurationEndpointConfig extends AzureAppConfigurationCommonOptions {
  /**
   * The endpoint URL of the Azure App Configuration store.
   */
  endpoint: string;

  /**
   * The token credential used to authenticate to the Azure App Configuration store.
   * See {@link https://learn.microsoft.com/javascript/api/overview/azure/identity-readme}.
   */
  credential: TokenCredential;
}

export type AzureAppConfigurationProviderConfig =
  | AzureAppConfigurationConnectionStringConfig
  | AzureAppConfigurationEndpointConfig;

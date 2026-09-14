import type { PromiseOptions } from '../utils';

/**
 * This is used to shape the event send through {@link FlagChangeStrategy.onFlagChange} registered handlers.
 */
export interface FlagChangeEvent {
  /**
   * The key names of deleted flags
   */
  deleted: string[];
  /**
   * The key names of added flags
   */
  added: string[];
  /**
   * The key names of updated flags
   */
  updated: string[];
}

/**
 * The type used to register handlers through {@link FlagChangeStrategy.onFlagChange}
 */
export type FlagChangeStrategyOnFlagChangeHandler = (changes: FlagChangeEvent) => void;
/**
 * The type used to register handlers through {@link FlagChangeStrategy.onStatusChange}
 */
export type FlagChangeStrategyOnStatusChangeHandler = (status: FlagChangeStrategy['status']) => void;

/**
 * The return type used by {@link FlagChangeStrategy.onFlagChange} and {@link FlagChangeStrategy.onStatusChange}
 */
export interface FlagChangeStrategyHandlerRef {
  /**
   * used to detach the handler registered with the {@link FlagChangeStrategy}
   */
  detach(): void;
}

/**
 * This interface will be used from {@link GoFeatureFlagWebProvider} to interact with the change strategy implementation
 */
export interface FlagChangeStrategy {
  /**
   * Connect to the source
   */
  connect(): void;
  /**
   * Disconnect from the source
   */
  disconnect(): void;
  /**
   * Disconnect from the source and set the strategy in 'closed' state.
   * NOTE: after strategy is in 'closed' state, no further actions can be executed on it.
   */
  close(): void;
  /**
   * Set the API key used by the strategy to connect to the GO Feature Flag relay-proxy
   * @param {string} apiKey
   */
  setApiKey(apiKey: string): void;
  /**
   * Used to register listeners for {@link FlagChangeEvent} events
   * @param handler
   */
  onFlagChange(handler: FlagChangeStrategyOnFlagChangeHandler): FlagChangeStrategyHandlerRef;
  /**
   * Used to register listeners for status changes on the strategy
   */
  onStatusChange(handler: FlagChangeStrategyOnStatusChangeHandler): FlagChangeStrategyHandlerRef;
  /**
   * returns a Promise that resolves when the specified status will be set for the strategy
   * If empty or omitted, the next available status will be used to resolve the Promise.
   */
  waitForStatus(status: FlagChangeStrategy['status'], options?: PromiseOptions): Promise<void>;
  /**
   * returns a Promise that resolves when any of the specified statuses will be set for the strategy.
   * If empty or omitted, the next available status will be used to resolve the Promise.
   */
  waitForAnyStatus(status?: FlagChangeStrategy['status'][], options?: PromiseOptions): Promise<void>;
  /**
   * The current status of the change strategy
   */
  status: 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'closing' | 'closed' | 'error';
  /**
   * The name of the change strategy
   */
  name: string;
}

/**
 * Options that can be used to configure the behaviour of a {@link FlagChangeStrategy} instance
 */
export interface FlagChangeStrategyOptions {
  /**
   * The endpoint of the source
   */
  endpoint: string;
  /**
   * The api key to be used when connecting to the source.
   * NOTE: this can be changed later at runtime as well by using {@link FlagChangeStrategy.setApiKey}
   */
  apiKey: string;
  /**
   * The max attempts to be used when retrying the connection to the source
   * @default 10
   */
  maxAttempts: number;
  /**
   * the exponential backoff settings to be used when retrying the connection to the source
   */
  backoff: {
    /**
     * The minimum delay in milliseconds to wait before a retry
     */
    minDelayMs: number;
    /**
     * The maximum delay in milliseconds to wait before a retry
     */
    maxDelayMs: number;
    /**
     * The multiplier to be used for the exponential backoff strategy
     */
    multiplier: number;
  };
}

/**
 * The options to be used with the {@link WebSocketFlagChangeStrategy} change strategy
 */
export type WebSocketFlagChangeStrategyOptions = FlagChangeStrategyOptions;

/**
 * The options to be used with the {@link ServerSentEventFlagChangeStrategy} change strategy
 */
export type ServerSentEventFlagChangeStrategyOptions = FlagChangeStrategyOptions;

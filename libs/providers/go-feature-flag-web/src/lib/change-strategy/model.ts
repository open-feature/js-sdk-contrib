import type { PromiseOptions } from '../utils';

export interface FlagChangeEvent {
  deleted: string[];
  added: string[];
  updated: string[];
}

export type FlagChangeStrategyOnFlagChangeHandler = (changes: FlagChangeEvent) => void;
export type FlagChangeStrategyOnStatusChangeHandler = (status: FlagChangeStrategy['status']) => void;

export interface FlagChangeStrategyHandlerRef {
  detach(): void;
}

export interface FlagChangeStrategy {
  connect(): void;
  disconnect(): void;
  close(): void;
  setApiKey(apiKey: string): void;
  onFlagChange(handler: FlagChangeStrategyOnFlagChangeHandler): FlagChangeStrategyHandlerRef;
  onStatusChange(handler: FlagChangeStrategyOnStatusChangeHandler): FlagChangeStrategyHandlerRef;
  waitForStatus(status: FlagChangeStrategy['status'], options?: PromiseOptions): Promise<void>;
  waitForAnyStatus(status: FlagChangeStrategy['status'][], options?: PromiseOptions): Promise<void>;
  status: 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'closing' | 'closed' | 'error';
  name: string;
}

export interface FlagChangeStrategyOptions {
  endpoint: string;
  apiKey: string;
  connectionTimeoutMs: number;
  maxAttempts: number;
  backoff: {
    minDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
  };
}

export type WebSocketFlagChangeStrategyOptions = FlagChangeStrategyOptions;

export type ServerSentEventFlagChangeStrategyOptions = FlagChangeStrategyOptions;

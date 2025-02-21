import { StepDefinitions } from 'jest-cucumber';
import { CacheOption, ResolverType } from '../../lib/configuration';
import { Client, EvaluationDetails, FlagValue } from '@openfeature/server-sdk';
import { EvaluationContext, EventDetails } from "@openfeature/core";

interface Flag {
  name: string;
  type: string;
  defaultValue: unknown;
}

interface Event {
  type: string;
  details?: EventDetails;
}

export interface State {
  flagsChanged?: string[];
  providerType?: string;
  details?: EvaluationDetails<FlagValue>;
  client?: Client;
  resolverType: ResolverType;
  context?: EvaluationContext;
  config?: {
    cache?: CacheOption;
    socketPath?: string;
    port: number;
    maxCacheSize?: number;
    resolverType?: ResolverType;
    host: string;
    offlineFlagSourcePath?: string;
    tls: boolean;
    selector?: string;
  };
  options: Record<string, unknown>;
  events: Event[];
  flag?: Flag;
}

export type Steps = (state: State) => StepDefinitions;

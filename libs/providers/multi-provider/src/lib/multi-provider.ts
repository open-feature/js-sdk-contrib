import {
  DefaultLogger,
  EvaluationContext,
  FlagValueType,
  GeneralError,
  Hook,
  HookContext,
  HookHints,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ProviderMetadata,
  BeforeHookContext,
  ResolutionDetails,
} from '@openfeature/server-sdk';
import { HookExecutor } from './hook-executor';
import { constructAggregateError, throwAggregateErrorFromPromiseResults } from './errors';
import { BaseEvaluationStrategy, ProviderResolutionResult, FirstMatchStrategy } from './strategies';
import { StatusTracker } from './status-tracker';
import { ProviderEntryInput, RegisteredProvider } from './types';

export class MultiProvider implements Provider {
  readonly runsOn = 'server';

  public readonly events = new OpenFeatureEventEmitter();

  private hookContexts: WeakMap<EvaluationContext, HookContext> = new WeakMap<EvaluationContext, HookContext>();
  private hookHints: WeakMap<EvaluationContext, HookHints> = new WeakMap<EvaluationContext, HookHints>();

  metadata: ProviderMetadata;

  providerEntries: RegisteredProvider[] = [];
  private providerEntriesByName: Record<string, RegisteredProvider> = {};

  private hookExecutor: HookExecutor;
  private statusTracker = new StatusTracker(this.events);

  constructor(
    readonly constructorProviders: ProviderEntryInput[],
    private readonly evaluationStrategy: BaseEvaluationStrategy = new FirstMatchStrategy(),
    private readonly logger: Logger = new DefaultLogger(),
  ) {
    this.hookExecutor = new HookExecutor(this.logger);

    this.registerProviders(constructorProviders);

    const aggregateMetadata = Object.keys(this.providerEntriesByName).reduce((acc, name) => {
      return { ...acc, [name]: this.providerEntriesByName[name].provider.metadata };
    }, {});

    this.metadata = {
      ...aggregateMetadata,
      name: MultiProvider.name,
    };
  }

  private registerProviders(constructorProviders: ProviderEntryInput[]) {
    const providersByName: Record<string, Provider[]> = {};

    for (const constructorProvider of constructorProviders) {
      const providerName = constructorProvider.provider.metadata.name;
      let candidateName = constructorProvider.name ?? providerName;

      if (constructorProvider.name && providersByName[constructorProvider.name]) {
        throw new Error('Provider names must be unique');
      }

      providersByName[candidateName] ??= [];
      providersByName[candidateName].push(constructorProvider.provider);
    }

    for (const name of Object.keys(providersByName)) {
      const useIndexedNames = providersByName[name].length > 1;
      for (let i = 0; i < providersByName[name].length; i++) {
        const indexedName = useIndexedNames ? `${name}-${i + 1}` : name;
        this.providerEntriesByName[indexedName] = { provider: providersByName[name][i], name: indexedName };
        this.providerEntries.push(this.providerEntriesByName[indexedName]);
        this.statusTracker.wrapEventHandler(this.providerEntriesByName[indexedName]);
      }
    }

    // just make sure we don't accidentally modify these later
    Object.freeze(this.providerEntries);
    Object.freeze(this.providerEntriesByName);
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const result = await Promise.allSettled(
      this.providerEntries.map((provider) => provider.provider.initialize?.(context)),
    );
    throwAggregateErrorFromPromiseResults(result, this.providerEntries);
  }

  async onClose(): Promise<void> {
    const result = await Promise.allSettled(this.providerEntries.map((provider) => provider.provider.onClose?.()));
    throwAggregateErrorFromPromiseResults(result, this.providerEntries);
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.flagResolutionProxy<boolean>(flagKey, 'boolean', defaultValue, context);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.flagResolutionProxy(flagKey, 'string', defaultValue, context);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.flagResolutionProxy(flagKey, 'number', defaultValue, context);
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.flagResolutionProxy(flagKey, 'object', defaultValue, context);
  }

  private async flagResolutionProxy<T extends boolean | string | number | JsonValue>(
    flagKey: string,
    flagType: FlagValueType,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const hookContext = this.hookContexts.get(context);
    const hookHints = this.hookHints.get(context);

    if (!hookContext || !hookHints) {
      throw new GeneralError('Hook context not available for evaluation');
    }

    const tasks: Promise<boolean>[] = [];
    const resolutions: ProviderResolutionResult<T>[] = [];

    for (const providerEntry of this.providerEntries) {
      const task = this.evaluateProviderEntry(
        flagKey,
        flagType,
        defaultValue,
        providerEntry,
        hookContext,
        hookHints,
        context,
        resolutions,
      );

      if (this.evaluationStrategy.runMode === 'sequential') {
        const shouldEvaluateNext = await task;
        if (!shouldEvaluateNext) {
          break;
        }
      }

      tasks.push(task);
    }

    if (this.evaluationStrategy.runMode === 'parallel') {
      await Promise.all(tasks);
    }

    const finalResult = this.evaluationStrategy.determineFinalResult({ flagKey, flagType }, context, resolutions);

    if (finalResult.errors?.length) {
      throw constructAggregateError(finalResult.errors);
    }

    if (!finalResult.details) {
      throw new GeneralError('No result was returned from any provider');
    }

    return finalResult.details;
  }

  private async evaluateProviderEntry<T extends boolean | string | number | JsonValue>(
    flagKey: string,
    flagType: FlagValueType,
    defaultValue: T,
    providerEntry: RegisteredProvider,
    hookContext: HookContext,
    hookHints: HookHints,
    context: EvaluationContext,
    resolutions: ProviderResolutionResult<T>[],
  ) {
    let thrownError: unknown;
    let evaluationResult: ResolutionDetails<T> | undefined = undefined;
    const provider = providerEntry.provider;
    const strategyContext = {
      flagKey,
      flagType,
      provider,
      providerName: providerEntry.name,
      providerStatus: this.statusTracker.providerStatus(providerEntry.name),
    };

    if (!this.evaluationStrategy.shouldEvaluateThisProvider(strategyContext, context)) {
      return true;
    }

    try {
      evaluationResult = await this.evaluateProviderAndHooks(flagKey, defaultValue, provider, hookContext, hookHints);
      resolutions.push({
        details: evaluationResult,
        provider: provider,
        providerName: providerEntry.name,
      });
    } catch (error: unknown) {
      resolutions.push({
        thrownError: error,
        provider: provider,
        providerName: providerEntry.name,
      });
      thrownError = error;
    }

    if (this.evaluationStrategy.runMode === 'sequential') {
      return this.evaluationStrategy.shouldEvaluateNextProvider(
        strategyContext,
        context,
        evaluationResult,
        thrownError,
      );
    }
    return true;
  }

  private async evaluateProviderAndHooks<T extends boolean | string | number | JsonValue>(
    flagKey: string,
    defaultValue: T,
    provider: Provider,
    hookContext: HookContext,
    hookHints: HookHints,
  ) {
    let providerContext: EvaluationContext | undefined = undefined;
    let evaluationResult: ResolutionDetails<T>;

    try {
      providerContext = await this.hookExecutor.beforeHooks(provider.hooks, hookContext, hookHints);

      evaluationResult = (await this.callProviderResolve(
        provider,
        flagKey,
        defaultValue,
        providerContext,
      )) as ResolutionDetails<T>;

      const afterHookEvalDetails = {
        ...evaluationResult,
        flagMetadata: Object.freeze(evaluationResult.flagMetadata ?? {}),
        flagKey,
      };

      await this.hookExecutor.afterHooks(
        provider.hooks,
        { ...hookContext, context: providerContext },
        afterHookEvalDetails,
        hookHints,
      );
      return evaluationResult;
    } catch (error: unknown) {
      await this.hookExecutor.errorHooks(
        provider.hooks,
        { ...hookContext, context: providerContext ?? hookContext.context },
        error,
        hookHints,
      );
      throw error;
    } finally {
      await this.hookExecutor.finallyHooks(
        provider.hooks,
        { ...hookContext, context: providerContext ?? hookContext.context },
        hookHints,
      );
    }
  }

  private async callProviderResolve<T extends boolean | string | number | JsonValue>(
    provider: Provider,
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ) {
    switch (typeof defaultValue) {
      case 'string':
        return await provider.resolveStringEvaluation(flagKey, defaultValue, context, this.logger);
      case 'number':
        return await provider.resolveNumberEvaluation(flagKey, defaultValue, context, this.logger);
      case 'object':
        return await provider.resolveObjectEvaluation(flagKey, defaultValue, context, this.logger);
      case 'boolean':
        return await provider.resolveBooleanEvaluation(flagKey, defaultValue, context, this.logger);
      default:
        throw new GeneralError('Invalid flag evaluation type');
    }
  }

  public get hooks(): Hook[] {
    return [
      {
        before: async (hookContext: BeforeHookContext, hints: HookHints): Promise<EvaluationContext> => {
          this.hookContexts.set(hookContext.context, hookContext);
          this.hookHints.set(hookContext.context, hints ?? {});
          return hookContext.context;
        },
      },
    ];
  }
}

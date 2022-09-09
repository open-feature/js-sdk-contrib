import { EvaluationContext, FlagValue, ResolutionDetails } from '@openfeature/js-sdk';

export interface FlagdCache {  
  /**
   * Sets the evaluation details indexed by the specified key and context
   * 
   * @param key 
   * @param context 
   * @param obj 
   */
  set<T extends FlagValue>(key: string, context: EvaluationContext, obj: ResolutionDetails<T>): Promise<void>;

  /**
   * Gets the object indexed by the specified key and context
   * 
   * @param key 
   * @param context 
   */
  get<T extends FlagValue>(key: string, context: EvaluationContext): Promise<ResolutionDetails<T> | void>;

  /**
   * Deletes the evaluation details indexed by the specified key and context
   * 
   * @param key 
   * @param context 
   */
  del(key: string, context: EvaluationContext): Promise<void>;

  /**
   * Flushes all records for the specified key. If no key is specified, all records are flushed.
   * @param flagKey 
   */
  flush(flagKey?: string): Promise<void>;
}

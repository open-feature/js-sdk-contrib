export interface WasmInput {
  flagKey: string;
  evalContext: Record<string, any>;

  // private Flag flag;
  // private FlagContext flagContext;
}

export interface FlagBase {
  variations: Record<string, any>;
  bucketingKey: string | undefined;
  trackEvents: boolean | undefined;
  disable: boolean | undefined;
  version: string | undefined;
  metadata: Record<string, any> | undefined;

  // private List<Rule> targeting;
  // private Rule defaultRule;
  // private ExperimentationRollout experimentation;
}

export interface Flag extends FlagBase {}

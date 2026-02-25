/**
 * Options for configuring FlagdCore behavior.
 */
export interface FlagdCoreOptions {
  /**
   * When true, uses interpreter mode for json-logic-engine instead of
   * compilation mode. This avoids dynamic code generation (new Function())
   * and is required for V8 isolate WebWorker environments such as
   * Cloudflare Workers, Deno Deploy, and Vercel Edge Runtime.
   *
   * @default false
   */
  disableDynamicCodeGeneration?: boolean;
}

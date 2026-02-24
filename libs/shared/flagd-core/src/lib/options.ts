/**
 * Options for configuring FlagdCore behavior.
 */
export interface FlagdCoreOptions {
  /**
   * When true, uses interpreter mode for json-logic-engine instead of
   * compilation mode. This avoids dynamic code generation (new Function())
   * and is required for Cloudflare Workers, Deno Deploy, Vercel Edge Runtime,
   * and other V8 isolate environments.
   *
   * @default false
   */
  workers?: boolean;
}

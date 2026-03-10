/**
 * Options for configuring FlagdCore behavior.
 */
export interface FlagdCoreOptions {
  /**
   * When true, uses interpreter mode for json-logic-engine instead of
   * compilation mode. This avoids dynamic code generation (new Function())
   * and is required for edge function runtimes that restrict dynamic code
   * evaluation (e.g. Cloudflare Workers, Deno Deploy, Vercel Edge Runtime,
   * AWS CloudFront Functions, Next.js Middleware).
   *
   * @default false
   */
  disableDynamicCodeGeneration?: boolean;
}

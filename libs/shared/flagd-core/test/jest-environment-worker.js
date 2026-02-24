/**
 * Custom Jest environment that simulates V8 isolate restrictions
 * (Cloudflare Workers, Deno Deploy, Vercel Edge Runtime, etc.).
 *
 * Extends @edge-runtime/jest-environment to get Web-standard globals and
 * stripped Node.js-specific APIs, then additionally patches eval() and the
 * Function constructor to throw — mirroring the exact error V8 isolates
 * produce when dynamic code generation is attempted:
 *
 *   EvalError: Code generation from strings disallowed for this context
 *
 * Tests running in this environment will fail immediately if any code path
 * calls new Function() or eval(), proving the workers code path genuinely
 * avoids dynamic code generation.
 *
 * Usage — add this docblock to a test file:
 *
 *   @jest-environment ./test/jest-environment-worker.js
 */

'use strict';

const EdgeEnvironment = require('@edge-runtime/jest-environment').default;

const EVAL_ERROR_MESSAGE = 'Code generation from strings disallowed for this context';

class WorkerEnvironment extends EdgeEnvironment {
  constructor(config) {
    super(config);
  }

  async setup() {
    await super.setup();

    // Block eval() — same error message V8 isolates produce
    this.global.eval = () => {
      throw new EvalError(EVAL_ERROR_MESSAGE);
    };

    // Block new Function() — the primary failure mode for ajv runtime compilation.
    // We preserve Function.prototype so that instanceof checks still work correctly.
    const OriginalFunction = this.global.Function;
    function RestrictedFunction(...args) {
      void args;
      throw new EvalError(EVAL_ERROR_MESSAGE);
    }
    RestrictedFunction.prototype = OriginalFunction.prototype;
    this.global.Function = RestrictedFunction;
  }
}

module.exports = WorkerEnvironment;

// Enforces the edge-runtime "no dynamic code generation" restriction under the built-in Jest `node` env (custom envs break Jest's ESM, which cborg needs); blocks eval() and Function()/new Function() while leaving Function.prototype intact.
const deny = () => {
  throw new EvalError(
    'Code generation from strings disallowed for this context (simulating edge runtime restrictions)',
  );
};

// eslint-disable-next-line no-eval
globalThis.eval = deny as unknown as typeof eval;
globalThis.Function = new Proxy(globalThis.Function, {
  apply: deny,
  construct: deny,
}) as unknown as FunctionConstructor;

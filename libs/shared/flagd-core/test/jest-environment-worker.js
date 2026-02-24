'use strict';

// Jest environment that simulates Cloudflare Workers / V8 isolate restrictions.
// eval() and new Function() are blocked, just as in a real Worker environment.
// Used by the *.workers.spec.ts test suites to prove Workers compatibility.
const { default: WorkerEnvironment } = require('@edge-runtime/jest-environment');

module.exports = WorkerEnvironment;

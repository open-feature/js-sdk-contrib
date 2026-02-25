'use strict';

// Jest environment that simulates Cloudflare Workers / V8 isolate restrictions.
// eval() and new Function() are blocked, just as in a real WebWorker environment.
// Used by the *.web-worker.spec.ts test suites to prove WebWorker compatibility.
const { default: WorkerEnvironment } = require('@edge-runtime/jest-environment');

module.exports = WorkerEnvironment;

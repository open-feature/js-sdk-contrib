'use strict';

// Jest environment that simulates edge function runtime restrictions.
// eval() and new Function() are blocked, just as in V8 isolate runtimes
// that restrict dynamic code evaluation.
const { default: WorkerEnvironment } = require('@edge-runtime/jest-environment');

module.exports = WorkerEnvironment;

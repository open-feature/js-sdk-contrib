'use strict';

// Cloudflare Workers, Vercel Edge, and similar isolates reject dynamic code
// generation. The edge-runtime environment also supplies the Web APIs used by
// the Universal Optimizely SDK (fetch, Request, Response, URL, and crypto).
const { default: WorkerEnvironment } = require('@edge-runtime/jest-environment');

module.exports = WorkerEnvironment;

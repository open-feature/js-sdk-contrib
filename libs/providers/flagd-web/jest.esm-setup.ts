// expose the `jest` global (not injected in ESM) for specs, and polyfill TextEncoder/TextDecoder which jsdom lacks but cborg (via flagd-core) needs.
import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'node:util';

(globalThis as unknown as { jest: typeof jest }).jest = jest;

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder as never;
}

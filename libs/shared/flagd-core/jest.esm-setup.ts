// Jest ESM mode does not inject the `jest` global; expose it so specs use the ambient `jest` without per-file imports.
import { jest } from '@jest/globals';

(globalThis as unknown as { jest: typeof jest }).jest = jest;

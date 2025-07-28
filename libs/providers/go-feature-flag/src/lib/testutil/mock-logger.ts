import { jest } from '@jest/globals';
import type { Logger } from '@openfeature/server-sdk';

// Mock logger to capture error calls
export const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as Logger;

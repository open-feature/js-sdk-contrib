import { FlagdProvider } from './flagd-web-provider';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {
  OpenFeature,
  Client,
  ErrorCode,
  StandardResolutionReasons,
} from '@openfeature/nodejs-sdk';

describe('FlagdProvider', () => {
  const host = 'http://localhost';
  const port = 8013;
  it('should be and instance of FlagdProvider', () => {
    expect(new FlagdProvider()).toBeInstanceOf(FlagdProvider);
  });
});

//Copyright 2022 Catamorphic, Co.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//limitations under the License.

//Code taken from https://github.com/launchdarkly/openfeature-node-server/blob/main/__tests__/TestLogger.ts

import { LDLogger } from 'launchdarkly-js-client-sdk';

export default class TestLogger implements LDLogger {
  public logs: string[] = [];

  error(...args: unknown[]): void {
    this.logs.push(args.join(' '));
  }

  warn(...args: unknown[]): void {
    this.logs.push(args.join(' '));
  }

  info(...args: unknown[]): void {
    this.logs.push(args.join(' '));
  }

  debug(...args: unknown[]): void {
    this.logs.push(args.join(' '));
  }

  reset() {
    this.logs = [];
  }
}

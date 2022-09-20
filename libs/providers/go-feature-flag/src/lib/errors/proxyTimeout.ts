import { ErrorCode, OpenFeatureError } from '@openfeature/js-sdk'

// ProxyTimeout is an error send when we try to call the relay proxy and he his not responding
// in the appropriate time.
export class ProxyTimeout extends OpenFeatureError {
  code: ErrorCode

  constructor(message: string, originalError: Error) {
    super(`${message}: ${originalError}`)
    Object.setPrototypeOf(this, ProxyTimeout.prototype)
    this.code = ErrorCode.GENERAL
  }
}

import { ErrorCode, OpenFeatureError } from '@openfeature/server-sdk'

// ProxyNotReady is an error send when we try to call the relay proxy and he is not ready
// to return a valid response.
export class ProxyNotReady extends OpenFeatureError {
  code: ErrorCode

  constructor(message: string, originalError: Error) {
    super(`${message}: ${originalError}`)
    Object.setPrototypeOf(this, ProxyNotReady.prototype)
    this.code = ErrorCode.PROVIDER_NOT_READY
  }
}

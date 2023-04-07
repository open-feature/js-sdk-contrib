import { ErrorCode, OpenFeatureError } from '@openfeature/js-sdk'

// ProxyNotReady is an error send when we try to call the relay proxy and he is not ready
// to return a valid response.
export class Unauthorized extends OpenFeatureError {
  code: ErrorCode

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, Unauthorized.prototype)
    this.code = ErrorCode.GENERAL
  }
}

import { ErrorCode, OpenFeatureError } from '@openfeature/js-sdk'

// Unauthorized is an error send when the provider do an unauthorized call to the relay proxy.
export class Unauthorized extends OpenFeatureError {
  code: ErrorCode

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, Unauthorized.prototype)
    this.code = ErrorCode.GENERAL
  }
}

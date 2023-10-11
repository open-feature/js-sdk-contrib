import { ErrorCode, OpenFeatureError } from '@openfeature/server-sdk'

// UnknownError is an error send when something unexpected happened.
export class UnknownError extends OpenFeatureError {
  code: ErrorCode

  constructor(message: string, originalError: Error | unknown) {
    super(`${message}: ${originalError}`)
    Object.setPrototypeOf(this, UnknownError.prototype)
    this.code = ErrorCode.GENERAL
  }
}

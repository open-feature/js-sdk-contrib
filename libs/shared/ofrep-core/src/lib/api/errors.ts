abstract class OFREPApiError extends Error {
  constructor(
    public error: unknown | undefined,
    public response: Response | undefined,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    Object.setPrototypeOf(this, OFREPApiError.prototype);
    this.name = OFREPApiError.name;
  }
}

export class OFREPApiFetchError extends OFREPApiError {
  constructor(error: unknown, message?: string, options?: ErrorOptions) {
    super(error, undefined, message, options);
    Object.setPrototypeOf(this, OFREPApiError.prototype);
    this.name = OFREPApiError.name;
  }
}

export class OFREPApiInvalidResponseError extends OFREPApiError {
  constructor(response?: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiError.prototype);
    this.name = OFREPApiError.name;
  }
}

export class OFREPApiUnauthorizedError extends OFREPApiError {
  constructor(response: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiUnauthorizedError.prototype);
    this.name = OFREPApiUnauthorizedError.name;
  }
}

export class OFREPApiTooManyRequestsError extends OFREPApiError {
  constructor(response: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiTooManyRequestsError.prototype);
    this.name = OFREPApiTooManyRequestsError.name;
  }
}

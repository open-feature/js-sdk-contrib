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
    Object.setPrototypeOf(this, OFREPApiFetchError.prototype);
    this.name = OFREPApiFetchError.name;
  }
}

export class OFREPApiUnexpectedResponseError extends OFREPApiError {
  constructor(response?: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiUnexpectedResponseError.prototype);
    this.name = OFREPApiUnexpectedResponseError.name;
  }
}

export class OFREPApiUnauthorizedError extends OFREPApiError {
  constructor(response: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiUnauthorizedError.prototype);
    this.name = OFREPApiUnauthorizedError.name;
  }
}

export class OFREPForbiddenError extends OFREPApiError {
  constructor(response: Response, message?: string, options?: ErrorOptions) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPForbiddenError.prototype);
    this.name = OFREPForbiddenError.name;
  }
}

export class OFREPApiTooManyRequestsError extends OFREPApiError {
  public readonly requestTime: Date;

  constructor(
    public override response: Response,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(undefined, response, message, options);
    Object.setPrototypeOf(this, OFREPApiTooManyRequestsError.prototype);

    this.name = OFREPApiTooManyRequestsError.name;
    this.requestTime = new Date();
    this.message =
      message ?? this.retryAfterDate
        ? `rate limit exceeded, try again after ${this.retryAfterDate}`
        : `rate limit exceeded, try again later`;
  }

  public get retryAfterHeader(): string | null {
    return this.response.headers.get('Retry-After');
  }

  public get retryAfterSeconds(): number | null {
    if (!this.retryAfterHeader) {
      return null;
    }

    const retrySeconds = Number.parseInt(this.retryAfterHeader, 10);
    if (!Number.isFinite(retrySeconds)) {
      return null;
    }

    return retrySeconds;
  }

  public get retryAfterDate(): Date | null {
    if (!this.retryAfterHeader) {
      return null;
    }

    if (this.retryAfterSeconds) {
      const retryAfterSeconds = this.retryAfterSeconds;

      if (!retryAfterSeconds) {
        return null;
      }

      return new Date(Date.now() + this.retryAfterSeconds * 1000);
    }

    const date = new Date(this.retryAfterHeader);
    if (isNaN(date.valueOf())) {
      return null;
    }

    return date;
  }
}

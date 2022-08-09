import {
  ErrorCode,
  EvaluationContext,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/nodejs-sdk';
import axios, { AxiosResponse, AxiosError } from 'axios';
import {
  ResolveBooleanResponse,
  ResolveFloatResponse,
  ResolveStringResponse,
  ResolveObjectResponse,
} from '../../../proto/ts/schema/v1/schema';
import { Service } from '../Service';

interface HTTPServiceOptions {
  host: string;
  port: number;
  protocol: string;
}
export class HTTPService implements Service {
  private url: string;

  constructor(options: HTTPServiceOptions) {
    this.url = `${options.protocol}://${options.host}:${options.port}`;
  }

  async resolveBoolean(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    try {
      const res = await axios.post<ResolveBooleanResponse>(
        `${this.url}/flags/${encodeURIComponent(flagKey)}/resolve/boolean`,
        context
      );
      if (checkResponse(res, 'boolean')) {
        return {
          value: res.data.value,
          reason: res.data.reason,
          variant: res.data.variant,
        };
      }
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PARSE_ERROR,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: getErrorCode(err),
        value: defaultValue,
      };
    }
  }

  async resolveNumber(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    try {
      const res = await axios.post<ResolveFloatResponse>(
        /**
         * JavaScript numbers are always 64-bit floating point
         */
        `${this.url}/flags/${encodeURIComponent(flagKey)}/resolve/float`,
        context
      );
      if (checkResponse(res, 'number')) {
        return {
          value: res.data.value,
          reason: res.data.reason,
          variant: res.data.variant,
        };
      }
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PARSE_ERROR,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: getErrorCode(err),
        value: defaultValue,
      };
    }
  }

  async resolveString(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    try {
      const res = await axios.post<ResolveStringResponse>(
        `${this.url}/flags/${encodeURIComponent(flagKey)}/resolve/string`,
        context
      );
      if (checkResponse(res, 'string')) {
        return {
          value: res.data.value,
          reason: res.data.reason,
          variant: res.data.variant,
        };
      }
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PARSE_ERROR,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: getErrorCode(err),
        value: defaultValue,
      };
    }
  }

  async resolveObject<T extends object>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext
  ): Promise<ResolutionDetails<T>> {
    try {
      const res = await axios.post<ResolveObjectResponse>(
        `${this.url}/flags/${encodeURIComponent(flagKey)}/resolve/object`,
        context
      );
      if (checkResponse(res, 'object')) {
        return {
          value: res.data.value as T,
          reason: res.data.reason,
          variant: res.data.variant,
        };
      }
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PARSE_ERROR,
      };
    } catch (err: unknown) {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: getErrorCode(err),
        value: defaultValue,
      };
    }
  }
}

function getErrorCode(err: unknown): string {
  const code = (err as Partial<AxiosError>)?.response?.status;
  let res: string = StandardResolutionReasons.UNKNOWN;
  if (code != undefined) {
    if (code == 404) {
      res = ErrorCode.FLAG_NOT_FOUND;
    } else if (code == 400) {
      res = ErrorCode.TYPE_MISMATCH;
    }
  }
  return res;
}

function checkResponse(
  res:
    | AxiosResponse<ResolutionDetails<unknown>>
    | AxiosResponse<ResolveObjectResponse>,
  valueType: string
): boolean {
  if (
    res.data &&
    typeof res.data.value === valueType &&
    typeof res.data.variant === 'string' &&
    typeof res.data.reason === 'string'
  ) {
    return true;
  }
  return false;
}

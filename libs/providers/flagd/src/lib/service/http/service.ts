import { ErrorCode, EvaluationContext, ResolutionDetails, StandardResolutionReasons } from "@openfeature/nodejs-sdk";
import axios, { AxiosResponse, AxiosError } from "axios";
import { IService } from "../IService";
import {
  ResolveBooleanResponse,
  ResolveNumberResponse,
  ResolveStringResponse,
  ResolveObjectResponse
} from '../../../proto/ts/schema/v1/schema'


export default class HTTPService implements IService {
    private url: string

    constructor(host?: string, port?: number) {
        if (host == undefined) {
            host = "http://localhost"
        }
        if (port == undefined) {
            port = 8080
        }
        this.url = `${host}:${port}`
    }

    async ResolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>> {
      try {
        const res = await axios.post<ResolveBooleanResponse>(
          `${this.url}/flags/${flagKey}/resolve/boolean`,
          context
        );
        if (CheckResponse(res, 'boolean')) {
          return {
            value: res.data.value,
            reason: res.data.reason,
            variant: res.data.variant,
          };
        }
        return {
          value: defaultValue,
          reason: ErrorCode.PARSE_ERROR,
          variant: "default_value",
        }
      } catch (err: unknown) {
        return {
          reason: 'ERROR',
          errorCode: GetErrorCode(err),
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }

    async ResolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>> {
      try {
        const res = await axios.post<ResolveNumberResponse>(
          `${this.url}/flags/${flagKey}/resolve/number`,
          context
        );
        if (CheckResponse(res, 'number')) {
          return {
            value: res.data.value,
            reason: res.data.reason,
            variant: res.data.variant,
          };
        }
        return {
          value: defaultValue,
          reason: ErrorCode.PARSE_ERROR,
          variant: "default_value",
        }
      } catch (err: unknown) {
        return {
          reason: 'ERROR',
          errorCode: GetErrorCode(err),
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }

    async ResolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>> {
      try {
        const res = await axios.post<ResolveStringResponse>(
          `${this.url}/flags/${flagKey}/resolve/string`,
          context
        );
        if (CheckResponse(res, 'string')) {
          return {
            value: res.data.value,
            reason: res.data.reason,
            variant: res.data.variant,
          };
        }
        return {
          value: defaultValue,
          reason: ErrorCode.PARSE_ERROR,
          variant: "default_value",
        }
      } catch (err: unknown) {
        return {
          reason: 'ERROR',
          errorCode: GetErrorCode(err),
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }

    async ResolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
      try {
        const res = await axios.post<ResolveObjectResponse>(
          `${this.url}/flags/${flagKey}/resolve/object`,
          context
        );
        if (CheckResponse(res, 'object')) {
          return {
            value: res.data.value as T,
            reason: res.data.reason,
            variant: res.data.variant,
          };
        }
        return {
          value: defaultValue,
          reason: ErrorCode.PARSE_ERROR,
          variant: "default_value",
        }
      } catch (err: unknown) {
        return {
          reason: 'ERROR',
          errorCode: GetErrorCode(err),
          variant: 'default_value',
          value: defaultValue,
        }
      }
    }
}

function GetErrorCode(err: unknown): string {
  const code = (err as Partial<AxiosError>)?.response?.status
  let res: string = StandardResolutionReasons.UNKNOWN
  if (code != undefined) {
    if (code == 404) {
      res = ErrorCode.FLAG_NOT_FOUND
    } else if (code == 400) {
      res = ErrorCode.TYPE_MISMATCH
    }
  }
  return res
}

function CheckResponse(res: AxiosResponse<ResolutionDetails<unknown>> | AxiosResponse<ResolveObjectResponse>, valueType: string): boolean {
    if ((res.data)
    && (res.data.value && typeof res.data.value === valueType)
    && (res.data.variant && typeof res.data.variant === "string")
    && (res.data.reason && typeof res.data.reason === "string")
    ) {
        return true
    }
    return false
}


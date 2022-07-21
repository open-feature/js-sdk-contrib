import { EvaluationContext, ResolutionDetails } from "@openfeature/nodejs-sdk";
import axios, { AxiosResponse } from "axios";
import { IService } from "../IService";


export default class HTTPService implements IService {
    private url: string

    constructor(host?: string, port?: number) {
        if (host == undefined) {
            host = "localhost"
        }
        if (port == undefined) {
            port = 8080
        }
        this.url = `${host}:${port}`
    }

    async ResolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>> {
      // eslint-disable-next-line prefer-const
      let response: ResolutionDetails<boolean> = {
            value: defaultValue
        }
        await axios.post(`${this.url}/flags/${flagKey}/resolve/boolean`, {
            context
        }).then(res => {
            if (res.status != 200) {
                response.reason = "ERROR"
                response.reason = GetReason(res.status)
                return
            }
            if (CheckResponse(res, "boolean")) {
                response.reason = res.data.reason
                response.value = res.data.value
                response.variant = res.data.variant
            } else {
                response.reason = "ERROR"
                response.errorCode = "PARSE_ERROR"
            }
        }).catch(err => {
            console.error(err)
            response.reason = "ERROR"
            response.errorCode = "DEFAULT"
        })
        return response
    }

    async ResolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>> {
      // eslint-disable-next-line prefer-const
      let response: ResolutionDetails<number> = {
            value: defaultValue
        }
        await axios.post(`${this.url}/flags/${flagKey}/resolve/number`, {
            context
        }).then(res => {
            if (res.status != 200) {
                response.reason = "ERROR"
                response.reason = GetReason(res.status)
                return
            }
            if (CheckResponse(res, "number")) {
                response.reason = res.data.reason
                response.value = res.data.value
                response.variant = res.data.variant
            } else {
                response.reason = "ERROR"
                response.errorCode = "PARSE_ERROR"
            }
        }).catch(err => {
            console.error(err)
            response.reason = "ERROR"
            response.errorCode = "DEFAULT"
        })
        return response
    }

    async ResolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>> {
      // eslint-disable-next-line prefer-const
      let response: ResolutionDetails<string> = {
            value: defaultValue
        }
        await axios.post(`${this.url}/flags/${flagKey}/resolve/string`, {
            context
        }).then(res => {
            if (res.status != 200) {
                response.reason = "ERROR"
                response.reason = GetReason(res.status)
                return
            }
            if (CheckResponse(res, "string")) {
                response.reason = res.data.reason
                response.value = res.data.value
                response.variant = res.data.variant
            } else {
                response.reason = "ERROR"
                response.errorCode = "PARSE_ERROR"
            }
        }).catch(err => {
            console.error(err)
            response.reason = "ERROR"
            response.errorCode = "DEFAULT"
        })
        return response
    }

    async ResolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
      // eslint-disable-next-line prefer-const
      let response: ResolutionDetails<T> = {
            value: defaultValue
        }
        await axios.post(`${this.url}/flags/${flagKey}/resolve/boolean`, {
            context
        }).then(res => {
            if (res.status != 200) {
                response.reason = "ERROR"
                response.reason = GetReason(res.status)
                return
            }
            if (CheckResponse(res, "any")) {
                response.reason = res.data.reason
                response.value = res.data.value
                response.variant = res.data.variant
            } else {
                response.reason = "ERROR"
                response.errorCode = "PARSE_ERROR"
            }
        }).catch(err => {
            console.error(err)
            response.reason = "ERROR"
            response.errorCode = "DEFAULT"
        })
        return response //todo custom type check function for this return
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CheckResponse(res: AxiosResponse<any>, valueType: string): boolean {
    if ((res.data)
    && (res.data.value && typeof res.data.value == valueType)
    && (res.data.variant && typeof res.data.variant == "string")
    && (res.data.reason && typeof res.data.reason == "string")
    ) {
        return true
    }
    return false
}

function GetReason(statusCode: number): string {
    let res = "DEFAULT_ERROR"
    if (statusCode == 404) {
        res = "FLAG_NOT_FOUND"
    } else if (statusCode == 400) {
        res = "TYPE_MISMATCH"
    }
    return res
}

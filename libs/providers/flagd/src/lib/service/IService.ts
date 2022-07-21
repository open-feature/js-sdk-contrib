import {
    EvaluationContext,
    ResolutionDetails
} from '@openfeature/nodejs-sdk'

export interface IService {
    ResolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>>
    ResolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>>
    ResolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>>
    ResolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>>
}
import {
    EvaluationContext,
    ResolutionDetails
} from '@openfeature/nodejs-sdk'

export interface Service {
    resolveBoolean(flagKey: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>>
    resolveString(flagKey: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>>
    resolveNumber(flagKey: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>>
    resolveObject<T extends object>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>>
}

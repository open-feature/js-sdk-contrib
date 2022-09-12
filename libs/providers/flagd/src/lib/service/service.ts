import {
    EvaluationContext,
    ResolutionDetails
} from '@openfeature/nodejs-sdk'

export interface Service {
    resolveBoolean(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<boolean>>
    resolveString(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<string>>
    resolveNumber(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<number>>
    resolveObject<T extends object>(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<T>>
}

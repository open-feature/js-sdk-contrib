import {
    EvaluationContext,
    JsonValue,
    ResolutionDetails
} from '@openfeature/js-sdk'

export interface Service {
    resolveBoolean(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<boolean>>
    resolveString(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<string>>
    resolveNumber(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<number>>
    resolveObject<T extends JsonValue>(flagKey: string, context: EvaluationContext): Promise<ResolutionDetails<T>>
}

import {
    EvaluationContext,
    JsonValue,
    Logger,
    ResolutionDetails
} from '@openfeature/js-sdk'

export interface Service {
    readonly streamConnection: Promise<boolean>;
    resolveBoolean(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<boolean>>
    resolveString(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>>
    resolveNumber(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>>
    resolveObject<T extends JsonValue>(flagKey: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<T>>
}

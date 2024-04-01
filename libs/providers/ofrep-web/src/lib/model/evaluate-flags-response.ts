export enum BulkEvaluationStatus {
  SUCCESS_NO_CHANGES = 'SUCCESS_NO_CHANGES',
  SUCCESS_WITH_CHANGES = 'SUCCESS_WITH_CHANGES',
}

export interface EvaluateFlagsResponse {
  /**
   * Status of the bulk evaluation.
   */
  status: BulkEvaluationStatus;
  /**
   * The List of flags changed when doing the bulk evaluation.
   */
  flags: string[];
}

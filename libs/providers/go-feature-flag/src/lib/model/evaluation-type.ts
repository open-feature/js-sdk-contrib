/**
 * This enum represents the type of evaluation that can be performed.
 */
export enum EvaluationType {
  /**
   * InProcess: The evaluation is done in the process of the provider.
   */
  InProcess = 'InProcess',

  /**
   * Remote: The evaluation is done on the edge (e.g., CDN or API).
   */
  Remote = 'Remote',
}

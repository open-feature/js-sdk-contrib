import type { ExportEvent } from './event';

/**
 * ExporterRequest is an interface that represents the request to the GO Feature Flag data collector API.
 */
export interface ExporterRequest {
  /**
   * metadata is the metadata that will be sent in your evaluation data collector.
   */
  meta: Record<string, string | boolean | number>;

  /**
   * events is the list of events that will be sent in your evaluation data collector.
   */
  events: ExportEvent[];
}

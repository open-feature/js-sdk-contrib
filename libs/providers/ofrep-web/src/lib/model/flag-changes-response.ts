import { ErrorCode } from '@openfeature/web-sdk';

export type FlagChangesResponse = SingleFlagChangesResponse[];

export interface SingleFlagChangesResponse {
  errorCode?: ErrorCode;
  errorDetails?: string;
  key: string;
  ETag: string;
}

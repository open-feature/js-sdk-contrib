/**
 * Constants used throughout the GO Feature Flag API.
 */
export const HTTP_HEADER_CONTENT_TYPE = 'Content-Type';
export const HTTP_HEADER_AUTHORIZATION = 'Authorization';
export const HTTP_HEADER_IF_NONE_MATCH = 'If-None-Match';
export const HTTP_HEADER_ETAG = 'etag';
export const HTTP_HEADER_LAST_MODIFIED = 'last-modified';
export const APPLICATION_JSON = 'application/json';
export const BEARER_TOKEN = 'Bearer ';

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNAVAILABLE: 503,
  NOT_MODIFIED: 304,
} as const;

export const DEFAULT_FLUSH_INTERVAL_MS = 120000;
export const DEFAULT_MAX_PENDING_EVENTS = 10000;

export const DEFAULT_TARGETING_KEY = 'undefined-targetingKey';

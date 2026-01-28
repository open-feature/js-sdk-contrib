import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';
import type { OFREPProviderOptions } from './ofrep-provider';

enum ENV_VAR {
  OFREP_ENDPOINT = 'OFREP_ENDPOINT',
  OFREP_HEADERS = 'OFREP_HEADERS',
  OFREP_TIMEOUT_MS = 'OFREP_TIMEOUT_MS',
}

/**
 * Get configuration from environment variables.
 * @returns Partial configuration from environment variables
 */
function getEnvVarConfig(): Partial<OFREPProviderBaseOptions> {
  const config: Partial<OFREPProviderBaseOptions> = {};

  if (process.env[ENV_VAR.OFREP_ENDPOINT]) {
    const baseUrl = process.env[ENV_VAR.OFREP_ENDPOINT];
    try {
      new URL(baseUrl);
    } catch (error) {
      console.warn(`Invalid OFREP_ENDPOINT value: "${baseUrl}" is not a valid URL.`);
    }

    config.baseUrl = baseUrl;
  }

  if (process.env[ENV_VAR.OFREP_TIMEOUT_MS]) {
    const timeout = Number(process.env[ENV_VAR.OFREP_TIMEOUT_MS]);
    if (!isNaN(timeout)) {
      config.timeoutMs = timeout;
    } else {
      console.warn(`Invalid OFREP_TIMEOUT_MS value: "${process.env[ENV_VAR.OFREP_TIMEOUT_MS]}" is not a number.`);
    }
  }

  if (process.env[ENV_VAR.OFREP_HEADERS]) {
    config.headers = parseHeaders(process.env[ENV_VAR.OFREP_HEADERS]);
  }

  return config;
}

/**
 * Parse headers from environment variable string.
 * Expected format: "key1=value1,key2=value2"
 * Supports URL-encoded strings.
 *
 * Parsing algorithm:
 * 1. URL-decode the entire string first
 * 2. Split by comma to get header pairs
 * 3. Split each pair by the first equals sign
 * 4. Trim whitespace from keys and values
 * 5. Log warnings for invalid entries
 *
 * @param headerString - The header string to parse
 * @returns Array of header tuples
 */
function parseHeaders(headerString: string): [string, string][] {
  const headers: [string, string][] = [];

  let decodedString: string;
  try {
    decodedString = decodeURIComponent(headerString);
  } catch (error) {
    console.warn(`Failed to decode OFREP_HEADERS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    decodedString = headerString;
  }

  const pairs = decodedString.split(',');

  for (const pair of pairs) {
    const equalsIndex = pair.indexOf('=');

    if (equalsIndex === -1) {
      console.warn(`Skipping malformed header entry (missing equals sign): "${pair}"`);
      continue;
    }

    const key = pair.substring(0, equalsIndex);
    const value = pair.substring(equalsIndex + 1);

    const trimmedKey = key.trim();
    const trimmedValue = value.trim();

    if (!trimmedKey) {
      console.warn(`Skipping malformed header entry (missing key): "${pair}"`);
      continue;
    }

    headers.push([trimmedKey, trimmedValue]);
  }

  return headers;
}

/**
 * Merge headers with environment headers as base and programmatic headers taking precedence.
 * All header keys are normalized to lowercase to ensure proper overriding.
 *
 * @param envHeaders - Headers from environment variables (base)
 * @param programmaticHeaders - Headers provided programmatically (override)
 * @returns Merged array of header tuples with programmatic headers taking precedence
 */
function mergeHeaders(
  envHeaders: [string, string][] | undefined,
  programmaticHeaders: [string, string][] | undefined,
): [string, string][] | undefined {
  if (!envHeaders && !programmaticHeaders) {
    return undefined;
  }

  const headerMap = new Map<string, string>();

  // Add environment headers first (as base)
  if (envHeaders) {
    for (const [key, value] of envHeaders) {
      headerMap.set(key.toLowerCase(), value);
    }
  }

  // Overwrite with programmatic headers
  if (programmaticHeaders) {
    for (const [key, value] of programmaticHeaders) {
      headerMap.set(key.toLowerCase(), value);
    }
  }

  // Convert map back to array of tuples
  return Array.from(headerMap.entries());
}

/**
 * Merge configurations with precedence: options > environment variables > defaults
 * @param options - User provided options
 * @returns Merged configuration
 */
export function getConfig(options: OFREPProviderOptions = {}): OFREPProviderBaseOptions {
  const envVarConfig = getEnvVarConfig();
  const providedOptions = options ?? {};

  return {
    ...envVarConfig,
    ...providedOptions,
    baseUrl: providedOptions.baseUrl ?? envVarConfig.baseUrl ?? '',
    headers: mergeHeaders(envVarConfig.headers, providedOptions.headers),
  };
}

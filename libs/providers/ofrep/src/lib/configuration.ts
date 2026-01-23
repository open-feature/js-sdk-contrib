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
    config.baseUrl = process.env[ENV_VAR.OFREP_ENDPOINT];
  }

  if (process.env[ENV_VAR.OFREP_TIMEOUT_MS]) {
    const timeout = Number(process.env[ENV_VAR.OFREP_TIMEOUT_MS]);
    if (!isNaN(timeout)) {
      config.timeoutMs = timeout;
    }
  }

  // Store raw headers string to be processed later
  if (process.env[ENV_VAR.OFREP_HEADERS]) {
    config.headers = parseHeaders(process.env[ENV_VAR.OFREP_HEADERS]);
  }

  return config;
}

/**
 * Parse headers from environment variable string.
 * Expected format: "key1=value1,key2=value2"
 * @param headerString - The header string to parse
 * @returns Array of header tuples
 */
function parseHeaders(headerString: string): [string, string][] {
  const headers: [string, string][] = [];
  const pairs = headerString.split(',');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim(); // rejoin in case value contains '='
      headers.push([key.trim(), value]);
    }
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

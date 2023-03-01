// Support camel case ("camelCase" -> "camel Case" and "CAMELCase" -> "CAMEL Case").
const DEFAULT_SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g];

// Remove all non-word characters.
const DEFAULT_STRIP_REGEXP = /[^A-Z0-9]+/gi;

/**
 * Replace `re` in the input string with the replacement value.
 */
function replace(input: string, re: RegExp | RegExp[], value: string) {
  if (re instanceof RegExp) return input.replace(re, value);
  return re.reduce((input, re) => input.replace(re, value), input);
}

export function constantCase(input: string) {
  const result = replace(replace(input, DEFAULT_SPLIT_REGEXP, '$1\0$2'), DEFAULT_STRIP_REGEXP, '\0');

  let start = 0;
  let end = result.length;

  // Trim the delimiter from around the output string.
  while (result.charAt(start) === '\0') start++;
  while (result.charAt(end - 1) === '\0') end--;

  return result
    .slice(start, end)
    .split('\0')
    .map((i) => i.toUpperCase())
    .join('_');
}

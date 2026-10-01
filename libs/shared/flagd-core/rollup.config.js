const path = require('path');

// deps we bundle
const bundled = [
  'cborg', // ESM only - bundle to avoid breaking CJS
];

module.exports = (config) => {
  config.external = (id) => {
    if (bundled.some((name) => id === name || id.startsWith(`${name}/`))) return false; // bundle listed deps
    if (id.startsWith('.') || path.isAbsolute(id)) return false; // bundle local sources
    return true; // externalize everything else (deps, node builtins)
  };
  return config;
};

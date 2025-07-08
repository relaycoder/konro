import { KonroStorageError } from './error.util';

let yaml: { load: (str: string) => unknown; dump: (obj: any, options?: any) => string; } | undefined;
try {
  // Lazily attempt to load optional dependency
  yaml = require('js-yaml');
} catch {
  // js-yaml is not installed.
}

export type Serializer = {
  parse: <T>(data: string) => T;
  stringify: (obj: any) => string;
};

export const getSerializer = (format: 'json' | 'yaml'): Serializer => {
  if (format === 'json') {
    return {
      parse: <T>(data: string): T => JSON.parse(data),
      stringify: (obj: any): string => JSON.stringify(obj, null, 2),
    };
  }

  if (!yaml) {
    throw KonroStorageError("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
  }

  return {
    // The cast from `unknown` is necessary as `yaml.load` is correctly typed to return `unknown`.
    parse: <T>(data: string): T => yaml.load(data) as T,
    stringify: (obj: any): string => yaml.dump(obj),
  };
};
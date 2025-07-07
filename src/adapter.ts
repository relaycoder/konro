import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';

let yaml: { parse: (str: string) => any; stringify: (obj: any) => string; } | undefined;
try {
  yaml = require('js-yaml');
} catch {
  // js-yaml is an optional peer dependency
}

export interface StorageAdapter {
  read(schema: KonroSchema<any, any>): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
}

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
  single: { filepath: string };
  // multi: { dir: string }; // Not implemented for brevity
};

class FileAdapter implements StorageAdapter {
  constructor(private options: FileAdapterOptions) {
    if (options.format === 'yaml' && !yaml) {
      throw new Error("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
    }
  }

  async read(schema: KonroSchema<any, any>): Promise<DatabaseState> {
    const filepath = this.options.single.filepath;
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      return this.options.format === 'json' ? JSON.parse(data) : yaml!.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return createEmptyState(schema);
      }
      throw error;
    }
  }

  async write(state: DatabaseState): Promise<void> {
    const filepath = this.options.single.filepath;
    const tempFilepath = `${filepath}.${Date.now()}.tmp`;

    await fs.mkdir(path.dirname(filepath), { recursive: true });

    const content = this.options.format === 'json'
      ? JSON.stringify(state, null, 2)
      : yaml!.stringify(state);

    await fs.writeFile(tempFilepath, content, 'utf-8');
    await fs.rename(tempFilepath, filepath);
  }
}

export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  return new FileAdapter(options);
};

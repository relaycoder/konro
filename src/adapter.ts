import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';

let yaml: { parse: (str: string) => any; stringify: (obj: any, options?: any) => string; } | undefined;
try {
  yaml = require('js-yaml');
} catch {
  // js-yaml is an optional peer dependency
}

export interface StorageAdapter {
  read(schema: KonroSchema<any, any>): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; };
type MultiFileStrategy = { multi: { dir: string }; single?: never; };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
} & (SingleFileStrategy | MultiFileStrategy);

const getSerializer = (format: 'json' | 'yaml') => {
  if (format === 'json') {
    return {
      parse: (data: string) => JSON.parse(data),
      stringify: (obj: any) => JSON.stringify(obj, null, 2),
    };
  }
  if (!yaml) {
    throw new Error("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
  }
  return {
    parse: (data: string) => yaml.parse(data),
    stringify: (obj: any) => yaml.stringify(obj),
  };
};

const readFile = async (filepath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filepath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const writeAtomic = async (filepath: string, content: string): Promise<void> => {
    const tempFilepath = `${filepath}.${Date.now()}.tmp`;
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(tempFilepath, content, 'utf-8');
    await fs.rename(tempFilepath, filepath);
};


export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;

  const readSingle = async (schema: KonroSchema<any, any>): Promise<DatabaseState> => {
    const filepath = options.single!.filepath;
    const data = await readFile(filepath);
    return data ? serializer.parse(data) : createEmptyState(schema);
  };

  const writeSingle = async (state: DatabaseState): Promise<void> => {
    const filepath = options.single!.filepath;
    await writeAtomic(filepath, serializer.stringify(state));
  };
  
  const readMulti = async (schema: KonroSchema<any, any>): Promise<DatabaseState> => {
    const dir = options.multi!.dir;
    const state = createEmptyState(schema);
    await fs.mkdir(dir, { recursive: true });

    for (const tableName in schema.tables) {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const data = await readFile(filepath);
      if (data) {
        state[tableName] = serializer.parse(data);
      }
    }
    return state;
  };
  
  const writeMulti = async (state: DatabaseState): Promise<void> => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    
    // As per spec, write all to temp files first
    const tempWrites = Object.entries(state).map(async ([tableName, tableState]) => {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const tempFilepath = `${filepath}.${Date.now()}.tmp`;
      const content = serializer.stringify(tableState);
      await fs.writeFile(tempFilepath, content, 'utf-8');
      return { tempFilepath, filepath };
    });

    const writtenFiles = await Promise.all(tempWrites);

    // Then rename all
    const renames = writtenFiles.map(({ tempFilepath, filepath }) =>
      fs.rename(tempFilepath, filepath)
    );

    await Promise.all(renames);
  };

  if (options.single) {
    return { read: readSingle, write: writeSingle };
  } else {
    return { read: readMulti, write: writeMulti };
  }
};
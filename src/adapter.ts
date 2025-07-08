import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';
import { getSerializer } from './utils/serializer.util';
import { FsProvider, defaultFsProvider, writeAtomic } from './fs';
import { KonroStorageError } from './utils/error.util';

export interface StorageAdapter {
  read<S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>>;
  write(state: DatabaseState<any>): Promise<void>;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; };
type MultiFileStrategy = { multi: { dir: string }; single?: never; };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
  fs?: FsProvider;
} & (SingleFileStrategy | MultiFileStrategy);

export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;
  const fs = options.fs ?? defaultFsProvider;

  const readSingle = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const filepath = options.single!.filepath;
    const data = await fs.readFile(filepath);
    if (!data) return createEmptyState(schema);
    try {
      return serializer.parse<DatabaseState<S>>(data);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
    }
  };

  const writeSingle = async (state: DatabaseState<any>): Promise<void> => {
    const filepath = options.single!.filepath;
    await writeAtomic(filepath, serializer.stringify(state), fs);
  };
  
  const readMulti = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.multi!.dir;
    const state = createEmptyState(schema);
    await fs.mkdir(dir, { recursive: true });

    for (const tableName in schema.tables) {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const data = await fs.readFile(filepath);
      if (data) {
        try {
          // This is a controlled cast, safe because we are iterating over the schema's tables.
          (state as any)[tableName] = serializer.parse(data);
        } catch (e: any) {
          throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
        }
      }
    }
    return state;
  };
  
  const writeMulti = async (state: DatabaseState<any>): Promise<void> => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true }); // Ensure directory exists

    const writes = Object.entries(state).map(([tableName, tableState]) => {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const content = serializer.stringify(tableState);
      return writeAtomic(filepath, content, fs);
    });
    await Promise.all(writes);
  };

  if (options.single) {
    return { read: readSingle, write: writeSingle };
  } else {
    return { read: readMulti, write: writeMulti };
  }
};
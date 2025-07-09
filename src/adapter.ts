import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';
import { Serializer, getSerializer } from './utils/serializer.util';
import { FsProvider, defaultFsProvider, writeAtomic } from './fs';
import { KonroError, KonroStorageError } from './utils/error.util';

export interface StorageAdapter {
  read<S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>>;
  write(state: DatabaseState<any>): Promise<void>;
  readonly mode: 'in-memory' | 'on-demand';
}

export interface FileStorageAdapter extends StorageAdapter {
  readonly options: FileAdapterOptions;
  readonly fs: FsProvider;
  readonly serializer: Serializer;
  readonly fileExtension: string;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never };
type MultiFileStrategy = { multi: { dir: string }; single?: never };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
  fs?: FsProvider;
  /**
   * Defines the data access strategy.
   * - `in-memory`: (Default) Loads the entire database into memory on read. Fast for small/medium datasets.
   * - `on-demand`: Reads from the file system for each query. Slower but supports larger datasets. Requires the 'multi-file' strategy.
   */
  mode?: 'in-memory' | 'on-demand';
} & (SingleFileStrategy | MultiFileStrategy);

export function createFileAdapter(options: FileAdapterOptions & { mode: 'on-demand' }): FileStorageAdapter & { mode: 'on-demand' };
export function createFileAdapter(options: FileAdapterOptions & { mode?: 'in-memory' | undefined }): FileStorageAdapter & { mode: 'in-memory' };
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter;
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;
  const fs = options.fs ?? defaultFsProvider;
  const mode = options.mode ?? 'in-memory';

  // The 'on-demand' mode is fundamentally incompatible with a single-file approach
  if (mode === 'on-demand' && options.single) {
    throw KonroError("The 'on-demand' mode requires the 'multi-file' storage strategy.");
  }

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

  const adapterInternals = {
    options,
    fs,
    serializer,
    fileExtension,
    mode,
  };

  if (options.single) {
    return { ...adapterInternals, read: readSingle, write: writeSingle } as FileStorageAdapter;
  } else {
    return { ...adapterInternals, read: readMulti, write: writeMulti } as FileStorageAdapter;
  }};
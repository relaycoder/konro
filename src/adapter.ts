import path from 'path';
import type { DatabaseState, TableState } from './types';
import { createEmptyState } from './operations';
import type { ColumnDefinition, KonroSchema } from './schema';
import { type Serializer, getSerializer } from './utils/serializer.util';
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
  format: 'json' | 'yaml' | 'csv' | 'xlsx';
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

  const isTabular = options.format === 'csv' || options.format === 'xlsx';
  if (isTabular && (mode !== 'on-demand' || !options.multi)) {
    throw KonroError(`The '${options.format}' format only supports 'on-demand' mode with a 'multi-file' strategy.`);
  }

  if (mode === 'on-demand' && options.single) {
    throw KonroError("The 'on-demand' mode requires the 'multi-file' storage strategy.");
  }

  const parseFile = async <T>(filepath: string, schema?: Record<string, ColumnDefinition<any>>): Promise<T | undefined> => {
    const data = await fs.readFile(filepath);
    if (!data) return undefined;
    try {
      return serializer.parse<T>(data, schema);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
    }
  };

  const readSingle = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const state = await parseFile<DatabaseState<any>>(options.single!.filepath);
    // The cast is acceptable as the original code made the same implicit assumption.
    return (state ?? createEmptyState(schema)) as DatabaseState<S>;
  };

  const readMulti = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    const state = createEmptyState(schema);
    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        const filepath = path.join(dir, `${tableName}${fileExtension}`);
        const tableState = await parseFile<TableState<any>>(filepath, schema.tables[tableName]);
        if (tableState) (state as any)[tableName] = tableState;
      })
    );
    return state;
  };

  const writeSingle = (state: DatabaseState<any>) => writeAtomic(options.single!.filepath, serializer.stringify(state), fs);

  const writeMulti = async (state: DatabaseState<any>) => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    const writes = Object.entries(state).map(([tableName, tableState]) => {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      return writeAtomic(filepath, serializer.stringify(tableState), fs);
    });
    await Promise.all(writes);
  };

  return {
    options,
    fs,
    serializer,
    fileExtension,
    mode,
    read: options.single ? readSingle : readMulti,
    write: options.single ? writeSingle : writeMulti,
  } as FileStorageAdapter;
}
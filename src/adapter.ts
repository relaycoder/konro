import path from 'path';
import type { DatabaseState, KRecord, TableState } from './types';
import { createEmptyState } from './operations';
import type { ColumnDefinition, KonroSchema } from './schema';
import { type Serializer, getSerializer } from './utils/serializer.util';
import { FsProvider, defaultFsProvider, writeAtomic } from './fs';
import { KonroError, KonroStorageError } from './utils/error.util';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export interface StorageAdapter {
  read<S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>>;
  write(state: DatabaseState<any>, schema: KonroSchema<any, any>): Promise<void>;
  readonly mode: 'in-memory' | 'on-demand';
}

export interface FileStorageAdapter extends StorageAdapter {
  readonly options: FileAdapterOptions;
  readonly fs: FsProvider;
  readonly serializer: Serializer;
  readonly fileExtension: string;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; perRecord?: never };
type MultiFileStrategy = { multi: { dir: string }; single?: never; perRecord?: never };
type PerRecordStrategy = { perRecord: { dir: string }; single?: never; multi?: never };

export type FileAdapterOptions = {
  format: 'json' | 'yaml' | 'csv' | 'xlsx';
  fs?: FsProvider;
  /**
   * Defines the data access strategy.
   * - `in-memory`: (Default) Loads the entire database into memory on init. Fast for small/medium datasets.
   * - `on-demand`: Reads from the file system for each query. Slower but supports larger datasets. Requires 'multi-file' or 'per-record' strategy.
   */
  mode?: 'in-memory' | 'on-demand';
} & (SingleFileStrategy | MultiFileStrategy | PerRecordStrategy);

export function createFileAdapter(options: FileAdapterOptions & { mode: 'on-demand' }): FileStorageAdapter & { mode: 'on-demand' };
export function createFileAdapter(options: FileAdapterOptions & { mode?: 'in-memory' | undefined }): FileStorageAdapter & { mode: 'in-memory' };
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter;
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;
  const fs = options.fs ?? defaultFsProvider;
  const mode = options.mode ?? 'in-memory';

  if (options.perRecord && options.format !== 'json' && options.format !== 'yaml') {
    throw KonroError(`The 'per-record' strategy only supports 'json' or 'yaml' formats.`);
  }

  const isTabular = options.format === 'csv' || options.format === 'xlsx';
  if (isTabular && (mode !== 'on-demand' || !options.multi)) {
    throw KonroError(`The '${options.format}' format only supports 'on-demand' mode with a 'multi-file' strategy.`);
  }

  if (mode === 'on-demand' && options.single) {
    throw KonroError("The 'on-demand' mode requires the 'multi-file' or 'per-record' storage strategy.");
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

  const readPerRecord = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.perRecord!.dir;
    await fs.mkdir(dir, { recursive: true });
    const state = createEmptyState(schema);

    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        const tableDir = path.join(dir, tableName);
        await fs.mkdir(tableDir, { recursive: true });

        // Read meta file for lastId
        const metaPath = path.join(tableDir, '_meta.json');
        try {
          const metaContent = await fs.readFile(metaPath);
          if (metaContent) {
            (state as any)[tableName].meta = JSON.parse(metaContent);
          }
        } catch (e) {
          /* ignore if not found or parsing fails, will use default */
        }

        const files = await fs.readdir(tableDir);
        const recordFiles = files.filter((f) => !f.startsWith('_meta'));

        const records = await Promise.all(
          recordFiles.map((file) => parseFile<KRecord>(path.join(tableDir, file)))
        );

        (state as any)[tableName].records = records.filter((r): r is KRecord => r != null);

        // If meta file didn't exist or was empty, derive lastId for auto-increment PKs.
        if ((state as any)[tableName].meta.lastId === 0) {
          const tableSchema = schema.tables[tableName];
          const idColumn = Object.keys(tableSchema).find((key) => tableSchema[key]?.dataType === 'id' && tableSchema[key]?.options?._pk_strategy !== 'uuid');
          if (idColumn) {
            (state as any)[tableName].meta.lastId = (state as any)[tableName].records.reduce((maxId: number, record: KRecord) => {
              const id = record[idColumn];
              return typeof id === 'number' && id > maxId ? id : maxId;
            }, 0);
          }
        }
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

  const writePerRecord = async (state: DatabaseState<any>, schema: KonroSchema<any, any>) => {
    const dir = options.perRecord!.dir;
    await fs.mkdir(dir, { recursive: true });

    const writes = Object.entries(state).map(async ([tableName, tableState]) => {
      const tableDir = path.join(dir, tableName);
      await fs.mkdir(tableDir, { recursive: true });

      // Write meta file first
      const metaPath = path.join(tableDir, '_meta.json');
      await writeAtomic(metaPath, JSON.stringify(tableState.meta, null, 2), fs);

      const idColumn = Object.keys(schema.tables[tableName]).find((key) => schema.tables[tableName][key]?.dataType === 'id');
      if (!idColumn) {
        throw KonroError(`Table "${tableName}" must have an 'id' column to be used with 'per-record' storage.`);
      }

      const currentFiles = new Set(tableState.records.map((r: KRecord) => `${r[idColumn]}${fileExtension}`));
      const existingFiles = (await fs.readdir(tableDir)).filter((f) => !f.startsWith('_meta') && !f.endsWith(TEMP_FILE_SUFFIX));

      const recordWrites = tableState.records.map((record: KRecord) => writeAtomic(path.join(tableDir, `${record[idColumn]}${fileExtension}`), serializer.stringify(record), fs));
      const recordsToDelete = existingFiles.filter((f) => !currentFiles.has(f));
      const recordDeletes = recordsToDelete.map((f) => fs.unlink(path.join(tableDir, f)));

      await Promise.all([...recordWrites, ...recordDeletes]);
    });
    await Promise.all(writes);
  };

  return {
    options,
    fs,
    serializer,
    fileExtension,
    mode,
    read: options.single ? readSingle : options.multi ? readMulti : readPerRecord,
    write: options.single ? writeSingle : options.multi ? writeMulti : writePerRecord,
  } as FileStorageAdapter;
}
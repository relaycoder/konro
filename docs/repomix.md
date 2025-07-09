# Directory Structure
```
package.json
src/adapter.ts
src/db.ts
src/fs.ts
src/index.ts
src/operations.ts
src/schema.ts
src/types.ts
src/utils/constants.ts
src/utils/error.util.ts
src/utils/predicate.util.ts
src/utils/serializer.util.ts
test/unit/Core/Delete.test.ts
tsconfig.json
```

# Files

## File: src/utils/constants.ts
```typescript
export const TEMP_FILE_SUFFIX = '.tmp';
```

## File: src/utils/predicate.util.ts
```typescript
import { KRecord } from '../types';

/** Creates a predicate function from a partial object for equality checks, avoiding internal casts. */
export const createPredicateFromPartial = <T extends KRecord>(partial: Partial<T>): ((record: T) => boolean) => {
  // `Object.keys` is cast because TypeScript types it as `string[]` instead of `(keyof T)[]`.
  const keys = Object.keys(partial) as (keyof T)[];
  return (record: T): boolean => keys.every(key => record[key] === partial[key]);
};
```

## File: src/fs.ts
```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export interface FsProvider {
  readFile(filepath: string): Promise<string | null>;
  writeFile(filepath: string, content: string, encoding: 'utf-8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(dir: string, options: { recursive: true }): Promise<string | undefined>;
  readdir(dir: string): Promise<string[]>;
  unlink(filepath: string): Promise<void>;
}

export const defaultFsProvider: FsProvider = {
  readFile: async (filepath: string): Promise<string | null> => {
    try {
      return await fs.readFile(filepath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  },
  writeFile: (filepath: string, content: string, encoding: 'utf-8'): Promise<void> => {
    return fs.writeFile(filepath, content, encoding);
  },
  rename: fs.rename,
  mkdir: fs.mkdir,
  readdir: fs.readdir,
  unlink: fs.unlink,
};

export const writeAtomic = async (
  filepath: string,
  content: string,
  fsProvider: FsProvider,
): Promise<void> => {
    // Adding Date.now() for uniqueness in case of concurrent operations
    const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
    await fsProvider.mkdir(path.dirname(filepath), { recursive: true });
    await fsProvider.writeFile(tempFilepath, content, 'utf-8');
    await fsProvider.rename(tempFilepath, filepath);
};
```

## File: src/utils/error.util.ts
```typescript
// Per user request: no classes. Using constructor functions for errors.
const createKonroError = (name: string) => {
  function KonroErrorConstructor(message: string) {
    const error = new Error(message);
    error.name = name;
    Object.setPrototypeOf(error, KonroErrorConstructor.prototype);
    return error;
  }
  Object.setPrototypeOf(KonroErrorConstructor.prototype, Error.prototype);
  return KonroErrorConstructor;
};

/** Base constructor for all Konro-specific errors. */
export const KonroError = createKonroError('KonroError');

/** Thrown for storage adapter-related issues. */
export const KonroStorageError = createKonroError('KonroStorageError');

/** Thrown for schema validation errors. */
export const KonroValidationError = createKonroError('KonroValidationError');

/** Thrown when a resource is not found. */
export const KonroNotFoundError = createKonroError('KonroNotFoundError');
```

## File: test/unit/Core/Delete.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { _deleteImpl } from '../../../src/operations';
import { DatabaseState, KRecord } from '../../../src/types';
import { KonroSchema } from '../../../src/schema';

describe('Unit > Core > Delete', () => {
    let testState: DatabaseState;
    const mockSchema: KonroSchema<any, any> = {
        tables: {
            users: { 
                id: { dataType: 'id' } as any, 
                name: {} as any, 
                email: {} as any, 
                age: {} as any, 
                deletedAt: { options: { _konro_sub_type: 'deletedAt' } } as any 
            },
            posts: { 
                id: { dataType: 'id' } as any, 
                title: {} as any, 
                userId: {} as any 
            },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        },
        relations: {
            users: {
                posts: { 
                    _type: 'relation', 
                    relationType: 'many', 
                    targetTable: 'posts', 
                    on: 'id', 
                    references: 'userId', 
                    onDelete: 'CASCADE' 
                }
            }
        },
        types: {} as any,
        base: {} as any,
        create: {} as any,
    };
    
    const hardDeleteSchema: KonroSchema<any, any> = {
        ...mockSchema,
        tables: {
            ...mockSchema.tables,
            users: { id: { dataType: 'id' } as any, name: {} as any, email: {} as any, age: {} as any },
        }
    };

    beforeEach(() => {
        testState = {
            users: {
                records: [
                    { id: 1, name: 'Alice', email: 'a@a.com', age: 30, deletedAt: null },
                    { id: 2, name: 'Bob', email: 'b@b.com', age: 25, deletedAt: null },
                    { id: 3, name: 'Charlie', email: 'c@c.com', age: 42, deletedAt: null },
                ],
                meta: { lastId: 3 },
            },
            posts: { 
                records: [
                    { id: 101, title: 'Post A', userId: 1 },
                    { id: 102, title: 'Post B', userId: 2 },
                    { id: 103, title: 'Post C', userId: 1 },
                ], 
                meta: { lastId: 103 } 
            },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should return a new state object, not mutate the original state, on hard delete', () => {
        const originalState = structuredClone(testState);
        const [newState] = _deleteImpl(testState, hardDeleteSchema, 'users', (r) => r.id === 1);
        
        expect(newState).not.toBe(originalState);
        expect(originalState.users!.records.length).toBe(3);
        expect(newState.users!.records.length).toBe(2);
    });

    it('should only hard delete records that match the predicate function', () => {
        const [newState, deleted] = _deleteImpl(testState, hardDeleteSchema, 'users', (r) => typeof r.age === 'number' && r.age > 35);
        
        expect(deleted.length).toBe(1);
        expect(deleted[0]!.id).toBe(3);
        expect(newState.users!.records.length).toBe(2);
        expect(newState.users!.records.find(u => u.id === 3)).toBeUndefined();
    });

    it('should return both the new state and an array of the full, hard-deleted records in the result tuple', () => {
        const [newState, deleted] = _deleteImpl(testState, hardDeleteSchema, 'users', (r) => r.id === 2);

        expect(newState).toBeDefined();
        expect(deleted).toBeInstanceOf(Array);
        expect(deleted.length).toBe(1);
        expect(deleted[0]!).toEqual({ id: 2, name: 'Bob', email: 'b@b.com', age: 25, deletedAt: null });
    });

    it('should not modify the table meta lastId on delete', () => {
        const [newState] = _deleteImpl(testState, hardDeleteSchema, 'users', (r) => r.id === 3);
        expect(newState.users!.meta.lastId).toBe(3);
    });

    it('should soft delete a record by setting deletedAt if the column exists in schema', () => {
        const [newState, deleted] = _deleteImpl(testState, mockSchema, 'users', (r) => r.id === 2);

        expect(newState.users!.records.length).toBe(3); // Record is not removed
        const deletedUser = newState.users!.records.find(u => u.id === 2);
        expect(deletedUser?.deletedAt).toBeInstanceOf(Date);
        
        expect(deleted.length).toBe(1);
        expect(deleted[0]!.id).toBe(2);
        expect(deleted[0]!.deletedAt).toEqual(deletedUser?.deletedAt);
    });

    it('should not soft delete an already soft-deleted record', () => {
        (testState.users!.records[1] as KRecord).deletedAt = new Date('2024-01-01');
        const [newState, deleted] = _deleteImpl(testState, mockSchema, 'users', (r) => r.id === 2);

        expect(newState).toBe(testState); // Should return original state as nothing changed
        expect(deleted.length).toBe(0);
        expect((newState.users!.records[1] as KRecord).deletedAt).toEqual(new Date('2024-01-01'));
    });

    it('should perform a cascading delete on related records', () => {
        const [newState, deletedUsers] = _deleteImpl(testState, mockSchema, 'users', (r) => r.id === 1);
        
        expect(deletedUsers.length).toBe(1);
        expect(newState.users!.records.find(u => u.id === 1)?.deletedAt).toBeInstanceOf(Date);
        
        // Check that posts by user 1 are also gone (hard delete, as posts have no deletedAt)
        const postsForUser1 = newState.posts!.records.filter(p => p.userId === 1);
        expect(postsForUser1.length).toBe(0);

        // Check that other posts are unaffected
        expect(newState.posts!.records.length).toBe(1);
        expect(newState.posts!.records[0]!.id).toBe(102);
    });
});
```

## File: src/index.ts
```typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, uuid, string, number, boolean, date, createdAt, updatedAt, deletedAt, object, one, many, count, sum, avg, min, max } from './schema';

/**
 * The main Konro object, providing access to all core functionalities
 * for schema definition, database creation, and adapter configuration.
 */
export const konro = {
  /**
   * Defines the structure, types, and relations of your database.
   * This is the single source of truth for both runtime validation and static types.
   */
  createSchema,
  /**
   * Creates the main `db` context, which is the primary interface for all
   * database operations (read, write, query, etc.).
   */
  createDatabase,
  /**
   * Creates a file-based storage adapter for persisting the database state
   * to a JSON or YAML file.
   */
  createFileAdapter,
  // --- Column Definition Helpers ---
  id,
  uuid,
  string,
  number,
  boolean,
  date,
  createdAt,
  updatedAt,
  deletedAt,
  object,
  // --- Relationship Definition Helpers ---
  one,
  many,
  // --- Aggregation Definition Helpers ---
  count,
  sum,
  avg,
  min,
  max,
};
```

## File: src/types.ts
```typescript
import type { BaseModels, KonroSchema } from './schema';

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;

/**
 * Represents the state of a single table, including its records and metadata.
 */
export type TableState<T extends KRecord = KRecord> = {
  records: T[];
  meta: {
    lastId: number;
  };
};

/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: TableState<BaseModels<S['tables']>[TableName]>;
    }
  : {
      [tableName: string]: TableState;
    };
```

## File: tsconfig.json
```json
{
  "compilerOptions": {
    // Environment setup & latest features
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,


    // Some stricter flags (disabled by default)
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*", "test/**/*", "tsup.config.ts"],
  "exclude": ["dist/**/*"]
}
```

## File: src/utils/serializer.util.ts
```typescript
import { KonroStorageError } from './error.util';
import type { ColumnDefinition } from '../schema';

const loadOptional = <T>(name: string): T | undefined => {
  try {
    return require(name);
  } catch {
    return undefined;
  }
};

const yaml = loadOptional<{ load: (str: string) => unknown; dump: (obj: any, options?: any) => string }>('js-yaml');
const papaparse = loadOptional<{ parse: (str: string, config?: any) => { data: any[] }; unparse: (data: any[] | object) => string; }>('papaparse');
const xlsx = loadOptional<{ read: (data: any, opts: any) => any; utils: { sheet_to_json: <T>(ws: any) => T[]; json_to_sheet: (json: any) => any; book_new: () => any; book_append_sheet: (wb: any, ws: any, name: string) => void; }; write: (wb: any, opts: any) => any; }>('xlsx');

export type Serializer = {
  parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>) => T;
  stringify: (obj: any) => string;
};

/** For tabular formats (CSV/XLSX), metadata isn't stored. We derive lastId from the data itself. */
const deriveLastIdFromRecords = (records: any[], tableSchema: Record<string, ColumnDefinition<any>>): number => {
  const idColumn = Object.keys(tableSchema).find((key) => tableSchema[key]?.dataType === 'id' && tableSchema[key]?.options?._pk_strategy !== 'uuid');
  if (!idColumn) return 0;

  return records.reduce((maxId: number, record: any) => {
    const id = record[idColumn];
    return typeof id === 'number' && id > maxId ? id : maxId;
  }, 0);
};

export const getSerializer = (format: 'json' | 'yaml' | 'csv' | 'xlsx'): Serializer => {
  switch (format) {
    case 'json':
      return {
        parse: <T>(data: string): T => JSON.parse(data),
        stringify: (obj: any): string => JSON.stringify(obj, null, 2),
      };
    case 'yaml':
      if (!yaml) throw KonroStorageError("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
      return {
        parse: <T>(data: string): T => yaml.load(data) as T,
        stringify: (obj: any): string => yaml.dump(obj),
      };
    case 'csv':
      if (!papaparse) throw KonroStorageError("The 'csv' format requires 'papaparse' to be installed. Please run 'npm install papaparse'.");
      return {
        parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>): T => {
          const { data: records } = papaparse.parse(data, { header: true, dynamicTyping: true, skipEmptyLines: true });
          const lastId = tableSchema ? deriveLastIdFromRecords(records, tableSchema) : 0;
          return { records, meta: { lastId } } as T;
        },
        stringify: (obj: any): string => papaparse.unparse(obj.records || []),
      };
    case 'xlsx':
      if (!xlsx) throw KonroStorageError("The 'xlsx' format requires 'xlsx' to be installed. Please run 'npm install xlsx'.");
      return {
        parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>): T => {
          const workbook = xlsx.read(data, { type: 'base64' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) return { records: [], meta: { lastId: 0 } } as T;
          const worksheet = workbook.Sheets[sheetName];
          const records = xlsx.utils.sheet_to_json(worksheet);
          const lastId = tableSchema ? deriveLastIdFromRecords(records, tableSchema) : 0;
          return { records, meta: { lastId } } as T;
        },
        stringify: (obj: any): string => {
          const worksheet = xlsx.utils.json_to_sheet(obj.records || []);
          const workbook = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(workbook, worksheet, 'data');
          return xlsx.write(workbook, { bookType: 'xlsx', type: 'base64' });
        },
      };
    default:
      throw KonroStorageError(`Unsupported or invalid format specified.`);
  }
};
```

## File: package.json
```json
{
  "name": "konro",
  "version": "0.1.2",
  "description": "A type-safe, functional micro-ORM for JSON/YAML files.",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/relaycoder/konro.git"
  },
  "keywords": [
    "orm",
    "json",
    "yaml",
    "csv",
    "xlsx",
    "database",
    "typescript",
    "local-first",
    "immutable",
    "functional"
  ],
  "author": "relaycoder",
  "license": "MIT",
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9",
    "@types/papaparse": "^5.3.14",
    "@typescript-eslint/eslint-plugin": "^8.36.0",
    "@typescript-eslint/parser": "^8.36.0",
    "eslint": "^9.30.1",
    "js-yaml": "^4.1.0",
    "papaparse": "^5.4.1",
    "tsup": "^8.5.0",
    "typescript": "^5.5.4",
    "xlsx": "^0.18.5"
  },
  "peerDependencies": {
    "js-yaml": "^4.1.0",
    "papaparse": "^5.4.1",
    "typescript": "^5.0.0",
    "xlsx": "^0.18.5"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
      "optional": true
    },
    "papaparse": {
      "optional": true
    },
    "xlsx": {
      "optional": true
    }
  },
  "scripts": {
    "lint": "eslint .",
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "npm run build"
  }
}
```

## File: src/adapter.ts
```typescript
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
```

## File: src/operations.ts
```typescript
import { randomUUID } from 'crypto';
import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition, ColumnDefinition, AggregationDefinition } from './schema';
import { KonroError, KonroValidationError } from './utils/error.util';

// --- HELPERS ---


/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = <S extends KonroSchema<any, any>>(schema: S): DatabaseState<S> => {
  const state = {} as DatabaseState<S>;
  for (const tableName in schema.tables) {
    // This is a controlled cast, safe because we are iterating over the schema's tables.
    (state as any)[tableName] = { records: [], meta: { lastId: 0 } };
  }
  return state;
};

// --- QUERY ---

interface WithOptions {
  select?: Record<string, ColumnDefinition<unknown>>;
  where?: (record: KRecord) => boolean;
  with?: WithClause;
}
type WithClause = Record<string, boolean | WithOptions>;

export interface QueryDescriptor {
  tableName: string;
  select?: Record<string, ColumnDefinition<unknown> | RelationDefinition>;
  where?: (record: KRecord) => boolean;
  with?: WithClause;
  limit?: number;
  offset?: number;
  withDeleted?: boolean;
}

export interface AggregationDescriptor extends QueryDescriptor {
  aggregations: Record<string, AggregationDefinition>;
}

const _processWith = <S extends KonroSchema<any, any>>(
  recordsToProcess: KRecord[],
  currentTableName: string,
  withClause: WithClause,
  schema: S,
  state: DatabaseState
): KRecord[] => {
  // structuredClone is important to avoid mutating the records from the previous recursion level or the main state.
  const resultsWithRelations = structuredClone(recordsToProcess);

  for (const record of resultsWithRelations) {
    for (const relationName in withClause) {
      const relationDef = schema.relations[currentTableName]?.[relationName];
      if (!relationDef) continue;

      const withOpts = withClause[relationName];
      // Skip if the value is `false` or something not truthy (though types should prevent this)
      if (!withOpts) continue;

      const relatedRecords = findRelatedRecords(state, record, relationDef);

      const nestedWhere = typeof withOpts === 'object' ? withOpts.where : undefined;
      const nestedSelect = typeof withOpts === 'object' ? withOpts.select : undefined;
      const nestedWith = typeof withOpts === 'object' ? withOpts.with : undefined;

      let processedRelatedRecords = nestedWhere ? relatedRecords.filter(nestedWhere) : [...relatedRecords];

      // Recursively process deeper relations first
      if (nestedWith && processedRelatedRecords.length > 0) {
        processedRelatedRecords = _processWith(
          processedRelatedRecords,
          relationDef.targetTable,
          nestedWith,
          schema,
          state
        );
      }

      // Then, apply select on the (potentially already processed) related records
      if (nestedSelect) {
        const targetTableSchema = schema.tables[relationDef.targetTable];
        if (!targetTableSchema) throw KonroError(`Schema for table "${relationDef.targetTable}" not found.`);

        processedRelatedRecords = processedRelatedRecords.map(rec => {
          const newRec: KRecord = {};
          for (const outputKey in nestedSelect) {
            const def = nestedSelect[outputKey];
            if (!def) continue;
            // nested with() does not support selecting relations, only columns, as per spec.
            if (def._type === 'column') {
              const colName = Object.keys(targetTableSchema).find(key => targetTableSchema[key] === def);
              if (colName && rec.hasOwnProperty(colName)) {
                newRec[outputKey] = rec[colName];
              }
            }
          }
          return newRec;
        });
      }

      // Finally, attach the results to the parent record
      if (relationDef.relationType === 'one') {
        record[relationName] = processedRelatedRecords[0] ?? null;
      } else {
        record[relationName] = processedRelatedRecords;
      }
    }
  }

  return resultsWithRelations;
};

export const _queryImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, descriptor: QueryDescriptor): KRecord[] => {
  const tableState = state[descriptor.tableName];
  if (!tableState) return [];

  const tableSchema = schema.tables[descriptor.tableName];
  if (!tableSchema) throw KonroError(`Schema for table "${descriptor.tableName}" not found.`);
  const deletedAtColumn = Object.keys(tableSchema).find(key => tableSchema[key]?.options?._konro_sub_type === 'deletedAt');

  // 1. Filter
  let results: KRecord[];

  // Auto-filter soft-deleted records unless opted-out
  if (deletedAtColumn && !descriptor.withDeleted) {
    results = tableState.records.filter(r => r[deletedAtColumn] === null || r[deletedAtColumn] === undefined);
  } else {
    results = [...tableState.records];
  }
  
  results = descriptor.where ? results.filter(descriptor.where) : results;

  // 2. Eager load relations (`with`) - must happen after filtering
  if (descriptor.with) {
    results = 
_processWith(results, descriptor.tableName, descriptor.with, schema, state);
  }

  // 3. Paginate
  const offset = descriptor.offset ?? 0;
  const limit = descriptor.limit ?? results.length;
  let paginatedResults = results.slice(offset, offset + limit);

  // 4. Select Fields
  if (descriptor.select) {
    const relationsSchema = schema.relations[descriptor.tableName] ?? {};

    paginatedResults = paginatedResults.map(rec => {
      const newRec: KRecord = {};
      for (const outputKey in descriptor.select!) {
        const def = descriptor.select![outputKey];
        if (!def) continue;
        if (def._type === 'column') {
          const colName = Object.keys(tableSchema).find(key => tableSchema[key] === def);
          if (colName && rec.hasOwnProperty(colName)) {
            newRec[outputKey] = rec[colName];
          }
        } else if (def._type === 'relation') {
          const relName = Object.keys(relationsSchema).find(key => relationsSchema[key] === def);
          if (relName && rec.hasOwnProperty(relName)) {
            newRec[outputKey] = rec[relName];
          }
        }
      }
      return newRec;
    });
  }

  return paginatedResults;
};

const findRelatedRecords = (state: DatabaseState, record: KRecord, relationDef: RelationDefinition) => {
  const foreignKey = record[relationDef.on];
  const targetTable = state[relationDef.targetTable];

  if (foreignKey === undefined || !targetTable) return [];

  // one-to-many: 'on' is PK on current table, 'references' is FK on target
  if (relationDef.relationType === 'many') {
    return targetTable.records.filter(r => r[relationDef.references] === foreignKey);
  }

  // many-to-one: 'on' is FK on current table, 'references' is PK on target
  if (relationDef.relationType === 'one') {
    return targetTable.records.filter(r => r[relationDef.references] === foreignKey);
  }

  return [];
};

// --- AGGREGATION ---

export const _aggregateImpl = <S extends KonroSchema<any, any>>(
  state: DatabaseState,
  _schema: S, // Not used but keep for API consistency
  descriptor: AggregationDescriptor
): Record<string, number | null> => {
  const tableState = state[descriptor.tableName];
  if (!tableState) return {};

  const filteredRecords = descriptor.where ? tableState.records.filter(descriptor.where) : [...tableState.records];
  const results: Record<string, number | null> = {};

  for (const resultKey in descriptor.aggregations) {
    const aggDef = descriptor.aggregations[resultKey];
    if (!aggDef) continue;

    if (aggDef.aggType === 'count') {
      results[resultKey] = filteredRecords.length;
      continue;
    }

    if (!aggDef.column) {
      throw KonroError(`Aggregation '${aggDef.aggType}' requires a column.`);
    }
    const column = aggDef.column;

    const values = filteredRecords.map(r => r[column]).filter(v => typeof v === 'number') as number[];

    if (values.length === 0) {
      if (aggDef.aggType === 'sum') {
        results[resultKey] = 0; // sum of empty set is 0
      } else {
        results[resultKey] = null; // avg, min, max of empty set is null
      }
      continue;
    }

    switch (aggDef.aggType) {
      case 'sum':
        results[resultKey] = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'avg':
        results[resultKey] = values.reduce((sum, val) => sum + val, 0) / values.length;
        break;
      case 'min':
        results[resultKey] = Math.min(...values);
        break;
      case 'max':
        results[resultKey] = Math.max(...values);
        break;
    }
  }
  return results;
};

// --- INSERT ---

export const _insertImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);

  // To maintain immutability, we deep-clone only the table being modified.
  const tableState = structuredClone(oldTableState);
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) throw KonroError(`Schema for table "${tableName}" not found.`);
  const insertedRecords: KRecord[] = [];

  for (const value of values) {
    const newRecord: KRecord = { ...value };
    // Handle IDs and defaults
    for (const colName in tableSchema) {
      const colDef = tableSchema[colName];
      if (colDef.dataType === 'id') {
        if (newRecord[colName] === undefined) {
          // Generate new PK if not provided
          if (colDef.options?._pk_strategy === 'uuid') {
            newRecord[colName] = randomUUID();
          } else { // 'auto-increment' or legacy undefined strategy
            tableState.meta.lastId++;
            newRecord[colName] = tableState.meta.lastId;
          }
        } else {
          // If user provided an ID for an auto-increment table, update lastId to avoid future collisions.
          if (colDef.options?._pk_strategy !== 'uuid' && typeof newRecord[colName] === 'number') {
            tableState.meta.lastId = Math.max(tableState.meta.lastId, newRecord[colName] as number);
          }
        }
      }
      if (newRecord[colName] === undefined && colDef.options?.default !== undefined) {
        newRecord[colName] = typeof colDef.options.default === 'function' ? colDef.options.default() : colDef.options.default;
      }
    }

    // Validate the record before inserting
    validateRecord(newRecord, tableSchema, tableState.records);

    tableState.records.push(newRecord);
    insertedRecords.push(newRecord);
  }

  const newState = { ...state, [tableName]: tableState };
  return [newState, insertedRecords];
};

// --- UPDATE ---

export const _updateImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);

  const tableSchema = schema.tables[tableName];
  if (!tableSchema) {
    throw KonroError(`Schema for table "${tableName}" not found.`);
  }

  const updatedRecords: KRecord[] = [];

  // Auto-update 'updatedAt' timestamp
  for (const colName of Object.keys(tableSchema)) {
      if (tableSchema[colName]?.options?._konro_sub_type === 'updatedAt') {
          (data as KRecord)[colName] = new Date();
      }
  }

  const updateData = { ...data };
  // Find the ID column from the schema and prevent it from being updated.
  const idColumn = Object.entries(tableSchema).find(([, colDef]) => {
    return colDef && typeof colDef === 'object' && '_type' in colDef && colDef._type === 'column' && 'dataType' in colDef && colDef.dataType === 'id';
  })?.[0];
  if (idColumn && updateData[idColumn] !== undefined) {
    delete updateData[idColumn];
  }

  const newRecords = oldTableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...updateData };

      // Validate the updated record, excluding current record from unique checks
      const otherRecords = oldTableState.records.filter(r => r !== record);
      validateRecord(updatedRecord, tableSchema, otherRecords);

      updatedRecords.push(updatedRecord);
      return updatedRecord;
    }
    return record;
  });

  if (updatedRecords.length === 0) {
    return [state, []];
  }

  const tableState = { ...oldTableState, records: newRecords };
  const newState = { ...state, [tableName]: tableState };

  return [newState, updatedRecords];
};


// --- DELETE ---

function applyCascades<S extends KonroSchema<any, any>>(
  state: DatabaseState<S>,
  schema: S,
  tableName: string,
  deletedRecords: KRecord[]
): DatabaseState<S> {
  if (deletedRecords.length === 0) {
    return state;
  }

  let nextState = state;
  const relations = schema.relations[tableName] ?? {};

  for (const relationName in relations) {
    const relationDef = relations[relationName];
    // We only cascade from the "one" side of a one-to-many relationship, which is a 'many' type in Konro.
    if (!relationDef || relationDef.relationType !== 'many' || !relationDef.onDelete) {
      continue;
    }

    const sourceKey = relationDef.on;
    const targetTable = relationDef.targetTable;
    const targetKey = relationDef.references;

    const sourceKeyValues = deletedRecords.map(r => r[sourceKey]).filter(v => v !== undefined);
    if (sourceKeyValues.length === 0) continue;

    const sourceKeySet = new Set(sourceKeyValues);
    const predicate = (record: KRecord) => sourceKeySet.has(record[targetKey]);

    if (relationDef.onDelete === 'CASCADE') {
      // Recursively delete
      const [newState, ] = _deleteImpl(nextState, schema, targetTable, predicate);
      nextState = newState;
    } else if (relationDef.onDelete === 'SET NULL') {
      // Update FK to null
      const [newState, ] = _updateImpl(nextState, schema, targetTable, { [targetKey]: null }, predicate);
      nextState = newState;
    }
  }

  return nextState;
}

export const _deleteImpl = (state: DatabaseState, schema: KonroSchema<any, any>, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) throw KonroError(`Schema for table "${tableName}" not found.`);

  const deletedAtColumn = Object.keys(tableSchema).find(key => tableSchema[key]?.options?._konro_sub_type === 'deletedAt');

  // Soft delete path
  if (deletedAtColumn) {
    const recordsToUpdate: KRecord[] = [];
    const now = new Date();

    const newRecords = oldTableState.records.map(record => {
      if (!record[deletedAtColumn] && predicate(record)) { // Not already soft-deleted and matches predicate
        const updatedRecord = { ...record, [deletedAtColumn]: now };
        recordsToUpdate.push(updatedRecord);
        return updatedRecord;
      }
      return record;
    });

    if (recordsToUpdate.length === 0) return [state, []];

    const baseState = { ...state, [tableName]: { ...oldTableState, records: newRecords } };
    const finalState = applyCascades(baseState, schema, tableName, recordsToUpdate);
    
    // The returned records are the ones that were just soft-deleted from this table.
    return [finalState, recordsToUpdate];
  } 
  
  // Hard delete path
  const recordsToDelete: KRecord[] = [];
  const keptRecords = oldTableState.records.filter(r => predicate(r) ? (recordsToDelete.push(r), false) : true);

  if (recordsToDelete.length === 0) return [state, []];

  const baseState = { ...state, [tableName]: { ...oldTableState, records: keptRecords } };
  const finalState = applyCascades(baseState, schema, tableName, recordsToDelete);

  return [finalState, recordsToDelete];
};

// --- VALIDATION ---

const validateRecord = (record: KRecord, tableSchema: Record<string, any>, existingRecords: KRecord[]): void => {
  for (const [columnName, colDef] of Object.entries(tableSchema)) {
    if (!colDef || typeof colDef !== 'object' || !('dataType' in colDef)) continue;

    const value = record[columnName];
    const options = colDef.options || {};

    // Skip validation for undefined values (they should have defaults applied already)
    if (value === undefined) continue;

    // Validate unique constraint
    if (options.unique && existingRecords.some(r => r[columnName] === value)) {
      throw KonroValidationError(`Value '${String(value)}' for column '${columnName}' must be unique`);
    }

    // Validate string constraints
    if (colDef.dataType === 'string' && typeof value === 'string') {
      // Min length
      if (options.min !== undefined && value.length < options.min) {
        throw KonroValidationError(`String '${value}' for column '${columnName}' is too short (min: ${options.min})`);
      }

      // Max length
      if (options.max !== undefined && value.length > options.max) {
        throw KonroValidationError(`String '${value}' for column '${columnName}' is too long (max: ${options.max})`);
      }

      // Format validation
      if (options.format === 'email' && !isValidEmail(value)) {
        throw KonroValidationError(`Value '${value}' for column '${columnName}' is not a valid email`);
      }
    }

    // Validate number constraints
    if (colDef.dataType === 'number' && typeof value === 'number') {
      // Min value
      if (options.min !== undefined && value < options.min) {
        throw KonroValidationError(`Number ${value} for column '${columnName}' is too small (min: ${options.min})`);
      }

      // Max value
      if (options.max !== undefined && value > options.max) {
        throw KonroValidationError(`Number ${value} for column '${columnName}' is too large (max: ${options.max})`);
      }
    }
  }
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
```

## File: src/db.ts
```typescript
import path from 'path';
import { AggregationDefinition, ColumnDefinition, KonroSchema, RelationDefinition } from './schema';
import { StorageAdapter, FileStorageAdapter } from './adapter';
import { DatabaseState, KRecord, TableState } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor, _aggregateImpl, AggregationDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';
import { KonroError, KonroStorageError } from './utils/error.util';
import { writeAtomic } from './fs';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE HELPERS for Fluent API ---

type RelatedModel<T> = T extends (infer R)[] ? R : T extends (infer R | null) ? R : T;

// TAll is the full relational model type, e.g. schema.types.users
type WithArgument<TAll> = { // e.g. TAll = S['types']['users']
  [K in keyof TAll as NonNullable<TAll[K]> extends any[] | object ? K : never]?: boolean | ({
    where?: (record: RelatedModel<NonNullable<TAll[K]>>) => boolean;
  } & (
    | { select: Record<string, ColumnDefinition<unknown>>; with?: never }
    | { select?: never; with?: WithArgument<RelatedModel<NonNullable<TAll[K]>>> }
  ));
};

type ResolveWith<
  S extends KonroSchema<any, any>,
  TName extends keyof S['tables'],
  TWith extends WithArgument<S['types'][TName]>
> = { // TName='users', TWith={posts: {with: {author: true}}}
    [K in keyof TWith & keyof S['relations'][TName]]:
        S['relations'][TName][K] extends { relationType: 'many' }
            ? ( // 'many' relation -> array result. K = 'posts'
                TWith[K] extends { select: infer TSelect }
                    ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> })[]
                    : TWith[K] extends { with: infer TNestedWith }
                        // S['relations']['users']['posts']['targetTable'] = 'posts'
                        ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>)[]
                        // posts: true.
                        : S['base'][S['relations'][TName][K]['targetTable']][]
              )
            : S['relations'][TName][K] extends { relationType: 'one' }
                ? ( // 'one' relation -> nullable object result
                    TWith[K] extends { select: infer TSelect }
                        ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> }) | null
                        : TWith[K] extends { with: infer TNestedWith }
                            ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>) | null
                            : S['base'][S['relations'][TName][K]['targetTable']] | null
                  )
                : never
};

// InferColumnType is not exported from schema, so we need it here too.
type InferColumnType<C> = C extends ColumnDefinition<infer T> ? T : never;

// --- IN-MEMORY API TYPES (STATEFUL) ---

interface ChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<S['base'][TName]> | ((record: S['base'][TName]) => boolean)): this;
  withDeleted(): this;
  with<W extends WithArgument<S['types'][TName]>>(relations: W): ChainedQueryBuilder<S, TName, TReturn & ResolveWith<S, TName, W>>;
  limit(count: number): this;
  offset(count: number): this;
  all(): TReturn[];
  first(): TReturn | null;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): { [K in keyof TAggs]: number | null };
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S, T, S['base'][T]>;
}

interface UpdateBuilder<S extends KonroSchema<any, any>, TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
  };
}

interface DeleteBuilder<S extends KonroSchema<any, any>, TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
}

export interface InMemoryDbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState<S>>;
  write(state: DatabaseState<S>): Promise<void>;
  createEmptyState(): DatabaseState<S>;

  query(state: DatabaseState<S>): QueryBuilder<S>;
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['base'][T]];
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['base'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]>;
}


// --- ON-DEMAND API TYPES (STATELESS & ASYNC) ---

interface OnDemandChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<S['base'][TName]> | ((record: S['base'][TName]) => boolean)): this;
  withDeleted(): this;
  with<W extends WithArgument<S['types'][TName]>>(relations: W): OnDemandChainedQueryBuilder<S, TName, TReturn & ResolveWith<S, TName, W>>;
  limit(count: number): this;
  offset(count: number): this;
  all(): Promise<TReturn[]>;
  first(): Promise<TReturn | null>;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): Promise<{ [K in keyof TAggs]: number | null }>;
}

interface OnDemandQueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): OnDemandChainedQueryBuilder<S, T, S['base'][T]>;
}

interface OnDemandUpdateBuilder<TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
  };
}

interface OnDemandDeleteBuilder<TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
}

export interface OnDemandDbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<never>; // Not supported in on-demand mode
  write(): Promise<never>; // Not supported in on-demand mode
  createEmptyState(): DatabaseState<S>;

  query(): OnDemandQueryBuilder<S>;
  insert<T extends keyof S['tables']>(tableName: T, values: S['create'][T]): Promise<S['base'][T]>;
  insert<T extends keyof S['tables']>(tableName: T, values: Readonly<S['create'][T]>[]): Promise<S['base'][T][]>;
  update<T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]>;
  delete<T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]>;
}

// --- DbContext Union Type ---
export type DbContext<S extends KonroSchema<any, any>> = InMemoryDbContext<S> | OnDemandDbContext<S>;

// --- CORE LOGIC (STATELESS & PURE) ---

/**
 * Creates the core, stateless database operations.
 * These operations are pure functions that take a database state and return a new state,
 * forming the foundation for both in-memory and on-demand modes.
 */
function createCoreDbContext<S extends KonroSchema<any, any>>(schema: S) {
  const query = (state: DatabaseState<S>): QueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: (): TReturn[] => _queryImpl(state as DatabaseState, schema, currentDescriptor) as any,
        first: (): TReturn | null => (_queryImpl(state as DatabaseState, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any,
        aggregate: (aggregations) => {
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = <T extends keyof S['tables']>(
    state: DatabaseState<S>, tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]
  ): [DatabaseState<S>, S['base'][T] | S['base'][T][]] => {
    const valsArray = Array.isArray(values) ? values : [values];
    const [newState, inserted] = _insertImpl(state as DatabaseState, schema, tableName as string, valsArray as KRecord[]);
    const result = Array.isArray(values) ? inserted : inserted[0];
    return [newState as DatabaseState<S>, result] as [DatabaseState<S>, S['base'][T] | S['base'][T][]];
  };

  const update = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: (predicate) => {
        const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as any));
        return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
    where: (predicate) => {
      const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, schema, tableName as string, normalizePredicate(predicate as any));
      return [newState as DatabaseState<S>, deletedRecords as S['base'][T][]];
    },
  });

  return { query, insert, update, delete: del };
}

// --- ON-DEMAND CONTEXT (STATEFUL WRAPPER) ---

function createMultiFileOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: FileStorageAdapter,
  core: ReturnType<typeof createCoreDbContext<S>>
): OnDemandDbContext<S> {
  const { dir } = adapter.options.multi!;

  const readTableState = async (tableName: string): Promise<TableState> => {
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const data = await adapter.fs.readFile(filepath);
    if (!data) return { records: [], meta: { lastId: 0 } };
    try {
      return adapter.serializer.parse(data, schema.tables[tableName]);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${adapter.options.format} file. Original error: ${e.message}`);
    }
  };

  const writeTableState = async (tableName: string, tableState: TableState): Promise<void> => {
    await adapter.fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const content = adapter.serializer.stringify(tableState);
    await writeAtomic(filepath, content, adapter.fs);
  };
  
  // For queries with relations, we need the full state.
  const getFullState = async (): Promise<DatabaseState<S>> => {
    const state = createEmptyStateImpl(schema);
    await Promise.all(Object.keys(schema.tables).map(async (tableName) => {
      (state as any)[tableName] = await readTableState(tableName);
    }));
    return state;
  }

  // A generic handler for CUD operations that reads one table, performs an action, and writes it back.
  const performCud = async <TResult>(tableName: string, action: (state: DatabaseState<S>) => [DatabaseState<S>, TResult]): Promise<TResult> => {
    const state = createEmptyStateImpl(schema);
    (state as any)[tableName] = await readTableState(tableName);
    const [newState, result] = action(state as DatabaseState<S>);
    
    // Check if the operation produced a result (e.g., an array of inserted/updated/deleted records)
    const hasChanges = Array.isArray(result) ? result.length > 0 : result !== null;
    if (hasChanges) {
      const newTableState = newState[tableName as string];
      // This check satisfies the `noUncheckedIndexedAccess` compiler option.
      // Our CUD logic ensures this state will always exist after a change.
      if (newTableState) {
        await writeTableState(tableName, newTableState);
      }
    }
    return result;
  };

  const query = (): OnDemandQueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
      // The query builder for on-demand must be separate because its terminal methods are async.
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: async (): Promise<TReturn[]> => {
          const state = await getFullState();
          return _queryImpl(state, schema, currentDescriptor) as any;
        },
        first: async (): Promise<TReturn | null> => {
          const state = await getFullState();
          return (_queryImpl(state, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any;
        },
        aggregate: async (aggregations) => {
          const state = await getFullState();
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = <T extends keyof S['tables']>(tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]): Promise<any> => 
    performCud(tableName as string, (state) => core.insert(state, tableName, values as any));

  const update = <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: (predicate) => performCud(tableName as string, (state) => core.update(state, tableName).set(data).where(predicate as any)) as Promise<S['base'][T][]>,
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: async (predicate) => {
      // Cascading deletes require the full state.
      const state = await getFullState();
      const [newState, deletedRecords] = core.delete(state, tableName).where(predicate as any);

      // Find changed tables and write them back
      const changedTableNames = Object.keys(newState).filter(key => newState[key as keyof typeof newState] !== state[key as keyof typeof state]);
      
      await Promise.all(
        changedTableNames.map(name => writeTableState(name, newState[name as keyof typeof newState]))
      );

      return deletedRecords as S['base'][T][];
    },
  });

  const notSupported = () => Promise.reject(KonroError("This method is not supported in 'on-demand' mode."));

  return {
    schema,
    adapter,
    read: notSupported,
    write: notSupported,
    createEmptyState: () => createEmptyStateImpl(schema),
    query,
    insert,
    update,
    delete: del,
  };
}

function createPerRecordOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: FileStorageAdapter,
  core: ReturnType<typeof createCoreDbContext<S>>
): OnDemandDbContext<S> {
  const { dir } = adapter.options.perRecord!;
  const { fs, serializer, fileExtension } = adapter;

  const getTableDir = (tableName: string) => path.join(dir, tableName);
  const getRecordPath = (tableName: string, recordId: string | number) => path.join(getTableDir(tableName), `${recordId}${fileExtension}`);
  const getMetaPath = (tableName: string) => path.join(getTableDir(tableName), '_meta.json');

  const getIdColumn = (tableName: string) => {
    const tableSchema = schema.tables[tableName];
    const idColumn = Object.keys(tableSchema).find((key) => tableSchema[key]?.dataType === 'id');
    if (!idColumn) {
      throw KonroError(`Table "${tableName}" must have an 'id' column to be used with 'per-record' storage.`);
    }
    return idColumn;
  };

  const readMeta = async (tableName: string): Promise<{ lastId: number }> => {
    const metaContent = await fs.readFile(getMetaPath(tableName));
    return metaContent ? JSON.parse(metaContent) : { lastId: 0 };
  };

  const writeMeta = async (tableName: string, meta: { lastId: number }): Promise<void> => {
    await fs.mkdir(getTableDir(tableName), { recursive: true });
    await writeAtomic(getMetaPath(tableName), JSON.stringify(meta, null, 2), fs);
  };

  const readTableState = async (tableName: string): Promise<TableState> => {
    const tableDir = getTableDir(tableName);
    await fs.mkdir(tableDir, { recursive: true });

    const meta = await readMeta(tableName);
    const files = await fs.readdir(tableDir);
    const recordFiles = files.filter((f) => !f.startsWith('_meta'));

    const records = (
      await Promise.all(
        recordFiles.map(async (file) => {
          const content = await fs.readFile(path.join(tableDir, file));
          return content ? serializer.parse<KRecord>(content) : null;
        })
      )
    ).filter((r): r is KRecord => r !== null);

    return { records, meta };
  };

  const getFullState = async (): Promise<DatabaseState<S>> => {
    const state = createEmptyStateImpl(schema);
    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        (state as any)[tableName] = await readTableState(tableName);
      })
    );
    return state;
  };

  const query = (): OnDemandQueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: async (): Promise<TReturn[]> => {
          const state = await getFullState();
          return _queryImpl(state, schema, currentDescriptor) as any;
        },
        first: async (): Promise<TReturn | null> => {
          const state = await getFullState();
          return (_queryImpl(state, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any;
        },
        aggregate: async (aggregations) => {
          const state = await getFullState();
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = async <T extends keyof S['tables']>(tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]): Promise<any> => {
    const tableNameStr = tableName as string;
    const meta = await readMeta(tableNameStr);
    const idColumn = getIdColumn(tableNameStr);

    // We only need a shallow table state for insert, no records needed for validation context.
    const tempState: DatabaseState = { [tableNameStr]: { records: [], meta } };
    const [newState, insertedResult] = core.insert(tempState as any, tableName, values as any);

    const insertedAsArray = Array.isArray(insertedResult) ? insertedResult : insertedResult ? [insertedResult] : [];

    if (insertedAsArray.length === 0) {
      return insertedResult; // Return original empty array or null
    }

    await Promise.all(
      (insertedAsArray as KRecord[]).map((rec) => {
        const recordPath = getRecordPath(tableNameStr, rec[idColumn] as any);
        return writeAtomic(recordPath, serializer.stringify(rec), fs);
      })
    );

    const newMeta = (newState as DatabaseState)[tableNameStr]?.meta;
    if (newMeta && newMeta.lastId !== meta.lastId) {
      await writeMeta(tableNameStr, newMeta);
    }

    return insertedResult;
  };

  const update = <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: async (predicate) => {
        const tableNameStr = tableName as string;
        const tableState = await readTableState(tableNameStr);
        const idColumn = getIdColumn(tableNameStr);
        const [, updatedRecords] = core.update({ [tableNameStr]: tableState } as any, tableName).set(data).where(predicate as any);

        if (updatedRecords.length > 0) {
          await Promise.all(
            (updatedRecords as KRecord[]).map((rec) => writeAtomic(getRecordPath(tableNameStr, rec[idColumn] as any), serializer.stringify(rec), fs))
          );
        }
        return updatedRecords as S['base'][T][];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: async (predicate) => {
      const state = await getFullState();
      const [newState, deletedRecords] = core.delete(state, tableName).where(predicate as any);

      const changePromises: Promise<any>[] = [];

      for (const tName of Object.keys(schema.tables)) {
        const oldTableState = state[tName as keyof typeof state]!;
        const newTableState = newState[tName as keyof typeof newState]!;

        if (oldTableState === newTableState) continue;

        const tableDir = getTableDir(tName);
        changePromises.push(fs.mkdir(tableDir, { recursive: true }));

        if (JSON.stringify(oldTableState.meta) !== JSON.stringify(newTableState.meta)) {
          changePromises.push(writeMeta(tName, newTableState.meta));
        }

        const tIdColumn = getIdColumn(tName);
        const oldRecordsMap = new Map(oldTableState.records.map(r => [r[tIdColumn], r]));
        const newRecordsMap = new Map(newTableState.records.map(r => [r[tIdColumn], r]));
        
        for (const [id, record] of newRecordsMap.entries()) {
            const oldRecord = oldRecordsMap.get(id);
            // Write if new or record object identity has changed
            if (!oldRecord || oldRecord !== record) {
                changePromises.push(writeAtomic(getRecordPath(tName, id as any), serializer.stringify(record), fs));
            }
        }
        
        for (const id of oldRecordsMap.keys()) {
            if (!newRecordsMap.has(id)) { // Deleted record
                changePromises.push(fs.unlink(getRecordPath(tName, id as any)));
            }
        }
      }

      await Promise.all(changePromises);

      return deletedRecords as S['base'][T][];
    },
  });

  const notSupported = () => Promise.reject(KonroError("This method is not supported in 'on-demand' mode."));

  return { schema, adapter, createEmptyState: () => createEmptyStateImpl(schema), read: notSupported, write: notSupported, query, insert, update, delete: del };
}


// --- DATABASE FACTORY ---

export function createDatabase<
  S extends KonroSchema<any, any>,
  TAdapter extends StorageAdapter,
>(
  options: { schema: S; adapter: TAdapter }
): TAdapter['mode'] extends 'on-demand' ? OnDemandDbContext<S> : InMemoryDbContext<S>;
export function createDatabase<S extends KonroSchema<any, any>>(
  options: { schema: S; adapter: StorageAdapter }
): DbContext<S> {
  const { schema, adapter } = options;
  const core = createCoreDbContext(schema);

  if (adapter.mode === 'on-demand') {
    const fileAdapter = adapter as FileStorageAdapter; // We can be sure it's a FileStorageAdapter due to checks
    if (fileAdapter.options.multi) {
      return createMultiFileOnDemandDbContext(schema, fileAdapter, core);
    }
    if (fileAdapter.options.perRecord) {
      return createPerRecordOnDemandDbContext(schema, fileAdapter, core);
    }
    throw KonroError("The 'on-demand' mode requires a 'multi-file' or 'per-record' storage strategy.");
  }

  // For in-memory, just combine the core logic with the adapter and I/O methods.
  return {
    ...core,
    schema, adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state, schema),
    createEmptyState: () => createEmptyStateImpl(schema),
  } as InMemoryDbContext<S>;
}
```

## File: src/schema.ts
```typescript
//
// Konro: The Type-Safe, Functional ORM for JSON/YAML
//
// ## Pillar I: The Recipe (Schema Definition)
//
// This file contains the core logic for defining a database schema. It is designed to be
// both the runtime source of truth for validation and the static source of truth for
// TypeScript types. By using phantom types and inference, we can create a fully-typed
// `db` object from a single schema definition object, eliminating the need for manual
// type declarations (`interface User { ... }`) and ensuring they never get out of sync.
//

// --- TYPE INFERENCE HELPERS ---

/** Infers the underlying TypeScript type from a `ColumnDefinition`. e.g., `ColumnDefinition<string>` => `string`. */
type InferColumnType<C> = C extends ColumnDefinition<infer T> ? T : never;

/** A mapping of table names to their base model types (columns only, no relations). */
export type BaseModels<TTables extends Record<string, any>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: InferColumnType<TTables[TableName][ColumnName]>;
  };
};

/**
 * A mapping of table names to their full model types, including relations.
 * This is a recursive type that resolves relationships to other full models.
 */
type Models<
  TTables extends Record<string, any>,
  TRelations extends Record<string, any>,
  TBaseModels extends Record<keyof TTables, any>
> = {
  [TableName in keyof TTables]: TBaseModels[TableName] &
    (TableName extends keyof TRelations
      ? {
          [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName] extends OneRelationDefinition
            ? // `targetTable` is a string literal, so we can use it to index `Models`
              Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']] | null
            : TRelations[TableName][RelationName] extends ManyRelationDefinition
            ? Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']][]
            : never;
        }
      : {});
};

/** Finds all column names in a table definition that are optional for insertion (i.e., `id` or has a `default`). */
/** Finds all column names in a table definition that are optional for insertion (i.e., `id` or has a `default`). */
type OptionalCreateKeys<TTableDef> = {
  [K in keyof TTableDef]: TTableDef[K] extends { dataType: 'id' }
    ? K
    : TTableDef[K] extends { options: { default: any } }
    ? K
    : never;
}[keyof TTableDef];

/**
 * A mapping of table names to their "create" types, used for `db.insert`.
 * It takes the base model, makes keys with defaults optional, and removes the `id` field.
 */
type CreateModels<
  TTables extends Record<string, any>,
  TBaseModels extends Record<keyof TTables, any>
> = {
  [TableName in keyof TTables]: Omit<
    {
      // Required fields
      [K in Exclude<keyof TBaseModels[TableName], OptionalCreateKeys<TTables[TableName]>>]: TBaseModels[TableName][K];
    } & {
      // Optional fields
      [K in OptionalCreateKeys<TTables[TableName]>]?: TBaseModels[TableName][K];
    },
    // 'id' is always omitted from create types
    'id'
  >;
};


// --- PUBLIC API TYPES ---

/** The publicly exposed structure of a fully-processed Konro schema. */
export interface KonroSchema<
  TTables extends Record<string, any>,
  TRelations extends Record<string, any>
> {
  tables: TTables;
  relations: TRelations;
  /** The full, relational types for each table model. */
  types: Models<TTables, TRelations, BaseModels<TTables>>;
  /** The base types for each table model, without any relations. */
  base: BaseModels<TTables>;
  /** The types for creating new records, with defaults and `id` made optional. */
  create: CreateModels<TTables, BaseModels<TTables>>;
}

/** The definition for a database column, created by helpers like `konro.string()`. */
export interface ColumnDefinition<T> {
  readonly _type: 'column';
  readonly dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  readonly options: any;
  readonly _tsType?: T; // Phantom type, does not exist at runtime
}

/** The definition for a table relationship, created by `konro.one()` or `konro.many()`. */
export interface BaseRelationDefinition {
  readonly _type: 'relation';
  readonly targetTable: string;
  readonly on: string;
  readonly references: string;
  readonly onDelete?: 'CASCADE' | 'SET NULL';
}

export interface OneRelationDefinition extends BaseRelationDefinition {
  readonly relationType: 'one';
}

export interface ManyRelationDefinition extends BaseRelationDefinition {
  readonly relationType: 'many';
}

export type RelationDefinition = OneRelationDefinition | ManyRelationDefinition;

/** The definition for a data aggregation, created by `konro.count()`, `konro.sum()`, etc. */
export interface AggregationDefinition {
  readonly _type: 'aggregation';
  readonly aggType: 'count' | 'sum' | 'avg' | 'min' | 'max';
  readonly column?: string;
}


// --- SCHEMA BUILDER FUNCTION ---

/**
 * Defines the structure, types, and relations of your database.
 * This is the single source of truth for both runtime validation and static types.
 *
 * @param schemaDef The schema definition object.
 * @returns A processed schema object with inferred types attached.
 */
export const createSchema = <
  const TDef extends {
    tables: Record<string, Record<string, ColumnDefinition<any>>>;
    relations?: (tables: TDef['tables']) => Record<string, Record<string, BaseRelationDefinition>>;
  }
>(
  schemaDef: TDef
): KonroSchema<TDef['tables'], TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}> => { // eslint-disable-line
  const relations = schemaDef.relations ? schemaDef.relations(schemaDef.tables) : {};
  return {
    tables: schemaDef.tables,
    relations: relations as any, // Cast to bypass complex conditional type issue
    // Types are applied via the return type annotation, these are just placeholders at runtime.
    types: null as any,
    base: {} as any,
    create: {} as any,
  };
};


// --- COLUMN DEFINITION HELPERS ---

const createColumn = <T>(dataType: ColumnDefinition<T>['dataType'], options: object | undefined, tsType: T): ColumnDefinition<T> => ({
  _type: 'column',
  dataType,
  options,
  _tsType: tsType,
});

/** A managed, auto-incrementing integer primary key. This is the default strategy. */
export const id = () => createColumn<number>('id', { unique: true, _pk_strategy: 'auto-increment' }, 0);
/** A managed, universally unique identifier (UUID) primary key. Stored as a string. */
export const uuid = () => createColumn<string>('id', { unique: true, _pk_strategy: 'uuid' }, '');
/** A string column with optional validation. */
export const string = (options?: { unique?: boolean; default?: string | (() => string); min?: number; max?: number; format?: 'email' | 'uuid' | 'url' }) => createColumn<string>('string', options, '');
/** A number column with optional validation. */
export const number = (options?: { unique?: boolean; default?: number | (() => number); min?: number; max?: number; type?: 'integer' }) => createColumn<number>('number', options, 0);
/** A boolean column. */
export const boolean = (options?: { default?: boolean | (() => boolean) }) => createColumn<boolean>('boolean', options, false);
/** A generic date column. Consider using `createdAt` or `updatedAt` for managed timestamps. */
export const date = (options?: { default?: Date | (() => Date) }) => createColumn<Date>('date', options, new Date());
/** A managed timestamp set when a record is created. */
export const createdAt = (): ColumnDefinition<Date> => createColumn<Date>('date', { _konro_sub_type: 'createdAt', default: () => new Date() }, new Date());
/** A managed timestamp set when a record is created and updated. */
export const updatedAt = (): ColumnDefinition<Date> => createColumn<Date>('date', { _konro_sub_type: 'updatedAt', default: () => new Date() }, new Date());
/** A managed, nullable timestamp for soft-deleting records. */
export const deletedAt = (): ColumnDefinition<Date | null> => createColumn<Date | null>('date', { _konro_sub_type: 'deletedAt', default: null }, null);
/** A column for storing arbitrary JSON objects, with a generic for type safety. */
export const object = <T extends Record<string, any>>(options?: { default?: T | (() => T) }): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options });


// --- RELATIONSHIP DEFINITION HELPERS ---

/** Defines a `one-to-one` or `many-to-one` relationship. */
export const one = <T extends string>(targetTable: T, options: { on: string; references: string; onDelete?: 'CASCADE' | 'SET NULL' }): OneRelationDefinition & { targetTable: T } => ({
  _type: 'relation',
  relationType: 'one',
  targetTable,
  ...options,
});

/** Defines a `one-to-many` relationship. */
export const many = <T extends string>(targetTable: T, options: { on: string; references: string; onDelete?: 'CASCADE' | 'SET NULL' }): ManyRelationDefinition & { targetTable: T } => ({
  _type: 'relation',
  relationType: 'many',
  targetTable,
  ...options,
});


// --- AGGREGATION DEFINITION HELPERS ---

/** Aggregation to count records. */
export const count = (): AggregationDefinition => ({ _type: 'aggregation', aggType: 'count' });
/** Aggregation to sum a numeric column. */
export const sum = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'sum', column });
/** Aggregation to average a numeric column. */
export const avg = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'avg', column });
/** Aggregation to find the minimum value in a numeric column. */
export const min = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'min', column });
/** Aggregation to find the maximum value in a numeric column. */
export const max = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'max', column });
```

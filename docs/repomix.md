# Directory Structure
```
package.json
src/adapter.ts
src/types.ts
src/utils/constants.ts
src/utils/error.util.ts
src/utils/predicate.util.ts
src/utils/serializer.util.ts
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

## File: src/types.ts
```typescript
import type { BaseModels, KonroSchema } from './schema';

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;

/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: {
        records: BaseModels<S['tables']>[TableName][];
        meta: {
          lastId: number;
        };
      };
    }
  : {
      [tableName: string]: {
        records: KRecord[];
        meta: {
          lastId: number;
        };
      };
    };
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

## File: src/adapter.ts
```typescript
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
```

## File: package.json
```json
{
  "name": "konro",
  "version": "0.1.1",
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

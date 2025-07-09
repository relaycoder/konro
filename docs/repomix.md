# Directory Structure
```
package.json
README.md
src/adapter.ts
src/db.ts
src/fs.ts
src/index.ts
src/operations.ts
src/schema.ts
src/types.ts
src/utils/constants.ts
src/utils/error.codes.ts
src/utils/error.util.ts
src/utils/predicate.util.ts
src/utils/serializer.util.ts
tsconfig.json
```

# Files

## File: src/utils/constants.ts
````typescript
export const TEMP_FILE_SUFFIX = '.tmp';
````

## File: src/utils/error.codes.ts
````typescript
export const KONRO_ERROR_CODES = {
  // General Errors
  E001: 'An unexpected error occurred: {{details}}',

  // Storage Errors
  E100: 'Invalid storage strategy configuration.',
  E101: "The '{{format}}' format requires the '{{dependency}}' package to be installed. Please run 'npm install {{dependency}}'.",
  E102: 'Unsupported or invalid format specified: {{format}}.',
  E103: 'Failed to parse file at "{{filepath}}". It may be corrupt or not a valid {{format}} file. Original error: {{details}}',
  E104: "The 'on-demand' mode requires the 'multi-file' or 'per-record' storage strategy.",
  E105: `The 'per-record' strategy only supports 'json' or 'yaml' formats.`,
  E106: `The '{{format}}' format only supports 'on-demand' mode with a 'multi-file' strategy.`,
  E107: `Invalid file adapter options: missing storage strategy.`,

  // Schema & Data Errors
  E200: 'Table "{{tableName}}" does not exist in the database state.',
  E201: 'Schema for table "{{tableName}}" not found.',
  E202: `Table "{{tableName}}" must have an 'id' column for 'per-record' storage.`,
  E203: 'Aggregation `{{aggType}}` requires a column.',

  // Validation Errors
  E300: `Value '{{value}}' for column '{{columnName}}' must be unique.`,
  E301: `String '{{value}}' for column '{{columnName}}' is too short (min: {{min}}).`,
  E302: `String '{{value}}' for column '{{columnName}}' is too long (max: {{max}}).`,
  E303: `Value '{{value}}' for column '{{columnName}}' is not a valid email.`,
  E304: `Number {{value}} for column '{{columnName}}' is too small (min: {{min}}).`,
  E305: `Number {{value}} for column '{{columnName}}' is too large (max: {{max}}).`,

  // DB Context Errors
  E400: "The method '{{methodName}}' is not supported in 'on-demand' mode.",
};

export type KonroErrorCode = keyof typeof KONRO_ERROR_CODES;
````

## File: src/utils/predicate.util.ts
````typescript
import { KRecord } from '../types';

/** Creates a predicate function from a partial object for equality checks, avoiding internal casts. */
export const createPredicateFromPartial = <T extends KRecord>(partial: Partial<T>): ((record: T) => boolean) => {
  // `Object.keys` is cast because TypeScript types it as `string[]` instead of `(keyof T)[]`.
  const keys = Object.keys(partial) as (keyof T)[];
  return (record: T): boolean => keys.every(key => record[key] === partial[key]);
};
````

## File: src/fs.ts
````typescript
import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './utils/constants';
import type { FsProvider } from './types';

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
````

## File: src/utils/error.util.ts
````typescript
import { KONRO_ERROR_CODES, type KonroErrorCode } from './error.codes';

type ErrorContext = Record<string, string | number | undefined | null>;

const renderTemplate = (template: string, context: ErrorContext): string => {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const value = context[key.trim()];
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`;
  });
};

// Per user request: no classes. Using constructor functions for errors.
const createKonroError = (name: string) => {
  function KonroErrorConstructor(messageOrContext: string | ({ code: KonroErrorCode } & ErrorContext)) {
    let message: string;
    let code: KonroErrorCode | undefined;

    if (typeof messageOrContext === 'string') {
      message = messageOrContext;
    } else {
      code = messageOrContext.code;
      const template = KONRO_ERROR_CODES[code] || 'Unknown error code.';
      message = `[${code}] ${renderTemplate(template, messageOrContext)}`;
    }

    const error = new Error(message) as Error & { code?: KonroErrorCode };
    error.name = name;
    error.code = code;
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
````

## File: src/index.ts
````typescript
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
````

## File: tsconfig.json
````json
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
````

## File: src/types.ts
````typescript
// --- Schema Definition Types (from schema.ts) ---

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

/** Infers the underlying TypeScript type from a `ColumnDefinition`. e.g., `ColumnDefinition<string>` => `string`. */
type InferColumnType<C> = C extends ColumnDefinition<infer T> ? T : never;

/** A mapping of table names to their base model types (columns only, no relations). */
export type BaseModels<TTables extends Record<string, any>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: InferColumnType<TTables[TableName][ColumnName]>;
  };
};

/** A mapping of table names to their full model types, including relations. */
type Models<
  TTables extends Record<string, any>,
  TRelations extends Record<string, any>,
  TBaseModels extends Record<keyof TTables, any>
> = {
  [TableName in keyof TTables]: TBaseModels[TableName] &
    (TableName extends keyof TRelations
      ? {
          [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName] extends OneRelationDefinition
            ? Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']] | null
            : TRelations[TableName][RelationName] extends ManyRelationDefinition
            ? Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']][]
            : never;
        }
      : {});
};

/** Finds all column names in a table definition that are optional for insertion (i.e., `id` or has a `default`). */
type OptionalCreateKeys<TTableDef> = {
  [K in keyof TTableDef]: TTableDef[K] extends { dataType: 'id' }
    ? K
    : TTableDef[K] extends { options: { default: unknown } }
    ? K
    : never;
}[keyof TTableDef];

/** A mapping of table names to their "create" types, used for `db.insert`. */
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


// --- Generic & Core Types ---

/** A generic representation of a single record within a table. It uses `unknown` for values to enforce type-safe access. */
export type KRecord = Record<string, unknown>;

/** Represents the state of a single table, including its records and metadata. */
export type TableState<T extends KRecord = KRecord> = {
  records: T[];
  meta: {
    lastId: number;
  };
};

/** The in-memory representation of the entire database. It is a plain, immutable object. */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: TableState<BaseModels<S['tables']>[TableName]>;
    }
  : {
      [tableName: string]: TableState;
    };


// --- FS Provider Types (from fs.ts) ---
export interface FsProvider {
  readFile(filepath: string): Promise<string | null>;
  writeFile(filepath: string, content: string, encoding: 'utf-8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(dir: string, options: { recursive: true }): Promise<string | undefined>;
  readdir(dir: string): Promise<string[]>;
  unlink(filepath: string): Promise<void>;
}


// --- Serializer Types (from utils/serializer.util.ts) ---
export type Serializer = {
  parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>) => T;
  stringify: (obj: any) => string;
};


// --- Storage Adapter Types (from adapter.ts) ---

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

export type SingleFileStrategy = { single: { filepath: string }; multi?: never; perRecord?: never };
export type MultiFileStrategy = { multi: { dir: string }; single?: never; perRecord?: never };
export type PerRecordStrategy = { perRecord: { dir: string }; single?: never; multi?: never };

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


// --- Operation Descriptor Types (from operations.ts) ---

export type WithClause = Record<string, boolean | {
  where?: (record: KRecord) => boolean;
  select?: Record<string, ColumnDefinition<unknown>>;
  with?: WithClause;
}>;

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


// --- DB Context & Fluent API Types (from db.ts) ---

type RelatedModel<T> = T extends (infer R)[] ? R : T extends (infer R | null) ? R : T;

export type WithArgument<TAll> = {
  [K in keyof TAll as NonNullable<TAll[K]> extends any[] | object ? K : never]?: boolean | ({
    where?: (record: RelatedModel<NonNullable<TAll[K]>>) => boolean;
  } & (
    | { select: Record<string, ColumnDefinition<unknown>>; with?: never }
    | { select?: never; with?: WithArgument<RelatedModel<NonNullable<TAll[K]>>> }
  ));
};

export type ResolveWith<
  S extends KonroSchema<any, any>,
  TName extends keyof S['tables'],
  TWith extends WithArgument<S['types'][TName]>
> = {
    [K in keyof TWith & keyof S['relations'][TName]]:
        S['relations'][TName][K] extends { relationType: 'many' }
            ? (
                TWith[K] extends { select: infer TSelect }
                    ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> })[]
                    : TWith[K] extends { with: infer TNestedWith }
                        ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>)[]
                        : S['base'][S['relations'][TName][K]['targetTable']][]
              )
            : S['relations'][TName][K] extends { relationType: 'one' }
                ? (
                    TWith[K] extends { select: infer TSelect }
                        ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> }) | null
                        : TWith[K] extends { with: infer TNestedWith }
                            ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>) | null
                            : S['base'][S['relations'][TName][K]['targetTable']] | null
                  )
                : never
};

export interface ChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
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

export interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S, T, S['base'][T]>;
}

export interface UpdateBuilder<S extends KonroSchema<any, any>, TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
  };
}

export interface DeleteBuilder<S extends KonroSchema<any, any>, TBase> {
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

export interface OnDemandChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
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

export interface OnDemandQueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): OnDemandChainedQueryBuilder<S, T, S['base'][T]>;
}

export interface OnDemandUpdateBuilder<TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
  };
}

export interface OnDemandDeleteBuilder<TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
}

export interface OnDemandDbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<never>;
  write(): Promise<never>;
  createEmptyState(): DatabaseState<S>;

  query(): OnDemandQueryBuilder<S>;
  insert<T extends keyof S['tables']>(tableName: T, values: S['create'][T]): Promise<S['base'][T]>;
  insert<T extends keyof S['tables']>(tableName: T, values: Readonly<S['create'][T]>[]): Promise<S['base'][T][]>;
  update<T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]>;
  delete<T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]>;
}

export type DbContext<S extends KonroSchema<any, any>> = InMemoryDbContext<S> | OnDemandDbContext<S>;
````

## File: src/utils/serializer.util.ts
````typescript
import { KonroStorageError } from './error.util';
import type { ColumnDefinition, Serializer } from '../types';

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
      if (!yaml) throw KonroStorageError({ code: 'E101', format: 'yaml', dependency: 'js-yaml' });
      return {
        parse: <T>(data: string): T => yaml.load(data) as T,
        stringify: (obj: any): string => yaml.dump(obj),
      };
    case 'csv':
      if (!papaparse) throw KonroStorageError({ code: 'E101', format: 'csv', dependency: 'papaparse' });
      return {
        parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>): T => {
          const { data: records } = papaparse.parse(data, { header: true, dynamicTyping: true, skipEmptyLines: true });
          const lastId = tableSchema ? deriveLastIdFromRecords(records, tableSchema) : 0;
          return { records, meta: { lastId } } as T;
        },
        stringify: (obj: any): string => papaparse.unparse(obj.records || []),
      };
    case 'xlsx':
      if (!xlsx) throw KonroStorageError({ code: 'E101', format: 'xlsx', dependency: 'xlsx' });
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
      throw KonroStorageError({ code: 'E102', format });
  }
};
````

## File: README.md
````markdown
# Konro: The Type-Safe, Functional ORM for Your Local Files

<p align="center">
  <img src="https://i.imgur.com/6s2uA4Z.jpeg" alt="Konro Logo - A bowl of soup representing the database state, with spices (functions) being added" width="400" />
</p>

<p align="center">
  <strong>Slow-simmer your data. A pure, functional, and type-safe "spice rack" for your JSON, YAML, CSV, or XLSX "broth".</strong>
</p>

<p align="center">
  <a href="https://nodei.co/npm/konro/"><img src="https://nodei.co/npm/konro.png?downloads=true&compact=true" alt="NPM"></a>
  <br>
  <img alt="npm" src="https://img.shields.io/npm/v/konro?style=for-the-badge&color=c43a3a">
  <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/relaycoder/konro/ci.yml?style=for-the-badge&logo=github">
  <img alt="License" src="https://img.shields.io/npm/l/konro?style=for-the-badge">
</p>

---

Konro is a new kind of "micro-ORM" for JavaScript and TypeScript. It offers the safety and developer experience of a full-scale, relational database ORM, but for local **JSON, YAML, CSV, or XLSX files**. It is designed from the ground up to be **type-safe, immutable, relational, and ergonomic,** making it the perfect data persistence layer for local-first apps, CLIs, and small servers.

## Table of Contents

1.  [**The Konro Philosophy: Cooking Your Data**](#1-the-konro-philosophy-cooking-your-data)
2.  [**Core Principles: The Konro Difference**](#2-core-principles-the-konro-difference)
3.  [**When to Use Konro (and When Not To)**](#3-when-to-use-konro-and-when-not-to)
4.  [**Installation**](#4-installation)
5.  [**The 5-Minute Recipe: A Quick Start**](#5-the-5-minute-recipe-a-quick-start)
6.  [**Pillar I: The Recipe (Schema Definition)**](#6-pillar-i-the-recipe-schema-definition)
    *   [The `konro.createSchema` Function](#the-konrocreateschema-function)
    *   [Defining Tables and Columns](#defining-tables-and-columns)
    *   [Defining Relationships](#defining-relationships)
    *   [Inferring Static Types: The Magic](#inferring-static-types-the-magic)
7.  [**Pillar II: The Kitchen (Database Context)**](#7-pillar-ii-the-kitchen-database-context)
    *   [Choosing a Storage Adapter](#choosing-a-storage-adapter)
    *   [Data Access Modes: `in-memory` vs `on-demand`](#data-access-modes-in-memory-vs-on-demand)
    *   [The `konro.createDatabase` Function](#the-konrocreatedatabase-function)
8.  [**Pillar III: Cooking (The Fluent API)**](#8-pillar-iii-cooking-the-fluent-api)
    *   [Two API Styles: In-Memory vs. On-Demand](#two-api-styles-in-memory-vs-on-demand)
    *   [Reading Data with `db.query()`](#reading-data-with-dbquery)
    *   [Advanced Queries with `.with()`](#advanced-queries-with-with)
    *   [Aggregating Data](#aggregating-data)
    *   [Writing Data: `insert`, `update`, `delete`](#writing-data-insert-update-delete)
9.  [**Advanced Concepts & Patterns**](#9-advanced-concepts--patterns)
    *   [Testing Your Logic](#testing-your-logic)
    *   [Performance Considerations](#performance-considerations)
10. [**API Reference Cheatsheet**](#10-api-reference-cheatsheet)
11. [**Roadmap**](#11-roadmap)
12. [**Comparison to Other Libraries**](#12-comparison-to-other-libraries)
13. [**Contributing**](#13-contributing)
14. [**License**](#14-license)

---

## 1. The Konro Philosophy: Cooking Your Data

Konro is inspired by the art of Indonesian cooking, where a rich soup or `Konro` is made by carefully combining a base broth with a precise recipe and a collection of spices. Konro treats your data with the same philosophy.

*   **The Broth (Your Data):** Your database state is a plain, passive file (JSON, YAML, CSV, etc.). It holds no logic.
*   **The Recipe (Your Schema):** You define a schema that acts as a recipe, describing your data's structure, types, and relationships.
*   **The Spices (Pure Functions):** Konro provides a set of pure, immutable functions that act as spices. They take the broth and transform it, always returning a *new, updated broth*, never changing the original.
*   **The Fluent API (Your Guided Hand):** Konro provides an ergonomic, chainable API that guides you through the process of combining these elements, making the entire cooking process safe, predictable, and enjoyable.

## 2. Core Principles: The Konro Difference

*   **Type-First, Not Schema-First:** You don't write a schema to get types. You write a schema *as* types. Your schema definition becomes your single source of truth for both runtime validation and static TypeScript types.
*   **Stateless Core, Stateful Feel:** The internal engine is a collection of pure, stateless functions (`(state, args) => newState`). The user-facing API is a fluent, chainable "query builder" that feels intuitive and stateful, giving you the best of both worlds.
*   **Immutable by Default:** In its primary `in-memory` mode, data is never mutated. Every `insert`, `update`, or `delete` operation is an explicit API call that returns a `[newState, result]` tuple. This eliminates side effects and makes state management predictable and safe.
*   **Relational at Heart:** Define `one-to-one`, `one-to-many`, and `many-to-one` relationships directly in your schema. Eager-load related data with a powerful and fully-typed `.with()` clause, where TypeScript precisely infers the shape of the result based on your query's structure.
*   **Scales with You:** Start with a simple, atomic JSON file (`in-memory` mode). As your data grows, switch to `on-demand` mode to reduce memory usage, reading from the filesystem only when needed.

## 3. When to Use Konro (and When Not To)

✅ **Use Konro for:**

*   **Local-First Applications:** The perfect data layer for Electron, Tauri, or any desktop app needing a robust, relational store.
*   **Command-Line Tools (CLIs):** Manage complex state or configuration for a CLI tool in a structured, safe way.
*   **Small to Medium Servers:** Ideal for personal projects, blogs, portfolios, or microservices where you want to avoid the overhead of a traditional database.
*   **Rapid Prototyping:** Get the benefits of a type-safe, relational ORM without spinning up a database server.

❌ **Consider other solutions if you need:**

*   **High-Concurrency Writes:** Konro's default file-based adapters are not designed for environments where many processes need to write to the database simultaneously at high frequency.
*   **Extreme Performance at Scale:** While `on-demand` mode helps with memory, complex relational queries still load data into memory. For gigabyte-scale relational processing, a dedicated database server is more appropriate.
*   **Distributed Systems:** Konro is a single-node database solution by design.

---

## 4. Installation

```bash
npm install konro
```

Konro has **optional** peer dependencies for different file formats. Install the ones you need:

```bash
# For YAML file support
npm install js-yaml

# For CSV file support
npm install papaparse

# For XLSX (Excel) file support
npm install xlsx
```

---

## 5. The 5-Minute Recipe: A Quick Start

Let's build a simple, relational blog database from scratch.

**Step 1: Define the Recipe (`src/schema.ts`)**
Create a single source of truth for your entire database structure. Konro will infer your TypeScript types from this object.

```typescript
import { konro } from 'konro';

export const blogSchema = konro.createSchema({
  tables: {
    users: {
      id: konro.id(),
      name: konro.string({ min: 2 }),
      email: konro.string({ format: 'email', unique: true }),
    },
    posts: {
      id: konro.id(),
      title: konro.string({ min: 5 }),
      published: konro.boolean({ default: false }),
      authorId: konro.number({ type: 'integer' }),
    },
  },
  relations: (t) => ({
    users: {
      posts: konro.many('posts', { on: 'id', references: 'authorId' }),
    },
    posts: {
      author: konro.one('users', { on: 'authorId', references: 'id' }),
    },
  }),
});

// INFER YOUR TYPES! No need to write `interface User` ever again.
export type User = typeof blogSchema.types.users;
export type Post = typeof blogSchema.types.posts;
```

**Step 2: Prepare the Kitchen (`src/db.ts`)**
Create a database context that is pre-configured with your schema and a storage adapter. This example uses the default `in-memory` mode.

```typescript
import { konro, createFileAdapter } from 'konro';
import { blogSchema } from './schema';

// Use a multi-file YAML adapter to create 'users.yaml' and 'posts.yaml'.
const adapter = createFileAdapter({
  format: 'yaml', // 'json', 'yaml', 'csv', 'xlsx'
  multi: { dir: './data/yaml_db' },
  // mode: 'in-memory' is the default
});

// Create the db context. This is your main interface to Konro.
export const db = konro.createDatabase({
  schema: blogSchema,
  adapter,
});
```

**Step 3: Start Cooking (`src/index.ts`)**
Use the `db` context and your inferred types to interact with your data in a fully type-safe way.

```typescript
import { db } from './db';
import type { User } from './schema';

async function main() {
  // 1. READ state from disk. This loads the entire database into memory.
  let state = await db.read();
  console.log('Database state loaded.');

  // 2. INSERT a new user. `db.insert` is a pure function.
  // It returns a tuple: [newState, insertedRecord].
  let newUser: User;
  [state, newUser] = db.insert(state, 'users', {
    name: 'Chef Renatta',
    email: 'renatta@masterchef.dev',
  });
  console.log('User created:', newUser);

  // Use the NEW state for the next operation. This is key to immutability.
  [state] = db.insert(state, 'posts', {
    title: 'The Art of Plating',
    authorId: newUser.id,
  });

  // 3. UPDATE a record using the fluent API.
  let updatedPosts; // Type inferred as Post[]
  [state, updatedPosts] = db.update(state, 'posts')
    .set({ published: true })
    .where({ id: 1 });
  console.log('Post published:', updatedPosts[0]);

  // 4. WRITE the final state back to disk.
  await db.write(state);
  console.log('Database saved!');

  // 5. QUERY the data. Note that `db.query` also takes the state.
  const authorWithPosts = db.query(state)
    .from('users')
    .where({ id: newUser.id })
    .with({ posts: true }) // Eager-load the 'posts' relation
    .first();

  console.log('\n--- Final Query Result ---');
  console.log(JSON.stringify(authorWithPosts, null, 2));
}

main().catch(console.error);
```
*(For the alternative `on-demand` API style, see [Pillar III](#8-pillar-iii-cooking-the-fluent-api)).*

---

## 6. Pillar I: The Recipe (Schema Definition)

The `konro.createSchema` function is the heart of your application. It provides runtime validation and static types from one definition.

### The `konro.createSchema` Function

It accepts a single configuration object with two main keys: `tables` and `relations`.

### Defining Tables and Columns

Under the `tables` key, you define each table and its columns using Konro's helper functions. These helpers not only define the type but also allow for validation rules.

| Helper             | Description & Options                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `konro.id()`       | A managed, auto-incrementing integer primary key.                                      |
| `konro.uuid()`     | A managed, UUID string primary key.                                                    |
| `konro.string()`   | `{ unique, default, min, max, format: 'email' | 'uuid' | 'url' }`                        |
| `konro.number()`   | `{ unique, default, min, max, type: 'integer' }`                                       |
| `konro.boolean()`  | `{ default }`                                                                          |
| `konro.date()`     | `{ default }` (e.g., `() => new Date()`). Stored as an ISO string.                      |
| `konro.object()`   | Stores an arbitrary JSON object.                                                       |

### Defining Relationships

Under the `relations` key, you define how your tables connect. This centralized approach makes your data model easy to understand at a glance.

*   `konro.one(targetTable, options)`: Defines a `one-to-one` or `many-to-one` relationship. This is used on the table that holds the foreign key.
*   `konro.many(targetTable, options)`: Defines a `one-to-many` relationship. This is used on the table that is being pointed to.

The `options` object is `{ on: string, references: string }`.
*   `on`: The key on the **current** table.
*   `references`: The key on the **related** table.

### Inferring Static Types: The Magic

After creating your schema, you can export its inferred types directly from the `schema.types` property.

```typescript
export const mySchema = konro.createSchema({ /* ... */ });

// This is all you need to get full, relational static types.
export type User = typeof mySchema.types.users;
export type Post = typeof mySchema.types.posts;
```

---

## 7. Pillar II: The Kitchen (Database Context)

The database context is a pre-configured object that makes interacting with your data clean and convenient.

### Choosing a Storage Adapter

Konro ships with a flexible file adapter supporting multiple formats and strategies. You configure it when creating your `db` context using `createFileAdapter(options)`.

*   `format`: `'json' | 'yaml' | 'csv' | 'xlsx'` (required).
*   `single`: `{ filepath: string }`. Stores the entire database state in one monolithic file. Simple and atomic. **Only works with `json` and `yaml` in `in-memory` mode.**
*   `multi`: `{ dir: string }`. Stores each table in its own file within a directory. Great for organization and required for `on-demand` mode.
*   `mode`: `'in-memory'` (default) or `'on-demand'`. This is a crucial choice that affects performance and the API style.

### Data Access Modes: `in-memory` vs `on-demand`

| Mode           | How it Works                                                                                                    | API Style                                            | Best For                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **`in-memory`** (Default) | On `db.read()`, the entire database is loaded into a `state` object. All operations are pure functions on this object. `db.write(state)` saves it back. | Immutable: `(state, args) => [newState, result]` | Small-to-medium datasets. Fast queries. Guaranteed atomic writes.           |
| **`on-demand`** | Each operation (`insert`, `query`, `update`, etc.) reads from and writes to the filesystem directly. There is no manual `state` object to manage. | Async/Stateless: `async (args) => result`    | Larger datasets where memory is a concern. More granular I/O operations. |

**Important Constraints:**
*   `on-demand` mode **requires** the `multi: { dir: string }` file strategy.
*   `csv` and `xlsx` formats **require** `on-demand` mode. This is because they are non-relational by nature and store no database-level metadata.

### The `konro.createDatabase` Function

This function bundles your schema and adapter into a single, convenient `db` object. This object holds all the methods you'll need, and its API will automatically adapt based on the `mode` you selected in your adapter.

---

## 8. Pillar III: Cooking (The Fluent API)

Konro provides a fluent, chainable API for building and executing queries. The exact methods change slightly depending on your chosen access mode.

### Two API Styles: In-Memory vs. On-Demand

#### In-Memory (`in-memory`)
You explicitly manage the state. This is a pure, functional approach.
1.  **Read:** `let state = await db.read();`
2.  **Mutate:** `[state, result] = db.insert(state, ...);`
3.  **Write:** `await db.write(state);`

#### On-Demand (`on-demand`)
The state is managed internally. Every operation is `async` and handles its own I/O.
```typescript
// No state management needed. Each call is a transaction.
const newUser = await db.insert('users', { name: 'Chef Juna' });
const updated = await db.update('posts').set({ published: true }).where({ id: 1 });
const results = await db.query().from('users').all();
```

### Reading Data with `db.query()`

The query builder is almost identical in both modes, but terminal methods like `.all()` and `.first()` are **async** in `on-demand` mode.

```typescript
// In-Memory
const users = db.query(state).from('users').all();

// On-Demand
const users = await db.query().from('users').all();
```
The available methods are:
```typescript
db.query(state?) // state is omitted in on-demand mode
  .select(fields?)   // Optional: Pick specific fields. Fully typed!
  .from(tableName)  // Required: The table to query, e.g., 'users'
  .where(predicate) // Optional: Filter records.
  .with(relations)  // Optional: Eager-load relations, e.g., { posts: true }
  .limit(number)    // Optional: Limit the number of results
  .offset(number)   // Optional: Skip records for pagination
  .all();           // Returns T[] or Promise<T[]>

db.query(state?).from('users').where({ id: 1 }).first(); // Returns T | null or Promise<T | null>
```

### Advanced Queries with `.with()`

The `.with()` clause is a powerful tool for building complex, nested queries in a type-safe way. It works identically in both modes. Konro's type inference engine precisely understands your `.with()` clause and constructs an exact return type, so you can't accidentally access data you didn't ask for.

**1. Filtering Related Records**
```typescript
const userWithPublishedPosts = await db.query() // on-demand example
  .from('users')
  .where({ id: 1 })
  .with({
    posts: {
      where: (post) => post.published === true
    }
  })
  .first();
```

**2. Selecting Specific Fields from Relations**
```typescript
const userWithPostTitles = await db.query() // on-demand example
  .from('users')
  .where({ id: 1 })
  .with({
    posts: {
      select: {
        title: blogSchema.tables.posts.title,
      }
    }
  })
  .first();

// The type of `userWithPostTitles.posts` is now: { title: string; }[]
```

**3. Nested Eager-Loading**
```typescript
const postsWithAuthorsAndTheirPosts = await db.query()
  .from('posts')
  .with({
    author: {       // Load post's author
      with: {       // Then, from that author...
        posts: true // ...load all of their posts
      }
    }
  })
  .all();
```

**4. `select` and nested `with` are Mutually Exclusive**

Within a relation's option object, you can either use `select` to shape the output or `with` to load deeper relations, but not both.

### Aggregating Data

The `.aggregate()` terminator computes calculations like `count`, `sum`, `avg`, `min`, and `max`. It is also `async` in `on-demand` mode.

```typescript
// On-demand example
const stats = await db.query()
  .from('posts')
  .where({ published: true })
  .aggregate({
    postCount: konro.count(),
    // Assuming a 'views' number column on posts
    averageViews: konro.avg('views'),
  });

// stats is: { postCount: number; averageViews: number | null }
```

### Writing Data: `insert`, `update`, `delete`

Write operations clearly show the difference between the two modes.

| Operation | In-Memory (`(state, ...args) => [newState, result]`)                                | On-Demand (`(...args) => Promise<result>`)                                           |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `insert`  | `const [newState, newUser] = db.insert(state, 'users', { ... });`                    | `const newUser = await db.insert('users', { ... });`                                |
| `update`  | `const [newState, updated] = db.update(state, 'users').set({..}).where({..});`       | `const updated = await db.update('users').set({..}).where({..});`                    |
| `delete`  | `const [newState, deleted] = db.delete(state, 'users').where({..});`                 | `const deleted = await db.delete('users').where({..});`                              |

---

## 9. Advanced Concepts & Patterns

### Testing Your Logic

Testing is a major strength of Konro. Since the core operations are pure functions, you can test your business logic without touching the filesystem by using the `in-memory` API style.

```typescript
// my-logic.test.ts
import { db } from './db'; // Your pre-configured db context
import { assert } from 'chai';

describe('User Logic', () => {
  it('should create a user and a welcome post', () => {
    // 1. Arrange: Create a clean, in-memory initial state.
    let state = db.createEmptyState();

    // 2. Act: Call your application logic, passing and re-assigning state.
    let newUser;
    [state, newUser] = db.insert(state, 'users', { name: 'Test', email: 'test@test.com' });
    [state] = db.insert(state, 'posts', { title: 'Welcome!', authorId: newUser.id });

    // 3. Assert: Check the final state directly.
    const users = db.query(state).from('users').all();
    assert.equal(users.length, 1);
    assert.equal(users[0].name, 'Test');
  });
});
```

### Performance Considerations

Konro prioritizes data integrity, safety, and developer experience. Understanding the two access modes is key to performance.

*   **`in-memory` Mode:**
    *   **Pro:** Extremely fast queries, as all data is in RAM. Writes are atomic (the entire file is replaced), preventing corruption from partial writes.
    *   **Con:** Can consume significant memory for large datasets. Writing back a very large file can be slow.

*   **`on-demand` Mode:**
    *   **Pro:** Low initial memory usage. Write operations are granular (only the affected table file is changed), which can be faster.
    *   **Con:** Simple queries are fast. However, **relational queries** (using `.with()`) or **aggregations** will still load all required tables into memory for the duration of that single query. It is not a replacement for a true database server for complex, large-scale relational joins.

---

## 10. API Reference Cheatsheet

| Category       | Method / Function                     | Purpose                                          | Notes                                     |
| -------------- | ------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| **Schema**     | `konro.createSchema(def)`             | Defines the entire database structure.           |                                           |
|                | `konro.id/string/number/etc`          | Defines column types and validation rules.       |                                           |
|                | `konro.one/many(table, opts)`         | Defines relationships.                           |                                           |
| **DB Context** | `konro.createDatabase(opts)`          | Creates the main `db` context object.            | API changes based on adapter's `mode`.      |
|                | `createFileAdapter(opts)`             | Creates a file storage adapter. | `format`, `mode`, `single`/`multi` |
| **I/O**        | `db.read()`                           | Reads state from disk.                           | `in-memory` mode only.                    |
|                | `db.write(state)`                     | Writes state to disk.                            | `in-memory` mode only.                    |
|                | `db.createEmptyState()`               | Creates a fresh, empty `DatabaseState` object.   | Useful for testing.                       |
| **Data Ops**   | `db.query(state?)`                    | Starts a fluent read-query chain.                | `state` arg for `in-memory` mode only. Terminals are `async` in `on-demand`. |
|                | `db.insert(state?, ...)`              | Inserts records. Returns `[newState, result]` or `Promise<result>`. |                                           |
|                | `db.update(state?, ...)`              | Starts a fluent update chain.                    |                                           |
|                | `db.delete(state?, ...)`              | Starts a fluent delete chain.                    |                                           |

---

## 11. Roadmap

Konro is actively developed. Here are some features planned for the future:

*   **🚀 Performance Enhancements:**
    *   In-memory indexing for `on-demand` mode to speed up lookups without loading full tables.
    *   More efficient partial file updates for JSON/YAML formats.
*   **✨ Querying Power:**
    *   Support for more complex query operators (`$gt`, `$in`, `$like`, etc.) in `.where()`.
    *   Full-text search capabilities.
*   **🔧 Developer Experience:**
    *   A simple data migration system.
    *   A pluggable logging system for debugging queries.
    *   An adapter "decorator" for transparent data encryption at rest.

Have an idea? Please [open an issue](https://github.com/relaycoder/konro/issues) to discuss it!

---

## 12. Comparison to Other Libraries

| Feature          | `lowdb` (v3+)                                | **Konro**                                                                | `Prisma / Drizzle` (Full-scale ORMs) |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Paradigm**     | Simple Document Store                        | **Functional, Relational ORM**                                           | Client-Server ORMs                                                                |
| **Schema**       | Schema-less, manual types                    | **Type-First**, inferred static types                                    | Schema-first (via `.prisma` file or code)                                         |
| **API Style**    | Mutable (`db.data.push(...)`)                | **Immutable & Fluent** (`db.query(state)...`) or **Async** (`await db.query()...`) | Stateful Client (`prisma.user.create(...)`)                                       |
| **State Mgmt**   | Direct mutation                              | **Explicit state passing or Async I/O**               | Managed by the client instance                                                    |
| **Storage**      | JSON/YAML files                              | **JSON, YAML, CSV, XLSX (pluggable)**                                    | External databases (PostgreSQL, MySQL, etc.)                                      |
| **Best For**     | Quick scripts, simple configs                | **Local-first apps, CLIs, small servers needing safety and structure.**  | Production web applications with traditional client-server database architecture. |

---

## 13. Contributing

Konro is a community-driven project. Contributions are warmly welcome. Whether it's reporting a bug, suggesting a feature, improving the documentation, or submitting a pull request, your input is valuable. Please open an issue to discuss your ideas first.

## 14. License

[MIT](./LICENSE) © [relaycoder]
````

## File: package.json
````json
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
````

## File: src/adapter.ts
````typescript
import path from 'path';
import type {
  DatabaseState,
  KRecord,
  TableState,
  StorageAdapter,
  FileStorageAdapter,
  FileAdapterOptions,
  ColumnDefinition,
  SingleFileStrategy,
  MultiFileStrategy,
  PerRecordStrategy,
  KonroSchema,
  Serializer,
  FsProvider,
} from './types';
import { createEmptyState } from './operations';
import { getSerializer } from './utils/serializer.util';
import { defaultFsProvider, writeAtomic } from './fs';
import { KonroError, KonroStorageError } from './utils/error.util';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export function createFileAdapter(options: FileAdapterOptions & { mode: 'on-demand' }): FileStorageAdapter & { mode: 'on-demand' };
export function createFileAdapter(options: FileAdapterOptions & { mode?: 'in-memory' | undefined }): FileStorageAdapter & { mode: 'in-memory' };
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter;
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;
  const fs = options.fs ?? defaultFsProvider;
  const mode = options.mode ?? 'in-memory';

  if (options.perRecord && options.format !== 'json' && options.format !== 'yaml') {
    throw KonroError({ code: 'E105' });
  }

  const isTabular = options.format === 'csv' || options.format === 'xlsx';
  if (isTabular && (mode !== 'on-demand' || !options.multi)) {
    throw KonroError({ code: 'E106', format: options.format });
  }

  if (mode === 'on-demand' && options.single) {
    throw KonroError({ code: 'E104' });
  }

  const strategy = createStrategy(options, { fs, serializer, fileExtension, mode });

  return {
    options,
    fs,
    serializer,
    fileExtension,
    mode,
    ...strategy,
  } as FileStorageAdapter;
}

type FileStrategy = Pick<StorageAdapter, 'read' | 'write'>;
type StrategyContext = {
  fs: FsProvider;
  serializer: Serializer;
  fileExtension: string;
  mode: 'in-memory' | 'on-demand';
};

/** Chooses and creates the appropriate file strategy based on adapter options. */
function createStrategy(options: FileAdapterOptions, context: StrategyContext): FileStrategy {
  if (options.single) {
    return createSingleFileStrategy(options.single, context);
  }
  if (options.multi) {
    return createMultiFileStrategy(options.multi, context);
  }
  if (options.perRecord) {
    return createPerRecordStrategy(options.perRecord, context);
  }
  // This case should be prevented by the types, but as a safeguard:
  throw KonroError({ code: 'E107' });
}

/** Creates the strategy for reading/writing the entire database to a single file. */
function createSingleFileStrategy(options: SingleFileStrategy['single'], context: StrategyContext): FileStrategy {
  const { fs, serializer } = context;

  const parseFile = async <T>(filepath: string, schema?: Record<string, ColumnDefinition<unknown>>): Promise<T | undefined> => {
    const data = await fs.readFile(filepath);
    if (!data) return undefined;
    try {
      return serializer.parse<T>(data, schema);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw KonroStorageError({ code: 'E103', filepath, format: context.fileExtension.slice(1), details: message });
    }
  };

  return {
    read: async <S extends KonroSchema<any, any>>(schema: S) => {
      // We parse into a generic DatabaseState because the exact type is only known by the caller.
      const state = await parseFile<DatabaseState>(options.filepath);
      return (state ?? createEmptyState(schema)) as DatabaseState<S>;
    },
    write: (state: DatabaseState<any>) => writeAtomic(options.filepath, serializer.stringify(state), fs),
  };
}

/** Creates the strategy for reading/writing each table to its own file in a directory. */
function createMultiFileStrategy(options: MultiFileStrategy['multi'], context: StrategyContext): FileStrategy {
  const { fs, serializer, fileExtension } = context;
  const parseFile = async <T>(filepath: string, schema?: Record<string, ColumnDefinition<unknown>>): Promise<T | undefined> => {
    const data = await fs.readFile(filepath);
    if (!data) return undefined;
    try {
      return serializer.parse<T>(data, schema);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw KonroStorageError({ code: 'E103', filepath, format: fileExtension.slice(1), details: message });
    }
  };

  return {
    read: async <S extends KonroSchema<any, any>>(schema: S) => {
      await context.fs.mkdir(options.dir, { recursive: true });
      const state = createEmptyState(schema);
      await Promise.all(
        Object.keys(schema.tables).map(async (tableName) => {
          const filepath = path.join(options.dir, `${tableName}${context.fileExtension}`);
          const tableState = await parseFile<TableState>(filepath, schema.tables[tableName]);
          if (tableState) (state as any)[tableName] = tableState;
        })
      );
      return state;
    },
    write: async (state: DatabaseState<any>) => {
      await context.fs.mkdir(options.dir, { recursive: true });
      const writes = Object.entries(state).map(([tableName, tableState]) => {
        const filepath = path.join(options.dir, `${tableName}${context.fileExtension}`);
        return writeAtomic(filepath, context.serializer.stringify(tableState), context.fs);
      });
      await Promise.all(writes);
    },
  };
}

/** Creates the strategy for reading/writing each record to its own file. */
function createPerRecordStrategy(options: PerRecordStrategy['perRecord'], context: StrategyContext): FileStrategy {
  const { fs, serializer, fileExtension } = context;

  const parseFile = async <T>(filepath: string): Promise<T | undefined> => {
    const data = await fs.readFile(filepath);
    if (!data) return undefined;
    try {
      return serializer.parse<T>(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw KonroStorageError({ code: 'E103', filepath, format: context.fileExtension.slice(1), details: message });
    }
  };

  return {
    read: async <S extends KonroSchema<any, any>>(schema: S) => {
      await fs.mkdir(options.dir, { recursive: true });
      const state = createEmptyState(schema);
      await Promise.all(
        Object.keys(schema.tables).map(async (tableName) => {
          const tableDir = path.join(options.dir, tableName);
          const currentTableState = state[tableName as keyof typeof state];
          if (!currentTableState) return;

          await fs.mkdir(tableDir, { recursive: true });

          const metaContent = await fs.readFile(path.join(tableDir, '_meta.json')).catch(() => null);
          if (metaContent) currentTableState.meta = JSON.parse(metaContent);

          const files = await fs.readdir(tableDir);
          const recordFiles = files.filter((f) => !f.startsWith('_meta'));
          const records = (await Promise.all(recordFiles.map((file) => parseFile<KRecord>(path.join(tableDir, file))))).filter((r): r is KRecord => r != null);
          currentTableState.records = records as any;

          if (currentTableState.meta.lastId === 0) {
            const idColumn = Object.keys(schema.tables[tableName]).find((k) => schema.tables[tableName][k]?.options?._pk_strategy === 'auto-increment');
            if (idColumn) {
              currentTableState.meta.lastId = records.reduce((maxId: number, record: KRecord) => {
                const id = record[idColumn];
                return typeof id === 'number' && id > maxId ? id : maxId;
              }, 0);
            }
          }
        })
      );
      return state;
    },
    write: async (state: DatabaseState<any>, schema: KonroSchema<any, any>) => {
      await fs.mkdir(options.dir, { recursive: true });
      await Promise.all(Object.entries(state).map(async ([tableName, tableState]) => {
        const tableDir = path.join(options.dir, tableName as string);
        await fs.mkdir(tableDir, { recursive: true });
        await writeAtomic(path.join(tableDir, '_meta.json'), JSON.stringify(tableState.meta, null, 2), fs);

        const idColumn = Object.keys(schema.tables[tableName]).find((k) => schema.tables[tableName][k]?.dataType === 'id');
        if (!idColumn) throw KonroError({ code: 'E202', tableName });

        const currentFiles = new Set(tableState.records.map((r: KRecord) => `${r[idColumn]}${fileExtension}`));
        const existingFiles = (await fs.readdir(tableDir)).filter(f => !f.startsWith('_meta') && !f.endsWith(TEMP_FILE_SUFFIX));

        const recordWrites = tableState.records.map((r) => writeAtomic(path.join(tableDir, `${r[idColumn]}${fileExtension}`), serializer.stringify(r), fs));
        const recordDeletes = existingFiles.filter(f => !currentFiles.has(f)).map(f => fs.unlink(path.join(tableDir, f as string)));
        await Promise.all([...recordWrites, ...recordDeletes]);
      }));
    }
  };
}
````

## File: src/operations.ts
````typescript
import { randomUUID } from 'crypto';
import type {
  DatabaseState,
  KRecord,
  KonroSchema,
  RelationDefinition,
  WithClause,
  QueryDescriptor,
  AggregationDescriptor,
} from './types';
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
        if (!targetTableSchema) throw KonroError({ code: 'E201', tableName: relationDef.targetTable });

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
  if (!tableSchema) throw KonroError({ code: 'E201', tableName: descriptor.tableName });
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
      throw KonroError({ code: 'E203', aggType: aggDef.aggType });
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
  if (!oldTableState) throw KonroError({ code: 'E200', tableName });

  // To maintain immutability, we deep-clone only the table being modified.
  const tableState = structuredClone(oldTableState);
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) throw KonroError({ code: 'E201', tableName });
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
  if (!oldTableState) throw KonroError({ code: 'E200', tableName });

  const tableSchema = schema.tables[tableName];
  if (!tableSchema) {
    throw KonroError({ code: 'E201', tableName });
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
    const predicate = (record: KRecord) => sourceKeySet.has(record[targetKey] as any);

    if (relationDef.onDelete === 'CASCADE') {
      // Recursively delete
      const [newState, ] = _deleteImpl(nextState, schema, targetTable, predicate);
      nextState = newState as DatabaseState<S>;
    } else if (relationDef.onDelete === 'SET NULL') {
      // Update FK to null
      const [newState, ] = _updateImpl(nextState, schema, targetTable, { [targetKey]: null }, predicate);
      nextState = newState as DatabaseState<S>;
    }
  }

  return nextState;
}

export const _deleteImpl = (state: DatabaseState, schema: KonroSchema<any, any>, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError({ code: 'E200', tableName });
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) throw KonroError({ code: 'E201', tableName });

  const deletedAtColumn = Object.keys(tableSchema).find(key => tableSchema[key]?.options?._konro_sub_type === 'deletedAt');

  // Soft delete path
  if (deletedAtColumn) {
    // Use update implementation for soft-delete. It will also handle `updatedAt`.
    const [baseState, recordsToUpdate] = _updateImpl(
      state,
      schema,
      tableName,
      { [deletedAtColumn]: new Date() },
      (record) => !record[deletedAtColumn] && predicate(record)
    );

    if (recordsToUpdate.length === 0) return [state, []];
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
      throw KonroValidationError({ code: 'E300', value: String(value), columnName });
    }

    // Validate string constraints
    if (colDef.dataType === 'string' && typeof value === 'string') {
      // Min length
      if (options.min !== undefined && value.length < options.min) {
        throw KonroValidationError({ code: 'E301', value, columnName, min: options.min });
      }

      // Max length
      if (options.max !== undefined && value.length > options.max) {
        throw KonroValidationError({ code: 'E302', value, columnName, max: options.max });
      }

      // Format validation
      if (options.format === 'email' && !isValidEmail(value)) {
        throw KonroValidationError({ code: 'E303', value, columnName });
      }
    }

    // Validate number constraints
    if (colDef.dataType === 'number' && typeof value === 'number') {
      // Min value
      if (options.min !== undefined && value < options.min) {
        throw KonroValidationError({ code: 'E304', value, columnName, min: options.min });
      }

      // Max value
      if (options.max !== undefined && value > options.max) {
        throw KonroValidationError({ code: 'E305', value, columnName, max: options.max });
      }
    }
  }
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
````

## File: src/db.ts
````typescript
import path from 'path';
import type {
  AggregationDefinition,
  KonroSchema,
  StorageAdapter,
  FileStorageAdapter,
  DatabaseState,
  KRecord,
  TableState,
  QueryDescriptor,
  AggregationDescriptor,
  WithArgument,
  ResolveWith,
  ChainedQueryBuilder,
  QueryBuilder,
  UpdateBuilder,
  DeleteBuilder,
  InMemoryDbContext,
  OnDemandChainedQueryBuilder,
  OnDemandQueryBuilder,
  OnDemandUpdateBuilder,
  OnDemandDeleteBuilder,
  OnDemandDbContext,
  DbContext,
} from './types';
import {
  _queryImpl,
  _insertImpl,
  _updateImpl,
  _deleteImpl,
  createEmptyState as createEmptyStateImpl,
  _aggregateImpl,
} from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';
import { KonroError, KonroStorageError } from './utils/error.util';
import { writeAtomic } from './fs';

export type { InMemoryDbContext, OnDemandDbContext, DbContext };

// --- CORE LOGIC (STATELESS & PURE) ---

/**
 * A helper to normalize a predicate argument into a function.
 */
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

/**
 * Creates the core, stateless database operations.
 * These operations are pure functions that take a database state and return a new state,
 * forming the foundation for both in-memory and on-demand modes.
 */
function createCoreDbContext<S extends KonroSchema<any, any>>(schema: S) {
  const query = (state: DatabaseState<S>): QueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields as QueryDescriptor['select'] }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count: number) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count: number) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: (): TReturn[] => _queryImpl(state as DatabaseState, schema, currentDescriptor) as TReturn[],
        first: (): TReturn | null => (_queryImpl(state as DatabaseState, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as TReturn | null,
        aggregate: <TAggs extends Record<string, AggregationDefinition>>(aggregations: TAggs) => {
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as { [K in keyof TAggs]: number | null };
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
    set: (data: Partial<S['create'][T]>) => ({
      where: (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)): [DatabaseState<S>, S['base'][T][]] => {
        const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate));
        return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
    where: (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)): [DatabaseState<S>, S['base'][T][]] => {
      const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, schema, tableName as string, normalizePredicate(predicate));
      return [newState as DatabaseState<S>, deletedRecords as S['base'][T][]];
    },
  });

  return { query, insert, update, delete: del };
}

// --- ON-DEMAND CONTEXT (STATEFUL WRAPPER) ---

type CoreDbContext<S extends KonroSchema<any, any>> = ReturnType<typeof createCoreDbContext<S>>;

/** Defines the contract for file I/O operations in on-demand mode. */
interface OnDemandIO<S extends KonroSchema<any, any>> {
  getFullState(): Promise<DatabaseState<S>>;
  insert(core: CoreDbContext<S>, tableName: string, values: any): Promise<any>;
  update(core: CoreDbContext<S>, tableName: string, data: Partial<unknown>, predicate: (record: KRecord) => boolean): Promise<KRecord[]>;
  delete(core: CoreDbContext<S>, tableName: string, predicate: (record: KRecord) => boolean): Promise<KRecord[]>;
}

/**
 * Creates a generic, unified `OnDemandDbContext` from an I/O strategy.
 * This function is the key to removing duplication between 'multi-file' and 'per-record' modes.
 */
function createOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: StorageAdapter,
  core: CoreDbContext<S>,
  io: OnDemandIO<S>
): OnDemandDbContext<S> {
  const query = (): OnDemandQueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields as QueryDescriptor['select'] }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count: number) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count: number) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: async (): Promise<TReturn[]> => {
          const state = await io.getFullState();
          return _queryImpl(state, schema, currentDescriptor) as TReturn[];
        },
        first: async (): Promise<TReturn | null> => {
          const state = await io.getFullState();
          return (_queryImpl(state, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as TReturn | null;
        },
        aggregate: async <TAggs extends Record<string, AggregationDefinition>>(aggregations: TAggs) => {
          const state = await io.getFullState();
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state, schema, aggDescriptor) as { [K in keyof TAggs]: number | null };
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = <T extends keyof S['tables']>(tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]): Promise<any> =>
    io.insert(core, tableName as string, values);

  const update = <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
    set: (data: Partial<S['create'][T]>) => ({
      where: (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)) => io.update(core, tableName as string, data, normalizePredicate(predicate)) as Promise<S['base'][T][]>,
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)) => io.delete(core, tableName as string, normalizePredicate(predicate)) as Promise<S['base'][T][]>,
  });

  const notSupported = (methodName: string) => () => Promise.reject(KonroError({ code: 'E400', methodName }));

  return {
    schema,
    adapter,
    createEmptyState: () => createEmptyStateImpl(schema),
    read: notSupported('read'),
    write: notSupported('write'),
    query,
    insert,
    update,
    delete: del
  };
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

  // --- In-Memory Mode ---
  if (adapter.mode === 'in-memory') {
    return {
      ...core,
      schema, adapter,
      read: () => adapter.read(schema),
      write: (state) => adapter.write(state, schema),
      createEmptyState: () => createEmptyStateImpl(schema),
    } as InMemoryDbContext<S>;
  }

  // --- On-Demand Mode ---
  const fileAdapter = adapter as FileStorageAdapter; // We can be sure it's a FileStorageAdapter due to checks
  const { fs, serializer, fileExtension } = fileAdapter;

  // The `read` method from the adapter provides the canonical way to get the full state.
  const getFullState = (): Promise<DatabaseState<S>> => adapter.read(schema);
  
  // --- I/O Strategy for Multi-File ---
  const createMultiFileIO = (): OnDemandIO<S> => {
    const { dir } = fileAdapter.options.multi!;
    const getTablePath = (tableName: string) => path.join(dir, `${tableName}${fileExtension}`);

    const readTableState = async (tableName: string): Promise<TableState> => {
      const data = await fs.readFile(getTablePath(tableName));
      if (!data) return { records: [], meta: { lastId: 0 } };
      try {
        return serializer.parse(data, schema.tables[tableName]);
      } catch (e: any) {
        throw KonroStorageError({ code: 'E103', filepath: getTablePath(tableName), format: fileExtension.slice(1), details: e.message });
      }
    };

    const writeTableState = async (tableName: string, tableState: TableState): Promise<void> => {
      await fs.mkdir(dir, { recursive: true });
      await writeAtomic(getTablePath(tableName), serializer.stringify(tableState), fs);
    };

    return {
      getFullState,
      insert: async (core, tableName, values) => {
        const state = createEmptyStateImpl(schema);
        (state as any)[tableName] = await readTableState(tableName);
        const [newState, result] = core.insert(state, tableName as keyof S['tables'], values as any);
        await writeTableState(tableName, newState[tableName]!);
        return result;
      },
      update: async (core, tableName, data, predicate) => {
        const state = createEmptyStateImpl(schema);
        (state as any)[tableName] = await readTableState(tableName);
        const [newState, result] = core.update(state, tableName as keyof S["tables"]).set(data as any).where(predicate);
        if (result.length > 0) await writeTableState(tableName, newState[tableName]!);
        return result as any;
      },
      delete: async (core, tableName, predicate) => {
        const state = await getFullState(); // Cascades require full state
        const [newState, deletedRecords] = core.delete(state, tableName as keyof S["tables"]).where(predicate);
        const changedTables = Object.keys(newState).filter(k => newState[k as keyof typeof newState] !== state[k as keyof typeof state]);
        await Promise.all(changedTables.map(t => writeTableState(t, newState[t as keyof typeof newState]!)));
        return deletedRecords as any;
      },
    };
  };

  // --- I/O Strategy for Per-Record ---
  const createPerRecordIO = (): OnDemandIO<S> => {
    const { dir } = fileAdapter.options.perRecord!;
    const getTableDir = (tableName: string) => path.join(dir, tableName);
    const getRecordPath = (tableName: string, id: any) => path.join(getTableDir(tableName), `${id}${fileExtension}`);
    const getMetaPath = (tableName: string) => path.join(getTableDir(tableName), '_meta.json');
    const getIdColumn = (tableName: string) => {
      const col = Object.keys(schema.tables[tableName]).find(k => schema.tables[tableName][k]?.dataType === 'id');
      if (!col) throw KonroError({ code: 'E202', tableName });
      return col;
    };

    return {
      getFullState,
      insert: async (core, tableName, values) => {
        const metaContent = await fs.readFile(getMetaPath(tableName)).catch(() => null);
        const meta = metaContent ? JSON.parse(metaContent) : { lastId: 0 };
        const idCol = getIdColumn(tableName);

        // Perform insert without existing records for performance
        const [newState, inserted] = core.insert({ [tableName]: { records: [], meta } } as any, tableName as keyof S['tables'], values as any);
        const insertedArr = Array.isArray(inserted) ? inserted : (inserted ? [inserted] : []);
        if (insertedArr.length === 0) return inserted;

        // Write new records and update meta if it changed
        await fs.mkdir(getTableDir(tableName), { recursive: true });
        const newMeta = newState[tableName]?.meta;
        const promises = insertedArr.map((r) => writeAtomic(getRecordPath(tableName, r[idCol]), serializer.stringify(r), fs));
        if (newMeta && newMeta.lastId !== meta.lastId) {
          promises.push(writeAtomic(getMetaPath(tableName), JSON.stringify(newMeta, null, 2), fs));
        }
        await Promise.all(promises);
        return inserted;
      },
      update: async (core, tableName, data, predicate) => {
        const state = await getFullState(); // Update needs full table state for predicate
        const [newState, updated] = core.update(state, tableName as keyof S["tables"]).set(data as any).where(predicate);
        if (updated.length === 0) return updated as any;

        const idCol = getIdColumn(tableName);
        await Promise.all(updated.map((r: any) => writeAtomic(getRecordPath(tableName, r[idCol]), serializer.stringify(r), fs)));
        
        const newMeta = newState[tableName]?.meta;
        const oldMeta = state[tableName as keyof typeof state]?.meta;
        if (newMeta && JSON.stringify(newMeta) !== JSON.stringify(oldMeta)) {
            await writeAtomic(getMetaPath(tableName), JSON.stringify(newMeta, null, 2), fs);
        }
        return updated as any;
      },
      delete: async (core, tableName, predicate) => {
        const oldState = await getFullState();
        const [newState, deletedRecords] = core.delete(oldState, tableName as keyof S["tables"]).where(predicate);
        if (deletedRecords.length === 0) return deletedRecords as any;

        const changes = Object.keys(schema.tables).map(async tName => {
          const oldTState = oldState[tName as keyof typeof oldState]!;
          const newTState = newState[tName as keyof typeof newState]!;
          if (oldTState === newTState) return;

          const idCol = getIdColumn(tName);
          const oldMap = new Map(oldTState.records.map((r: any) => [r[idCol], r]));
          const newMap = new Map(newTState.records.map((r: any) => [r[idCol], r]));
          
          const promises: Promise<void>[] = [];
          if (JSON.stringify(oldTState.meta) !== JSON.stringify(newTState.meta)) {
            promises.push(fs.mkdir(getTableDir(tName), { recursive: true }).then(() =>
              writeAtomic(getMetaPath(tName), JSON.stringify(newTState.meta, null, 2), fs))
            );
          }
          newMap.forEach((rec, id) => {
            if (oldMap.get(id) !== rec) promises.push(writeAtomic(getRecordPath(tName, id), serializer.stringify(rec), fs));
          });
          oldMap.forEach((_rec, id) => {
            if (!newMap.has(id)) promises.push(fs.unlink(getRecordPath(tName, id)));
          });
          await Promise.all(promises);
        });

        await Promise.all(changes);
        return deletedRecords as any;
      },
    };
  };

  const io = fileAdapter.options.multi ? createMultiFileIO() : fileAdapter.options.perRecord ? createPerRecordIO() : null;
  if (!io) {
    throw KonroError({ code: 'E104' });
  }
  
  return createOnDemandDbContext(schema, adapter, core, io);
}
````

## File: src/schema.ts
````typescript
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

import type {
  KonroSchema,
  ColumnDefinition,
  OneRelationDefinition,
  ManyRelationDefinition,
  AggregationDefinition
} from './types';

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
    relations?: (tables: TDef['tables']) => Record<string, Record<string, OneRelationDefinition | ManyRelationDefinition>>;
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
export const object = <T extends Record<string, unknown>>(options?: { default?: T | (() => T) }): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options });


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
````

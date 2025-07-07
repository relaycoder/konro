# Directory Structure
```
src/
  utils/
    constants.ts
    error.util.ts
    fs.util.ts
    predicate.util.ts
    serializer.util.ts
  adapter.ts
  db.ts
  index.ts
  operations.ts
  schema.ts
  types.ts
package.json
tsconfig.json
```

# Files

## File: src/utils/constants.ts
```typescript
export const TEMP_FILE_SUFFIX = '.tmp';
```

## File: src/utils/error.util.ts
```typescript
// Per user request: no classes. Using factory functions for errors.
const createKonroError = (name: string) => (message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

/** Base class for all Konro-specific errors. */
export const KonroError = createKonroError('KonroError');

/** Thrown for storage adapter-related issues. */
export const KonroStorageError = createKonroError('KonroStorageError');

/** Thrown for schema validation errors. */
export const KonroValidationError = createKonroError('KonroValidationError');

/** Thrown when a resource is not found. */
export const KonroNotFoundError = createKonroError('KonroNotFoundError');
```

## File: src/utils/fs.util.ts
```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './constants';

export const readFile = async (filepath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filepath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const writeAtomic = async (filepath: string, content: string): Promise<void> => {
    // Adding Date.now() for uniqueness in case of concurrent operations
    const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(tempFilepath, content, 'utf-8');
    await fs.rename(tempFilepath, filepath);
};
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

## File: src/utils/serializer.util.ts
```typescript
import { KonroStorageError } from './error.util';

let yaml: { parse: (str: string) => unknown; stringify: (obj: any, options?: any) => string; } | undefined;
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
    // The cast from `unknown` is necessary as `yaml.parse` is correctly typed to return `unknown`.
    parse: <T>(data: string): T => yaml.parse(data) as T,
    stringify: (obj: any): string => yaml.stringify(obj),
  };
};
```

## File: src/index.ts
```typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, string, number, boolean, date, object, one, many } from './schema';

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
  string,
  number,
  boolean,
  date,
  object,
  // --- Relationship Definition Helpers ---
  one,
  many,
};
```

## File: src/types.ts
```typescript
/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState = {
  [tableName: string]: {
    records: KRecord[];
    meta: {
      lastId: number;
    };
  };
};

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;
```

## File: package.json
```json
{
  "name": "konro-db",
  "module": "src/index.ts",
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9"
  },
  "peerDependencies": {
    "typescript": "^5.0.0",
    "js-yaml": "^4.1.0"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
      "optional": true
    }
  }
}
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
    "jsx": "react-jsx",
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
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist/**/*"]
}
```

## File: src/schema.ts
```typescript
// --- TYPE UTILITIES ---
type Pretty<T> = { [K in keyof T]: T[K] } & {};

// --- CORE DEFINITIONS ---

export interface ColumnOptions<T> {
  unique?: boolean;
  default?: T | (() => T);
}

export interface StringColumnOptions extends ColumnOptions<string> {
  min?: number;
  max?: number;
  format?: 'email' | 'uuid' | 'url';
}

export interface NumberColumnOptions extends ColumnOptions<number> {
  min?: number;
  max?: number;
  type?: 'integer';
}

export interface ColumnDefinition<T> {
  _type: 'column';
  dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  options?: ColumnOptions<T>;
  _tsType: T; // For TypeScript inference only
}

export interface RelationDefinition {
  _type: 'relation';
  relationType: 'one' | 'many';
  targetTable: string;
  on: string;
  references: string;
}

// --- TYPE INFERENCE MAGIC ---

type BaseModels<TTables extends Record<string, Record<string, ColumnDefinition<any>>>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: TTables[TableName][ColumnName]['_tsType'];
  };
};

type WithRelations<
  TBaseModels extends Record<string, any>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> = {
    [TableName in keyof TBaseModels]: TBaseModels[TableName] & (TableName extends keyof TRelations ? {
      [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName]['relationType'] extends 'one'
      ? TBaseModels[TRelations[TableName][RelationName]['targetTable']] | null
      : TBaseModels[TRelations[TableName][RelationName]['targetTable']][];
    } : {});
  };

export interface KonroSchema<
  TTables extends Record<string, Record<string, ColumnDefinition<any>>>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> {
  tables: TTables;
  relations: TRelations;
  types: Pretty<WithRelations<BaseModels<TTables>, TRelations>>;
}

// --- SCHEMA HELPERS ---

export const id = (): ColumnDefinition<number> => ({ _type: 'column', dataType: 'id', options: { unique: true }, _tsType: 0 });
export const string = (options?: StringColumnOptions): ColumnDefinition<string> => ({ _type: 'column', dataType: 'string', options, _tsType: '' });
export const number = (options?: NumberColumnOptions): ColumnDefinition<number> => ({ _type: 'column', dataType: 'number', options, _tsType: 0 });
export const boolean = (options?: ColumnOptions<boolean>): ColumnDefinition<boolean> => ({ _type: 'column', dataType: 'boolean', options, _tsType: false });
export const date = (options?: ColumnOptions<Date>): ColumnDefinition<Date> => ({ _type: 'column', dataType: 'date', options, _tsType: new Date() });
export const object = <T extends Record<string, any>>(options?: ColumnOptions<T>): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options, _tsType: {} as T });

export const one = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'one', targetTable, ...options });
export const many = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'many', targetTable, ...options });

// --- SCHEMA BUILDER ---

type SchemaInputDef<T> = {
  tables: T;
  relations?: (tables: T) => Record<string, Record<string, RelationDefinition>>;
};

export function createSchema<const TDef extends SchemaInputDef<Record<string, Record<string, ColumnDefinition<any>>>>>(definition: TDef) {
  const relations = definition.relations ? definition.relations(definition.tables) : {};
  return {
    tables: definition.tables,
    relations,
    types: null as any, // This is a runtime placeholder for the inferred types
  } as KonroSchema<
    TDef['tables'],
    TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}
  >;
}
```

## File: src/adapter.ts
```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';
import { getSerializer } from './utils/serializer.util';
import { readFile, writeAtomic } from './utils/fs.util';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export interface StorageAdapter {
  read(schema: KonroSchema<any, any>): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; };
type MultiFileStrategy = { multi: { dir: string }; single?: never; };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
} & (SingleFileStrategy | MultiFileStrategy);

export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;

  const readSingle = async (schema: KonroSchema<any, any>): Promise<DatabaseState> => {
    const filepath = options.single!.filepath;
    const data = await readFile(filepath);
    return data ? serializer.parse<DatabaseState>(data) : createEmptyState(schema);
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
      const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
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
```

## File: src/db.ts
```typescript
import { KonroSchema } from './schema';
import { StorageAdapter } from './adapter';
import { DatabaseState, KRecord } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE-SAFE FLUENT API BUILDERS ---

interface ChainedQueryBuilder<T> {
  where(predicate: Partial<T> | ((record: T) => boolean)): this;
  with(relations: QueryDescriptor['with']): this;
  limit(count: number): this;
  offset(count: number): this;
  all(): Promise<T[]>;
  first(): Promise<T | null>;
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]>;
}

interface UpdateBuilder<T> {
  set(data: Partial<T>): {
    where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState, T[]];
  };
}

interface DeleteBuilder<T> {
  where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState, T[]];
}

export interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
  createEmptyState(): DatabaseState;

  query(state: DatabaseState): QueryBuilder<S>;
  insert<T extends keyof S['types']>(state: DatabaseState, tableName: T, values: S['types'][T] | Readonly<S['types'][T]>[]): [DatabaseState, S['types'][T] | S['types'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState, tableName: T): UpdateBuilder<S['types'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState, tableName: T): DeleteBuilder<S['types'][T]>;
}

export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
  const { schema, adapter } = options;

  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (state, tableName, values) => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state, schema, tableName as string, valsArray as KRecord[]);
      const result = Array.isArray(values) ? inserted : inserted[0];
      return [newState, result] as [DatabaseState, S['types'][typeof tableName] | S['types'][typeof tableName][]];
    },

    query: (state: DatabaseState): QueryBuilder<S> => ({
      from: <T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]> => {
        const descriptor: QueryDescriptor = { tableName: tableName as string };

        const builder: ChainedQueryBuilder<S['types'][T]> = {
          where: (predicate) => {
            descriptor.where = normalizePredicate(predicate);
            return builder;
          },
          with: (relations) => {
            descriptor.with = relations;
            return builder;
          },
          limit: (count) => {
            descriptor.limit = count;
            return builder;
          },
          offset: (count) => {
            descriptor.offset = count;
            return builder;
          },
          all: async () => _queryImpl(state, schema, descriptor) as S['types'][T][],
          first: async () => (_queryImpl(state, schema, { ...descriptor, limit: 1 })[0] ?? null) as S['types'][T] | null,
        };
        return builder;
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState, tableName: T): UpdateBuilder<S['types'][T]> => ({
      set: (data) => ({
        where: (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate));
          return [newState, updatedRecords as S['types'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState, tableName: T): DeleteBuilder<S['types'][T]> => ({
      where: (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state, tableName as string, normalizePredicate(predicate));
        return [newState, deletedRecords as S['types'][T][]];
      },
    }),
  };
};
```

## File: src/operations.ts
```typescript
import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition } from './schema';
import { KonroError } from './utils/error.util';

// --- HELPERS ---


/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = (schema: KonroSchema<any, any>): DatabaseState => {
  const state: DatabaseState = {};
  for (const tableName in schema.tables) {
    state[tableName] = { records: [], meta: { lastId: 0 } };
  }
  return state;
};

// --- QUERY ---

export interface QueryDescriptor {
  tableName: string;
  where?: (record: KRecord) => boolean;
  with?: Record<string, boolean | { where?: (record: KRecord) => boolean }>;
  limit?: number;
  offset?: number;
}

export const _queryImpl = (state: DatabaseState, schema: KonroSchema<any, any>, descriptor: QueryDescriptor): KRecord[] => {
  const tableState = state[descriptor.tableName];
  if (!tableState) return [];

  // 1. Filter
  let results = descriptor.where ? tableState.records.filter(descriptor.where) : [...tableState.records];

  // 2. Eager load relations (`with`)
  if (descriptor.with) {
    results = structuredClone(results); // Clone to avoid mutating state
    for (const record of results) {
      for (const relationName in descriptor.with) {
        const relationDef = schema.relations[descriptor.tableName]?.[relationName];
        if (!relationDef) continue;

        const relatedRecords = findRelatedRecords(state, record, relationDef);

        const withOpts = descriptor.with[relationName];
        const nestedWhere = typeof withOpts === 'object' ? withOpts.where : undefined;

        const filteredRelatedRecords = nestedWhere ? relatedRecords.filter(nestedWhere) : relatedRecords;
        if (relationDef.relationType === 'one') {
          record[relationName] = filteredRelatedRecords[0] ?? null;
        } else {
          record[relationName] = filteredRelatedRecords;
        }
      }
    }
  }

  // 3. Paginate
  const offset = descriptor.offset ?? 0;
  const limit = descriptor.limit ?? results.length;
  return results.slice(offset, offset + limit);
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


// --- INSERT ---

export const _insertImpl = (state: DatabaseState, schema: KonroSchema<any, any>, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const tableSchema = schema.tables[tableName];
  const insertedRecords: KRecord[] = [];

  for (const value of values) {
    const newRecord: KRecord = { ...value };
    // Handle IDs and defaults
    for (const colName in tableSchema) {
      const colDef = tableSchema[colName];
      if (colDef.dataType === 'id') {
        tableState.meta.lastId++;
        newRecord[colName] = tableState.meta.lastId;
      }
      if (newRecord[colName] === undefined && colDef.options?.default !== undefined) {
        newRecord[colName] = typeof colDef.options.default === 'function' ? colDef.options.default() : colDef.options.default;
      }
    }
    tableState.records.push(newRecord);
    insertedRecords.push(newRecord);
  }

  return [newState, insertedRecords];
};

// --- UPDATE ---

export const _updateImpl = (state: DatabaseState, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const updatedRecords: KRecord[] = [];

  tableState.records = tableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...data };
      updatedRecords.push(updatedRecord);
      return updatedRecord;
    }
    return record;
  });

  return [newState, updatedRecords];
};


// --- DELETE ---

export const _deleteImpl = (state: DatabaseState, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const deletedRecords: KRecord[] = [];

  const keptRecords = tableState.records.filter(record => {
    if (predicate(record)) {
      deletedRecords.push(record);
      return false;
    }
    return true;
  });

  tableState.records = keptRecords;
  return [newState, deletedRecords];
};
```

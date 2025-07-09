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
test/unit/Schema/ColumnHelpers.test.ts
test/util.ts
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

## File: src/index.ts
```typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, uuid, string, number, boolean, date, object, one, many, count, sum, avg, min, max } from './schema';

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

## File: src/utils/serializer.util.ts
```typescript
import { KonroStorageError } from './error.util';

let yaml: { load: (str: string) => unknown; dump: (obj: any, options?: any) => string; } | undefined;
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
    // The cast from `unknown` is necessary as `yaml.load` is correctly typed to return `unknown`.
    parse: <T>(data: string): T => yaml.load(data) as T,
    stringify: (obj: any): string => yaml.dump(obj),
  };
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

## File: test/unit/Schema/ColumnHelpers.test.ts
```typescript
import { describe, it, expect } from 'bun:test';
import { konro } from '../../../src/index';

describe('Unit > Schema > ColumnHelpers', () => {
  it('should create a valid ID column definition object when calling konro.id()', () => {
    const idCol = konro.id();
    expect(idCol).toEqual({
      _type: 'column',
      dataType: 'id',
      options: { unique: true },
      _tsType: 0,
    });
  });

  it('should create a valid string column definition with no options', () => {
    const stringCol = konro.string();
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: undefined,
      _tsType: '',
    });
  });

  it('should create a valid string column definition with all specified options', () => {
    const defaultFn = () => 'default';
    const stringCol = konro.string({
      unique: true,
      default: defaultFn,
      min: 5,
      max: 100,
      format: 'email',
    });
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: {
        unique: true,
        default: defaultFn,
        min: 5,
        max: 100,
        format: 'email',
      },
      _tsType: '',
    });
  });

  it('should create a valid number column definition with no options', () => {
    const numberCol = konro.number();
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: undefined,
      _tsType: 0,
    });
  });

  it('should create a valid number column definition with all specified options', () => {
    const numberCol = konro.number({
      unique: false,
      default: 0,
      min: 0,
      max: 1000,
      type: 'integer',
    });
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: {
        unique: false,
        default: 0,
        min: 0,
        max: 1000,
        type: 'integer',
      },
      _tsType: 0,
    });
  });

  it('should create a valid boolean column with no options', () => {
    const boolCol = konro.boolean();
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: undefined,
      _tsType: false,
    });
  });

  it('should create a valid boolean column definition with a default value', () => {
    const boolCol = konro.boolean({ default: false });
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: { default: false },
      _tsType: false,
    });
  });

  it('should create a valid date column definition with no options', () => {
    const dateCol = konro.date();
    expect(dateCol).toEqual({
      _type: 'column',
      dataType: 'date',
      options: undefined,
      _tsType: expect.any(Date),
    });
  });

  it('should create a valid date column definition with a default function', () => {
    const defaultDateFn = () => new Date();
    const dateCol = konro.date({ default: defaultDateFn });
    expect(dateCol).toEqual({
      _type: 'column',
      dataType: 'date',
      options: { default: defaultDateFn },
      _tsType: expect.any(Date),
    });
    expect(dateCol.options?.default).toBe(defaultDateFn);
  });

  it('should create a valid string column with a literal default', () => {
    const stringCol = konro.string({ default: 'hello' });
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: { default: 'hello' },
      _tsType: '',
    });
  });

  it('should create a valid number column with a function default', () => {
    const defaultFn = () => 42;
    const numberCol = konro.number({ default: defaultFn });
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: {
        default: defaultFn,
      },
      _tsType: 0,
    });
    expect(numberCol.options?.default).toBe(defaultFn);
  });

  it('should create a valid boolean column with a function default', () => {
    const defaultFn = () => true;
    const boolCol = konro.boolean({ default: defaultFn });
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: {
        default: defaultFn,
      },
      _tsType: false,
    });
    expect(boolCol.options?.default).toBe(defaultFn);
  });

  it('should create a valid object column definition', () => {
    const objCol = konro.object<{ meta: string }>();
    expect(objCol).toMatchObject({
      _type: 'column',
      dataType: 'object',
      options: undefined,
    });
  });
});
```

## File: test/util.ts
```typescript
import { konro } from '../src/index';
import { promises as fs } from 'fs';
import path from 'path';

export const TEST_DIR = path.join(__dirname, 'test_run_data');

// --- Schema Definition ---

const tables = {
  users: {
    id: konro.id(),
    name: konro.string({ min: 2 }),
    email: konro.string({ unique: true, format: 'email' }),
    age: konro.number({ min: 18, type: 'integer' }),
    isActive: konro.boolean({ default: true }),
  },
  posts: {
    id: konro.id(),
    title: konro.string(),
    content: konro.string(),
    authorId: konro.number(),
    publishedAt: konro.date({ default: () => new Date() }),
  },
  profiles: {
    id: konro.id(),
    bio: konro.string(),
    userId: konro.number({ unique: true }),
  },
  tags: {
    id: konro.id(),
    name: konro.string({ unique: true }),
  },
  posts_tags: {
    id: konro.id(),
    postId: konro.number(),
    tagId: konro.number(),
  },
};

export const schemaDef = {
  tables,
  relations: (_tables: typeof tables) => ({
    users: {
      posts: konro.many('posts', { on: 'id', references: 'authorId' }),
      profile: konro.one('profiles', { on: 'id', references: 'userId' }),
    },
    posts: {
      author: konro.one('users', { on: 'authorId', references: 'id' }),
      tags: konro.many('posts_tags', { on: 'id', references: 'postId' }),
    },
    profiles: {
      user: konro.one('users', { on: 'userId', references: 'id' }),
    },
    posts_tags: {
      post: konro.one('posts', { on: 'postId', references: 'id' }),
      tag: konro.one('tags', { on: 'tagId', references: 'id' }),
    }
  }),
};

export const testSchema = konro.createSchema(schemaDef);

export type UserCreate = typeof testSchema.create.users;

// --- Test Utilities ---

export const cleanup = async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('Error during cleanup:', error);
    }
  }
};

export const ensureTestDir = async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
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
    "@typescript-eslint/eslint-plugin": "^8.36.0",
    "@typescript-eslint/parser": "^8.36.0",
    "eslint": "^9.30.1",
    "tsup": "^8.5.0",
    "typescript": "^5.5.4"
  },
  "peerDependencies": {
    "js-yaml": "^4.1.0",
    "typescript": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
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

  // 1. Filter
  let results = descriptor.where ? tableState.records.filter(descriptor.where) : [...tableState.records];

  // 2. Eager load relations (`with`)
  if (descriptor.with) {
    results = _processWith(results, descriptor.tableName, descriptor.with, schema, state);
  }

  // 3. Paginate
  const offset = descriptor.offset ?? 0;
  const limit = descriptor.limit ?? results.length;
  let paginatedResults = results.slice(offset, offset + limit);

  // 4. Select Fields
  if (descriptor.select) {
    const tableSchema = schema.tables[descriptor.tableName];
    const relationsSchema = schema.relations[descriptor.tableName] ?? {};
    if (!tableSchema) throw KonroError(`Schema for table "${descriptor.tableName}" not found.`);

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

export const _deleteImpl = (state: DatabaseState, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const deletedRecords: KRecord[] = [];

  const keptRecords = oldTableState.records.filter(record => {
    if (predicate(record)) {
      deletedRecords.push(record);
      return false;
    }
    return true;
  });

  if (deletedRecords.length === 0) {
    return [state, []];
  }

  const tableState = { ...oldTableState, records: keptRecords };
  const newState = { ...state, [tableName]: tableState };
  return [newState, deletedRecords];
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
import { DatabaseState, KRecord } from './types';
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

// --- DATABASE FACTORY ---

function createInMemoryDbContext<S extends KonroSchema<any, any>>(
  options: { schema: S; adapter: StorageAdapter }
): InMemoryDbContext<S> {
  const { schema, adapter } = options;
  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (<T extends keyof S['tables']>(
      state: DatabaseState<S>,
      tableName: T,
      values: S['create'][T] | Readonly<S['create'][T]>[]
    ): [DatabaseState<S>, S['base'][T] | S['base'][T][]] => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state as DatabaseState, schema, tableName as string, valsArray as KRecord[]);
      const result = Array.isArray(values) ? inserted : inserted[0];
      return [newState as DatabaseState<S>, result] as [DatabaseState<S>, S['base'][T] | S['base'][T][]];
    }) as InMemoryDbContext<S>['insert'],

    query: (state: DatabaseState<S>): QueryBuilder<S> => ({
      from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
        const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
          select(fields) {
            return createBuilder<TReturn>({ ...currentDescriptor, select: fields });
          },
          where(predicate) {
            return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) });
          },
          with<W extends WithArgument<S['types'][TName]>>(relations: W) {
            const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
            return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
          },
          limit(count) {
            return createBuilder<TReturn>({ ...currentDescriptor, limit: count });
          },
          offset(count) {
            return createBuilder<TReturn>({ ...currentDescriptor, offset: count });
          },
          all: (): TReturn[] => _queryImpl(state as DatabaseState, schema, currentDescriptor) as any,
          first: (): TReturn | null => (_queryImpl(state as DatabaseState, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any,
          aggregate: (aggregations) => {
            const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
            return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as any;
          },
        });
        return createBuilder<S['base'][TName]>({ tableName: tableName as string });
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]> => ({
      set: (data) => ({
        where: (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as any));
          return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
      where: (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as any));
        return [newState as DatabaseState<S>, deletedRecords as S['base'][T][]];
      },
    }),
  };
}

function createOnDemandDbContext<S extends KonroSchema<any, any>>(
  options: { schema: S, adapter: FileStorageAdapter }
): OnDemandDbContext<S> {
  const { schema, adapter } = options;
  const dir = adapter.options.multi!.dir;

  // Helper to read/write a single table file
  const readTable = async (tableName: string): Promise<{ records: KRecord[], meta: { lastId: number } }> => {
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const data = await adapter.fs.readFile(filepath);
    if (!data) return { records: [], meta: { lastId: 0 } };
    try {
      return adapter.serializer.parse(data);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${adapter.options.format} file. Original error: ${e.message}`);
    }
  };

  const writeTable = async (tableName: string, tableState: { records: KRecord[], meta: { lastId: number } }): Promise<void> => {
    await adapter.fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const content = adapter.serializer.stringify(tableState);
    await writeAtomic(filepath, content, adapter.fs);
  };
  
  const getFullState = async (): Promise<DatabaseState> => {
    const state = createEmptyStateImpl(schema);
    for (const tableName in schema.tables) {
      (state as any)[tableName] = await readTable(tableName);
    }
    return state;
  }

  const notSupported = () => Promise.reject(KonroError("This method is not supported in 'on-demand' mode."));

  return {
    schema,
    adapter,
    read: notSupported,
    write: notSupported,
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (async <T extends keyof S['tables']>(
      tableName: T,
      values: S['create'][T] | Readonly<S['create'][T]>[]
    ): Promise<S['base'][T] | S['base'][T][]> => {
      const state = await getFullState(); // Read only the tables involved later
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state, schema, tableName as string, valsArray as KRecord[]);
      const tableState = newState[tableName as string];
      if (tableState) {
        await writeTable(tableName as string, tableState);
      }
      const result = Array.isArray(values) ? inserted : inserted[0];
      return result as any;
    }) as OnDemandDbContext<S>['insert'],

    query: (): OnDemandQueryBuilder<S> => ({
      from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
        const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
          select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
          where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
          with<W extends WithArgument<S['types'][TName]>>(relations: W) {
            const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
            return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
          },
          limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
          offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
          all: async (): Promise<TReturn[]> => {
            const state = await getFullState(); // Inefficient, but required for relations. Future optimization: only load tables in query.
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
    }),

    update: <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
      set: (data: Partial<S['create'][T]>) => ({
        where: async (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)) => {
          const state = await getFullState();
          const [newState, updatedRecords] = _updateImpl(state, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as any));
          if (updatedRecords.length > 0) {
            const tableState = newState[tableName as string];
            if (tableState) {
              await writeTable(tableName as string, tableState);
            }
          }
          return updatedRecords as S['base'][T][];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
      where: async (predicate: Partial<S['base'][T]> | ((record: S['base'][T]) => boolean)) => {
        const state = await getFullState();
        const [newState, deletedRecords] = _deleteImpl(state, tableName as string, normalizePredicate(predicate as any));
        if (deletedRecords.length > 0) {
          const tableState = newState[tableName as string];
          if (tableState) {
            await writeTable(tableName as string, tableState);
          }
        }
        return deletedRecords as S['base'][T][];
      },
    }),
  };
}


export function createDatabase<
  S extends KonroSchema<any, any>,
  TAdapter extends StorageAdapter,
>(
  options: { schema: S; adapter: TAdapter }
): TAdapter['mode'] extends 'on-demand' ? OnDemandDbContext<S> : InMemoryDbContext<S>;
export function createDatabase<S extends KonroSchema<any, any>>(
  options: { schema: S; adapter: StorageAdapter }
): DbContext<S> {
  const { adapter } = options;

  if (adapter.mode === 'on-demand') {
    // We can be reasonably sure it's a FileStorageAdapter due to the checks in createFileAdapter
    return createOnDemandDbContext(options as { schema: S; adapter: FileStorageAdapter });
  }

  return createInMemoryDbContext(options);
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
/** A date column, stored as an ISO string but hydrated as a Date object. */
export const date = (options?: { default?: Date | (() => Date) }) => createColumn<Date>('date', options, new Date());
/** A column for storing arbitrary JSON objects, with a generic for type safety. */
export const object = <T extends Record<string, any>>(options?: { default?: T | (() => T) }): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options });


// --- RELATIONSHIP DEFINITION HELPERS ---

/** Defines a `one-to-one` or `many-to-one` relationship. */
export const one = <T extends string>(targetTable: T, options: { on: string; references: string }): OneRelationDefinition & { targetTable: T } => ({
  _type: 'relation',
  relationType: 'one',
  targetTable,
  ...options,
});

/** Defines a `one-to-many` relationship. */
export const many = <T extends string>(targetTable: T, options: { on: string; references: string }): ManyRelationDefinition & { targetTable: T } => ({
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

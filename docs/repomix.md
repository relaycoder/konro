# Directory Structure
```
package.json
src/adapter.ts
src/db.ts
src/fs.ts
src/operations.ts
src/schema.ts
tsconfig.build.json
tsconfig.json
```

# Files

## File: tsconfig.build.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist/**/*", "test/**/*"]
}
```

## File: src/fs.ts
```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './utils/constants';
import type { FsProvider } from './types';
⋮----
export const writeAtomic = async (
  filepath: string,
  content: string,
  fsProvider: FsProvider,
): Promise<void> =>
⋮----
// Adding Date.now() for uniqueness in case of concurrent operations
```

## File: tsconfig.json
```json
{
  "compilerOptions": {
    // Environment setup & latest features
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "allowJs": true,
    "allowSyntheticDefaultImports": true,

    // Output configuration
    "moduleResolution": "node",
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    // Some stricter flags
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist/**/*"]
}
```

## File: src/adapter.ts
```typescript
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
⋮----
export function createFileAdapter(options: FileAdapterOptions &
⋮----
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter;
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter
⋮----
type FileStrategy = Pick<StorageAdapter, 'read' | 'write'>;
type StrategyContext = {
  fs: FsProvider;
  serializer: Serializer;
  fileExtension: string;
  mode: 'in-memory' | 'on-demand';
};
⋮----
/** Chooses and creates the appropriate file strategy based on adapter options. */
function createStrategy(options: FileAdapterOptions, context: StrategyContext): FileStrategy
⋮----
// This case should be prevented by the types, but as a safeguard:
⋮----
/** Creates the strategy for reading/writing the entire database to a single file. */
function createSingleFileStrategy(options: SingleFileStrategy['single'], context: StrategyContext): FileStrategy
⋮----
const parseFile = async <T>(filepath: string, schema?: Record<string, ColumnDefinition<unknown>>): Promise<T | undefined> =>
⋮----
// We parse into a generic DatabaseState because the exact type is only known by the caller.
⋮----
/** Creates the strategy for reading/writing each table to its own file in a directory. */
function createMultiFileStrategy(options: MultiFileStrategy['multi'], context: StrategyContext): FileStrategy
⋮----
/** Creates the strategy for reading/writing each record to its own file. */
function createPerRecordStrategy(options: PerRecordStrategy['perRecord'], context: StrategyContext): FileStrategy
```

## File: src/operations.ts
```typescript
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
⋮----
// --- HELPERS ---
⋮----
/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = <S extends KonroSchema<any, any>>(schema: S): DatabaseState<S> =>
⋮----
// This is a controlled cast, safe because we are iterating over the schema's tables.
⋮----
// --- QUERY ---
⋮----
const _processWith = <S extends KonroSchema<any, any>>(
  recordsToProcess: KRecord[],
  currentTableName: string,
  withClause: WithClause,
  schema: S,
  state: DatabaseState
): KRecord[] =>
⋮----
// structuredClone is important to avoid mutating the records from the previous recursion level or the main state.
⋮----
// Skip if the value is `false` or something not truthy (though types should prevent this)
⋮----
// Recursively process deeper relations first
⋮----
// Then, apply select on the (potentially already processed) related records
⋮----
// nested with() does not support selecting relations, only columns, as per spec.
⋮----
// Finally, attach the results to the parent record
⋮----
export const _queryImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, descriptor: QueryDescriptor): KRecord[] =>
⋮----
// 1. Filter
⋮----
// Auto-filter soft-deleted records unless opted-out
⋮----
// 2. Eager load relations (`with`) - must happen after filtering
⋮----
// 3. Paginate
⋮----
// 4. Select Fields
⋮----
const findRelatedRecords = (state: DatabaseState, record: KRecord, relationDef: RelationDefinition) =>
⋮----
// one-to-many: 'on' is PK on current table, 'references' is FK on target
⋮----
// many-to-one: 'on' is FK on current table, 'references' is PK on target
⋮----
// --- AGGREGATION ---
⋮----
export const _aggregateImpl = <S extends KonroSchema<any, any>>(
  state: DatabaseState,
  _schema: S, // Not used but keep for API consistency
  descriptor: AggregationDescriptor
): Record<string, number | null> =>
⋮----
_schema: S, // Not used but keep for API consistency
⋮----
results[resultKey] = 0; // sum of empty set is 0
⋮----
results[resultKey] = null; // avg, min, max of empty set is null
⋮----
// --- INSERT ---
⋮----
export const _insertImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] =>
⋮----
// To maintain immutability, we deep-clone only the table being modified.
⋮----
// Handle IDs and defaults
⋮----
// Generate new PK if not provided
⋮----
} else { // 'auto-increment' or legacy undefined strategy
⋮----
// If user provided an ID for an auto-increment table, update lastId to avoid future collisions.
⋮----
// Validate the record before inserting
⋮----
// --- UPDATE ---
⋮----
export const _updateImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] =>
⋮----
// Auto-update 'updatedAt' timestamp
⋮----
// Find the ID column from the schema and prevent it from being updated.
⋮----
// Validate the updated record, excluding current record from unique checks
⋮----
// --- DELETE ---
⋮----
function applyCascades<S extends KonroSchema<any, any>>(
  state: DatabaseState<S>,
  schema: S,
  tableName: string,
  deletedRecords: KRecord[]
): DatabaseState<S>
⋮----
// We only cascade from the "one" side of a one-to-many relationship, which is a 'many' type in Konro.
⋮----
const predicate = (record: KRecord)
⋮----
// Recursively delete
⋮----
// Update FK to null
⋮----
export const _deleteImpl = (state: DatabaseState, schema: KonroSchema<any, any>, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] =>
⋮----
// Soft delete path
⋮----
// Use update implementation for soft-delete. It will also handle `updatedAt`.
⋮----
// The returned records are the ones that were just soft-deleted from this table.
⋮----
// Hard delete path
⋮----
// --- VALIDATION ---
⋮----
const validateRecord = (record: KRecord, tableSchema: Record<string, any>, existingRecords: KRecord[]): void =>
⋮----
// Skip validation for undefined values (they should have defaults applied already)
⋮----
// Validate unique constraint, allowing multiple nulls
⋮----
// Validate string constraints
⋮----
// Min length
⋮----
// Max length
⋮----
// Format validation
⋮----
// Validate number constraints
⋮----
// Min value
⋮----
// Max value
⋮----
const isValidEmail = (email: string): boolean =>
```

## File: package.json
```json
{
  "name": "konro",
  "version": "0.1.7",
  "description": "A type-safe, functional micro-ORM for JSON/YAML files.",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
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
    "build": "tsc --project tsconfig.build.json",
    "dev": "tsc --watch --project tsconfig.build.json",
    "test": "bun test",
    "test:restore-importer": "git checkout -- test/konro-test-import.ts",
    "test:src": "npm run test:restore-importer && bun test",
    "test:dist": "npm run build && echo \"export * from '../dist/index.js';\" > test/konro-test-import.ts && bun test && npm run test:restore-importer",
    "prepublishOnly": "npm run build"
  }
}
```

## File: src/db.ts
```typescript
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
⋮----
// --- CORE LOGIC (STATELESS & PURE) ---
⋮----
/**
 * A helper to normalize a predicate argument into a function.
 */
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord)
⋮----
// The cast is necessary due to function argument contravariance.
// The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
⋮----
/**
 * Creates the core, stateless database operations.
 * These operations are pure functions that take a database state and return a new state,
 * forming the foundation for both in-memory and on-demand modes.
 */
function createCoreDbContext<S extends KonroSchema<any, any>>(schema: S)
⋮----
const query = (state: DatabaseState<S>): QueryBuilder<S> => (
⋮----
const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => (
⋮----
select(fields)
where(predicate)
withDeleted()
with<W extends WithArgument<S, TName>>(relations: W)
limit(count: number)
offset(count: number)
⋮----
const insert = <T extends keyof S['tables']>(
    state: DatabaseState<S>, tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]
): [DatabaseState<S>, S['base'][T] | S['base'][T][]] =>
⋮----
const update = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]> => (
⋮----
const del = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => (
⋮----
// --- ON-DEMAND CONTEXT (STATEFUL WRAPPER) ---
⋮----
type CoreDbContext<S extends KonroSchema<any, any>> = ReturnType<typeof createCoreDbContext<S>>;
⋮----
/** Defines the contract for file I/O operations in on-demand mode. */
interface OnDemandIO<S extends KonroSchema<any, any>> {
  getFullState(): Promise<DatabaseState<S>>;
  insert(core: CoreDbContext<S>, tableName: string, values: any): Promise<any>;
  update(core: CoreDbContext<S>, tableName: string, data: Partial<unknown>, predicate: (record: KRecord) => boolean): Promise<KRecord[]>;
  delete(core: CoreDbContext<S>, tableName: string, predicate: (record: KRecord) => boolean): Promise<KRecord[]>;
}
⋮----
getFullState(): Promise<DatabaseState<S>>;
insert(core: CoreDbContext<S>, tableName: string, values: any): Promise<any>;
update(core: CoreDbContext<S>, tableName: string, data: Partial<unknown>, predicate: (record: KRecord)
delete(core: CoreDbContext<S>, tableName: string, predicate: (record: KRecord)
⋮----
/**
 * Creates a generic, unified `OnDemandDbContext` from an I/O strategy.
 * This function is the key to removing duplication between 'multi-file' and 'per-record' modes.
 */
function createOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: StorageAdapter,
  core: CoreDbContext<S>,
  io: OnDemandIO<S>
): OnDemandDbContext<S>
⋮----
const notSupported = (methodName: string) => () => Promise.reject(KonroError(
⋮----
// --- DATABASE FACTORY ---
⋮----
export function createDatabase<
  S extends KonroSchema<any, any>,
  TAdapter extends StorageAdapter,
>(
  options: { schema: S; adapter: TAdapter }
): TAdapter['mode'] extends 'on-demand' ? OnDemandDbContext<S> : InMemoryDbContext<S>;
export function createDatabase<S extends KonroSchema<any, any>>(
  options: { schema: S; adapter: StorageAdapter }
): DbContext<S>
⋮----
// --- In-Memory Mode ---
⋮----
// --- On-Demand Mode ---
const fileAdapter = adapter as FileStorageAdapter; // We can be sure it's a FileStorageAdapter due to checks
⋮----
// The `read` method from the adapter provides the canonical way to get the full state.
const getFullState = (): Promise<DatabaseState<S>>
⋮----
// --- I/O Strategy for Multi-File ---
const createMultiFileIO = (): OnDemandIO<S> =>
⋮----
const getTablePath = (tableName: string) => path.join(dir, `$
⋮----
const readTableState = async (tableName: string): Promise<TableState> =>
⋮----
const writeTableState = async (tableName: string, tableState: TableState): Promise<void> =>
⋮----
const state = await getFullState(); // Cascades require full state
⋮----
// --- I/O Strategy for Per-Record ---
const createPerRecordIO = (): OnDemandIO<S> =>
⋮----
const getTableDir = (tableName: string)
const getRecordPath = (tableName: string, id: any) => path.join(getTableDir(tableName), `$
const getMetaPath = (tableName: string)
const getIdColumn = (tableName: string) =>
⋮----
// Perform insert without existing records for performance
⋮----
// Write new records and update meta if it changed
⋮----
const state = await getFullState(); // Update needs full table state for predicate
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
⋮----
import type {
  KonroSchema,
  ColumnDefinition,
  OneRelationDefinition,
  ManyRelationDefinition,
  AggregationDefinition
} from './types';
⋮----
// --- SCHEMA BUILDER FUNCTION ---
⋮----
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
relations?: (tables: TDef['tables'])
⋮----
): KonroSchema<TDef['tables'], TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}> => { // eslint-disable-line
⋮----
relations: relations as any, // Cast to bypass complex conditional type issue
// Types are applied via the return type annotation, these are just placeholders at runtime.
⋮----
// --- COLUMN DEFINITION HELPERS ---
⋮----
const createColumn = <T>(dataType: ColumnDefinition<T>['dataType'], options: object | undefined, tsType: T): ColumnDefinition<T> => (
⋮----
/** A managed, auto-incrementing integer primary key. This is the default strategy. */
export const id = () => createColumn<number>('id',
/** A managed, universally unique identifier (UUID) primary key. Stored as a string. */
export const uuid = () => createColumn<string>('id',
⋮----
// A shared base type for options to avoid repetition in overloads.
type BaseStringOptions = {
  unique?: boolean;
  min?: number;
  max?: number;
  format?: 'email' | 'uuid' | 'url';
};
/** A string column with optional validation. */
export function string(options: BaseStringOptions &
export function string(options?: BaseStringOptions &
⋮----
type BaseNumberOptions = {
  unique?: boolean;
  min?: number;
  max?: number;
  type?: 'integer';
};
/** A number column with optional validation. */
export function number(options: BaseNumberOptions &
export function number(options?: BaseNumberOptions &
⋮----
/** A boolean column. */
export function boolean(options:
export function boolean(options?:
⋮----
/** A generic date column. Consider using `createdAt` or `updatedAt` for managed timestamps. */
export function date(options:
export function date(options?:
⋮----
/** A managed timestamp set when a record is created. */
export const createdAt = (): ColumnDefinition<Date> => createColumn<Date>('date',
/** A managed timestamp set when a record is created and updated. */
export const updatedAt = (): ColumnDefinition<Date> => createColumn<Date>('date',
/** A managed, nullable timestamp for soft-deleting records. */
export const deletedAt = (): ColumnDefinition<Date | null> => createColumn<Date | null>('date',
/** A column for storing arbitrary JSON objects, with a generic for type safety. */
export function object<T extends Record<string, unknown>>(options:
export function object<T extends Record<string, unknown>>(options?:
export function object<T extends Record<string, unknown>>(options?: { optional?: boolean; default?: unknown }
): ColumnDefinition<T | null> | ColumnDefinition<T>
⋮----
// The cast here is to satisfy the generic constraint on the implementation.
// The phantom type will be `T | null`.
⋮----
// --- RELATIONSHIP DEFINITION HELPERS ---
⋮----
/** Defines a `one-to-one` or `many-to-one` relationship. */
export const one = <T extends string>(targetTable: T, options:
⋮----
/** Defines a `one-to-many` relationship. */
export const many = <T extends string>(targetTable: T, options:
⋮----
// --- AGGREGATION DEFINITION HELPERS ---
⋮----
/** Aggregation to count records. */
export const count = (): AggregationDefinition => (
/** Aggregation to sum a numeric column. */
export const sum = (column: string): AggregationDefinition => (
/** Aggregation to average a numeric column. */
export const avg = (column: string): AggregationDefinition => (
/** Aggregation to find the minimum value in a numeric column. */
export const min = (column: string): AggregationDefinition => (
/** Aggregation to find the maximum value in a numeric column. */
export const max = (column: string): AggregationDefinition => (
```

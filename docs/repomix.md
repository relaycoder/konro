# Directory Structure
```
package.json
src/adapter.ts
src/db.ts
src/operations.ts
src/schema.ts
src/types.ts
test/integration/Adapters/PerRecord.test.ts
test/integration/InMemoryFlow/CrudCycle.test.ts
tsconfig.json
```

# Files

## File: test/integration/Adapters/PerRecord.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir, uuidTestSchema } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import { KonroError, KonroStorageError } from '../../../src/utils/error.util';
import type { InMemoryDbContext, OnDemandDbContext } from '../../../src/db';

describe('Integration > Adapters > PerRecord', () => {
  const dbDirPath = path.join(TEST_DIR, 'per_record_db');

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  describe('Initialization', () => {
    it('should successfully create a per-record adapter', () => {
      const adapter = konro.createFileAdapter({
        format: 'json',
        perRecord: { dir: dbDirPath },
      });
      expect(adapter).toBeDefined();
      expect(adapter.options.perRecord).toEqual({ dir: dbDirPath });
    });

    it('should throw an error for unsupported formats like "csv"', () => {
      expect(() => {
        konro.createFileAdapter({
          format: 'csv',
          perRecord: { dir: dbDirPath },
        });
      }).toThrow(KonroError("The 'per-record' strategy only supports 'json' or 'yaml' formats."));
    });
  });

  describe('In-Memory Mode (JSON)', () => {
    let db: InMemoryDbContext<typeof testSchema>;
    const adapter = konro.createFileAdapter({
      format: 'json',
      perRecord: { dir: dbDirPath },
    });

    beforeEach(() => {
      db = konro.createDatabase({ schema: testSchema, adapter });
    });

    it('should write each record to a separate file and a meta file', async () => {
      let state = db.createEmptyState();
      [state] = db.insert(state, 'users', { name: 'Record User', email: 'rec@test.com', age: 33 });
      [state] = db.insert(state, 'posts', { title: 'Record Post', content: '...', authorId: 1 });

      await db.write(state);

      const usersDir = path.join(dbDirPath, 'users');
      const postsDir = path.join(dbDirPath, 'posts');
      
      const userRecordPath = path.join(usersDir, '1.json');
      const userMetaPath = path.join(usersDir, '_meta.json');
      const postRecordPath = path.join(postsDir, '1.json');
      const postMetaPath = path.join(postsDir, '_meta.json');

      const userRecordContent = JSON.parse(await fs.readFile(userRecordPath, 'utf-8'));
      const userMetaContent = JSON.parse(await fs.readFile(userMetaPath, 'utf-8'));
      const postRecordContent = JSON.parse(await fs.readFile(postRecordPath, 'utf-8'));
      const postMetaContent = JSON.parse(await fs.readFile(postMetaPath, 'utf-8'));

      expect(userRecordContent.name).toBe('Record User');
      expect(userMetaContent.lastId).toBe(1);
      expect(postRecordContent.title).toBe('Record Post');
      expect(postMetaContent.lastId).toBe(1);
    });

    it('should delete record files that are no longer in the state', async () => {
      let state = db.createEmptyState();
      [state] = db.insert(state, 'users', { name: 'To Be Deleted', email: 'del@test.com', age: 40 });
      await db.write(state);
      
      const userRecordPath = path.join(dbDirPath, 'users', '1.json');
      expect(await fs.access(userRecordPath).then(() => true).catch(() => false)).toBe(true);

      [state] = db.delete(state, 'users').where({ id: 1 });
      await db.write(state);

      expect(await fs.access(userRecordPath).then(() => true).catch(() => false)).toBe(false);
    });

    it('should read records from individual files to build the state', async () => {
      // Manually create files
      const usersDir = path.join(dbDirPath, 'users');
      await fs.mkdir(usersDir, { recursive: true });
      await fs.writeFile(path.join(usersDir, '1.json'), JSON.stringify({ id: 1, name: 'Manual User', email: 'man@test.com', age: 50, isActive: true }));
      await fs.writeFile(path.join(usersDir, '_meta.json'), JSON.stringify({ lastId: 1 }));
      
      const state = await db.read();
      
      expect(state.users.records.length).toBe(1);
      expect(state.users.records[0]?.name).toBe('Manual User');
      expect(state.users.meta.lastId).toBe(1);
      expect(state.posts.records.length).toBe(0);
    });
    
    it('should derive lastId from record files if meta file is missing', async () => {
        const usersDir = path.join(dbDirPath, 'users');
        await fs.mkdir(usersDir, { recursive: true });
        await fs.writeFile(path.join(usersDir, '2.json'), JSON.stringify({ id: 2, name: 'User 2', email: 'u2@test.com', age: 50, isActive: true }));
        await fs.writeFile(path.join(usersDir, '5.json'), JSON.stringify({ id: 5, name: 'User 5', email: 'u5@test.com', age: 50, isActive: true }));

        const state = await db.read();
        expect(state.users.meta.lastId).toBe(5);
    });

    it('should throw KonroStorageError for a corrupt record file', async () => {
      const usersDir = path.join(dbDirPath, 'users');
      await fs.mkdir(usersDir, { recursive: true });
      await fs.writeFile(path.join(usersDir, '1.json'), '{ "id": 1, "name": "Corrupt"'); // Invalid JSON
      
      await expect(db.read()).rejects.toThrow(KonroStorageError);
    });
  });

  describe('On-Demand Mode (YAML)', () => {
    let db: OnDemandDbContext<typeof testSchema>;
    
    beforeEach(() => {
        const adapter = konro.createFileAdapter({
            format: 'yaml',
            mode: 'on-demand',
            perRecord: { dir: dbDirPath },
        });
        db = konro.createDatabase({ schema: testSchema, adapter });
    });

    it('should insert a record and create its file and update meta', async () => {
      const user = await db.insert('users', { name: 'OnDemand Record', email: 'odr@test.com', age: 25 });
      
      const userRecordPath = path.join(dbDirPath, 'users', `${user.id}.yaml`);
      const userMetaPath = path.join(dbDirPath, 'users', '_meta.json');

      const recordContent = yaml.load(await fs.readFile(userRecordPath, 'utf-8')) as any;
      const metaContent = JSON.parse(await fs.readFile(userMetaPath, 'utf-8'));

      expect(recordContent.name).toBe('OnDemand Record');
      expect(metaContent.lastId).toBe(1);
    });

    it('should update a record file', async () => {
      const user = await db.insert('users', { name: 'Update Me', email: 'upd@test.com', age: 35 });
      await db.update('users').set({ name: 'Updated Name' }).where({ id: user.id });

      const userRecordPath = path.join(dbDirPath, 'users', `${user.id}.yaml`);
      const recordContent = yaml.load(await fs.readFile(userRecordPath, 'utf-8')) as any;
      
      expect(recordContent.name).toBe('Updated Name');
    });

    it('should delete a record file', async () => {
      const user = await db.insert('users', { name: 'Delete Me', email: 'del@test.com', age: 45 });
      const userRecordPath = path.join(dbDirPath, 'users', `${user.id}.yaml`);
      expect(await fs.access(userRecordPath).then(() => true).catch(() => false)).toBe(true);

      await db.delete('users').where({ id: user.id });
      expect(await fs.access(userRecordPath).then(() => true).catch(() => false)).toBe(false);
    });

    it('should query with relations by reading multiple tables', async () => {
        const user = await db.insert('users', { name: 'Author', email: 'author@test.com', age: 35 });
        await db.insert('posts', { title: 'Post by Author', content: '...', authorId: user.id });
        
        const userWithPosts = await db.query().from('users').where({ id: user.id }).with({ posts: true }).first();
        
        expect(userWithPosts).toBeDefined();
        expect(userWithPosts?.posts?.length).toBe(1);
        expect(userWithPosts?.posts?.[0]?.title).toBe('Post by Author');
    });
  });

  describe('ID Handling', () => {
    it('should generate UUIDs for filenames and record IDs', async () => {
        const adapter = konro.createFileAdapter({
            format: 'json',
            mode: 'on-demand',
            perRecord: { dir: dbDirPath },
        });
        const db = konro.createDatabase({ schema: uuidTestSchema, adapter });

        const user = await db.insert('uuid_users', { name: 'UUID User' });
        
        expect(typeof user.id).toBe('string');
        const userRecordPath = path.join(dbDirPath, 'uuid_users', `${user.id}.json`);
        expect(await fs.access(userRecordPath).then(() => true).catch(() => false)).toBe(true);
        
        const recordContent = JSON.parse(await fs.readFile(userRecordPath, 'utf-8'));
        expect(recordContent.id).toBe(user.id);
        expect(recordContent.name).toBe('UUID User');
    });

    it('on-demand insert should not derive lastId from existing files', async () => {
        // Manually create a file with ID 5, but no meta file
        const usersDir = path.join(dbDirPath, 'users');
        await fs.mkdir(usersDir, { recursive: true });
        await fs.writeFile(path.join(usersDir, '5.json'), JSON.stringify({ id: 5, name: 'Existing User', email: 'ex@test.com', age: 55, isActive: true }));
        
        const adapter = konro.createFileAdapter({ format: 'json', mode: 'on-demand', perRecord: { dir: dbDirPath } });
        const db = konro.createDatabase({ schema: testSchema, adapter });
        
        // Inserting should start from ID 1 because _meta.json doesn't exist
        const newUser = await db.insert('users', { name: 'New User', email: 'new@test.com', age: 22 });
        expect(newUser.id).toBe(1);
        
        const metaContent = JSON.parse(await fs.readFile(path.join(usersDir, '_meta.json'), 'utf-8'));
        expect(metaContent.lastId).toBe(1);
    });
  });
});
```

## File: src/types.ts
```typescript
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
```

## File: test/integration/InMemoryFlow/CrudCycle.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema } from '../../util';
import path from 'path';
import type { InMemoryDbContext } from '../../../src/db';
import type { DatabaseState } from '../../../src/types';

describe('Integration > InMemoryFlow > CrudCycle', () => {
  let db: InMemoryDbContext<typeof testSchema>;
  let state: DatabaseState<typeof testSchema>;

  beforeEach(() => {
    // Adapter is needed for context creation, but we won't use its I/O
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: path.join(__dirname, 'test.db.json') },
    });
    db = konro.createDatabase({
      schema: testSchema,
      adapter,
    });
    state = db.createEmptyState();
  });

  it('should allow inserting a record and then immediately querying for it', () => {
    const [newState, insertedUser] = db.insert(state, 'users', {
      name: 'InMemory Alice',
      email: 'alice@inmemory.com',
      age: 30,
      isActive: true,
    });
    expect(insertedUser.id).toBe(1);

    const users = db.query(newState).from('users').all();
    expect(users.length).toBe(1);
    expect(users[0]).toEqual(insertedUser);
  });

  it('should correctly chain mutation operations by passing the newState', () => {
    // Insert user
    const [stateAfterUserInsert, user] = db.insert(state, 'users', {
      name: 'Chain User',
      email: 'chain@test.com',
      age: 40,
      isActive: true,
    });

    // Insert post using the new state
    const [stateAfterPostInsert, post] = db.insert(stateAfterUserInsert, 'posts', {
      title: 'Chained Post',
      content: '...',
      authorId: user.id,
      publishedAt: new Date(),
    });

    expect(stateAfterPostInsert.users.records.length).toBe(1);
    expect(stateAfterPostInsert.posts.records.length).toBe(1);
    expect(post.authorId).toBe(user.id);
  });

  it('should update a record and verify the change in the returned newState', () => {
    const [stateAfterInsert, user] = db.insert(state, 'users', {
      name: 'Update Me',
      email: 'update@test.com',
      age: 50,
      isActive: true,
    });

    const [stateAfterUpdate, updatedUsers] = db.update(stateAfterInsert, 'users')
      .set({ name: 'Updated Name' })
      .where({ id: user.id });

    expect(updatedUsers.length).toBe(1);
    expect(updatedUsers[0]?.name).toBe('Updated Name');

    const queriedUser = db.query(stateAfterUpdate).from('users').where({ id: user.id }).first();
    expect(queriedUser?.name).toBe('Updated Name');
    expect(stateAfterInsert.users.records[0]?.name).toBe('Update Me'); // Original state is untouched
  });

  it('should delete a record and verify its absence in the returned newState', () => {
    const [stateAfterInsert, user] = db.insert(state, 'users', {
      name: 'Delete Me',
      email: 'delete@test.com',
      age: 60,
      isActive: true,
    });

    const [stateAfterDelete, deletedUsers] = db.delete(stateAfterInsert, 'users')
      .where({ id: user.id });

    expect(deletedUsers.length).toBe(1);
    expect(deletedUsers[0]?.name).toBe('Delete Me');

    const users = db.query(stateAfterDelete).from('users').all();
    expect(users.length).toBe(0);
  });

  it('should correctly execute a query with a .with() clause on an in-memory state', () => {
    const [s1, user] = db.insert(state, 'users', {
      name: 'Relation User',
      email: 'relation@test.com',
      age: 35,
      isActive: true,
    });
    const [s2, ] = db.insert(s1, 'posts', [
        { title: 'Relational Post 1', content: '...', authorId: user.id, publishedAt: new Date() },
        { title: 'Relational Post 2', content: '...', authorId: user.id, publishedAt: new Date() },
    ]);

    const userWithPosts = db.query(s2).from('users').where({ id: user.id }).with({ posts: true }).first();

    expect(userWithPosts).toBeDefined();
    expect(userWithPosts?.name).toBe('Relation User');
    expect(userWithPosts?.posts).toBeInstanceOf(Array);
    expect(userWithPosts?.posts?.length).toBe(2);
    expect(userWithPosts?.posts?.[0]?.title).toBe('Relational Post 1');
  });
});
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
import type {
  DatabaseState,
  KRecord,
  TableState,
  StorageAdapter,
  FileStorageAdapter,
  FileAdapterOptions,
  ColumnDefinition,
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
```

## File: src/operations.ts
```typescript
import { randomUUID } from 'crypto';
import type {
  DatabaseState,
  KRecord,
  KonroSchema,
  RelationDefinition,
  ColumnDefinition,
  AggregationDefinition,
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
```

## File: src/db.ts
```typescript
import path from 'path';
import type {
  AggregationDefinition,
  ColumnDefinition,
  KonroSchema,
  RelationDefinition,
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

// --- CORE LOGIC (STATELESS & PURE) ---

/**
 * Creates the core, stateless database operations.
 * These operations are pure functions that take a database state and return a new state,
 * forming the foundation for both in-memory and on-demand modes.
 */
function createCoreDbContext<S extends KonroSchema<any, any>>(schema: S) {
  // A helper to normalize a predicate argument
  const normalizePredicate = <T extends KRecord>(
    predicate: Partial<T> | ((record: T) => boolean)
  ): ((record: KRecord) => boolean) =>
    // The cast is necessary due to function argument contravariance.
    // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
    (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

  const query = (state: DatabaseState<S>): QueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0]) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
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
    set: (data) => ({
      where: (predicate) => {
        const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0]));
        return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
    where: (predicate) => {
      const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, schema, tableName as string, normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0]));
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
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0]) }); },
        withDeleted() { return createBuilder<TReturn>({ ...currentDescriptor, withDeleted: true }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
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
    set: (data) => ({
      where: (predicate) => io.update(core, tableName as string, data, normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0])) as Promise<S['base'][T][]>,
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: (predicate) => io.delete(core, tableName as string, normalizePredicate(predicate as Parameters<typeof normalizePredicate>[0])) as Promise<S['base'][T][]>,
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

import type {
  KonroSchema,
  ColumnDefinition,
  BaseRelationDefinition,
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
```

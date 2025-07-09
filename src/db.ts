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
      const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as any));
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
    where: (predicate) => performCud(tableName as string, (state) => core.delete(state, tableName).where(predicate as any)) as Promise<S['base'][T][]>,
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
      const tableNameStr = tableName as string;
      const tableState = await readTableState(tableNameStr);
      const idColumn = getIdColumn(tableNameStr);
      const [, deletedRecords] = core.delete({ [tableNameStr]: tableState } as any, tableName).where(predicate as any);

      if (deletedRecords.length > 0) {
        await Promise.all((deletedRecords as KRecord[]).map((rec) => fs.unlink(getRecordPath(tableNameStr, rec[idColumn] as any))));
      }
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
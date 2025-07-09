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
        throw KonroStorageError(`Failed to parse file at "${getTablePath(tableName)}". Original error: ${e.message}`);
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
      if (!col) throw KonroError(`Table "${tableName}" needs an 'id' column for 'per-record' mode.`);
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
    throw KonroError("The 'on-demand' mode requires a 'multi-file' or 'per-record' storage strategy.");
  }
  
  return createOnDemandDbContext(schema, adapter, core, io);
}
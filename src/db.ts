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
      return adapter.serializer.parse(data, schema.tables[tableName]);
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
import { AggregationDefinition, ColumnDefinition, KonroSchema, RelationDefinition } from './schema';
import { StorageAdapter } from './adapter';
import { DatabaseState, KRecord } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor, _aggregateImpl, AggregationDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE HELPERS for Fluent API ---

type RelatedModel<T> = T extends (infer R)[] ? R : T extends (infer R | null) ? R : never;

// TAll is the full relational model type, e.g. schema.types.users
type WithArgument<TAll> = {
  // K is a relation name like 'posts' or 'profile'
  [K in keyof TAll as NonNullable<TAll[K]> extends any[] | object ? K : never]?: boolean | {
    where?: (record: RelatedModel<NonNullable<TAll[K]>>) => boolean;
    select?: Record<string, ColumnDefinition<unknown>>;
  };
};

type ResolveWith<
  S extends KonroSchema<any, any>,
  TName extends keyof S['tables'],
  TWith extends WithArgument<S['types'][TName]>
> = {
  // K will be 'posts', 'profile', etc.
  [K in keyof TWith as K extends keyof S['types'][TName] ? K : never]: S['types'][TName][K];
};


// --- TYPE-SAFE FLUENT API BUILDERS ---

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

interface UpdateBuilder<S extends KonroSchema<any, any>, TBase> {
  set(data: Partial<TBase>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
  };
}

interface DeleteBuilder<S extends KonroSchema<any, any>, TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
}

export interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState<S>>;
  write(state: DatabaseState<S>): Promise<void>;
  createEmptyState(): DatabaseState<S>;

  query(state: DatabaseState<S>): QueryBuilder<S>;
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['base'][T]];
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['base'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]>;
}

export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
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
    }) as {
      <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['base'][T]];
      <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['base'][T][]];
    },

    query: (state: DatabaseState<S>): QueryBuilder<S> => ({
      from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
        const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
          select(fields) {
            return createBuilder<TReturn>({ ...currentDescriptor, select: fields });
          },
          where(predicate) {
            return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as (record: KRecord) => boolean) });
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
          all: (): TReturn[] => _queryImpl(state as DatabaseState, schema, currentDescriptor) as unknown as TReturn[],
          first: (): TReturn | null => (_queryImpl(state as DatabaseState, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as unknown as TReturn | null,
          aggregate: <TAggs extends Record<string, AggregationDefinition>>(aggregations: TAggs): { [K in keyof TAggs]: number | null } => {
            const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
            return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as { [K in keyof TAggs]: number | null };
          },
        });
        return createBuilder<S['base'][TName]>({ tableName: tableName as string });
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T]> => ({
      set: (data) => ({
        where: (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as (record: KRecord) => boolean));
          return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
      where: (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as (record: KRecord) => boolean));
        return [newState as DatabaseState<S>, deletedRecords as S['base'][T][]];
      },
    }),
  };
};
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

// --- TYPE-SAFE FLUENT API BUILDERS ---

interface ChainedQueryBuilder<T> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<T> | ((record: T) => boolean)): this;
  with(relations: QueryDescriptor['with']): this;
  limit(count: number): this;
  offset(count: number): this;
  all(): Promise<T[]>;
  first(): Promise<T | null>;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): Promise<{ [K in keyof TAggs]: number | null }>;
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]>;
}

interface UpdateBuilder<T> {
  set(data: Partial<T>): {
    where(predicate: Partial<T> | ((record: T) => boolean)): Promise<[DatabaseState, T[]]>;
  };
}

interface DeleteBuilder<T> {
  where(predicate: Partial<T> | ((record: T) => boolean)): Promise<[DatabaseState, T[]]>;
}

export interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState<S>>;
  write(state: DatabaseState<S>): Promise<void>;
  createEmptyState(): DatabaseState<S>;

  query(state: DatabaseState<S>): QueryBuilder<S>;
  insert<T extends keyof S['types']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['types'][T]];
  insert<T extends keyof S['types']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['types'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S['types'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S['types'][T]>;
}

export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
  const { schema, adapter } = options;

  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (<T extends keyof S['types']>(
      state: DatabaseState<S>,
      tableName: T,
      values: S['create'][T] | Readonly<S['create'][T]>[]
    ): [DatabaseState<S>, S['types'][T] | S['types'][T][]] => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state as DatabaseState, schema, tableName as string, valsArray as KRecord[]);
      const result = Array.isArray(values) ? inserted : inserted[0];
      return [newState as DatabaseState<S>, result] as [DatabaseState<S>, S['types'][T] | S['types'][T][]];
    }) as {
      <T extends keyof S['types']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['types'][T]];
      <T extends keyof S['types']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['types'][T][]];
    },

    query: (state: DatabaseState<S>): QueryBuilder<S> => ({
      from: <T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]> => {
        const descriptor: QueryDescriptor = { tableName: tableName as string };

        const builder: ChainedQueryBuilder<S['types'][T]> = {
          select: (fields) => {
            descriptor.select = fields;
            return builder;
          },
          where: (predicate) => {
            descriptor.where = normalizePredicate(predicate as (record: KRecord) => boolean);
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
          all: async (): Promise<S['types'][T][]> => _queryImpl(state as DatabaseState, schema, descriptor) as any,
          first: async (): Promise<S['types'][T] | null> => (_queryImpl(state as DatabaseState, schema, { ...descriptor, limit: 1 })[0] ?? null) as any,
          aggregate: async <TAggs extends Record<string, AggregationDefinition>>(aggregations: TAggs): Promise<{ [K in keyof TAggs]: number | null }> => {
            const aggDescriptor: AggregationDescriptor = { ...descriptor, aggregations };
            return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as { [K in keyof TAggs]: number | null };
          },
        };
        return builder;
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S['types'][T]> => ({
      set: (data) => ({
        where: async (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as (record: KRecord) => boolean));
          return [newState as DatabaseState<S>, updatedRecords as S['types'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S['types'][T]> => ({
      where: async (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as (record: KRecord) => boolean));
        return [newState as DatabaseState<S>, deletedRecords as S['types'][T][]];
      },
    }),
  };
};

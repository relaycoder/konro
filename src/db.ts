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
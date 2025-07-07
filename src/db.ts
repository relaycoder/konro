import { KonroSchema } from './schema';
import { StorageAdapter } from './adapter';
import { DatabaseState, KRecord } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl } from './operations';

interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read: () => Promise<DatabaseState>;
  write: (state: DatabaseState) => Promise<void>;
  createEmptyState: () => DatabaseState;

  query: (state: DatabaseState) => QueryBuilder;
  insert: <T extends keyof S['types']>(state: DatabaseState, tableName: T, values: S['types'][T] | S['types'][T][]) => [DatabaseState, S['types'][T] | S['types'][T][]];
  update: (state: DatabaseState, tableName: keyof S['types']) => UpdateBuilder;
  delete: (state: DatabaseState, tableName: keyof S['types']) => DeleteBuilder;
}

// Fluent API Builders
interface QueryBuilder {
  from: (tableName: string) => this;
  where: (predicate: any) => this;
  with: (relations: any) => this;
  limit: (count: number) => this;
  offset: (count: number) => this;
  all: <T = KRecord>() => Promise<T[]>;
  first: <T = KRecord>() => Promise<T | null>;
}

interface UpdateBuilder {
  set: (data: any) => { where: (predicate: any) => [DatabaseState, KRecord[]]; };
}

interface DeleteBuilder {
  where: (predicate: any) => [DatabaseState, KRecord[]];
}


export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
  const { schema, adapter } = options;

  const normalize = (p: any) => typeof p === 'function' ? p : (r: KRecord) => Object.entries(p).every(([k, v]) => r[k] === v);

  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (state, tableName, values) => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state, schema, tableName as string, valsArray);
      return [newState, Array.isArray(values) ? inserted : inserted[0]] as any;
    },

    query: (state) => {
      const descriptor: any = {};
      const builder: QueryBuilder = {
        from: (tableName) => { descriptor.tableName = tableName; return builder; },
        where: (predicate) => { descriptor.where = normalize(predicate); return builder; },
        with: (relations) => { descriptor.with = relations; return builder; },
        limit: (count) => { descriptor.limit = count; return builder; },
        offset: (count) => { descriptor.offset = count; return builder; },
        all: () => Promise.resolve(_queryImpl(state, schema, descriptor)) as any,
        first: () => Promise.resolve(_queryImpl(state, schema, { ...descriptor, limit: 1 })[0] ?? null) as any,
      };
      return builder;
    },

    update: (state, tableName) => ({
      set: (data) => ({
        where: (predicate) => _updateImpl(state, tableName as string, data, normalize(predicate)),
      }),
    }),

    delete: (state, tableName) => ({
      where: (predicate) => _deleteImpl(state, tableName as string, normalize(predicate)),
    }),
  };
};

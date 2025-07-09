import type { BaseModels, KonroSchema } from './schema';

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;

/**
 * Represents the state of a single table, including its records and metadata.
 */
export type TableState<T extends KRecord = KRecord> = {
  records: T[];
  meta: {
    lastId: number;
  };
};

/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: TableState<BaseModels<S['tables']>[TableName]>;
    }
  : {
      [tableName: string]: TableState;
    };
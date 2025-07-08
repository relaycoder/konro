import type { BaseModels, KonroSchema } from './schema';

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;

/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: {
        records: BaseModels<S['tables']>[TableName][];
        meta: {
          lastId: number;
        };
      };
    }
  : {
      [tableName: string]: {
        records: KRecord[];
        meta: {
          lastId: number;
        };
      };
    };
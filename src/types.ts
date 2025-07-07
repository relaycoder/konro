/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState = {
  [tableName: string]: {
    records: KRecord[];
    meta: {
      lastId: number;
    };
  };
};

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;
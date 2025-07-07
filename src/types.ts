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
 */
export type KRecord = Record<string, any>;

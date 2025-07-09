import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, uuid, string, number, boolean, date, createdAt, updatedAt, deletedAt, object, one, many, count, sum, avg, min, max } from './schema';

export type {
  // Core Schema & DB Types
  KonroSchema,
  DbContext,
  InMemoryDbContext,
  OnDemandDbContext,
  DatabaseState,
  KRecord,
  // Schema Definition Types
  ColumnDefinition,
  RelationDefinition,
  OneRelationDefinition,
  ManyRelationDefinition,
  AggregationDefinition,
  // Adapter & FS Types
  StorageAdapter,
  FileAdapterOptions,
  FileStorageAdapter,
  SingleFileStrategy,
  MultiFileStrategy,
  PerRecordStrategy,
  FsProvider,
} from './types';

/**
 * The main Konro object, providing access to all core functionalities
 * for schema definition, database creation, and adapter configuration.
 */
export const konro = {
  /**
   * Defines the structure, types, and relations of your database.
   * This is the single source of truth for both runtime validation and static types.
   */
  createSchema,
  /**
   * Creates the main `db` context, which is the primary interface for all
   * database operations (read, write, query, etc.).
   */
  createDatabase,
  /**
   * Creates a file-based storage adapter for persisting the database state
   * to a JSON or YAML file.
   */
  createFileAdapter,
  // --- Column Definition Helpers ---
  id,
  uuid,
  string,
  number,
  boolean,
  date,
  createdAt,
  updatedAt,
  deletedAt,
  object,
  // --- Relationship Definition Helpers ---
  one,
  many,
  // --- Aggregation Definition Helpers ---
  count,
  sum,
  avg,
  min,
  max,
};

import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition } from './schema';

// --- HELPERS ---


/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = (schema: KonroSchema<any, any>): DatabaseState => {
  const state: DatabaseState = {};
  for (const tableName in schema.tables) {
    state[tableName] = { records: [], meta: { lastId: 0 } };
  }
  return state;
};

// --- QUERY ---

export interface QueryDescriptor {
  tableName: string;
  where?: (record: KRecord) => boolean;
  with?: Record<string, boolean | { where?: (record: KRecord) => boolean }>;
  limit?: number;
  offset?: number;
}

export const _queryImpl = (state: DatabaseState, schema: KonroSchema<any, any>, descriptor: QueryDescriptor): KRecord[] => {
  const tableState = state[descriptor.tableName];
  if (!tableState) return [];

  // 1. Filter
  let results = descriptor.where ? tableState.records.filter(descriptor.where) : [...tableState.records];

  // 2. Eager load relations (`with`)
  if (descriptor.with) {
    results = structuredClone(results); // Clone to avoid mutating state
    for (const record of results) {
      for (const relationName in descriptor.with) {
        const relationDef = schema.relations[descriptor.tableName]?.[relationName];
        if (!relationDef) continue;

        const relatedRecords = findRelatedRecords(state, record, relationDef);

        const withOpts = descriptor.with[relationName];
        const nestedWhere = typeof withOpts === 'object' ? withOpts.where : undefined;

        const filteredRelatedRecords = nestedWhere ? relatedRecords.filter(nestedWhere) : relatedRecords;
        if (relationDef.relationType === 'one') {
          record[relationName] = filteredRelatedRecords[0] ?? null;
        } else {
          record[relationName] = filteredRelatedRecords;
        }
      }
    }
  }

  // 3. Paginate
  const offset = descriptor.offset ?? 0;
  const limit = descriptor.limit ?? results.length;
  return results.slice(offset, offset + limit);
};

const findRelatedRecords = (state: DatabaseState, record: KRecord, relationDef: RelationDefinition) => {
  const foreignKey = record[relationDef.on];
  const targetTable = state[relationDef.targetTable];

  if (foreignKey === undefined || !targetTable) return [];

  // one-to-many: 'on' is PK on current table, 'references' is FK on target
  if (relationDef.relationType === 'many') {
    return targetTable.records.filter(r => r[relationDef.references] === foreignKey);
  }

  // many-to-one: 'on' is FK on current table, 'references' is PK on target
  if (relationDef.relationType === 'one') {
    return targetTable.records.filter(r => r[relationDef.references] === foreignKey);
  }

  return [];
};


// --- INSERT ---

export const _insertImpl = (state: DatabaseState, schema: KonroSchema<any, any>, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw new Error(`Table "${tableName}" does not exist in the database state.`);
  const tableSchema = schema.tables[tableName];
  const insertedRecords: KRecord[] = [];

  for (const value of values) {
    const newRecord: KRecord = { ...value };
    // Handle IDs and defaults
    for (const colName in tableSchema) {
      const colDef = tableSchema[colName];
      if (colDef.dataType === 'id') {
        tableState.meta.lastId++;
        newRecord[colName] = tableState.meta.lastId;
      }
      if (newRecord[colName] === undefined && colDef.options?.default !== undefined) {
        newRecord[colName] = typeof colDef.options.default === 'function' ? colDef.options.default() : colDef.options.default;
      }
    }
    tableState.records.push(newRecord);
    insertedRecords.push(newRecord);
  }

  return [newState, insertedRecords];
};

// --- UPDATE ---

export const _updateImpl = (state: DatabaseState, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw new Error(`Table "${tableName}" does not exist in the database state.`);
  const updatedRecords: KRecord[] = [];

  tableState.records = tableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...data };
      updatedRecords.push(updatedRecord);
      return updatedRecord;
    }
    return record;
  });

  return [newState, updatedRecords];
};


// --- DELETE ---

export const _deleteImpl = (state: DatabaseState, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw new Error(`Table "${tableName}" does not exist in the database state.`);
  const deletedRecords: KRecord[] = [];

  const keptRecords = tableState.records.filter(record => {
    if (predicate(record)) {
      deletedRecords.push(record);
      return false;
    }
    return true;
  });

  tableState.records = keptRecords;
  return [newState, deletedRecords];
};

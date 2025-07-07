import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition } from './schema';
import { KonroError } from './utils/error.util';

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
  select?: (keyof KRecord)[];
  where?: (record: KRecord) => boolean;
  with?: Record<string, boolean | { where?: (record: KRecord) => boolean }>;
  limit?: number;
  offset?: number;
}

export const _queryImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, descriptor: QueryDescriptor): KRecord[] => {
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
  let paginatedResults = results.slice(offset, offset + limit);

  // 4. Select Fields
  if (descriptor.select) {
    paginatedResults = paginatedResults.map(rec => {
      const newRec: KRecord = {};
      for (const key of descriptor.select!) {
        // This includes keys from `with` if the user explicitly adds them to select.
        if (rec.hasOwnProperty(key)) {
          newRec[key] = rec[key];
        }
      }
      return newRec;
    });
  }

  return paginatedResults;
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

export const _insertImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) throw KonroError(`Schema for table "${tableName}" not found.`);
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

export const _updateImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const newState = structuredClone(state);
  const tableState = newState[tableName];
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  
  const tableSchema = schema.tables[tableName];
  if (!tableSchema) {
    throw KonroError(`Schema for table "${tableName}" not found.`);
  }
  
  const updatedRecords: KRecord[] = [];

  const updateData = { ...data };
  // Find the ID column from the schema and prevent it from being updated.
  const idColumn = Object.entries(tableSchema).find(([, colDef]) => colDef.dataType === 'id')?.[0];
  if (idColumn && updateData[idColumn] !== undefined) {
    delete updateData[idColumn];
  }

  tableState.records = tableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...updateData };
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
  if (!tableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
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

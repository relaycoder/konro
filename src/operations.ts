import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition, ColumnDefinition, AggregationDefinition } from './schema';
import { KonroError, KonroValidationError } from './utils/error.util';

// --- HELPERS ---


/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = <S extends KonroSchema<any, any>>(schema: S): DatabaseState<S> => {
  const state = {} as DatabaseState<S>;
  for (const tableName in schema.tables) {
    // This is a controlled cast, safe because we are iterating over the schema's tables.
    (state as any)[tableName] = { records: [], meta: { lastId: 0 } };
  }
  return state;
};

// --- QUERY ---

export interface QueryDescriptor {
  tableName: string;
  select?: Record<string, ColumnDefinition<unknown> | RelationDefinition>;
  where?: (record: KRecord) => boolean;
  with?: Record<string, boolean | { select?: Record<string, ColumnDefinition<unknown>>; where?: (record: KRecord) => boolean }>;
  limit?: number;
  offset?: number;
}

export interface AggregationDescriptor extends QueryDescriptor {
  aggregations: Record<string, AggregationDefinition>;
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
        const nestedSelect = typeof withOpts === 'object' ? withOpts.select : undefined;

        let processedRecords = nestedWhere ? relatedRecords.filter(nestedWhere) : relatedRecords;

        if (nestedSelect) {
          const targetTableSchema = schema.tables[relationDef.targetTable];
          if (!targetTableSchema) throw KonroError(`Schema for table "${relationDef.targetTable}" not found.`);

          processedRecords = processedRecords.map(rec => {
            const newRec: KRecord = {};
            for (const outputKey in nestedSelect) {
              const def = nestedSelect[outputKey];
              if (!def) continue;
              // nested with() does not support selecting relations, only columns, as per spec.
              if (def._type === 'column') {
                const colName = Object.keys(targetTableSchema).find(key => targetTableSchema[key] === def);
                if (colName && rec.hasOwnProperty(colName)) {
                  newRec[outputKey] = rec[colName];
                }
              }
            }
            return newRec;
          });
        }
        if (relationDef.relationType === 'one') {
          record[relationName] = processedRecords[0] ?? null;
        } else {
          record[relationName] = processedRecords;
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
    const tableSchema = schema.tables[descriptor.tableName];
    const relationsSchema = schema.relations[descriptor.tableName] ?? {};
    if (!tableSchema) throw KonroError(`Schema for table "${descriptor.tableName}" not found.`);

    paginatedResults = paginatedResults.map(rec => {
      const newRec: KRecord = {};
      for (const outputKey in descriptor.select!) {
        const def = descriptor.select![outputKey];
        if (!def) continue;
        if (def._type === 'column') {
          const colName = Object.keys(tableSchema).find(key => tableSchema[key] === def);
          if (colName && rec.hasOwnProperty(colName)) {
            newRec[outputKey] = rec[colName];
          }
        } else if (def._type === 'relation') {
          const relName = Object.keys(relationsSchema).find(key => relationsSchema[key] === def);
          if (relName && rec.hasOwnProperty(relName)) {
            newRec[outputKey] = rec[relName];
          }
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

// --- AGGREGATION ---

export const _aggregateImpl = <S extends KonroSchema<any, any>>(
  state: DatabaseState,
  _schema: S, // Not used but keep for API consistency
  descriptor: AggregationDescriptor
): Record<string, number | null> => {
  const tableState = state[descriptor.tableName];
  if (!tableState) return {};

  const filteredRecords = descriptor.where ? tableState.records.filter(descriptor.where) : [...tableState.records];
  const results: Record<string, number | null> = {};

  for (const resultKey in descriptor.aggregations) {
    const aggDef = descriptor.aggregations[resultKey];
    if (!aggDef) continue;

    if (aggDef.aggType === 'count') {
      results[resultKey] = filteredRecords.length;
      continue;
    }

    if (!aggDef.column) {
      throw KonroError(`Aggregation '${aggDef.aggType}' requires a column.`);
    }
    const column = aggDef.column;

    const values = filteredRecords.map(r => r[column]).filter(v => typeof v === 'number') as number[];

    if (values.length === 0) {
      if (aggDef.aggType === 'sum') {
        results[resultKey] = 0; // sum of empty set is 0
      } else {
        results[resultKey] = null; // avg, min, max of empty set is null
      }
      continue;
    }

    switch (aggDef.aggType) {
      case 'sum':
        results[resultKey] = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'avg':
        results[resultKey] = values.reduce((sum, val) => sum + val, 0) / values.length;
        break;
      case 'min':
        results[resultKey] = Math.min(...values);
        break;
      case 'max':
        results[resultKey] = Math.max(...values);
        break;
    }
  }
  return results;
};

// --- INSERT ---

export const _insertImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, values: KRecord[]): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);

  // To maintain immutability, we deep-clone only the table being modified.
  const tableState = structuredClone(oldTableState);
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

    // Validate the record before inserting
    validateRecord(newRecord, tableSchema, tableState.records);

    tableState.records.push(newRecord);
    insertedRecords.push(newRecord);
  }

  const newState = { ...state, [tableName]: tableState };
  return [newState, insertedRecords];
};

// --- UPDATE ---

export const _updateImpl = <S extends KonroSchema<any, any>>(state: DatabaseState, schema: S, tableName: string, data: Partial<KRecord>, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);

  const tableSchema = schema.tables[tableName];
  if (!tableSchema) {
    throw KonroError(`Schema for table "${tableName}" not found.`);
  }

  const updatedRecords: KRecord[] = [];

  const updateData = { ...data };
  // Find the ID column from the schema and prevent it from being updated.
  const idColumn = Object.entries(tableSchema).find(([, colDef]) => {
    return colDef && typeof colDef === 'object' && '_type' in colDef && colDef._type === 'column' && 'dataType' in colDef && colDef.dataType === 'id';
  })?.[0];
  if (idColumn && updateData[idColumn] !== undefined) {
    delete updateData[idColumn];
  }

  const newRecords = oldTableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...updateData };

      // Validate the updated record, excluding current record from unique checks
      const otherRecords = oldTableState.records.filter(r => r !== record);
      validateRecord(updatedRecord, tableSchema, otherRecords);

      updatedRecords.push(updatedRecord);
      return updatedRecord;
    }
    return record;
  });

  if (updatedRecords.length === 0) {
    return [state, []];
  }

  const tableState = { ...oldTableState, records: newRecords };
  const newState = { ...state, [tableName]: tableState };

  return [newState, updatedRecords];
};


// --- DELETE ---

export const _deleteImpl = (state: DatabaseState, tableName: string, predicate: (record: KRecord) => boolean): [DatabaseState, KRecord[]] => {
  const oldTableState = state[tableName];
  if (!oldTableState) throw KonroError(`Table "${tableName}" does not exist in the database state.`);
  const deletedRecords: KRecord[] = [];

  const keptRecords = oldTableState.records.filter(record => {
    if (predicate(record)) {
      deletedRecords.push(record);
      return false;
    }
    return true;
  });

  if (deletedRecords.length === 0) {
    return [state, []];
  }

  const tableState = { ...oldTableState, records: keptRecords };
  const newState = { ...state, [tableName]: tableState };
  return [newState, deletedRecords];
};

// --- VALIDATION ---

const validateRecord = (record: KRecord, tableSchema: Record<string, any>, existingRecords: KRecord[]): void => {
  for (const [columnName, colDef] of Object.entries(tableSchema)) {
    if (!colDef || typeof colDef !== 'object' || !('dataType' in colDef)) continue;

    const value = record[columnName];
    const options = colDef.options || {};

    // Skip validation for undefined values (they should have defaults applied already)
    if (value === undefined) continue;

    // Validate unique constraint
    if (options.unique && existingRecords.some(r => r[columnName] === value)) {
      throw KonroValidationError(`Value '${String(value)}' for column '${columnName}' must be unique`);
    }

    // Validate string constraints
    if (colDef.dataType === 'string' && typeof value === 'string') {
      // Min length
      if (options.min !== undefined && value.length < options.min) {
        throw KonroValidationError(`String '${value}' for column '${columnName}' is too short (min: ${options.min})`);
      }

      // Max length
      if (options.max !== undefined && value.length > options.max) {
        throw KonroValidationError(`String '${value}' for column '${columnName}' is too long (max: ${options.max})`);
      }

      // Format validation
      if (options.format === 'email' && !isValidEmail(value)) {
        throw KonroValidationError(`Value '${value}' for column '${columnName}' is not a valid email`);
      }
    }

    // Validate number constraints
    if (colDef.dataType === 'number' && typeof value === 'number') {
      // Min value
      if (options.min !== undefined && value < options.min) {
        throw KonroValidationError(`Number ${value} for column '${columnName}' is too small (min: ${options.min})`);
      }

      // Max value
      if (options.max !== undefined && value > options.max) {
        throw KonroValidationError(`Number ${value} for column '${columnName}' is too large (max: ${options.max})`);
      }
    }
  }
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

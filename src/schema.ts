// --- TYPE UTILITIES ---
type Pretty<T> = { [K in keyof T]: T[K] } & {};

// --- CORE DEFINITIONS ---

export interface ColumnOptions<T> {
  unique?: boolean;
  default?: T | (() => T);
  [key: string]: any; // For rules like min, max, format etc.
}

export interface ColumnDefinition<T> {
  _type: 'column';
  dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  options?: ColumnOptions<T>;
  _tsType: T; // For TypeScript inference only
}

export interface RelationDefinition {
  _type: 'relation';
  relationType: 'one' | 'many';
  targetTable: string;
  on: string;
  references: string;
}

// --- TYPE INFERENCE MAGIC ---

type BaseModels<TTables extends Record<string, Record<string, ColumnDefinition<any>>>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: TTables[TableName][ColumnName]['_tsType'];
  };
};

type WithRelations<
  TBaseModels extends Record<string, any>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> = {
    [TableName in keyof TBaseModels]: TBaseModels[TableName] & (TableName extends keyof TRelations ? {
      [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName]['relationType'] extends 'one'
      ? TBaseModels[TRelations[TableName][RelationName]['targetTable']] | null
      : TBaseModels[TRelations[TableName][RelationName]['targetTable']][];
    } : {});
  };

export interface KonroSchema<
  TTables extends Record<string, Record<string, ColumnDefinition<any>>>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> {
  tables: TTables;
  relations: TRelations;
  types: Pretty<WithRelations<BaseModels<TTables>, TRelations>>;
}

// --- SCHEMA HELPERS ---

export const id = (): ColumnDefinition<number> => ({ _type: 'column', dataType: 'id', options: { unique: true }, _tsType: 0 });
export const string = (options?: ColumnOptions<string>): ColumnDefinition<string> => ({ _type: 'column', dataType: 'string', options, _tsType: '' });
export const number = (options?: ColumnOptions<number>): ColumnDefinition<number> => ({ _type: 'column', dataType: 'number', options, _tsType: 0 });
export const boolean = (options?: ColumnOptions<boolean>): ColumnDefinition<boolean> => ({ _type: 'column', dataType: 'boolean', options, _tsType: false });
export const date = (options?: ColumnOptions<Date>): ColumnDefinition<Date> => ({ _type: 'column', dataType: 'date', options, _tsType: new Date() });
export const object = <T extends Record<string, any>>(options?: ColumnOptions<T>): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options, _tsType: {} as T });

export const one = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'one', targetTable, ...options });
export const many = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'many', targetTable, ...options });

// --- SCHEMA BUILDER ---

type SchemaInputDef<T> = {
  tables: T;
  relations?: (tables: T) => Record<string, Record<string, RelationDefinition>>;
};

export function createSchema<const TDef extends SchemaInputDef<Record<string, Record<string, ColumnDefinition<any>>>>>(definition: TDef) {
  const relations = definition.relations ? definition.relations(definition.tables) : {};
  return {
    tables: definition.tables,
    relations,
    types: null as any, // This is a runtime placeholder for the inferred types
  } as KonroSchema<
    TDef['tables'],
    TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}
  >;
}

// --- TYPE UTILITIES ---
type Pretty<T> = { [K in keyof T]: T[K] } & {};

// --- CORE DEFINITIONS ---

export interface ColumnOptions<T> {
  unique?: boolean;
  default?: T | (() => T);
}

export interface StringColumnOptions extends ColumnOptions<string> {
  min?: number;
  max?: number;
  format?: 'email' | 'uuid' | 'url';
}

export interface NumberColumnOptions extends ColumnOptions<number> {
  min?: number;
  max?: number;
  type?: 'integer';
}

export interface ColumnDefinition<T> {
  _type: 'column';
  dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  options?: ColumnOptions<T>;
  _tsType: T; // For TypeScript inference only
}

export interface StringColumnDefinition extends ColumnDefinition<string> {
  dataType: 'string';
  options?: StringColumnOptions;
}

export interface NumberColumnDefinition extends ColumnDefinition<number> {
  dataType: 'number';
  options?: NumberColumnOptions;
}

export interface OneRelationDefinition<TTableName extends string = string> {
  _type: 'relation';
  relationType: 'one';
  targetTable: TTableName;
  on: string;
  references: string;
}

export interface ManyRelationDefinition<TTableName extends string = string> {
  _type: 'relation';
  relationType: 'many';
  targetTable: TTableName;
  on: string;
  references: string;
}

export type RelationDefinition<TTableName extends string = string> =
  | OneRelationDefinition<TTableName>
  | ManyRelationDefinition<TTableName>;

export interface AggregationDefinition {
  _type: 'aggregation';
  aggType: 'sum' | 'avg' | 'min' | 'max' | 'count';
  column?: string;
}

// --- TYPE INFERENCE MAGIC ---

type IdKey<TTableDef extends Record<string, ColumnDefinition<any>>> = {
  [K in keyof TTableDef]: TTableDef[K]['dataType'] extends 'id' ? K : never;
}[keyof TTableDef];

// Find keys for columns with defaults
type WithDefaultKey<TTableDef extends Record<string, ColumnDefinition<any>>> = {
    [K in keyof TTableDef]: TTableDef[K] extends { options: { default: any } }
        ? K
        : never;
}[keyof TTableDef];

type CreateModel<TTableDef extends Record<string, ColumnDefinition<any>>> = Pretty<
  // Required fields: all fields except ID and fields with defaults
  { [K in Exclude<keyof TTableDef, IdKey<TTableDef> | WithDefaultKey<TTableDef>>]: TTableDef[K]['_tsType'] } &
  // Optional fields: ID and fields with defaults
  Partial<{ [K in WithDefaultKey<TTableDef> | IdKey<TTableDef>]: TTableDef[K]['_tsType'] }>
>;

export type BaseModels<TTables extends Record<string, Record<string, ColumnDefinition<any>>>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: TTables[TableName][ColumnName]['_tsType'];
  };
};

type CreateModels<TTables extends Record<string, Record<string, ColumnDefinition<any>>>> = {
    [TableName in keyof TTables]: CreateModel<TTables[TableName]>
};

type WithRelations<
  TBaseModels extends BaseModels<any>,
  TRelations extends Record<string, Record<string, RelationDefinition<keyof TBaseModels & string>>>
> = {
  [TableName in keyof TBaseModels]: TBaseModels[TableName] & (TableName extends keyof TRelations ? {
      [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName]['relationType'] extends 'one'
        ? TBaseModels[TRelations[TableName][RelationName]['targetTable']] | null
        : TBaseModels[TRelations[TableName][RelationName]['targetTable']][];
    } : {});
};

export interface KonroSchema<
  TTables extends Record<string, Record<string, ColumnDefinition<any>>>,
  TRelations extends Record<string, Record<string, RelationDefinition<keyof TTables & string>>>
> {
  tables: TTables;
  relations: TRelations;
  types: Pretty<WithRelations<BaseModels<TTables>, TRelations>>;
  create: CreateModels<TTables>;
}

// --- SCHEMA HELPERS ---

export const id = (): ColumnDefinition<number> => ({
  _type: 'column',
  dataType: 'id',
  options: {
    unique: true,
  },
  _tsType: 0,
});

export const string = (options?: StringColumnOptions): StringColumnDefinition => ({ _type: 'column', dataType: 'string', options, _tsType: '' });
export const number = (options?: NumberColumnOptions): NumberColumnDefinition => ({ _type: 'column', dataType: 'number', options, _tsType: 0 });
export const boolean = (options?: ColumnOptions<boolean>): ColumnDefinition<boolean> => ({ _type: 'column', dataType: 'boolean', options, _tsType: false });
export const date = (options?: ColumnOptions<Date>): ColumnDefinition<Date> => ({ _type: 'column', dataType: 'date', options, _tsType: new Date() });
export const object = <T extends Record<string, any>>(options?: ColumnOptions<T>): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options, _tsType: undefined as any });

export const one = <T extends string>(targetTable: T, options: { on: string; references: string }): OneRelationDefinition<T> => ({ _type: 'relation', relationType: 'one', targetTable, ...options });
export const many = <T extends string>(targetTable: T, options: { on: string; references: string }): ManyRelationDefinition<T> => ({ _type: 'relation', relationType: 'many', targetTable, ...options });


// --- AGGREGATION HELPERS ---

export const count = (): AggregationDefinition => ({ _type: 'aggregation', aggType: 'count' });
export const sum = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'sum', column });
export const avg = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'avg', column });
export const min = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'min', column });
export const max = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'max', column });
// --- SCHEMA BUILDER ---

type SchemaInputDef<T> = {
  tables: T;
  relations?: (tables: T) => Record<string, Record<string, RelationDefinition<keyof T & string>>>;
};

export function createSchema<const TDef extends SchemaInputDef<any>>(definition: TDef) {
  const relations = definition.relations ? definition.relations(definition.tables) : {};
  return {
    tables: definition.tables,
    relations,
    types: null as any, // This is a runtime placeholder for the inferred types
    create: undefined as any, // This is a runtime placeholder for the create types
  } as KonroSchema<
    TDef['tables'],
    TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}
  >;
}

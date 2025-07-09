import { KonroStorageError } from './error.util';
import type { ColumnDefinition } from '../schema';

let yaml: { load: (str: string) => unknown; dump: (obj: any, options?: any) => string; } | undefined;
try {
  // Lazily attempt to load optional dependency
  yaml = require('js-yaml');
} catch {
  // js-yaml is not installed.
}

let papaparse: { parse: (str: string, config?: any) => { data: any[] }; unparse: (data: any[] | object) => string; } | undefined;
try {
  papaparse = require('papaparse');
} catch {
  // papaparse is not installed
}

let xlsx: { read: (data: any, opts: any) => any; utils: { sheet_to_json: <T>(ws: any) => T[]; json_to_sheet: (json: any) => any; book_new: () => any; book_append_sheet: (wb: any, ws: any, name: string) => void; }; write: (wb: any, opts: any) => any; } | undefined;
try {
  xlsx = require('xlsx');
} catch {
  // xlsx is not installed
}

export type Serializer = {
  parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>) => T;
  stringify: (obj: any) => string;
};

export const getSerializer = (format: 'json' | 'yaml' | 'csv' | 'xlsx'): Serializer => {
  if (format === 'json') {
    return {
      parse: <T>(data: string): T => JSON.parse(data),
      stringify: (obj: any): string => JSON.stringify(obj, null, 2),
    };
  }

  if (format === 'yaml') {
    if (!yaml) {
      throw KonroStorageError("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
    }

    return {
      // The cast from `unknown` is necessary as `yaml.load` is correctly typed to return `unknown`.
      parse: <T>(data: string): T => yaml.load(data) as T,
      stringify: (obj: any): string => yaml.dump(obj),
    };
  }

  if (format === 'csv') {
    if (!papaparse) {
      throw KonroStorageError("The 'csv' format requires 'papaparse' to be installed. Please run 'npm install papaparse'.");
    }
    return {
      parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>): T => {
        const { data: records } = papaparse!.parse(data, { header: true, dynamicTyping: true, skipEmptyLines: true });
        // For CSV/XLSX, metadata isn't stored. We derive lastId from the data itself.
        let lastId = 0;
        if (tableSchema) {
          const idColumn = Object.keys(tableSchema).find(
            (key) => tableSchema[key]?.dataType === 'id' && tableSchema[key]?.options?._pk_strategy !== 'uuid'
          );
          if (idColumn) {
            lastId = (records as any[]).reduce((maxId, record) => {
              const id = record[idColumn];
              return typeof id === 'number' && id > maxId ? id : maxId;
            }, 0);
          }
        }
        return { records, meta: { lastId } } as T;
      },
      stringify: (obj: any): string => papaparse!.unparse(obj.records || []),
    };
  }

  if (format === 'xlsx') {
    if (!xlsx) {
      throw KonroStorageError("The 'xlsx' format requires 'xlsx' to be installed. Please run 'npm install xlsx'.");
    }
    return {
      parse: <T>(data: string, tableSchema?: Record<string, ColumnDefinition<any>>): T => {
        const workbook = xlsx!.read(data, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return { records: [], meta: { lastId: 0 } } as T;
        const worksheet = workbook.Sheets[sheetName];
        const records = xlsx!.utils.sheet_to_json(worksheet);
        // For CSV/XLSX, metadata isn't stored. We derive lastId from the data itself.
        let lastId = 0;
        if (tableSchema) {
          const idColumn = Object.keys(tableSchema).find(
            (key) => tableSchema[key]?.dataType === 'id' && tableSchema[key]?.options?._pk_strategy !== 'uuid'
          );
          if (idColumn) {
            lastId = (records as any[]).reduce((maxId: number, record: any) => {
              const id = record[idColumn];
              return typeof id === 'number' && id > maxId ? id : maxId;
            }, 0);
          }
        }
        return { records, meta: { lastId } } as T;
      },
      stringify: (obj: any): string => {
        const worksheet = xlsx!.utils.json_to_sheet(obj.records || []);
        const workbook = xlsx!.utils.book_new();
        xlsx!.utils.book_append_sheet(workbook, worksheet, 'data');
        return xlsx!.write(workbook, { bookType: 'xlsx', type: 'base64' });
      },
    };
  }

  // This should be unreachable with TypeScript, but provides a safeguard.
  throw KonroStorageError(`Unsupported or invalid format specified.`);
};
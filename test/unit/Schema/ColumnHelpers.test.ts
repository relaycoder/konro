import { describe, it, expect } from 'bun:test';
import { konro } from '../../../src/index';

describe('Unit > Schema > ColumnHelpers', () => {
  it('should create a valid ID column definition object when calling konro.id()', () => {
    const idCol = konro.id();
    expect(idCol).toEqual({
      _type: 'column',
      dataType: 'id',
      options: { unique: true },
      _tsType: 0,
    });
  });

  it('should create a valid string column definition with all specified options', () => {
    const defaultFn = () => 'default';
    const stringCol = konro.string({
      unique: true,
      default: defaultFn,
      min: 5,
      max: 100,
      format: 'email',
    });
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: {
        unique: true,
        default: defaultFn,
        min: 5,
        max: 100,
        format: 'email',
      },
      _tsType: '',
    });
  });

  it('should create a valid number column definition with all specified options', () => {
    const numberCol = konro.number({
      unique: false,
      default: 0,
      min: 0,
      max: 1000,
      type: 'integer',
    });
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: {
        unique: false,
        default: 0,
        min: 0,
        max: 1000,
        type: 'integer',
      },
      _tsType: 0,
    });
  });

  it('should create a valid boolean column definition with a default value', () => {
    const boolCol = konro.boolean({ default: false });
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: { default: false },
      _tsType: false,
    });
  });

  it('should create a valid date column definition with a default function', () => {
    const defaultDateFn = () => new Date();
    const dateCol = konro.date({ default: defaultDateFn });
    expect(dateCol).toEqual({
      _type: 'column',
      dataType: 'date',
      options: { default: defaultDateFn },
      _tsType: expect.any(Date),
    });
    expect(dateCol.options?.default).toBe(defaultDateFn);
  });

  it('should create a valid object column definition', () => {
    const objCol = konro.object<{ meta: string }>();
    expect(objCol).toMatchObject({
      _type: 'column',
      dataType: 'object',
      options: undefined,
    });
  });
});
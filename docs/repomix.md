# Directory Structure
```
package.json
README.md
src/adapter.ts
src/db.ts
src/index.ts
src/operations.ts
src/schema.ts
src/types.ts
src/utils/constants.ts
src/utils/error.util.ts
src/utils/fs.util.ts
src/utils/predicate.util.ts
src/utils/serializer.util.ts
test/unit/Core/Aggregate.test.ts
test/unit/Core/Delete.test.ts
test/unit/Core/Insert.test.ts
test/unit/Core/Query-With.test.ts
test/unit/Core/Query.test.ts
test/unit/Core/Update.test.ts
test/unit/Schema/ColumnHelpers.test.ts
test/unit/Schema/CreateSchema.test.ts
test/unit/Schema/RelationHelpers.test.ts
test/unit/Validation/Constraints.test.ts
tsconfig.json
```

# Files

## File: src/utils/constants.ts
````typescript
export const TEMP_FILE_SUFFIX = '.tmp';
````

## File: src/utils/fs.util.ts
````typescript
import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './constants';

export const readFile = async (filepath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filepath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const writeAtomic = async (filepath: string, content: string): Promise<void> => {
    // Adding Date.now() for uniqueness in case of concurrent operations
    const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(tempFilepath, content, 'utf-8');
    await fs.rename(tempFilepath, filepath);
};
````

## File: src/utils/predicate.util.ts
````typescript
import { KRecord } from '../types';

/** Creates a predicate function from a partial object for equality checks, avoiding internal casts. */
export const createPredicateFromPartial = <T extends KRecord>(partial: Partial<T>): ((record: T) => boolean) => {
  // `Object.keys` is cast because TypeScript types it as `string[]` instead of `(keyof T)[]`.
  const keys = Object.keys(partial) as (keyof T)[];
  return (record: T): boolean => keys.every(key => record[key] === partial[key]);
};
````

## File: test/unit/Core/Aggregate.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _aggregateImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';
import { konro } from '../../../src/index';

describe('Unit > Core > Aggregate', () => {
  let testState: DatabaseState;

  beforeEach(() => {
    testState = {
      users: {
        records: [
          { id: 1, name: 'Alice', age: 30, isActive: true },
          { id: 2, name: 'Bob', age: 25, isActive: true },
          { id: 3, name: 'Charlie', age: 42, isActive: false },
          { id: 4, name: 'Denise', age: 30, isActive: true },
          { id: 5, name: 'Edward', age: null, isActive: true }, // age can be null
        ],
        meta: { lastId: 5 },
      },
      posts: { records: [], meta: { lastId: 0 } },
      profiles: { records: [], meta: { lastId: 0 } },
      tags: { records: [], meta: { lastId: 0 } },
      posts_tags: { records: [], meta: { lastId: 0 } },
    };
  });

  it('should correctly count all records in a table', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: { total: konro.count() }
    });
    expect(result.total).toBe(5);
  });

  it('should correctly count records matching a where clause', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      where: (r) => r.isActive === true,
      aggregations: { activeUsers: konro.count() }
    });
    expect(result.activeUsers).toBe(4);
  });

  it('should correctly sum a numeric column', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: { totalAge: konro.sum('age') }
    });
    // 30 + 25 + 42 + 30 = 127
    expect(result.totalAge).toBe(127);
  });

  it('should correctly calculate the average of a numeric column', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: { averageAge: konro.avg('age') }
    });
    // 127 / 4 = 31.75
    expect(result.averageAge).toBe(31.75);
  });

  it('should find the minimum value in a numeric column', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: { minAge: konro.min('age') }
    });
    expect(result.minAge).toBe(25);
  });

  it('should find the maximum value in a numeric column', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: { maxAge: konro.max('age') }
    });
    expect(result.maxAge).toBe(42);
  });

  it('should handle multiple aggregations in one call', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      where: (r) => r.isActive === true,
      aggregations: {
        count: konro.count(),
        avgAge: konro.avg('age'), // Alice(30), Bob(25), Denise(30) -> 85 / 3
      }
    });
    expect(result.count).toBe(4); // Includes Edward with null age
    expect(result.avgAge).toBeCloseTo(85 / 3);
  });

  it('should return 0 for count on an empty/filtered-out set', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      where: (r) => (r.age as number) > 100,
      aggregations: { count: konro.count() }
    });
    expect(result.count).toBe(0);
  });

  it('should return 0 for sum on an empty set', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      where: (r) => (r.age as number) > 100,
      aggregations: { sumAge: konro.sum('age') }
    });
    expect(result.sumAge).toBe(0);
  });

  it('should return null for avg, min, and max on an empty set', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      where: (r) => (r.age as number) > 100,
      aggregations: {
        avgAge: konro.avg('age'),
        minAge: konro.min('age'),
        maxAge: konro.max('age'),
      }
    });
    expect(result.avgAge).toBeNull();
    expect(result.minAge).toBeNull();
    expect(result.maxAge).toBeNull();
  });

  it('should ignore non-numeric and null values in calculations', () => {
    const result = _aggregateImpl(testState, testSchema, {
      tableName: 'users',
      aggregations: {
        count: konro.count(),
        sum: konro.sum('age'),
        avg: konro.avg('age'),
        min: konro.min('age'),
        max: konro.max('age'),
      }
    });
    // There are 5 users, but only 4 have numeric ages.
    // The implementation of avg/sum/min/max filters for numbers.
    // The count is for all records matching where.
    expect(result.count).toBe(5);
    expect(result.sum).toBe(127);
    expect(result.avg).toBe(31.75);
    expect(result.min).toBe(25);
    expect(result.max).toBe(42);
  });
});
````

## File: test/unit/Schema/RelationHelpers.test.ts
````typescript
import { describe, it, expect } from 'bun:test';
import { konro } from '../../../src/index';

describe('Unit > Schema > RelationHelpers', () => {
  it('should create a valid one-to-many relationship definition object when calling konro.many()', () => {
    const manyRel = konro.many('posts', { on: 'id', references: 'authorId' });
    expect(manyRel).toEqual({
      _type: 'relation',
      relationType: 'many',
      targetTable: 'posts',
      on: 'id',
      references: 'authorId',
    });
  });

  it('should create a valid one-to-one/many-to-one relationship definition object when calling konro.one()', () => {
    const oneRel = konro.one('users', { on: 'authorId', references: 'id' });
    expect(oneRel).toEqual({
      _type: 'relation',
      relationType: 'one',
      targetTable: 'users',
      on: 'authorId',
      references: 'id',
    });
  });
});
````

## File: src/index.ts
````typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, string, number, boolean, date, object, one, many, count, sum, avg, min, max } from './schema';

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
  string,
  number,
  boolean,
  date,
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
````

## File: src/utils/error.util.ts
````typescript
// Per user request: no classes. Using constructor functions for errors.
const createKonroError = (name: string) => {
  function KonroErrorConstructor(message: string) {
    const error = new Error(message);
    error.name = name;
    Object.setPrototypeOf(error, KonroErrorConstructor.prototype);
    return error;
  }
  Object.setPrototypeOf(KonroErrorConstructor.prototype, Error.prototype);
  return KonroErrorConstructor;
};

/** Base constructor for all Konro-specific errors. */
export const KonroError = createKonroError('KonroError');

/** Thrown for storage adapter-related issues. */
export const KonroStorageError = createKonroError('KonroStorageError');

/** Thrown for schema validation errors. */
export const KonroValidationError = createKonroError('KonroValidationError');

/** Thrown when a resource is not found. */
export const KonroNotFoundError = createKonroError('KonroNotFoundError');
````

## File: src/utils/serializer.util.ts
````typescript
import { KonroStorageError } from './error.util';

let yaml: { load: (str: string) => unknown; dump: (obj: any, options?: any) => string; } | undefined;
try {
  // Lazily attempt to load optional dependency
  yaml = require('js-yaml');
} catch {
  // js-yaml is not installed.
}

export type Serializer = {
  parse: <T>(data: string) => T;
  stringify: (obj: any) => string;
};

export const getSerializer = (format: 'json' | 'yaml'): Serializer => {
  if (format === 'json') {
    return {
      parse: <T>(data: string): T => JSON.parse(data),
      stringify: (obj: any): string => JSON.stringify(obj, null, 2),
    };
  }

  if (!yaml) {
    throw KonroStorageError("The 'yaml' format requires 'js-yaml' to be installed. Please run 'npm install js-yaml'.");
  }

  return {
    // The cast from `unknown` is necessary as `yaml.load` is correctly typed to return `unknown`.
    parse: <T>(data: string): T => yaml.load(data) as T,
    stringify: (obj: any): string => yaml.dump(obj),
  };
};
````

## File: test/unit/Core/Delete.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { _deleteImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';

describe('Unit > Core > Delete', () => {
    let testState: DatabaseState;

    beforeEach(() => {
        testState = {
            users: {
                records: [
                    { id: 1, name: 'Alice', email: 'a@a.com', age: 30 },
                    { id: 2, name: 'Bob', email: 'b@b.com', age: 25 },
                    { id: 3, name: 'Charlie', email: 'c@c.com', age: 42 },
                ],
                meta: { lastId: 3 },
            },
            posts: { records: [], meta: { lastId: 0 } },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should return a new state object, not mutate the original state, on delete', () => {
        const originalState = structuredClone(testState);
        const [newState] = _deleteImpl(testState, 'users', (r) => r.id === 1);
        
        expect(newState).not.toBe(originalState);
        expect(originalState.users!.records.length).toBe(3);
        expect(newState.users!.records.length).toBe(2);
    });

    it('should only delete records that match the predicate function', () => {
        const [newState, deleted] = _deleteImpl(testState, 'users', (r) => typeof r.age === 'number' && r.age > 35);
        
        expect(deleted.length).toBe(1);
        expect(deleted[0]!.id).toBe(3);
        expect(newState.users!.records.length).toBe(2);
        expect(newState.users!.records.find(u => u.id === 3)).toBeUndefined();
    });

    it('should return both the new state and an array of the full, deleted records in the result tuple', () => {
        const [newState, deleted] = _deleteImpl(testState, 'users', (r) => r.id === 2);

        expect(newState).toBeDefined();
        expect(deleted).toBeInstanceOf(Array);
        expect(deleted.length).toBe(1);
        expect(deleted[0]!).toEqual({ id: 2, name: 'Bob', email: 'b@b.com', age: 25 });
    });

    it('should not modify the table meta lastId on delete', () => {
        const [newState] = _deleteImpl(testState, 'users', (r) => r.id === 3);
        expect(newState.users!.meta.lastId).toBe(3);
    });
});
````

## File: test/unit/Core/Insert.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _insertImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';

describe('Unit > Core > Insert', () => {
    let emptyState: DatabaseState;

    beforeEach(() => {
        emptyState = {
            users: { records: [], meta: { lastId: 0 } },
            posts: { records: [], meta: { lastId: 10 } },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should return a new state object, not mutate the original state, on insert', () => {
        const originalState = structuredClone(emptyState);
        const [newState] = _insertImpl(emptyState, testSchema, 'users', [{ name: 'Test', email: 'test@test.com', age: 25 }]);
        
        expect(newState).not.toBe(originalState);
        expect(originalState.users!.records.length).toBe(0);
        expect(newState.users!.records.length).toBe(1);
    });

    it('should correctly increment the lastId in the table meta', () => {
        const [newState] = _insertImpl(emptyState, testSchema, 'users', [{ name: 'Test', email: 'test@test.com', age: 25 }]);
        expect(newState.users!.meta.lastId).toBe(1);

        const [finalState] = _insertImpl(newState, testSchema, 'users', [{ name: 'Test2', email: 'test2@test.com', age: 30 }]);
        expect(finalState.users!.meta.lastId).toBe(2);
    });

    it('should assign the new id to the inserted record', () => {
        const [newState, inserted] = _insertImpl(emptyState, testSchema, 'posts', [{ title: 'My Post', content: '...', authorId: 1 }]);
        expect(newState.posts!.meta.lastId).toBe(11);
        expect(inserted[0]!.id).toBe(11);
        expect(newState.posts!.records[0]!.id).toBe(11);
    });

    it('should apply default values for fields that are not provided', () => {
        const [newState, inserted] = _insertImpl(emptyState, testSchema, 'users', [{ name: 'Default User', email: 'default@test.com', age: 30 }]);
        expect(inserted[0]!.isActive).toBe(true);
        expect(newState.users!.records[0]!.isActive).toBe(true);
    });

    it('should apply default values from a function call, like for dates', () => {
        const before = new Date();
        const [newState, inserted] = _insertImpl(emptyState, testSchema, 'posts', [{ title: 'Dated Post', content: '...', authorId: 1 }]);
        const after = new Date();

        const publishedAt = inserted[0]!.publishedAt as Date;
        expect(publishedAt).toBeInstanceOf(Date);
        expect(publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(publishedAt.getTime()).toBeLessThanOrEqual(after.getTime());
        expect(newState.posts!.records[0]!.publishedAt).toEqual(publishedAt);
    });

    it('should successfully insert multiple records in a single call', () => {
        const usersToInsert = [
            { name: 'User A', email: 'a@test.com', age: 21 },
            { name: 'User B', email: 'b@test.com', age: 22 },
        ];
        const [newState, inserted] = _insertImpl(emptyState, testSchema, 'users', usersToInsert);

        expect(newState.users!.records.length).toBe(2);
        expect(inserted.length).toBe(2);
        expect(newState.users!.meta.lastId).toBe(2);
        expect(inserted[0]!.id).toBe(1);
        expect(inserted[1]!.id).toBe(2);
        expect(inserted[0]!.name).toBe('User A');
        expect(inserted[1]!.name).toBe('User B');
    });

    it('should return both the new state and the newly created record(s) in the result tuple', () => {
        const userToInsert = { name: 'Single', email: 'single@test.com', age: 40 };
        const [newState, inserted] = _insertImpl(emptyState, testSchema, 'users', [userToInsert]);
        
        expect(newState).toBeDefined();
        expect(inserted).toBeInstanceOf(Array);
        expect(inserted.length).toBe(1);
        expect(inserted[0]!.name).toBe('Single');
        expect(inserted[0]!.id).toBe(1);
    });
});
````

## File: test/unit/Core/Update.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _updateImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';

describe('Unit > Core > Update', () => {
    let testState: DatabaseState;

    beforeEach(() => {
        testState = {
            users: {
                records: [
                    { id: 1, name: 'Alice', email: 'a@a.com', age: 30, isActive: true },
                    { id: 2, name: 'Bob', email: 'b@b.com', age: 25, isActive: true },
                    { id: 3, name: 'Charlie', email: 'c@c.com', age: 42, isActive: false },
                ],
                meta: { lastId: 3 },
            },
            posts: { records: [], meta: { lastId: 0 } },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should return a new state object, not mutate the original state, on update', () => {
        const originalState = structuredClone(testState);
        const [newState] = _updateImpl(testState, testSchema, 'users', { age: 31 }, (r) => r.id === 1);
        
        expect(newState).not.toBe(originalState);
        expect(originalState.users!.records[0]!.age).toBe(30);
        expect(newState.users!.records.find(u => u.id === 1)?.age).toBe(31);
    });

    it('should only update records that match the predicate function', () => {
        const [newState, updated] = _updateImpl(testState, testSchema, 'users', { isActive: true }, (r) => r.name === 'Charlie');
        
        expect(updated.length).toBe(1);
        expect(updated[0]!.id).toBe(3);
        expect(updated[0]!.isActive).toBe(true);
        expect(newState.users!.records.find(u => u.id === 3)?.isActive).toBe(true);
        expect(newState.users!.records.find(u => u.id === 1)?.isActive).toBe(true); // Unchanged
    });

    it('should correctly modify the fields specified in the set payload', () => {
        const [newState, updated] = _updateImpl(testState, testSchema, 'users', { age: 26, name: 'Robert' }, (r) => r.id === 2);

        expect(updated.length).toBe(1);
        const updatedUser = newState.users!.records.find(u => u.id === 2);
        expect(updatedUser?.name).toBe('Robert');
        expect(updatedUser?.age).toBe(26);
    });

    it('should not allow changing the id of an updated record', () => {
        const payload = { id: 99, age: 50 };
        const [newState, updated] = _updateImpl(testState, testSchema, 'users', payload, (r) => r.id === 1);
        
        expect(updated.length).toBe(1);
        expect(updated[0]!.id).toBe(1); // The id should remain 1
        expect(updated[0]!.age).toBe(50);
        
        const userInNewState = newState.users!.records.find(u => u.age === 50);
        expect(userInNewState?.id).toBe(1);

        const userWithOldId = newState.users!.records.find(u => u.id === 1);
        expect(userWithOldId).toBeDefined();
        expect(userWithOldId?.age).toBe(50);
        
        const userWithNewId = newState.users!.records.find(u => u.id === 99);
        expect(userWithNewId).toBeUndefined();
    });

    it('should return an empty array of updated records if the predicate matches nothing', () => {
        const [newState, updated] = _updateImpl(testState, testSchema, 'users', { age: 99 }, (r) => r.id === 999);
        expect(updated.length).toBe(0);
        expect(newState.users!.records).toEqual(testState.users!.records);
        expect(newState).not.toBe(testState);
    });

    it('should return both the new state and an array of the full, updated records in the result tuple', () => {
        const [newState, updated] = _updateImpl(testState, testSchema, 'users', { isActive: false }, (r) => r.id === 1);
        expect(newState).toBeDefined();
        expect(updated).toBeInstanceOf(Array);
        expect(updated.length).toBe(1);
        expect(updated[0]!).toEqual({
            id: 1,
            name: 'Alice',
            email: 'a@a.com',
            age: 30,
            isActive: false,
        });
    });
});
````

## File: test/unit/Schema/CreateSchema.test.ts
````typescript
import { describe, it, expect } from 'bun:test';
import { konro } from '../../../src/index';

describe('Unit > Schema > CreateSchema', () => {
  it('should correctly assemble a full schema object from tables and relations definitions', () => {
    const tableDefs = {
      users: {
        id: konro.id(),
        name: konro.string(),
      },
      posts: {
        id: konro.id(),
        title: konro.string(),
        authorId: konro.number(),
      },
    };

    const schema = konro.createSchema({
      tables: tableDefs,
      relations: () => ({
        users: {
          posts: konro.many('posts', { on: 'id', references: 'authorId' }),
        },
        posts: {
          author: konro.one('users', { on: 'authorId', references: 'id' }),
        },
      }),
    });

    expect(schema.tables).toBe(tableDefs);
    expect(schema.relations).toBeDefined();
    expect(schema.relations.users.posts).toBeDefined();
    expect(schema.relations.posts.author).toBeDefined();
    expect(schema.types).toBeNull(); // Runtime placeholder
  });

  it('should handle schemas with no relations defined', () => {
    const tableDefs = {
      logs: {
        id: konro.id(),
        message: konro.string(),
      },
    };

    const schema = konro.createSchema({
      tables: tableDefs,
    });

    expect(schema.tables).toBe(tableDefs);
    expect(schema.relations).toEqual({});
  });

  it('should handle schemas where relations function returns an empty object', () => {
    const tableDefs = {
      users: {
        id: konro.id(),
        name: konro.string(),
      },
    };

    const schema = konro.createSchema({
      tables: tableDefs,
      relations: () => ({}),
    });

    expect(schema.tables).toBe(tableDefs);
    expect(schema.relations).toEqual({});
  });

  it('should handle schemas with multiple relations on one table', () => {
    const tableDefs = {
      users: { id: konro.id(), name: konro.string() },
      posts: { id: konro.id(), title: konro.string(), authorId: konro.number(), editorId: konro.number() },
    };

    const schema = konro.createSchema({
      tables: tableDefs,
      relations: () => ({
        posts: {
          author: konro.one('users', { on: 'authorId', references: 'id' }),
          editor: konro.one('users', { on: 'editorId', references: 'id' }),
        },
      }),
    });

    expect(schema.relations.posts.author).toBeDefined();
    expect(schema.relations.posts.editor).toBeDefined();
    expect(schema.relations.posts.author.targetTable).toBe('users');
    expect(schema.relations.posts.editor.targetTable).toBe('users');
  });
});
````

## File: test/unit/Validation/Constraints.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _insertImpl, _updateImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';
import { KonroValidationError } from '../../../src/utils/error.util';

describe('Unit > Validation > Constraints', () => {
    let testState: DatabaseState;

    beforeEach(() => {
        testState = {
            users: {
                records: [{ id: 1, name: 'Alice', email: 'alice@example.com', age: 30, isActive: true }],
                meta: { lastId: 1 },
            },
            posts: { records: [], meta: { lastId: 0 } },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    // NOTE: These tests are expected to fail until validation is implemented in core operations.
    // This is intentional to highlight the missing functionality as per the test plan.
    
    it('should throw a KonroValidationError when inserting a record with a non-unique value', () => {
        const user = { name: 'Bob', email: 'alice@example.com', age: 25 };
        // This should throw because 'alice@example.com' is already used and `email` is unique.
        expect(() => _insertImpl(testState, testSchema, 'users', [user])).toThrow(KonroValidationError);
    });

    it('should throw a KonroValidationError for a string that violates a format: email constraint', () => {
        const user = { name: 'Bob', email: 'bob@invalid', age: 25 };
        // This should throw because the email format is invalid.
        expect(() => _insertImpl(testState, testSchema, 'users', [user])).toThrow(KonroValidationError);
    });

    it('should throw a KonroValidationError for a number smaller than the specified min', () => {
        const user = { name: 'Bob', email: 'bob@example.com', age: 17 }; // age.min is 18
        // This should throw because age is below min.
        expect(() => _insertImpl(testState, testSchema, 'users', [user])).toThrow(KonroValidationError);
    });

    it('should throw a KonroValidationError for a string shorter than the specified min', () => {
        const user = { name: 'B', email: 'bob@example.com', age: 25 }; // name.min is 2
        // This should throw because name is too short.
        expect(() => _insertImpl(testState, testSchema, 'users', [user])).toThrow(KonroValidationError);
    });
    
    it('should throw a KonroValidationError on update for a non-unique value', () => {
        // Add another user to create conflict
        testState.users!.records.push({ id: 2, name: 'Charlie', email: 'charlie@example.com', age: 40, isActive: true });
        testState.users!.meta.lastId = 2;

        const predicate = (r: any) => r.id === 2;
        const data = { email: 'alice@example.com' }; // Try to update charlie's email to alice's

        expect(() => _updateImpl(testState, testSchema, 'users', data, predicate)).toThrow(KonroValidationError);
    });
});
````

## File: README.md
````markdown
# Konro: The Type-Safe, Functional ORM for JSON/YAML

<p align="center">
  <img src="https://i.imgur.com/vHq4gXz.png" alt="Konro Logo - A bowl of soup representing the database state, with spices (functions) being added" width="200" />
</p>

<p align="center">
  <strong>Slow-simmer your data. A pure, functional, and type-safe "spice rack" for your JSON or YAML "broth".</strong>
</p>

<p align="center">
  <a href="https://nodei.co/npm/konro-db/"><img src="https://nodei.co/npm/konro-db.png?downloads=true&compact=true" alt="NPM"></a>
  <br>
  <img alt="npm" src="https://img.shields.io/npm/v/konro-db?style=for-the-badge&color=c43a3a">
  <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/your-repo/konro/ci.yml?style=for-the-badge&logo=github">
  <img alt="License" src="https://img.shields.io/npm/l/konro-db?style=for-the-badge">
</p>

---

Konro is a new kind of "micro-ORM" for JavaScript and TypeScript. It offers the safety and developer experience of a full-scale, relational database ORM, but for local **JSON or YAML files**. It is designed from the ground up to be **type-safe, immutable, relational, and ergonomic,** making it the perfect data persistence layer for local-first apps, CLIs, and small servers.

## Table of Contents

1.  [**The Konro Philosophy: Cooking Your Data**](#1-the-konro-philosophy-cooking-your-data)
2.  [**Core Principles: The Konro Difference**](#2-core-principles-the-konro-difference)
3.  [**When to Use Konro (and When Not To)**](#3-when-to-use-konro-and-when-not-to)
4.  [**Installation**](#4-installation)
5.  [**The 5-Minute Recipe: A Quick Start**](#5-the-5-minute-recipe-a-quick-start)
6.  [**Pillar I: The Recipe (Schema Definition)**](#6-pillar-i-the-recipe-schema-definition)
    *   [The `konro.createSchema` Function](#the-konrocreateschema-function)
    *   [Defining Tables and Columns](#defining-tables-and-columns)
    *   [Defining Relationships](#defining-relationships)
    *   [Inferring Static Types: The Magic](#inferring-static-types-the-magic)
7.  [**Pillar II: The Kitchen (Database Context)**](#7-pillar-ii-the-kitchen-database-context)
    *   [Choosing a Storage Adapter](#choosing-a-storage-adapter)
    *   [The `konro.createDatabase` Function](#the-konrocreatedatabase-function)
8.  [**Pillar III: Cooking (The Fluent API)**](#8-pillar-iii-cooking-the-fluent-api)
    *   [The Transactional Workflow: Read, Mutate, Write](#the-transactional-workflow-read-mutate-write)
    *   [Reading Data with `db.query()`](#reading-data-with-dbquery)
    *   [Inserting Data with `db.insert()`](#inserting-data-with-dbinsert)
    *   [Updating Data with `db.update()`](#updating-data-with-dbupdate)
    *   [Deleting Data with `db.delete()`](#deleting-data-with-dbdelete)
9.  [**Advanced Concepts & Patterns**](#9-advanced-concepts--patterns)
    *   [Testing Your Logic](#testing-your-logic)
    *   [Performance Considerations](#performance-considerations)
10. [**API Reference Cheatsheet**](#10-api-reference-cheatsheet)
11. [**Comparison to Other Libraries**](#11-comparison-to-other-libraries)
12. [**Contributing**](#12-contributing)
13. [**License**](#13-license)

---

## 1. The Konro Philosophy: Cooking Your Data

Konro is inspired by the art of Indonesian cooking, where a rich soup or `Konro` is made by carefully combining a base broth with a precise recipe and a collection of spices. Konro treats your data with the same philosophy.

*   **The Broth (Your Data):** Your database state is a plain, passive JSON object. It holds no logic.
*   **The Recipe (Your Schema):** You define a schema that acts as a recipe, describing your data's structure, types, and relationships.
*   **The Spices (Pure Functions):** Konro provides a set of pure, immutable functions that act as spices. They take the broth and transform it, always returning a *new, updated broth*, never changing the original.
*   **The Fluent API (Your Guided Hand):** Konro provides an ergonomic, chainable API that guides you through the process of combining these elements, making the entire cooking process safe, predictable, and enjoyable.

## 2. Core Principles: The Konro Difference

*   **Type-First, Not Schema-First:** You don't write a schema to get types. You write a schema *as* types. Your schema definition becomes your single source of truth for both runtime validation and static TypeScript types.
*   **Stateless Core, Stateful Feel:** The internal engine is a collection of pure, stateless functions (`(state, args) => newState`). The user-facing API is a fluent, chainable "query builder" that feels intuitive and stateful, giving you the best of both worlds.
*   **Immutable by Default:** Data is never mutated. Every `insert`, `update`, or `delete` operation is an explicit API call that returns a `[newState, result]` tuple. This eliminates side effects and makes state management predictable and safe.
*   **Relational at Heart:** Define `one-to-one`, `one-to-many`, and `many-to-one` relationships directly in your schema. Eager-load related data with a simple and fully-typed `.with()` clause.

## 3. When to Use Konro (and When Not To)

✅ **Use Konro for:**

*   **Local-First Applications:** The perfect data layer for Electron, Tauri, or any desktop app needing a robust, relational store.
*   **Command-Line Tools (CLIs):** Manage complex state or configuration for a CLI tool in a structured, safe way.
*   **Small to Medium Servers:** Ideal for personal projects, blogs, portfolios, or microservices where you want to avoid the overhead of a traditional database.
*   **Rapid Prototyping:** Get the benefits of a type-safe, relational ORM without spinning up a database server.

❌ **Consider other solutions if you need:**

*   **High-Concurrency Writes:** Konro's default adapters are not designed for environments where many processes need to write to the database simultaneously at high frequency.
*   **Gigabyte-Scale Datasets:** Konro operates on data in memory, making it unsuitable for datasets that cannot comfortably fit into RAM.
*   **Distributed Systems:** Konro is a single-node database solution by design.

---

## 4. Installation

```bash
npm install konro-db
# If using YAML files, you will also need to install `js-yaml`
# npm install js-yaml
```

---

## 5. The 5-Minute Recipe: A Quick Start

Let's build a simple, relational blog database from scratch.

**Step 1: Define the Recipe (`src/schema.ts`)**
Create a single source of truth for your entire database structure. Konro will infer your TypeScript types from this object.

```typescript
import { konro } from 'konro-db';

export const blogSchema = konro.createSchema({
  tables: {
    users: {
      id: konro.id(),
      name: konro.string({ min: 2 }),
      email: konro.string({ format: 'email', unique: true }),
    },
    posts: {
      id: konro.id(),
      title: konro.string({ min: 5 }),
      published: konro.boolean({ default: false }),
      authorId: konro.number({ type: 'integer' }),
    },
  },
  relations: (t) => ({
    users: {
      posts: konro.many('posts', { on: 'id', references: 'authorId' }),
    },
    posts: {
      author: konro.one('users', { on: 'authorId', references: 'id' }),
    },
  }),
});

// INFER YOUR TYPES! No need to write `interface User` ever again.
export type User = typeof blogSchema.types.users;
export type Post = typeof blogSchema.types.posts;
```

**Step 2: Prepare the Kitchen (`src/db.ts`)**
Create a database context that is pre-configured with your schema and a storage adapter.

```typescript
import { konro, createFileAdapter } from 'konro-db';
import { blogSchema } from './schema';

// Example: Use a multi-file YAML adapter to create 'users.yaml' and 'posts.yaml'.
const adapter = createFileAdapter({
  format: 'yaml', // Specify the file format: 'json' or 'yaml'
  multi: { dir: './data/yaml_db' },
});

// You could also use a single JSON file:
// const adapter = createFileAdapter({
//   format: 'json',
//   single: { filepath: './data/database.json' }
// });

// Create the db context. This is your main interface to Konro.
export const db = konro.createDatabase({
  schema: blogSchema,
  adapter,
});
```

**Step 3: Start Cooking (`src/index.ts`)**
Use the `db` context and your inferred types to interact with your data in a fully type-safe way.

```typescript
import { db } from './db';
import type { User } from './schema';

async function main() {
  // 1. READ state from disk.
  let state = await db.read();
  console.log('Database state loaded.');

  // 2. INSERT a new user. `db.insert` is a pure function.
  // It returns a tuple: [newState, insertedRecord].
  let newUser: User;
  [state, newUser] = db.insert(state, 'users', {
    name: 'Chef Renatta',
    email: 'renatta@masterchef.dev',
  });
  console.log('User created:', newUser);

  // Use the NEW state for the next operation. This is key to immutability.
  [state] = db.insert(state, 'posts', {
    title: 'The Art of Plating',
    authorId: newUser.id,
  });

  // 3. UPDATE a record using the fluent API.
  let updatedPosts; // Type inferred as Post[]
  [state, updatedPosts] = await db.update(state, 'posts')
    .set({ published: true })
    .where({ id: 1 });
  console.log('Post published:', updatedPosts[0]);

  // 4. WRITE the final state back to disk.
  await db.write(state);
  console.log('Database saved!');

  // 5. QUERY the data with the fluent API.
  const authorWithPosts = await db.query(state)
    .select()
    .from('users')
    .where({ id: newUser.id })
    .with({ posts: true }) // Eager-load the 'posts' relation
    .first();

  console.log('\n--- Final Query Result ---');
  console.log(JSON.stringify(authorWithPosts, null, 2));
}

main().catch(console.error);
```

---

## 6. Pillar I: The Recipe (Schema Definition)

The `konro.createSchema` function is the heart of your application. It provides runtime validation and static types from one definition.

### The `konro.createSchema` Function

It accepts a single configuration object with two main keys: `tables` and `relations`.

### Defining Tables and Columns

Under the `tables` key, you define each table and its columns using Konro's helper functions. These helpers not only define the type but also allow for validation rules.

| Helper             | Description & Options                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `konro.id()`       | A managed, auto-incrementing integer primary key.                                      |
| `konro.string()`   | `{ unique, default, min, max, format: 'email' | 'uuid' | 'url' }`                        |
| `konro.number()`   | `{ unique, default, min, max, type: 'integer' }`                                       |
| `konro.boolean()`  | `{ default }`                                                                          |
| `konro.date()`     | `{ default }` (e.g., `() => new Date()`). Stored as an ISO string.                      |

### Defining Relationships

Under the `relations` key, you define how your tables connect. This centralized approach makes your data model easy to understand at a glance.

*   `konro.one(targetTable, options)`: Defines a `one-to-one` or `many-to-one` relationship. This is used on the table that holds the foreign key.
*   `konro.many(targetTable, options)`: Defines a `one-to-many` relationship. This is used on the table that is being pointed to.

The `options` object is `{ on: string, references: string }`.
*   `on`: The key on the **current** table.
*   `references`: The key on the **related** table.

### Inferring Static Types: The Magic

After creating your schema, you can export its inferred types directly from the `schema.types` property.

```typescript
export const mySchema = konro.createSchema({ /* ... */ });

// This is all you need to get full, relational static types.
export type User = typeof mySchema.types.users;
export type Post = typeof mySchema.types.posts;
```

---

## 7. Pillar II: The Kitchen (Database Context)

The database context is a pre-configured object that makes interacting with your data clean and convenient.

### Choosing a Storage Adapter

Konro ships with a flexible file adapter supporting both JSON and YAML. You configure it when creating your `db` context.

*   **`createFileAdapter(options)`**: The factory function for all file-based adapters.
    *   `format`: `'json'` or `'yaml'` (required).
    *   `single`: `{ filepath: string }`. Stores the entire database state in one monolithic file. Simple and atomic.
    *   `multi`: `{ dir: string }`. Stores each table in its own file within a directory. Great for organization and easy inspection of individual table data.

### The `konro.createDatabase` Function

This function bundles your schema and adapter into a single, convenient `db` object. This object holds all the methods you'll need, like `read`, `write`, `query`, `insert`, etc.

---

## 8. Pillar III: Cooking (The Fluent API)

Konro provides a fluent, chainable API for building and executing queries.

### The Transactional Workflow: Read, Mutate, Write

Because Konro is immutable, every data-modifying operation follows a clear, safe pattern:

1.  **Read:** Load the current state from disk: `let state = await db.read();`
2.  **Mutate:** Apply one or more pure operations, re-assigning the state variable each time: `[state, result] = db.insert(state, ...);`
3.  **Write:** Persist the final, new state back to disk: `await db.write(state);`

This pattern guarantees that your data on disk is always in a consistent state. A transaction is either fully completed or not at all.

### Reading Data with `db.query()`

The `db.query(state)` method is the entry point for all read operations.

```typescript
const results = await db.query(state)
  .select(fields?)   // Optional: Pick specific fields. Fully typed!
  .from(tableName)  // Required: The table to query, e.g., 'users'
  .where(predicate) // Optional: Filter records.
  .with(relations)  // Optional: Eager-load relations, e.g., { posts: true }
  .limit(number)    // Optional: Limit the number of results
  .offset(number)   // Optional: Skip records for pagination
  .all();           // Terminator: Returns Promise<Array<T>>

const single = await db.query(state).from('users').where({ id: 1 }).first(); // Returns Promise<T | null>
```

### Aggregating Data with `db.query()`

The same query chain can be used to perform calculations like `count`, `sum`, `avg`, `min`, and `max`.

```typescript
const stats = await db.query(state)
  .from('posts')
  .where({ published: true })
  .aggregate({
    postCount: konro.count(),
    // Assuming a 'views' number column on posts
    averageViews: konro.avg('views'),
  });

console.log(`Published posts: ${stats.postCount}, with an average of ${stats.averageViews} views.`);
```

### Inserting Data with `db.insert()`

`db.insert` is a direct, pure function that validates data against your schema before inserting.

```typescript
const [newState, newUser] = db.insert(state, 'users', {
  name: 'Valid Name',
  email: 'valid@email.com',
});
// Throws a runtime error if data is invalid!
```

### Updating Data with `db.update()`

`db.update(state, tableName)` returns a chainable builder.

```typescript
const [newState, updatedPosts] = await db.update(state, 'posts')
  .set({ published: true, title: 'New Title' }) // Data to change
  .where({ id: 1 }); // Required: a predicate to execute the update
```

### Deleting Data with `db.delete()`

`db.delete(state, tableName)` also returns a chainable builder.

```typescript
const [newState, deletedUsers] = await db.delete(state, 'users')
  .where(user => user.email.endsWith('@spam.com')); // Required predicate
```

---

## 9. Advanced Concepts & Patterns

### Testing Your Logic

Testing is a major strength of Konro. Since the core operations are pure functions, you can test your business logic without touching the filesystem.

```typescript
// my-logic.test.ts
import { db } from './db'; // Your pre-configured db context
import { assert } from 'chai';

describe('User Logic', () => {
  it('should create a user and a welcome post', () => {
    // 1. Arrange: Create a clean, in-memory initial state using the db context.
    let state = db.createEmptyState();

    // 2. Act: Call your application logic.
    let newUser;
    [state, newUser] = db.insert(state, 'users', { name: 'Test', email: 'test@test.com' });
    [state] = db.insert(state, 'posts', { title: 'Welcome!', authorId: newUser.id });

    // 3. Assert: Check the final state directly.
    const users = db.query(state).from('users').all();
    assert.equal(users.length, 1);
    assert.equal(users[0].name, 'Test');
  });
});
```

### Performance Considerations

Konro prioritizes data integrity, safety, and developer experience. The default adapters rewrite the entire data file(s) on every transaction. This is a deliberate trade-off for atomicity—it guarantees your database file is never corrupted by a partial write. For databases up to several dozen megabytes, this is typically instantaneous. For very large files or write-heavy applications, the overhead may become noticeable.

---

## 10. API Reference Cheatsheet

| Category       | Method / Function                     | Purpose                                          |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| **Schema**     | `konro.createSchema(def)`             | Defines the entire database structure.           |
|                | `konro.id/string/number/etc`          | Defines column types and validation rules.       |
|                | `konro.one/many(table, opts)`         | Defines relationships.                           |
| **DB Context** | `konro.createDatabase(opts)`          | Creates the main `db` context object.            |
|                | `createFileAdapter(opts)`             | Creates a single- or multi-file storage adapter. |
| **I/O**        | `db.read()`                           | Reads state from disk.                           |
|                | `db.write(state)`                     | Writes state to disk.                            |
|                | `db.createEmptyState()`               | Creates a fresh, empty `DatabaseState` object.   |
| **Data Ops**   | `db.query(state)`                     | Starts a fluent read-query chain.                |
|                | `db.insert(state, table, vals)`       | Returns `[newState, inserted]`.                  |
|                | `...aggregate(aggs)`                  | Terminator: Computes aggregations like count, sum, etc. |
|                | `db.update(state, table)`             | Starts a fluent update-query chain.              |
|                | `db.delete(state, table)`             | Starts a fluent delete-query chain.              |

---

## 11. Comparison to Other Libraries

| Feature          | `lowdb` (v3+)                                | **Konro**                                                                | `Prisma / Drizzle` (Full-scale ORMs) |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Paradigm**     | Simple Document Store                        | **Functional, Relational ORM**                                           | Client-Server ORMs                                                                |
| **Schema**       | Schema-less, manual types                    | **Type-First**, inferred static types                                    | Schema-first (via `.prisma` file or code)                                         |
| **API Style**    | Mutable (`db.data.push(...)`)                | **Immutable & Fluent** (`db.query(state)...`)                            | Stateful Client (`prisma.user.create(...)`)                                       |
| **State Mgmt**   | Direct mutation                              | **Explicit state passing** `(state) => [newState, result]`               | Managed by the client instance                                                    |
| **Storage**      | JSON/YAML files                              | **JSON/YAML files (pluggable)**                                          | External databases (PostgreSQL, MySQL, etc.)                                      |
| **Best For**     | Quick scripts, simple configs                | **Local-first apps, CLIs, small servers needing safety and structure.**  | Production web applications with traditional client-server database architecture. |

---

## 12. Contributing

Konro is a community-driven project. Contributions are warmly welcome. Whether it's reporting a bug, suggesting a feature, improving the documentation, or submitting a pull request, your input is valuable. Please open an issue to discuss your ideas first.

## 13. License

[MIT](./LICENSE) © [Your Name]
````

## File: src/types.ts
````typescript
import type { BaseModels, KonroSchema } from './schema';

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;

/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState<S extends KonroSchema<any, any> | unknown = unknown> = S extends KonroSchema<any, any>
  ? {
      [TableName in keyof S['tables']]: {
        records: BaseModels<S['tables']>[TableName][];
        meta: {
          lastId: number;
        };
      };
    }
  : {
      [tableName: string]: {
        records: KRecord[];
        meta: {
          lastId: number;
        };
      };
    };
````

## File: test/unit/Core/Query-With.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _queryImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';

describe('Unit > Core > Query-With', () => {
    let testState: DatabaseState;

    beforeEach(() => {
        testState = {
            users: {
                records: [
                    { id: 1, name: 'Alice' },
                    { id: 2, name: 'Bob' },
                ],
                meta: { lastId: 2 },
            },
            posts: {
                records: [
                    { id: 10, title: 'Alice Post 1', authorId: 1 },
                    { id: 11, title: 'Bob Post 1', authorId: 2 },
                    { id: 12, title: 'Alice Post 2', authorId: 1 },
                ],
                meta: { lastId: 12 },
            },
            profiles: {
                records: [
                    { id: 100, bio: 'Bio for Alice', userId: 1 },
                ],
                meta: { lastId: 100 },
            },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should resolve a `one` relationship and attach it to the parent record', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'posts',
            where: r => r.id === 10,
            with: { author: true }
        });

        expect(results.length).toBe(1);
        const post = results[0]!;
        expect(post).toBeDefined();
        const author = post.author as {id: unknown, name: unknown};
        expect(author).toBeDefined();
        expect(author.id).toBe(1);
        expect(author.name).toBe('Alice');
    });

    it('should resolve a `many` relationship and attach it as an array', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: { posts: true }
        });

        expect(results.length).toBe(1);
        const user = results[0]!;
        expect(user).toBeDefined();
        const posts = user.posts as {title: unknown}[];
        expect(posts).toBeInstanceOf(Array);
        expect(posts.length).toBe(2);
        expect(posts[0]!.title).toBe('Alice Post 1');
        expect(posts[1]!.title).toBe('Alice Post 2');
    });

    it('should filter nested records within a .with() clause', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: {
                posts: {
                    where: (post) => typeof post.title === 'string' && post.title.includes('Post 2')
                }
            }
        });

        expect(results.length).toBe(1);
        const user = results[0]!;
        const posts = user.posts as {id: unknown}[];
        expect(posts).toBeDefined();
        expect(posts.length).toBe(1);
        expect(posts[0]!.id).toBe(12);
    });

    it('should select nested fields within a .with() clause', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: {
                posts: {
                    select: {
                        postTitle: testSchema.tables.posts.title
                    }
                }
            }
        });

        expect(results.length).toBe(1);
        const user = results[0]!;
        const posts = user.posts as {postTitle: unknown}[];
        expect(posts).toBeDefined();
        expect(posts.length).toBe(2);
        expect(posts[0]!).toEqual({ postTitle: 'Alice Post 1' });
    });

    it('should handle multiple relations at once', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: {
                posts: true,
                profile: true
            }
        });
        
        expect(results.length).toBe(1);
        const user = results[0]!;
        const posts = user.posts as unknown[];
        const profile = user.profile as { bio: unknown };
        expect(posts).toBeInstanceOf(Array);
        expect(posts.length).toBe(2);
        expect(profile).toBeDefined();
        expect(profile.bio).toBe('Bio for Alice');
    });

    it('should return null for a `one` relation if no related record is found', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 2, // Bob has no profile
            with: { profile: true }
        });

        expect(results.length).toBe(1);
        const user = results[0]!;
        expect(user.profile).toBeNull();
    });

    it('should return an empty array for a `many` relation if no related records are found', () => {
        // Add a user with no posts
        testState.users!.records.push({ id: 3, name: 'Charlie' });
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 3,
            with: { posts: true }
        });

        expect(results.length).toBe(1);
        const user = results[0]!;
        expect(user.posts).toBeInstanceOf(Array);
        expect((user.posts as unknown[]).length).toBe(0);
    });
});
````

## File: test/unit/Core/Query.test.ts
````typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { testSchema } from '../../util';
import { _queryImpl } from '../../../src/operations';
import { DatabaseState } from '../../../src/types';

describe('Unit > Core > Query', () => {
    let testState: DatabaseState;

    beforeEach(() => {
        testState = {
            users: {
                records: [
                    { id: 1, name: 'Alice', age: 30, isActive: true },
                    { id: 2, name: 'Bob', age: 25, isActive: true },
                    { id: 3, name: 'Charlie', age: 42, isActive: false },
                    { id: 4, name: 'Denise', age: 30, isActive: true },
                ],
                meta: { lastId: 4 },
            },
            posts: { records: [], meta: { lastId: 0 } },
            profiles: { records: [], meta: { lastId: 0 } },
            tags: { records: [], meta: { lastId: 0 } },
            posts_tags: { records: [], meta: { lastId: 0 } },
        };
    });

    it('should select all fields from a table when .select() is omitted', () => {
        const results = _queryImpl(testState, testSchema, { tableName: 'users' });
        expect(results.length).toBe(4);
        expect(results[0]!).toEqual({ id: 1, name: 'Alice', age: 30, isActive: true });
        expect(Object.keys(results[0]!).length).toBe(4);
    });

    it('should select only the specified fields when using .select()', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            select: {
                name: testSchema.tables.users.name,
                age: testSchema.tables.users.age
            }
        });
        expect(results.length).toBe(4);
        expect(results[0]!).toEqual({ name: 'Alice', age: 30 });
        expect(Object.keys(results[0]!).length).toBe(2);
    });

    it('should filter records correctly using a where function', () => {
        const results = _queryImpl(testState, testSchema, { tableName: 'users', where: (r) => r.age === 30 });
        expect(results.length).toBe(2);
        expect(results[0]!.name).toBe('Alice');
        expect(results[1]!.name).toBe('Denise');
    });

    it('should limit the number of returned records correctly using .limit()', () => {
        const results = _queryImpl(testState, testSchema, { tableName: 'users', limit: 2 });
        expect(results.length).toBe(2);
        expect(results[0]!.id).toBe(1);
        expect(results[1]!.id).toBe(2);
    });

    it('should skip the correct number of records using .offset()', () => {
        const results = _queryImpl(testState, testSchema, { tableName: 'users', offset: 2 });
        expect(results.length).toBe(2);
        expect(results[0]!.id).toBe(3);
        expect(results[1]!.id).toBe(4);
    });

    it('should correctly handle limit and offset together for pagination', () => {
        const results = _queryImpl(testState, testSchema, { tableName: 'users', offset: 1, limit: 2 });
        expect(results.length).toBe(2);
        expect(results[0]!.id).toBe(2);
        expect(results[1]!.id).toBe(3);
    });

    it('should return an array of all matching records when using .all()', () => {
        // This is implicit in _queryImpl, the test just verifies the base case
        const results = _queryImpl(testState, testSchema, { tableName: 'users', where: r => r.isActive === true });
        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBe(3);
    });

    it('should return the first matching record when using .first()', () => {
        // This is simulated by adding limit: 1
        const results = _queryImpl(testState, testSchema, { tableName: 'users', where: r => typeof r.age === 'number' && r.age > 28, limit: 1 });
        expect(results.length).toBe(1);
        expect(results[0]!.id).toBe(1);
    });

    it('should return null when .first() finds no matching record', () => {
        // This is simulated by _queryImpl returning [] and the caller handling it
        const results = _queryImpl(testState, testSchema, { tableName: 'users', where: r => typeof r.age === 'number' && r.age > 50, limit: 1 });
        expect(results.length).toBe(0);
    });
});
````

## File: test/unit/Schema/ColumnHelpers.test.ts
````typescript
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

  it('should create a valid string column definition with no options', () => {
    const stringCol = konro.string();
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: undefined,
      _tsType: '',
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

  it('should create a valid number column definition with no options', () => {
    const numberCol = konro.number();
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: undefined,
      _tsType: 0,
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

  it('should create a valid boolean column with no options', () => {
    const boolCol = konro.boolean();
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: undefined,
      _tsType: false,
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

  it('should create a valid date column definition with no options', () => {
    const dateCol = konro.date();
    expect(dateCol).toEqual({
      _type: 'column',
      dataType: 'date',
      options: undefined,
      _tsType: expect.any(Date),
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

  it('should create a valid string column with a literal default', () => {
    const stringCol = konro.string({ default: 'hello' });
    expect(stringCol).toEqual({
      _type: 'column',
      dataType: 'string',
      options: { default: 'hello' },
      _tsType: '',
    });
  });

  it('should create a valid number column with a function default', () => {
    const defaultFn = () => 42;
    const numberCol = konro.number({ default: defaultFn });
    expect(numberCol).toEqual({
      _type: 'column',
      dataType: 'number',
      options: {
        default: defaultFn,
      },
      _tsType: 0,
    });
    expect(numberCol.options?.default).toBe(defaultFn);
  });

  it('should create a valid boolean column with a function default', () => {
    const defaultFn = () => true;
    const boolCol = konro.boolean({ default: defaultFn });
    expect(boolCol).toEqual({
      _type: 'column',
      dataType: 'boolean',
      options: {
        default: defaultFn,
      },
      _tsType: false,
    });
    expect(boolCol.options?.default).toBe(defaultFn);
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
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    // Environment setup & latest features
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,


    // Some stricter flags (disabled by default)
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist/**/*"]
}
````

## File: package.json
````json
{
  "name": "konro",
  "module": "src/index.ts",
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9",
    "@typescript-eslint/eslint-plugin": "^8.36.0",
    "@typescript-eslint/parser": "^8.36.0",
    "eslint": "^9.30.1",
    "typescript": "^5.8.3"
  },
  "peerDependencies": {
    "js-yaml": "^4.1.0",
    "typescript": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
      "optional": true
    }
  },
  "scripts": {
    "lint": "eslint ."
  }
}
````

## File: src/adapter.ts
````typescript
import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseState } from './types';
import { createEmptyState } from './operations';
import { KonroSchema } from './schema';
import { getSerializer } from './utils/serializer.util';
import { readFile, writeAtomic } from './utils/fs.util';
import { TEMP_FILE_SUFFIX } from './utils/constants';
import { KonroStorageError } from './utils/error.util';

export interface StorageAdapter {
  read<S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>>;
  write(state: DatabaseState<any>): Promise<void>;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; };
type MultiFileStrategy = { multi: { dir: string }; single?: never; };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
} & (SingleFileStrategy | MultiFileStrategy);

export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;

  const readSingle = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const filepath = options.single!.filepath;
    const data = await readFile(filepath);
    if (!data) return createEmptyState(schema);
    try {
      return serializer.parse<DatabaseState<S>>(data);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
    }
  };

  const writeSingle = async (state: DatabaseState<any>): Promise<void> => {
    const filepath = options.single!.filepath;
    await writeAtomic(filepath, serializer.stringify(state));
  };
  
  const readMulti = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.multi!.dir;
    const state = createEmptyState(schema);
    await fs.mkdir(dir, { recursive: true });

    for (const tableName in schema.tables) {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const data = await readFile(filepath);
      if (data) {
        try {
          // This is a controlled cast, safe because we are iterating over the schema's tables.
          (state as any)[tableName] = serializer.parse(data);
        } catch (e: any) {
          throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
        }
      }
    }
    return state;
  };
  
  const writeMulti = async (state: DatabaseState<any>): Promise<void> => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    
    // As per spec, write all to temp files first
    const tempWrites = Object.entries(state).map(async ([tableName, tableState]) => {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
      const content = serializer.stringify(tableState);
      await fs.writeFile(tempFilepath, content, 'utf-8');
      return { tempFilepath, filepath };
    });

    const writtenFiles = await Promise.all(tempWrites);

    // Then rename all
    const renames = writtenFiles.map(({ tempFilepath, filepath }) =>
      fs.rename(tempFilepath, filepath)
    );

    await Promise.all(renames);
  };

  if (options.single) {
    return { read: readSingle, write: writeSingle };
  } else {
    return { read: readMulti, write: writeMulti };
  }
};
````

## File: src/operations.ts
````typescript
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

    // Validate the record before inserting
    validateRecord(newRecord, tableSchema, tableState.records);

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
  const idColumn = Object.entries(tableSchema).find(([, colDef]) => {
    return colDef && typeof colDef === 'object' && '_type' in colDef && colDef._type === 'column' && 'dataType' in colDef && colDef.dataType === 'id';
  })?.[0];
  if (idColumn && updateData[idColumn] !== undefined) {
    delete updateData[idColumn];
  }

  tableState.records = tableState.records.map(record => {
    if (predicate(record)) {
      const updatedRecord = { ...record, ...updateData };

      // Validate the updated record, excluding current record from unique checks
      const otherRecords = tableState.records.filter(r => r !== record);
      validateRecord(updatedRecord, tableSchema, otherRecords);

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
````

## File: src/db.ts
````typescript
import { AggregationDefinition, ColumnDefinition, KonroSchema, RelationDefinition } from './schema';
import { StorageAdapter } from './adapter';
import { DatabaseState, KRecord } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor, _aggregateImpl, AggregationDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE HELPERS for Fluent API ---

type RelatedModel<T> = T extends (infer R)[] ? R : T extends (infer R | null) ? R : never;

type WithArgument<T> = {
  [K in keyof T as NonNullable<T[K]> extends any[] | object ? K : never]?: boolean | {
    where?: (record: RelatedModel<NonNullable<T[K]>>) => boolean;
    select?: Record<string, ColumnDefinition<unknown>>; // Not fully typed yet, but better than nothing
  };
};

// --- TYPE-SAFE FLUENT API BUILDERS ---

interface ChainedQueryBuilder<T> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<T> | ((record: T) => boolean)): this;
  with(relations: WithArgument<T>): this;
  limit(count: number): this;
  offset(count: number): this;
  all(): T[];
  first(): T | null;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): { [K in keyof TAggs]: number | null };
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]>;
}

interface UpdateBuilder<S extends KonroSchema<any, any>, T> {
  set(data: Partial<T>): {
    where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState<S>, T[]];
  };
}

interface DeleteBuilder<S extends KonroSchema<any, any>, T> {
  where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState<S>, T[]];
}

export interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState<S>>;
  write(state: DatabaseState<S>): Promise<void>;
  createEmptyState(): DatabaseState<S>;

  query(state: DatabaseState<S>): QueryBuilder<S>;
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['types'][T]];
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['types'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['types'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['types'][T]>;
}

export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
  const { schema, adapter } = options;

  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (<T extends keyof S['tables']>(
      state: DatabaseState<S>,
      tableName: T,
      values: S['create'][T] | Readonly<S['create'][T]>[]
    ): [DatabaseState<S>, S['types'][T] | S['types'][T][]] => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state as DatabaseState, schema, tableName as string, valsArray as KRecord[]);
      const result = Array.isArray(values) ? inserted : inserted[0];
      return [newState as DatabaseState<S>, result] as [DatabaseState<S>, S['types'][T] | S['types'][T][]];
    }) as {
      <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['types'][T]];
      <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['types'][T][]];
    },

    query: (state: DatabaseState<S>): QueryBuilder<S> => ({
      from: <T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]> => {
        const descriptor: QueryDescriptor = { tableName: tableName as string };

        const builder: ChainedQueryBuilder<S['types'][T]> = {
          select: (fields) => {
            descriptor.select = fields;
            return builder;
          },
          where: (predicate) => {
            descriptor.where = normalizePredicate(predicate as (record: KRecord) => boolean);
            return builder;
          },
          with: (relations) => {
            descriptor.with = relations as QueryDescriptor['with'];
            return builder;
          },
          limit: (count) => {
            descriptor.limit = count;
            return builder;
          },
          offset: (count) => {
            descriptor.offset = count;
            return builder;
          },
          all: (): S['types'][T][] => _queryImpl(state as DatabaseState, schema, descriptor) as unknown as S['types'][T][],
          first: (): S['types'][T] | null => (_queryImpl(state as DatabaseState, schema, { ...descriptor, limit: 1 })[0] ?? null) as unknown as S['types'][T] | null,
          aggregate: <TAggs extends Record<string, AggregationDefinition>>(aggregations: TAggs): { [K in keyof TAggs]: number | null } => {
            const aggDescriptor: AggregationDescriptor = { ...descriptor, aggregations };
            return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as { [K in keyof TAggs]: number | null };
          },
        };
        return builder;
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['types'][T]> => ({
      set: (data) => ({
        where: (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as (record: KRecord) => boolean));
          return [newState as DatabaseState<S>, updatedRecords as S['types'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['types'][T]> => ({
      where: (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as (record: KRecord) => boolean));
        return [newState as DatabaseState<S>, deletedRecords as S['types'][T][]];
      },
    }),
  };
};
````

## File: src/schema.ts
````typescript
//
// Konro: The Type-Safe, Functional ORM for JSON/YAML
//
// ## Pillar I: The Recipe (Schema Definition)
//
// This file contains the core logic for defining a database schema. It is designed to be
// both the runtime source of truth for validation and the static source of truth for
// TypeScript types. By using phantom types and inference, we can create a fully-typed
// `db` object from a single schema definition object, eliminating the need for manual
// type declarations (`interface User { ... }`) and ensuring they never get out of sync.
//

// --- TYPE INFERENCE HELPERS ---

/** Infers the underlying TypeScript type from a `ColumnDefinition`. e.g., `ColumnDefinition<string>` => `string`. */
type InferColumnType<C> = C extends ColumnDefinition<infer T> ? T : never;

/** A mapping of table names to their base model types (columns only, no relations). */
export type BaseModels<TTables extends Record<string, any>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: InferColumnType<TTables[TableName][ColumnName]>;
  };
};

/**
 * A mapping of table names to their full model types, including relations.
 * This is a recursive type that resolves relationships to other full models.
 */
type Models<
  TTables extends Record<string, any>,
  TRelations extends Record<string, any>,
  TBaseModels extends Record<keyof TTables, any>
> = {
  [TableName in keyof TTables]: TBaseModels[TableName] &
    (TableName extends keyof TRelations
      ? {
          [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName] extends OneRelationDefinition
            ? // `targetTable` is a string literal, so we can use it to index `Models`
              Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']] | null
            : TRelations[TableName][RelationName] extends ManyRelationDefinition
            ? Models<TTables, TRelations, TBaseModels>[TRelations[TableName][RelationName]['targetTable']][]
            : never;
        }
      : {});
};

/** Finds all column names in a table definition that are optional for insertion (i.e., `id` or has a `default`). */
/** Finds all column names in a table definition that are optional for insertion (i.e., `id` or has a `default`). */
type OptionalCreateKeys<TTableDef> = {
  [K in keyof TTableDef]: TTableDef[K] extends { dataType: 'id' }
    ? K
    : TTableDef[K] extends { options: { default: any } }
    ? K
    : never;
}[keyof TTableDef];

/**
 * A mapping of table names to their "create" types, used for `db.insert`.
 * It takes the base model, makes keys with defaults optional, and removes the `id` field.
 */
type CreateModels<
  TTables extends Record<string, any>,
  TBaseModels extends Record<keyof TTables, any>
> = {
  [TableName in keyof TTables]: Omit<
    {
      // Required fields
      [K in Exclude<keyof TBaseModels[TableName], OptionalCreateKeys<TTables[TableName]>>]: TBaseModels[TableName][K];
    } & {
      // Optional fields
      [K in OptionalCreateKeys<TTables[TableName]>]?: TBaseModels[TableName][K];
    },
    // 'id' is always omitted from create types
    'id'
  >;
};


// --- PUBLIC API TYPES ---

/** The publicly exposed structure of a fully-processed Konro schema. */
export interface KonroSchema<
  TTables extends Record<string, any>,
  TRelations extends Record<string, any>
> {
  tables: TTables;
  relations: TRelations;
  types: Models<TTables, TRelations, BaseModels<TTables>>;
  create: CreateModels<TTables, BaseModels<TTables>>;
}

/** The definition for a database column, created by helpers like `konro.string()`. */
export interface ColumnDefinition<T> {
  readonly _type: 'column';
  readonly dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  readonly options: any;
  readonly _tsType: T; // Phantom type, does not exist at runtime
}

/** The definition for a table relationship, created by `konro.one()` or `konro.many()`. */
interface BaseRelationDefinition {
  readonly _type: 'relation';
  readonly targetTable: string;
  readonly on: string;
  readonly references: string;
}

interface OneRelationDefinition extends BaseRelationDefinition {
  readonly relationType: 'one';
}

interface ManyRelationDefinition extends BaseRelationDefinition {
  readonly relationType: 'many';
}

export type RelationDefinition = OneRelationDefinition | ManyRelationDefinition;

/** The definition for a data aggregation, created by `konro.count()`, `konro.sum()`, etc. */
export interface AggregationDefinition {
  readonly _type: 'aggregation';
  readonly aggType: 'count' | 'sum' | 'avg' | 'min' | 'max';
  readonly column?: string;
}


// --- SCHEMA BUILDER FUNCTION ---

/**
 * Defines the structure, types, and relations of your database.
 * This is the single source of truth for both runtime validation and static types.
 *
 * @param schemaDef The schema definition object.
 * @returns A processed schema object with inferred types attached.
 */
export const createSchema = <
  const TDef extends {
    tables: Record<string, Record<string, ColumnDefinition<any>>>;
    relations?: (tables: TDef['tables']) => Record<string, Record<string, BaseRelationDefinition>>;
  }
>(
  schemaDef: TDef
): KonroSchema<TDef['tables'], TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}> => {
  const relations = schemaDef.relations ? schemaDef.relations(schemaDef.tables) : {};
  return {
    tables: schemaDef.tables,
    relations: relations as any, // Cast to bypass complex conditional type issue
    // Types are applied via the return type annotation, these are just placeholders at runtime.
    types: {} as any,
    create: {} as any,
  };
};


// --- COLUMN DEFINITION HELPERS ---

const createColumn = <T>(dataType: ColumnDefinition<T>['dataType'], options?: object): ColumnDefinition<T> => ({
  _type: 'column',
  dataType,
  options: options ?? {},
  // This is a "phantom type", it holds the TypeScript type for inference but is undefined at runtime.
  _tsType: undefined as T,
});

/** A managed, auto-incrementing integer primary key. */
export const id = () => createColumn<number>('id');
/** A string column with optional validation. */
export const string = (options?: { unique?: boolean; default?: string | (() => string); min?: number; max?: number; format?: 'email' | 'uuid' | 'url' }) => createColumn<string>('string', options);
/** A number column with optional validation. */
export const number = (options?: { unique?: boolean; default?: number | (() => number); min?: number; max?: number; type?: 'integer' }) => createColumn<number>('number', options);
/** A boolean column. */
export const boolean = (options?: { default?: boolean | (() => boolean) }) => createColumn<boolean>('boolean', options);
/** A date column, stored as an ISO string but hydrated as a Date object. */
export const date = (options?: { default?: Date | (() => Date) }) => createColumn<Date>('date', options);
/** A column for storing arbitrary JSON objects, with a generic for type safety. */
export const object = <T extends Record<string, any>>(options?: { default?: T | (() => T) }) => createColumn<T>('object', options);


// --- RELATIONSHIP DEFINITION HELPERS ---

/** Defines a `one-to-one` or `many-to-one` relationship. */
export const one = <T extends string>(targetTable: T, options: { on: string; references: string }): OneRelationDefinition & { targetTable: T } => ({
  _type: 'relation',
  relationType: 'one',
  targetTable,
  ...options,
});

/** Defines a `one-to-many` relationship. */
export const many = <T extends string>(targetTable: T, options: { on: string; references: string }): ManyRelationDefinition & { targetTable: T } => ({
  _type: 'relation',
  relationType: 'many',
  targetTable,
  ...options,
});


// --- AGGREGATION DEFINITION HELPERS ---

/** Aggregation to count records. */
export const count = (): AggregationDefinition => ({ _type: 'aggregation', aggType: 'count' });
/** Aggregation to sum a numeric column. */
export const sum = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'sum', column });
/** Aggregation to average a numeric column. */
export const avg = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'avg', column });
/** Aggregation to find the minimum value in a numeric column. */
export const min = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'min', column });
/** Aggregation to find the maximum value in a numeric column. */
export const max = (column: string): AggregationDefinition => ({ _type: 'aggregation', aggType: 'max', column });
````

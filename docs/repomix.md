# Directory Structure
```
package.json
src/adapter.ts
src/db.ts
src/index.ts
src/operations.ts
src/schema.ts
src/types.ts
test/e2e/ErrorAndEdgeCases/Pagination.test.ts
test/e2e/ErrorAndEdgeCases/Transaction.test.ts
test/e2e/MultiFileYaml/FullLifecycle.test.ts
test/e2e/SingleFileJson/FullLifecycle.test.ts
test/integration/Adapters/MultiFileYaml.test.ts
test/integration/Adapters/Read.test.ts
test/integration/Adapters/SingleFileJson.test.ts
test/integration/DBContext/Initialization.test.ts
test/integration/InMemoryFlow/CrudCycle.test.ts
test/integration/Types/InferredTypes.test-d.ts
test/util.ts
tsconfig.json
```

# Files

## File: test/integration/Adapters/Read.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import { KonroStorageError } from '../../../src/utils/error.util';

describe('Integration > Adapters > Read', () => {

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  describe('SingleFileJson', () => {
    const dbFilePath = path.join(TEST_DIR, 'read_test.json');
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: dbFilePath },
    });
    const db = konro.createDatabase({ schema: testSchema, adapter });

    it('should correctly read and parse a single JSON file', async () => {
      const state = db.createEmptyState();
      state.users.records.push({ id: 1, name: 'Reader', email: 'reader@test.com', age: 30, isActive: true });
      state.users.meta.lastId = 1;
      await fs.writeFile(dbFilePath, JSON.stringify(state, null, 2));

      const readState = await db.read();
      expect(readState.users.records.length).toBe(1);
      expect(readState.users.records[0]?.name).toBe('Reader');
      expect(readState.users.meta.lastId).toBe(1);
    });

    it('should return an empty state if the file does not exist', async () => {
      const readState = await db.read();
      expect(readState).toEqual(db.createEmptyState());
    });

    it('should throw KonroStorageError for a corrupt JSON file', async () => {
      await fs.writeFile(dbFilePath, '{ "users": { "records": ['); // Invalid JSON
      await expect(db.read()).rejects.toThrow(KonroStorageError);
    });
  });

  describe('MultiFileYaml', () => {
    const dbDirPath = path.join(TEST_DIR, 'read_yaml_test');
    const adapter = konro.createFileAdapter({
      format: 'yaml',
      multi: { dir: dbDirPath },
    });
    const db = konro.createDatabase({ schema: testSchema, adapter });

    it('should correctly read and parse multiple YAML files', async () => {
      const state = db.createEmptyState();
      state.users.records.push({ id: 1, name: 'YamlReader', email: 'yaml@test.com', age: 31, isActive: true });
      state.users.meta.lastId = 1;
      state.posts.records.push({ id: 1, title: 'Yaml Post', content: '...', authorId: 1, publishedAt: new Date() });
      state.posts.meta.lastId = 1;

      await fs.mkdir(dbDirPath, { recursive: true });
      await fs.writeFile(path.join(dbDirPath, 'users.yaml'), yaml.dump({ records: state.users.records, meta: state.users.meta }));
      await fs.writeFile(path.join(dbDirPath, 'posts.yaml'), yaml.dump({ records: state.posts.records, meta: state.posts.meta }));
      
      const readState = await db.read();
      expect(readState.users.records.length).toBe(1);
      expect(readState.users.records[0]?.name).toBe('YamlReader');
      expect(readState.posts.records.length).toBe(1);
      expect(readState.posts.records[0]?.title).toBe('Yaml Post');
      expect(readState.tags.records.length).toBe(0); // Ensure non-existent files are handled
    });

    it('should return an empty state if the directory does not exist', async () => {
      const readState = await db.read();
      expect(readState).toEqual(db.createEmptyState());
    });
  });
});
```

## File: test/integration/DBContext/Initialization.test.ts
```typescript
import { describe, it, expect } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema } from '../../util';
import path from 'path';

describe('Integration > DBContext > Initialization', () => {
  it('should successfully create a db context with a valid schema and adapter', () => {
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: path.join(__dirname, 'test.db.json') },
    });

    const db = konro.createDatabase({
      schema: testSchema,
      adapter: adapter,
    });

    expect(db).toBeDefined();
    expect(db.schema).toEqual(testSchema);
    expect(db.adapter).toBe(adapter);
    expect(typeof db.read).toBe('function');
    expect(typeof db.write).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(typeof db.delete).toBe('function');
    expect(typeof db.query).toBe('function');
  });

  it('should correctly generate a pristine, empty DatabaseState object via db.createEmptyState()', () => {
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: path.join(__dirname, 'test.db.json') },
    });
    const db = konro.createDatabase({
      schema: testSchema,
      adapter,
    });

    const emptyState = db.createEmptyState();

    expect(emptyState).toEqual({
      users: { records: [], meta: { lastId: 0 } },
      posts: { records: [], meta: { lastId: 0 } },
      profiles: { records: [], meta: { lastId: 0 } },
      tags: { records: [], meta: { lastId: 0 } },
      posts_tags: { records: [], meta: { lastId: 0 } },
    });
  });

  it('should have the full schema definition available at db.schema for direct reference in queries', () => {
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: path.join(__dirname, 'test.db.json') },
    });
    const db = konro.createDatabase({
      schema: testSchema,
      adapter,
    });

    // Example of using db.schema to reference a column definition
    const userEmailColumn = db.schema.tables.users.email;
    expect(userEmailColumn).toEqual(testSchema.tables.users.email);
    expect(userEmailColumn.dataType).toBe('string');
  });
});
```

## File: src/index.ts
```typescript
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
```

## File: test/integration/Adapters/MultiFileYaml.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';

describe('Integration > Adapters > MultiFileYaml', () => {
  const dbDirPath = path.join(TEST_DIR, 'yaml_db');
  const adapter = konro.createFileAdapter({
    format: 'yaml',
    multi: { dir: dbDirPath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  it('should correctly write each table to a separate YAML file', async () => {
    let state = db.createEmptyState();
    [state] = db.insert(state, 'users', {
      name: 'YAML User',
      email: 'yaml@test.com',
      age: 44,
    });
    [state] = db.insert(state, 'posts', {
      title: 'YAML Post',
      content: 'Content here',
      authorId: 1,
    });

    await db.write(state);

    const usersFilePath = path.join(dbDirPath, 'users.yaml');
    const postsFilePath = path.join(dbDirPath, 'posts.yaml');

    const usersFileExists = await fs.access(usersFilePath).then(() => true).catch(() => false);
    const postsFileExists = await fs.access(postsFilePath).then(() => true).catch(() => false);
    expect(usersFileExists).toBe(true);
    expect(postsFileExists).toBe(true);

    const usersFileContent = await fs.readFile(usersFilePath, 'utf-8');
    const postsFileContent = await fs.readFile(postsFilePath, 'utf-8');

    const parsedUsers = yaml.load(usersFileContent) as { records: unknown[], meta: unknown };
    const parsedPosts = yaml.load(postsFileContent) as { records: unknown[], meta: unknown };

    expect(parsedUsers.records.length).toBe(1);
    expect((parsedUsers.records[0] as { name: string }).name).toBe('YAML User');
    expect((parsedUsers.meta as { lastId: number }).lastId).toBe(1);

    expect(parsedPosts.records.length).toBe(1);
    expect((parsedPosts.records[0] as { title: string }).title).toBe('YAML Post');
    expect((parsedPosts.meta as { lastId: number }).lastId).toBe(1);
  });

  it('should correctly serialize and deserialize dates', async () => {
    let state = db.createEmptyState();
    const testDate = new Date('2023-10-27T10:00:00.000Z');

    [state] = db.insert(state, 'posts', {
      title: 'Dated Post',
      content: '...',
      authorId: 1,
      publishedAt: testDate,
    });

    await db.write(state);

    const readState = await db.read();

    expect(readState.posts.records[0]?.publishedAt).toBeInstanceOf(Date);
    expect((readState.posts.records[0]?.publishedAt as Date).getTime()).toBe(testDate.getTime());
  });
});
```

## File: test/integration/Adapters/SingleFileJson.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';

describe('Integration > Adapters > SingleFileJson', () => {
  const dbFilePath = path.join(TEST_DIR, 'db.json');
  const adapter = konro.createFileAdapter({
    format: 'json',
    single: { filepath: dbFilePath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  it('should correctly write the DatabaseState to a single JSON file', async () => {
    let state = db.createEmptyState();
    [state] = db.insert(state, 'users', {
      name: 'JSON User',
      email: 'json@test.com',
      age: 33,
    });

    await db.write(state);

    const fileExists = await fs.access(dbFilePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const fileContent = await fs.readFile(dbFilePath, 'utf-8');
    const parsedContent = JSON.parse(fileContent);

    expect(parsedContent.users.records.length).toBe(1);
    expect(parsedContent.users.records[0].name).toBe('JSON User');
    expect(parsedContent.users.meta.lastId).toBe(1);
    expect(parsedContent.posts.records.length).toBe(0);
  });

  it('should correctly serialize complex data types like dates', async () => {
    let state = db.createEmptyState();
    const testDate = new Date('2023-10-27T10:00:00.000Z');

    [state] = db.insert(state, 'posts', {
      title: 'Dated Post',
      content: '...',
      authorId: 1,
      // override default
      publishedAt: testDate,
    });

    await db.write(state);

    const fileContent = await fs.readFile(dbFilePath, 'utf-8');
    const parsedContent = JSON.parse(fileContent);

    expect(parsedContent.posts.records[0].publishedAt).toBe(testDate.toISOString());
  });
});
```

## File: src/types.ts
```typescript
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
```

## File: test/integration/InMemoryFlow/CrudCycle.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema } from '../../util';
import path from 'path';
import type { DbContext } from '../../../src/db';
import type { DatabaseState } from '../../../src/types';

describe('Integration > InMemoryFlow > CrudCycle', () => {
  let db: DbContext<typeof testSchema>;
  let state: DatabaseState<typeof testSchema>;

  beforeEach(() => {
    // Adapter is needed for context creation, but we won't use its I/O
    const adapter = konro.createFileAdapter({
      format: 'json',
      single: { filepath: path.join(__dirname, 'test.db.json') },
    });
    db = konro.createDatabase({
      schema: testSchema,
      adapter,
    });
    state = db.createEmptyState();
  });

  it('should allow inserting a record and then immediately querying for it', () => {
    const [newState, insertedUser] = db.insert(state, 'users', {
      name: 'InMemory Alice',
      email: 'alice@inmemory.com',
      age: 30,
      isActive: true,
    });
    expect(insertedUser.id).toBe(1);

    const users = db.query(newState).from('users').all();
    expect(users.length).toBe(1);
    expect(users[0]).toEqual(insertedUser);
  });

  it('should correctly chain mutation operations by passing the newState', () => {
    // Insert user
    const [stateAfterUserInsert, user] = db.insert(state, 'users', {
      name: 'Chain User',
      email: 'chain@test.com',
      age: 40,
      isActive: true,
    });

    // Insert post using the new state
    const [stateAfterPostInsert, post] = db.insert(stateAfterUserInsert, 'posts', {
      title: 'Chained Post',
      content: '...',
      authorId: user.id,
      publishedAt: new Date(),
    });

    expect(stateAfterPostInsert.users.records.length).toBe(1);
    expect(stateAfterPostInsert.posts.records.length).toBe(1);
    expect(post.authorId).toBe(user.id);
  });

  it('should update a record and verify the change in the returned newState', () => {
    const [stateAfterInsert, user] = db.insert(state, 'users', {
      name: 'Update Me',
      email: 'update@test.com',
      age: 50,
      isActive: true,
    });

    const [stateAfterUpdate, updatedUsers] = db.update(stateAfterInsert, 'users')
      .set({ name: 'Updated Name' })
      .where({ id: user.id });

    expect(updatedUsers.length).toBe(1);
    expect(updatedUsers[0]?.name).toBe('Updated Name');

    const queriedUser = db.query(stateAfterUpdate).from('users').where({ id: user.id }).first();
    expect(queriedUser?.name).toBe('Updated Name');
    expect(stateAfterInsert.users.records[0]?.name).toBe('Update Me'); // Original state is untouched
  });

  it('should delete a record and verify its absence in the returned newState', () => {
    const [stateAfterInsert, user] = db.insert(state, 'users', {
      name: 'Delete Me',
      email: 'delete@test.com',
      age: 60,
      isActive: true,
    });

    const [stateAfterDelete, deletedUsers] = db.delete(stateAfterInsert, 'users')
      .where({ id: user.id });

    expect(deletedUsers.length).toBe(1);
    expect(deletedUsers[0]?.name).toBe('Delete Me');

    const users = db.query(stateAfterDelete).from('users').all();
    expect(users.length).toBe(0);
  });

  it('should correctly execute a query with a .with() clause on an in-memory state', () => {
    const [s1, user] = db.insert(state, 'users', {
      name: 'Relation User',
      email: 'relation@test.com',
      age: 35,
      isActive: true,
    });
    const [s2, ] = db.insert(s1, 'posts', [
        { title: 'Relational Post 1', content: '...', authorId: user.id, publishedAt: new Date() },
        { title: 'Relational Post 2', content: '...', authorId: user.id, publishedAt: new Date() },
    ]);

    const userWithPosts = db.query(s2).from('users').where({ id: user.id }).with({ posts: true }).first();

    expect(userWithPosts).toBeDefined();
    expect(userWithPosts?.name).toBe('Relation User');
    expect(userWithPosts?.posts).toBeInstanceOf(Array);
    expect(userWithPosts?.posts?.length).toBe(2);
    expect(userWithPosts?.posts?.[0]?.title).toBe('Relational Post 1');
  });
});
```

## File: tsconfig.json
```json
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
```

## File: test/e2e/ErrorAndEdgeCases/Pagination.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';

describe('E2E > ErrorAndEdgeCases > Pagination', () => {
  const dbFilePath = path.join(TEST_DIR, 'pagination_test.json');
  const adapter = konro.createFileAdapter({
    format: 'json',
    single: { filepath: dbFilePath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

    beforeEach(async () => {
        await ensureTestDir();
        let state = db.createEmptyState();
        const usersToInsert = [];
        for (let i = 1; i <= 100; i++) {
            usersToInsert.push({
                name: `User ${i}`,
                email: `user${i}@test.com`,
                age: 20 + (i % 30),
                isActive: true
            });
        }
        [state] = db.insert(state, 'users', usersToInsert);
        await db.write(state);
    });
    afterEach(cleanup);

  it('should correctly paginate through a large set of records from a file', async () => {
    const state = await db.read();
    expect(state.users!.records.length).toBe(100);

    // Get page 1 (items 1-10)
    const page1 = await db.query(state).from('users').limit(10).offset(0).all();
    expect(page1.length).toBe(10);
    expect(page1[0]?.name).toBe('User 1');
    expect(page1[9]?.name).toBe('User 10');

    // Get page 2 (items 11-20)
    const page2 = await db.query(state).from('users').limit(10).offset(10).all();
    expect(page2.length).toBe(10);
    expect(page2[0]?.name).toBe('User 11');
    expect(page2[9]?.name).toBe('User 20');

    // Get the last page, which might be partial
    const lastPage = await db.query(state).from('users').limit(10).offset(95).all();
    expect(lastPage.length).toBe(5);
    expect(lastPage[0]?.name).toBe('User 96');
    expect(lastPage[4]?.name).toBe('User 100');

    // Get an empty page beyond the end
    const emptyPage = await db.query(state).from('users').limit(10).offset(100).all();
    expect(emptyPage.length).toBe(0);
  });
});
```

## File: test/e2e/ErrorAndEdgeCases/Transaction.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import { KonroValidationError } from '../../../src/utils/error.util';

describe('E2E > ErrorAndEdgeCases > Transaction', () => {
  const dbFilePath = path.join(TEST_DIR, 'transaction_test.json');
  const adapter = konro.createFileAdapter({
    format: 'json',
    single: { filepath: dbFilePath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

  beforeEach(async () => {
    await ensureTestDir();
    // Start with a clean slate for each test
    await db.write(db.createEmptyState());
  });
  afterEach(cleanup);

    it('should not write to disk if an operation fails mid-transaction', async () => {
        // 1. Get initial state with one user
        let state = await db.read();
        [state] = db.insert(state, 'users', { name: 'Good User', email: 'good@test.com', age: 30, isActive: true });
        await db.write(state);

    const contentBefore = await fs.readFile(dbFilePath, 'utf-8');

    // 2. Start a "transaction": read, then perform multiple operations
    let transactionState = await db.read();

        // This one is fine
        [transactionState] = db.insert(transactionState, 'users', { name: 'Another User', email: 'another@test.com', age: 31, isActive: true });

        // This one will fail due to unique constraint
        const failingOperation = () => {
            db.insert(transactionState, 'users', { name: 'Bad User', email: 'good@test.com', age: 32, isActive: true });
        };
        expect(failingOperation).toThrow(KonroValidationError);

    // Even if the error is caught, the developer should not write the tainted `transactionState`.
    // The file on disk should remain untouched from before the transaction started.
    const contentAfter = await fs.readFile(dbFilePath, 'utf-8');
    expect(contentAfter).toEqual(contentBefore);
  });

    it('should not change the database file if an update matches no records', async () => {
        let state = await db.read();
        [state] = db.insert(state, 'users', { name: 'Initial User', email: 'initial@test.com', age: 50, isActive: true });
        await db.write(state);

    const contentBefore = await fs.readFile(dbFilePath, 'utf-8');

    // Read the state to perform an update
    let currentState = await db.read();
    const [newState] = await db.update(currentState, 'users')
      .set({ name: 'This Should Not Be Set' })
      .where({ id: 999 }); // This matches no records

    await db.write(newState);

    const contentAfter = await fs.readFile(dbFilePath, 'utf-8');

    // The content should be identical because the state object itself shouldn't have changed meaningfully.
    expect(contentAfter).toEqual(contentBefore);
  });
});
```

## File: test/e2e/MultiFileYaml/FullLifecycle.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';

describe('E2E > MultiFileYaml > FullLifecycle', () => {
  const dbDirPath = path.join(TEST_DIR, 'e2e_yaml_db');
  const adapter = konro.createFileAdapter({
    format: 'yaml',
    multi: { dir: dbDirPath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  it('should handle a full data lifecycle across multiple YAML files', async () => {
    // 1. Initialize empty database files
    let state = db.createEmptyState();
    await db.write(state);

    // Check that empty files are created
    const usersFilePath = path.join(dbDirPath, 'users.yaml');
    let usersFileContent = await fs.readFile(usersFilePath, 'utf-8');
    expect(yaml.load(usersFileContent)).toEqual({ records: [], meta: { lastId: 0 } });

    // 2. Insert data and write to disk
    const [s1, user] = db.insert(state, 'users', { name: 'E2E Yaml', email: 'yaml.e2e@test.com', age: 50, isActive: true });
    const [s2] = db.insert(s1, 'posts', { title: 'YAML Post', content: '...', authorId: user.id, publishedAt: new Date() });
    await db.write(s2);

    // 3. Read back and verify integrity from separate files
    const readState = await db.read();
    expect(readState.users!.records.length).toBe(1);
    expect(readState.posts!.records.length).toBe(1);
    expect(readState.users!.records[0]?.id).toBe(user.id);

    // 4. Query with relations
    const userWithPosts = await db.query(readState).from('users').where({ id: user.id }).with({ posts: true }).first();
    expect(userWithPosts).toBeDefined();
    if (userWithPosts) {
      expect(userWithPosts.posts).toBeDefined();
      expect(userWithPosts.posts?.length).toBe(1);
      expect(userWithPosts.posts?.[0]?.title).toBe('YAML Post');
    }

    // 5. Update and write
    const [s3] = await db.update(readState, 'users').set({ name: 'Updated Yaml User' }).where({ id: user.id });
    await db.write(s3);
    const stateAfterUpdate = await db.read();
    expect(stateAfterUpdate.users!.records[0]?.name).toBe('Updated Yaml User');

    // 6. Delete and write
    const [s4] = await db.delete(stateAfterUpdate, 'posts').where({ authorId: user.id });
    await db.write(s4);
    const finalState = await db.read();
    expect(finalState.posts!.records.length).toBe(0);
    expect(finalState.users!.records.length).toBe(1);
  });
});
```

## File: test/integration/Types/InferredTypes.test-d.ts
```typescript
import { describe, it } from 'bun:test';
import { konro } from '../../../src/index';
import { schemaDef } from '../../util';

/**
 * NOTE: This is a type definition test file.
 * It is not meant to be run, but to be checked by `tsc`.
 * The presence of `// @ts-expect-error` comments indicates
 * that a TypeScript compilation error is expected on the next line.
 * If the error does not occur, `tsc` will fail, which is the desired behavior for this test.
 */
describe('Integration > Types > InferredTypes', () => {
  it('should pass type checks', () => {
    const testSchema = konro.createSchema(schemaDef);
    type User = typeof testSchema.types.users;

    // Test 1: Inferred User type should have correct primitive and relational fields.
    const user: User = {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      age: 30,
      isActive: true,
      posts: [{
        id: 1,
        title: 'Post 1',
        content: '...',
        authorId: 1,
        publishedAt: new Date(),
      }],
      profile: null,
    };

        // This should be valid
        user.name; // Accessing for type check
    const db = konro.createDatabase({ schema: testSchema, adapter: {} as any });
    const state = db.createEmptyState();

    // Test 2: Should cause a TS error if a non-existent field is used in a where clause.
    // @ts-expect-error - 'nonExistentField' does not exist on type 'User'.
    db.query(state).from('users').where({ nonExistentField: 'value' });

    // This should be valid
    db.query(state).from('users').where({ name: 'Alice' });

    // Test 3: Should cause a TS error if a wrong type is passed to db.insert().
    // @ts-expect-error - 'age' should be a number, not a string.
    db.insert(state, 'users', { name: 'Bob', email: 'bob@test.com', age: 'twenty-five' });

    // This should be valid - using type assertion for test-only code
    // @ts-ignore - This is a type test only, not runtime code
    db.insert(state, 'users', { name: 'Bob', email: 'bob@test.com', age: 25 });

    // Test 4: Nested .with clause should be typed correctly
    db.query(state).from('users').with({
      posts: {
        where: (post) => post.title.startsWith('A') // post is typed as Post
      }
    }).first();

    // @ts-expect-error - 'nonExistentRelation' is not a valid relation on 'users'
    db.query(state).from('users').with({ nonExistentRelation: true });
  });
});
```

## File: test/util.ts
```typescript
import { konro } from '../src/index';
import { promises as fs } from 'fs';
import path from 'path';

export const TEST_DIR = path.join(__dirname, 'test_run_data');

// --- Schema Definition ---

const tables = {
  users: {
    id: konro.id(),
    name: konro.string({ min: 2 }),
    email: konro.string({ unique: true, format: 'email' }),
    age: konro.number({ min: 18, type: 'integer' }),
    isActive: konro.boolean({ default: true }),
  },
  posts: {
    id: konro.id(),
    title: konro.string(),
    content: konro.string(),
    authorId: konro.number(),
    publishedAt: konro.date({ default: () => new Date() }),
  },
  profiles: {
    id: konro.id(),
    bio: konro.string(),
    userId: konro.number({ unique: true }),
  },
  tags: {
    id: konro.id(),
    name: konro.string({ unique: true }),
  },
  posts_tags: {
    id: konro.id(),
    postId: konro.number(),
    tagId: konro.number(),
  },
};

export const schemaDef = {
  tables,
  relations: (_tables: typeof tables) => ({
    users: {
      posts: konro.many('posts', { on: 'id', references: 'authorId' }),
      profile: konro.one('profiles', { on: 'id', references: 'userId' }),
    },
    posts: {
      author: konro.one('users', { on: 'authorId', references: 'id' }),
      tags: konro.many('posts_tags', { on: 'id', references: 'postId' }),
    },
    profiles: {
      user: konro.one('users', { on: 'userId', references: 'id' }),
    },
    posts_tags: {
      post: konro.one('posts', { on: 'postId', references: 'id' }),
      tag: konro.one('tags', { on: 'tagId', references: 'id' }),
    }
  }),
};

export const testSchema = konro.createSchema(schemaDef);

export type UserCreate = typeof testSchema.create.users;

// --- Test Utilities ---

export const cleanup = async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('Error during cleanup:', error);
    }
  }
};

export const ensureTestDir = async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
}
```

## File: package.json
```json
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
```

## File: test/e2e/SingleFileJson/FullLifecycle.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';

describe('E2E > SingleFileJson > FullLifecycle', () => {
  const dbFilePath = path.join(TEST_DIR, 'e2e_db.json');
  const adapter = konro.createFileAdapter({
    format: 'json',
    single: { filepath: dbFilePath },
  });
  const db = konro.createDatabase({
    schema: testSchema,
    adapter,
  });

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  it('should handle a full data lifecycle: write, read, insert, query, update, delete', async () => {
    // 1. Initialize an empty database file
    let state = db.createEmptyState();
    await db.write(state);
    let fileContent = await fs.readFile(dbFilePath, 'utf-8');
    expect(JSON.parse(fileContent).users.records.length).toBe(0);

    // 2. Read state, insert a user and a post, and write back
    state = await db.read();
    const [s1, user] = db.insert(state, 'users', {
      name: 'E2E User',
      email: 'e2e@test.com',
      age: 42,
      isActive: true,
    });
    const [s2, post] = db.insert(s1, 'posts', {
      title: 'E2E Post',
      content: 'Live from the disk',
      authorId: user.id,
      publishedAt: new Date(),
    });
    await db.write(s2);

    // 3. Read back and verify data integrity
    let readState = await db.read();
    expect(readState.users!.records.length).toBe(1);
    expect(readState.posts!.records.length).toBe(1);
    expect(readState.users!.records[0]?.name).toBe('E2E User');

    // 4. Perform a complex query with relations on the re-read state
    const userWithPosts = await db.query(readState)
      .from('users')
      .where({ id: user.id })
      .with({ posts: true })
      .first();

    expect(userWithPosts).toBeDefined();
    if (userWithPosts) {
      expect(userWithPosts.posts).toBeDefined();
      expect(userWithPosts.posts?.length).toBe(1);
      expect(userWithPosts.posts?.[0]?.title).toBe('E2E Post');
    }

    // 5. Update a record, write the change, and read back to confirm
    const [s3, updatedPosts] = await db.update(readState, 'posts')
      .set({ title: 'Updated E2E Post' })
      .where({ id: post.id });
    expect(updatedPosts.length).toBe(1);
    await db.write(s3);

    let stateAfterUpdate = await db.read();
    const updatedPostFromDisk = db.query(stateAfterUpdate).from('posts').where({ id: post.id }).first();
    expect(updatedPostFromDisk?.title).toBe('Updated E2E Post');

    // 6. Delete a record, write, and confirm it's gone
    const [s4, deletedUsers] = db.delete(stateAfterUpdate, 'users')
      .where({ id: user.id });
    expect(deletedUsers.length).toBe(1);
    await db.write(s4);

    let finalState = await db.read();
    expect(finalState.users!.records.length).toBe(0);
    // The post should also effectively be orphaned, let's check it's still there
    expect(finalState.posts!.records.length).toBe(1);
  });
});
```

## File: src/adapter.ts
```typescript
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
```

## File: src/operations.ts
```typescript
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
```

## File: src/db.ts
```typescript
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
```

## File: src/schema.ts
```typescript
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
    relations?: (tables: TDef['tables']) => Record<string, Record<string, RelationDefinition>>;
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
export const one = (targetTable: string, options: { on: string; references: string }): OneRelationDefinition => ({
  _type: 'relation',
  relationType: 'one',
  targetTable,
  ...options,
});

/** Defines a `one-to-many` relationship. */
export const many = (targetTable: string, options: { on: string; references: string }): ManyRelationDefinition => ({
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
```

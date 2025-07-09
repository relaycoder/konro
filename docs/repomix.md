# Directory Structure
```
package.json
src/adapter.ts
src/db.ts
src/index.ts
test/integration/Adapters/MultiFileYaml.test.ts
test/integration/Adapters/OnDemand.test.ts
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

## File: test/integration/Adapters/OnDemand.test.ts
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir, uuidTestSchema } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import papaparse from 'papaparse';
import xlsx from 'xlsx';
import { KonroError } from '../../../src/utils/error.util';
import type { OnDemandDbContext } from '../../../src/db';

describe('Integration > Adapters > OnDemand', () => {
  const dbDirPath = path.join(TEST_DIR, 'on_demand_db');

  beforeEach(ensureTestDir);
  afterEach(cleanup);

  describe('Initialization', () => {
    it('should successfully create an on-demand db context with a multi-file adapter', () => {
      const adapter = konro.createFileAdapter({
        format: 'yaml',
        mode: 'on-demand',
        multi: { dir: dbDirPath },
      });
      const db = konro.createDatabase({
        schema: testSchema,
        adapter,
      });

      expect(db).toBeDefined();
      expect(db.adapter.mode).toBe('on-demand');
      expect(typeof db.insert).toBe('function');
      expect(typeof db.query).toBe('function');
    });

    it('should throw an error when creating an on-demand db context with a single-file adapter', () => {
      expect(() => {
        konro.createFileAdapter({
          format: 'json',
          mode: 'on-demand',
          single: { filepath: path.join(dbDirPath, 'db.json') },
        });
      }).toThrow(KonroError("The 'on-demand' mode requires the 'multi-file' or 'per-record' storage strategy."));
    });
  });

  describe('Unsupported Operations', () => {
    const adapter = konro.createFileAdapter({
      format: 'yaml',
      mode: 'on-demand',
      multi: { dir: dbDirPath },
    });
    const db = konro.createDatabase({
      schema: testSchema,
      adapter,
    });
    
    it('should reject db.read()', async () => {
      expect(db.read()).rejects.toThrow(KonroError("This method is not supported in 'on-demand' mode."));
    });

    it('should reject db.write()', async () => {
      expect(db.write()).rejects.toThrow(KonroError("This method is not supported in 'on-demand' mode."));
    });
  });

  describe('CRUD Operations', () => {
    let db: OnDemandDbContext<typeof testSchema>;

    beforeEach(() => {
      const adapter = konro.createFileAdapter({
        format: 'yaml',
        mode: 'on-demand',
        multi: { dir: dbDirPath },
      });
      db = konro.createDatabase({
        schema: testSchema,
        adapter,
      });
    });

    it('should insert a record and write it to the correct file', async () => {
      const user = await db.insert('users', {
        name: 'OnDemand User',
        email: 'ondemand@test.com',
        age: 25,
      });

      expect(user.id).toBe(1);
      expect(user.name).toBe('OnDemand User');

      const userFilePath = path.join(dbDirPath, 'users.yaml');
      const fileContent = await fs.readFile(userFilePath, 'utf-8');
      const parsedContent = yaml.load(fileContent) as any;

      expect(parsedContent.records.length).toBe(1);
      expect(parsedContent.records[0].name).toBe('OnDemand User');
      expect(parsedContent.meta.lastId).toBe(1);
    });

    it('should query for records', async () => {
      await db.insert('users', { name: 'Query User', email: 'q@test.com', age: 30 });
      
      const user = await db.query().from('users').where({ name: 'Query User' }).first();
      expect(user).toBeDefined();
      expect(user?.name).toBe('Query User');

      const allUsers = await db.query().from('users').all();
      expect(allUsers.length).toBe(1);
    });

    it('should update a record', async () => {
      const user = await db.insert('users', { name: 'Update Me', email: 'u@test.com', age: 40 });
      
      const updatedUsers = await db.update('users')
        .set({ name: 'Updated Name' })
        .where({ id: user.id });

      expect(updatedUsers.length).toBe(1);
      expect(updatedUsers[0]?.name).toBe('Updated Name');

      const userFilePath = path.join(dbDirPath, 'users.yaml');
      const fileContent = await fs.readFile(userFilePath, 'utf-8');
      const parsedContent = yaml.load(fileContent) as any;
      
      expect(parsedContent.records[0].name).toBe('Updated Name');
    });

    it('should delete a record', async () => {
      const user = await db.insert('users', { name: 'Delete Me', email: 'd@test.com', age: 50 });
      
      await db.delete('users').where({ id: user.id });

      const users = await db.query().from('users').all();
      expect(users.length).toBe(0);

      const userFilePath = path.join(dbDirPath, 'users.yaml');
      const fileContent = await fs.readFile(userFilePath, 'utf-8');
      const parsedContent = yaml.load(fileContent) as any;
      
      expect(parsedContent.records.length).toBe(0);
    });
    
    it('should query with relations', async () => {
      const user = await db.insert('users', { name: 'Author', email: 'author@test.com', age: 35 });
      await db.insert('posts', { title: 'Post by Author', content: '...', authorId: user.id });
      await db.insert('posts', { title: 'Another Post', content: '...', authorId: user.id });
      
      const userWithPosts = await db.query().from('users').where({ id: user.id }).with({ posts: true }).first();
      
      expect(userWithPosts).toBeDefined();
      expect(userWithPosts?.name).toBe('Author');
      expect(userWithPosts?.posts).toBeInstanceOf(Array);
      expect(userWithPosts?.posts?.length).toBe(2);
      expect(userWithPosts?.posts?.[0]?.title).toBe('Post by Author');
    });

    it('should perform aggregations', async () => {
      await db.insert('users', { name: 'Agg User 1', email: 'agg1@test.com', age: 20 });
      await db.insert('users', { name: 'Agg User 2', email: 'agg2@test.com', age: 30 });
      
      const result = await db.query().from('users').aggregate({
        count: konro.count(),
        avgAge: konro.avg('age'),
        sumAge: konro.sum('age'),
      });
      
      expect(result.count).toBe(2);
      expect(result.avgAge).toBe(25);
      expect(result.sumAge).toBe(50);
    });
  });

  describe('ID Generation', () => {
    it('should auto-increment IDs for new CSV files', async () => {
      const dbDirPath = path.join(TEST_DIR, 'csv_db');
      const adapter = konro.createFileAdapter({
        format: 'csv',
        mode: 'on-demand',
        multi: { dir: dbDirPath },
      });
      const db = konro.createDatabase({ schema: testSchema, adapter });

      const user1 = await db.insert('users', { name: 'CSV User 1', email: 'csv1@test.com', age: 20 });
      expect(user1.id).toBe(1);

      const user2 = await db.insert('users', { name: 'CSV User 2', email: 'csv2@test.com', age: 21 });
      expect(user2.id).toBe(2);

      // Verify file content
      const userFilePath = path.join(dbDirPath, 'users.csv');
      const fileContent = await fs.readFile(userFilePath, 'utf-8');
      const parsed = papaparse.parse(fileContent, { header: true, dynamicTyping: true, skipEmptyLines: true });
      expect(parsed.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'CSV User 1', email: 'csv1@test.com', age: 20, isActive: true }),
          expect.objectContaining({ id: 2, name: 'CSV User 2', email: 'csv2@test.com', age: 21, isActive: true }),
        ])
      );
    });

    it('should auto-increment IDs for new XLSX files', async () => {
      const dbDirPath = path.join(TEST_DIR, 'xlsx_db');
      const adapter = konro.createFileAdapter({
        format: 'xlsx',
        mode: 'on-demand',
        multi: { dir: dbDirPath },
      });
      const db = konro.createDatabase({ schema: testSchema, adapter });

      const user1 = await db.insert('users', { name: 'XLSX User 1', email: 'xlsx1@test.com', age: 20 });
      expect(user1.id).toBe(1);

      const user2 = await db.insert('users', { name: 'XLSX User 2', email: 'xlsx2@test.com', age: 21 });
      expect(user2.id).toBe(2);

      // Verify file content
      const userFilePath = path.join(dbDirPath, 'users.xlsx');
      const fileContent = await fs.readFile(userFilePath, 'utf-8');
      const workbook = xlsx.read(fileContent, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      expect(sheetName).toBeDefined();
      const worksheet = workbook.Sheets[sheetName!];
      expect(worksheet).toBeDefined();
      const data = xlsx.utils.sheet_to_json(worksheet!);
      expect(data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'XLSX User 1', email: 'xlsx1@test.com', age: 20, isActive: true }),
          expect.objectContaining({ id: 2, name: 'XLSX User 2', email: 'xlsx2@test.com', age: 21, isActive: true }),
        ])
      );
    });

    it('should determine lastId from existing CSV files', async () => {
      const dbDirPath = path.join(TEST_DIR, 'csv_db_read');
      const userFilePath = path.join(dbDirPath, 'users.csv');

      // Manually create a CSV with existing data
      await fs.mkdir(dbDirPath, { recursive: true });
      const initialCsv = papaparse.unparse([{ id: 5, name: 'Existing User', email: 'existing@test.com', age: 50, isActive: true }]);
      await fs.writeFile(userFilePath, initialCsv);

      const adapter = konro.createFileAdapter({ format: 'csv', mode: 'on-demand', multi: { dir: dbDirPath } });
      const db = konro.createDatabase({ schema: testSchema, adapter });

      const newUser = await db.insert('users', { name: 'New CSV User', email: 'newcsv@test.com', age: 25 });
      expect(newUser.id).toBe(6);
    });

    it('should determine lastId from existing XLSX files', async () => {
      const dbDirPath = path.join(TEST_DIR, 'xlsx_db_read');
      const userFilePath = path.join(dbDirPath, 'users.xlsx');

      // Manually create an XLSX with existing data
      await fs.mkdir(dbDirPath, { recursive: true });
      const initialData = [{ id: 10, name: 'Existing XLSX User', email: 'existing_xlsx@test.com', age: 60, isActive: false }];
      const worksheet = xlsx.utils.json_to_sheet(initialData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'data');
      const fileContent = xlsx.write(workbook, { bookType: 'xlsx', type: 'base64' });
      await fs.writeFile(userFilePath, fileContent, 'utf-8');

      const adapter = konro.createFileAdapter({ format: 'xlsx', mode: 'on-demand', multi: { dir: dbDirPath } });
      const db = konro.createDatabase({ schema: testSchema, adapter });

      const newUser = await db.insert('users', { name: 'New XLSX User', email: 'newxlsx@test.com', age: 35 });
      expect(newUser.id).toBe(11);
    });

    it('should generate UUIDs for id column', async () => {
      const dbDirPath = path.join(TEST_DIR, 'uuid_db');
      const adapter = konro.createFileAdapter({
        format: 'yaml',
        mode: 'on-demand',
        multi: { dir: dbDirPath },
      });
      const db = konro.createDatabase({ schema: uuidTestSchema, adapter });

      const user = await db.insert('uuid_users', { name: 'UUID User' });
      expect(typeof user.id).toBe('string');
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      const fileContent = await fs.readFile(path.join(dbDirPath, 'uuid_users.yaml'), 'utf-8');
      const parsed = yaml.load(fileContent) as any;
      expect(parsed.records[0].id).toBe(user.id);
    });
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

## File: src/index.ts
```typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, uuid, string, number, boolean, date, object, one, many, count, sum, avg, min, max } from './schema';

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

## File: test/integration/InMemoryFlow/CrudCycle.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema } from '../../util';
import path from 'path';
import type { InMemoryDbContext } from '../../../src/db';
import type { DatabaseState } from '../../../src/types';

describe('Integration > InMemoryFlow > CrudCycle', () => {
  let db: InMemoryDbContext<typeof testSchema>;
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
  "include": ["src/**/*", "test/**/*", "tsup.config.ts"],
  "exclude": ["dist/**/*"]
}
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

export const uuidTestSchema = konro.createSchema({
  tables: {
    uuid_users: {
      id: konro.uuid(),
      name: konro.string(),
    },
  },
});

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
    const inMemoryAdapter = konro.createFileAdapter({ format: 'json', single: { filepath: 'dummy.json' }});
    const db = konro.createDatabase({ schema: testSchema, adapter: inMemoryAdapter });
    const state = db.createEmptyState(); // For in-memory db

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

    // Test 4: Nested .with clause on in-memory db should be typed correctly
    db.query(state).from('users').with({
      posts: {
        where: (post) => post.title.startsWith('A') // post is typed as Post
      }
    }).first();

    // @ts-expect-error - 'nonExistentRelation' is not a valid relation on 'users'
    db.query(state).from('users').with({ nonExistentRelation: true });

    // Test 5: A query without .with() should return the base type, without relations.
    const baseUser = db.query(state).from('users').where({ id: 1 }).first();
    // This should be valid
    baseUser?.name;
    // @ts-expect-error - 'posts' does not exist on base user type, as .with() was not used.
    baseUser?.posts;

    // Test 6: A query with .with() should return the relations, which are now accessible.
    const userWithPosts = db.query(state).from('users').where({ id: 1 }).with({ posts: true }).first();
    userWithPosts?.posts; // This should be valid and typed as Post[] | undefined
    
    // userWithPosts?.posts?.[0]?.author; 

    // --- On-Demand DB Type Tests ---
    const onDemandAdapter = konro.createFileAdapter({ format: 'yaml', mode: 'on-demand', multi: { dir: 'dummy-dir' }});
    const onDemandDb = konro.createDatabase({ schema: testSchema, adapter: onDemandAdapter });

    // Test 7: On-demand query should not require state.
    onDemandDb.query().from('users').where({ name: 'Alice' }).first(); // Should be valid

    // Test 8: On-demand query with .with() should be typed correctly without state.
    onDemandDb.query().from('users').with({
      posts: {
        where: (post) => post.title.startsWith('A')
      }
    }).first();

    // @ts-expect-error - 'nonExistentRelation' is not a valid relation on 'users'
    onDemandDb.query().from('users').with({ nonExistentRelation: true });

    // Test 9: On-demand insert should be awaitable and return the correct type.
    const insertedUserPromise = onDemandDb.insert('users', { name: 'OnDemand', email: 'od@test.com', age: 22 });
    // @ts-expect-error - 'posts' should not exist on the base inserted type
    insertedUserPromise.then(u => u.posts);
  });
});
```

## File: src/adapter.ts
```typescript
import path from 'path';
import type { DatabaseState, KRecord, TableState } from './types';
import { createEmptyState } from './operations';
import type { ColumnDefinition, KonroSchema } from './schema';
import { type Serializer, getSerializer } from './utils/serializer.util';
import { FsProvider, defaultFsProvider, writeAtomic } from './fs';
import { KonroError, KonroStorageError } from './utils/error.util';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export interface StorageAdapter {
  read<S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>>;
  write(state: DatabaseState<any>, schema: KonroSchema<any, any>): Promise<void>;
  readonly mode: 'in-memory' | 'on-demand';
}

export interface FileStorageAdapter extends StorageAdapter {
  readonly options: FileAdapterOptions;
  readonly fs: FsProvider;
  readonly serializer: Serializer;
  readonly fileExtension: string;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; perRecord?: never };
type MultiFileStrategy = { multi: { dir: string }; single?: never; perRecord?: never };
type PerRecordStrategy = { perRecord: { dir: string }; single?: never; multi?: never };

export type FileAdapterOptions = {
  format: 'json' | 'yaml' | 'csv' | 'xlsx';
  fs?: FsProvider;
  /**
   * Defines the data access strategy.
   * - `in-memory`: (Default) Loads the entire database into memory on init. Fast for small/medium datasets.
   * - `on-demand`: Reads from the file system for each query. Slower but supports larger datasets. Requires 'multi-file' or 'per-record' strategy.
   */
  mode?: 'in-memory' | 'on-demand';
} & (SingleFileStrategy | MultiFileStrategy | PerRecordStrategy);

export function createFileAdapter(options: FileAdapterOptions & { mode: 'on-demand' }): FileStorageAdapter & { mode: 'on-demand' };
export function createFileAdapter(options: FileAdapterOptions & { mode?: 'in-memory' | undefined }): FileStorageAdapter & { mode: 'in-memory' };
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter;
export function createFileAdapter(options: FileAdapterOptions): FileStorageAdapter {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;
  const fs = options.fs ?? defaultFsProvider;
  const mode = options.mode ?? 'in-memory';

  const isTabular = options.format === 'csv' || options.format === 'xlsx';
  if (isTabular && (mode !== 'on-demand' || !options.multi)) {
    throw KonroError(`The '${options.format}' format only supports 'on-demand' mode with a 'multi-file' strategy.`);
  }

  if (options.perRecord && options.format !== 'json' && options.format !== 'yaml') {
    throw KonroError(`The 'per-record' strategy only supports 'json' or 'yaml' formats.`);
  }

  if (mode === 'on-demand' && options.single) {
    throw KonroError("The 'on-demand' mode requires the 'multi-file' or 'per-record' storage strategy.");
  }

  const parseFile = async <T>(filepath: string, schema?: Record<string, ColumnDefinition<any>>): Promise<T | undefined> => {
    const data = await fs.readFile(filepath);
    if (!data) return undefined;
    try {
      return serializer.parse<T>(data, schema);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${options.format} file. Original error: ${e.message}`);
    }
  };

  const readSingle = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const state = await parseFile<DatabaseState<any>>(options.single!.filepath);
    // The cast is acceptable as the original code made the same implicit assumption.
    return (state ?? createEmptyState(schema)) as DatabaseState<S>;
  };

  const readMulti = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    const state = createEmptyState(schema);
    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        const filepath = path.join(dir, `${tableName}${fileExtension}`);
        const tableState = await parseFile<TableState<any>>(filepath, schema.tables[tableName]);
        if (tableState) (state as any)[tableName] = tableState;
      })
    );
    return state;
  };

  const readPerRecord = async <S extends KonroSchema<any, any>>(schema: S): Promise<DatabaseState<S>> => {
    const dir = options.perRecord!.dir;
    await fs.mkdir(dir, { recursive: true });
    const state = createEmptyState(schema);

    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        const tableDir = path.join(dir, tableName);
        await fs.mkdir(tableDir, { recursive: true });

        // Read meta file for lastId
        const metaPath = path.join(tableDir, '_meta.json');
        try {
          const metaContent = await fs.readFile(metaPath);
          if (metaContent) {
            (state as any)[tableName].meta = JSON.parse(metaContent);
          }
        } catch (e) {
          /* ignore if not found or parsing fails, will use default */
        }

        const files = await fs.readdir(tableDir);
        const recordFiles = files.filter((f) => !f.startsWith('_meta'));

        const records = await Promise.all(
          recordFiles.map(async (file) => {
            const recordPath = path.join(tableDir, file);
            const recordContent = await fs.readFile(recordPath);
            if (!recordContent) return null;
            // The serializer for json/yaml just parses the content, schema is ignored.
            return serializer.parse<KRecord>(recordContent);
          })
        );

        (state as any)[tableName].records = records.filter((r) => r !== null);

        // If meta file didn't exist or was empty, derive lastId for auto-increment PKs.
        if ((state as any)[tableName].meta.lastId === 0) {
          const tableSchema = schema.tables[tableName];
          const idColumn = Object.keys(tableSchema).find((key) => tableSchema[key]?.dataType === 'id' && tableSchema[key]?.options?._pk_strategy !== 'uuid');
          if (idColumn) {
            (state as any)[tableName].meta.lastId = (state as any)[tableName].records.reduce((maxId: number, record: KRecord) => {
              const id = record[idColumn];
              return typeof id === 'number' && id > maxId ? id : maxId;
            }, 0);
          }
        }
      })
    );
    return state;
  };

  const writeSingle = (state: DatabaseState<any>) => writeAtomic(options.single!.filepath, serializer.stringify(state), fs);

  const writeMulti = async (state: DatabaseState<any>) => {
    const dir = options.multi!.dir;
    await fs.mkdir(dir, { recursive: true });
    const writes = Object.entries(state).map(([tableName, tableState]) => {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      return writeAtomic(filepath, serializer.stringify(tableState), fs);
    });
    await Promise.all(writes);
  };

  const writePerRecord = async (state: DatabaseState<any>, schema: KonroSchema<any, any>) => {
    const dir = options.perRecord!.dir;
    await fs.mkdir(dir, { recursive: true });

    const writes = Object.entries(state).map(async ([tableName, tableState]) => {
      const tableDir = path.join(dir, tableName);
      await fs.mkdir(tableDir, { recursive: true });

      // Write meta file first
      const metaPath = path.join(tableDir, '_meta.json');
      await writeAtomic(metaPath, JSON.stringify(tableState.meta, null, 2), fs);

      const idColumn = Object.keys(schema.tables[tableName]).find((key) => schema.tables[tableName][key]?.dataType === 'id');
      if (!idColumn) {
        throw KonroError(`Table "${tableName}" must have an 'id' column to be used with 'per-record' storage.`);
      }

      const currentFiles = new Set(tableState.records.map((r: KRecord) => `${r[idColumn]}${fileExtension}`));
      const existingFiles = (await fs.readdir(tableDir)).filter((f) => !f.startsWith('_meta') && !f.endsWith(TEMP_FILE_SUFFIX));

      const recordWrites = tableState.records.map((record: KRecord) => writeAtomic(path.join(tableDir, `${record[idColumn]}${fileExtension}`), serializer.stringify(record), fs));
      const recordsToDelete = existingFiles.filter((f) => !currentFiles.has(f));
      const recordDeletes = recordsToDelete.map((f) => fs.unlink(path.join(tableDir, f)));

      await Promise.all([...recordWrites, ...recordDeletes]);
    });
    await Promise.all(writes);
  };

  return {
    options,
    fs,
    serializer,
    fileExtension,
    mode,
    read: options.single ? readSingle : options.multi ? readMulti : readPerRecord,
    write: options.single ? writeSingle : options.multi ? writeMulti : writePerRecord,
  } as FileStorageAdapter;
}
```

## File: package.json
```json
{
  "name": "konro",
  "version": "0.1.2",
  "description": "A type-safe, functional micro-ORM for JSON/YAML files.",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/relaycoder/konro.git"
  },
  "keywords": [
    "orm",
    "json",
    "yaml",
    "csv",
    "xlsx",
    "database",
    "typescript",
    "local-first",
    "immutable",
    "functional"
  ],
  "author": "relaycoder",
  "license": "MIT",
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9",
    "@types/papaparse": "^5.3.14",
    "@typescript-eslint/eslint-plugin": "^8.36.0",
    "@typescript-eslint/parser": "^8.36.0",
    "eslint": "^9.30.1",
    "js-yaml": "^4.1.0",
    "papaparse": "^5.4.1",
    "tsup": "^8.5.0",
    "typescript": "^5.5.4",
    "xlsx": "^0.18.5"
  },
  "peerDependencies": {
    "js-yaml": "^4.1.0",
    "papaparse": "^5.4.1",
    "typescript": "^5.0.0",
    "xlsx": "^0.18.5"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
      "optional": true
    },
    "papaparse": {
      "optional": true
    },
    "xlsx": {
      "optional": true
    }
  },
  "scripts": {
    "lint": "eslint .",
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "npm run build"
  }
}
```

## File: src/db.ts
```typescript
import path from 'path';
import { AggregationDefinition, ColumnDefinition, KonroSchema, RelationDefinition } from './schema';
import { StorageAdapter, FileStorageAdapter } from './adapter';
import { DatabaseState, KRecord, TableState } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor, _aggregateImpl, AggregationDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';
import { KonroError, KonroStorageError } from './utils/error.util';
import { writeAtomic } from './fs';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE HELPERS for Fluent API ---

type RelatedModel<T> = T extends (infer R)[] ? R : T extends (infer R | null) ? R : T;

// TAll is the full relational model type, e.g. schema.types.users
type WithArgument<TAll> = { // e.g. TAll = S['types']['users']
  [K in keyof TAll as NonNullable<TAll[K]> extends any[] | object ? K : never]?: boolean | ({
    where?: (record: RelatedModel<NonNullable<TAll[K]>>) => boolean;
  } & (
    | { select: Record<string, ColumnDefinition<unknown>>; with?: never }
    | { select?: never; with?: WithArgument<RelatedModel<NonNullable<TAll[K]>>> }
  ));
};

type ResolveWith<
  S extends KonroSchema<any, any>,
  TName extends keyof S['tables'],
  TWith extends WithArgument<S['types'][TName]>
> = { // TName='users', TWith={posts: {with: {author: true}}}
    [K in keyof TWith & keyof S['relations'][TName]]:
        S['relations'][TName][K] extends { relationType: 'many' }
            ? ( // 'many' relation -> array result. K = 'posts'
                TWith[K] extends { select: infer TSelect }
                    ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> })[]
                    : TWith[K] extends { with: infer TNestedWith }
                        // S['relations']['users']['posts']['targetTable'] = 'posts'
                        ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>)[]
                        // posts: true.
                        : S['base'][S['relations'][TName][K]['targetTable']][]
              )
            : S['relations'][TName][K] extends { relationType: 'one' }
                ? ( // 'one' relation -> nullable object result
                    TWith[K] extends { select: infer TSelect }
                        ? ({ [P in keyof TSelect]: InferColumnType<TSelect[P]> }) | null
                        : TWith[K] extends { with: infer TNestedWith }
                            ? (S['base'][S['relations'][TName][K]['targetTable']] & ResolveWith<S, S['relations'][TName][K]['targetTable'], TNestedWith & WithArgument<S['types'][S['relations'][TName][K]['targetTable']]>>) | null
                            : S['base'][S['relations'][TName][K]['targetTable']] | null
                  )
                : never
};

// InferColumnType is not exported from schema, so we need it here too.
type InferColumnType<C> = C extends ColumnDefinition<infer T> ? T : never;

// --- IN-MEMORY API TYPES (STATEFUL) ---

interface ChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<S['base'][TName]> | ((record: S['base'][TName]) => boolean)): this;
  with<W extends WithArgument<S['types'][TName]>>(relations: W): ChainedQueryBuilder<S, TName, TReturn & ResolveWith<S, TName, W>>;
  limit(count: number): this;
  offset(count: number): this;
  all(): TReturn[];
  first(): TReturn | null;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): { [K in keyof TAggs]: number | null };
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S, T, S['base'][T]>;
}

interface UpdateBuilder<S extends KonroSchema<any, any>, TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
  };
}

interface DeleteBuilder<S extends KonroSchema<any, any>, TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): [DatabaseState<S>, TBase[]];
}

export interface InMemoryDbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState<S>>;
  write(state: DatabaseState<S>): Promise<void>;
  createEmptyState(): DatabaseState<S>;

  query(state: DatabaseState<S>): QueryBuilder<S>;
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: S['create'][T]): [DatabaseState<S>, S['base'][T]];
  insert<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T, values: Readonly<S['create'][T]>[]): [DatabaseState<S>, S['base'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]>;
}


// --- ON-DEMAND API TYPES (STATELESS & ASYNC) ---

interface OnDemandChainedQueryBuilder<S extends KonroSchema<any, any>, TName extends keyof S['tables'], TReturn> {
  select(fields: Record<string, ColumnDefinition<unknown> | RelationDefinition>): this;
  where(predicate: Partial<S['base'][TName]> | ((record: S['base'][TName]) => boolean)): this;
  with<W extends WithArgument<S['types'][TName]>>(relations: W): OnDemandChainedQueryBuilder<S, TName, TReturn & ResolveWith<S, TName, W>>;
  limit(count: number): this;
  offset(count: number): this;
  all(): Promise<TReturn[]>;
  first(): Promise<TReturn | null>;
  aggregate<TAggs extends Record<string, AggregationDefinition>>(
    aggregations: TAggs
  ): Promise<{ [K in keyof TAggs]: number | null }>;
}

interface OnDemandQueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): OnDemandChainedQueryBuilder<S, T, S['base'][T]>;
}

interface OnDemandUpdateBuilder<TBase, TCreate> {
  set(data: Partial<TCreate>): {
    where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
  };
}

interface OnDemandDeleteBuilder<TBase> {
  where(predicate: Partial<TBase> | ((record: TBase) => boolean)): Promise<TBase[]>;
}

export interface OnDemandDbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<never>; // Not supported in on-demand mode
  write(): Promise<never>; // Not supported in on-demand mode
  createEmptyState(): DatabaseState<S>;

  query(): OnDemandQueryBuilder<S>;
  insert<T extends keyof S['tables']>(tableName: T, values: S['create'][T]): Promise<S['base'][T]>;
  insert<T extends keyof S['tables']>(tableName: T, values: Readonly<S['create'][T]>[]): Promise<S['base'][T][]>;
  update<T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]>;
  delete<T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]>;
}

// --- DbContext Union Type ---
export type DbContext<S extends KonroSchema<any, any>> = InMemoryDbContext<S> | OnDemandDbContext<S>;

// --- CORE LOGIC (STATELESS & PURE) ---

/**
 * Creates the core, stateless database operations.
 * These operations are pure functions that take a database state and return a new state,
 * forming the foundation for both in-memory and on-demand modes.
 */
function createCoreDbContext<S extends KonroSchema<any, any>>(schema: S) {
  const query = (state: DatabaseState<S>): QueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): ChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): ChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: (): TReturn[] => _queryImpl(state as DatabaseState, schema, currentDescriptor) as any,
        first: (): TReturn | null => (_queryImpl(state as DatabaseState, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any,
        aggregate: (aggregations) => {
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state as DatabaseState, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = <T extends keyof S['tables']>(
    state: DatabaseState<S>, tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]
  ): [DatabaseState<S>, S['base'][T] | S['base'][T][]] => {
    const valsArray = Array.isArray(values) ? values : [values];
    const [newState, inserted] = _insertImpl(state as DatabaseState, schema, tableName as string, valsArray as KRecord[]);
    const result = Array.isArray(values) ? inserted : inserted[0];
    return [newState as DatabaseState<S>, result] as [DatabaseState<S>, S['base'][T] | S['base'][T][]];
  };

  const update = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): UpdateBuilder<S, S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: (predicate) => {
        const [newState, updatedRecords] = _updateImpl(state as DatabaseState, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate as any));
        return [newState as DatabaseState<S>, updatedRecords as S['base'][T][]];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(state: DatabaseState<S>, tableName: T): DeleteBuilder<S, S['base'][T]> => ({
    where: (predicate) => {
      const [newState, deletedRecords] = _deleteImpl(state as DatabaseState, tableName as string, normalizePredicate(predicate as any));
      return [newState as DatabaseState<S>, deletedRecords as S['base'][T][]];
    },
  });

  return { query, insert, update, delete: del };
}

// --- ON-DEMAND CONTEXT (STATEFUL WRAPPER) ---

function createMultiFileOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: FileStorageAdapter,
  core: ReturnType<typeof createCoreDbContext<S>>
): OnDemandDbContext<S> {
  const { dir } = adapter.options.multi!;

  const readTableState = async (tableName: string): Promise<TableState> => {
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const data = await adapter.fs.readFile(filepath);
    if (!data) return { records: [], meta: { lastId: 0 } };
    try {
      return adapter.serializer.parse(data, schema.tables[tableName]);
    } catch (e: any) {
      throw KonroStorageError(`Failed to parse file at "${filepath}". It may be corrupt or not a valid ${adapter.options.format} file. Original error: ${e.message}`);
    }
  };

  const writeTableState = async (tableName: string, tableState: TableState): Promise<void> => {
    await adapter.fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, `${tableName}${adapter.fileExtension}`);
    const content = adapter.serializer.stringify(tableState);
    await writeAtomic(filepath, content, adapter.fs);
  };
  
  // For queries with relations, we need the full state.
  const getFullState = async (): Promise<DatabaseState<S>> => {
    const state = createEmptyStateImpl(schema);
    await Promise.all(Object.keys(schema.tables).map(async (tableName) => {
      (state as any)[tableName] = await readTableState(tableName);
    }));
    return state;
  }

  // A generic handler for CUD operations that reads one table, performs an action, and writes it back.
  const performCud = async <TResult>(tableName: string, action: (state: DatabaseState<S>) => [DatabaseState<S>, TResult]): Promise<TResult> => {
    const state = createEmptyStateImpl(schema);
    (state as any)[tableName] = await readTableState(tableName);
    const [newState, result] = action(state as DatabaseState<S>);
    
    // Check if the operation produced a result (e.g., an array of inserted/updated/deleted records)
    const hasChanges = Array.isArray(result) ? result.length > 0 : result !== null;
    if (hasChanges) {
      const newTableState = newState[tableName as string];
      // This check satisfies the `noUncheckedIndexedAccess` compiler option.
      // Our CUD logic ensures this state will always exist after a change.
      if (newTableState) {
        await writeTableState(tableName, newTableState);
      }
    }
    return result;
  };

  const query = (): OnDemandQueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
      // The query builder for on-demand must be separate because its terminal methods are async.
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: async (): Promise<TReturn[]> => {
          const state = await getFullState();
          return _queryImpl(state, schema, currentDescriptor) as any;
        },
        first: async (): Promise<TReturn | null> => {
          const state = await getFullState();
          return (_queryImpl(state, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any;
        },
        aggregate: async (aggregations) => {
          const state = await getFullState();
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = <T extends keyof S['tables']>(tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]): Promise<any> => 
    performCud(tableName as string, (state) => core.insert(state, tableName, values as any));

  const update = <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: (predicate) => performCud(tableName as string, (state) => core.update(state, tableName).set(data).where(predicate as any)) as Promise<S['base'][T][]>,
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: (predicate) => performCud(tableName as string, (state) => core.delete(state, tableName).where(predicate as any)) as Promise<S['base'][T][]>,
  });

  const notSupported = () => Promise.reject(KonroError("This method is not supported in 'on-demand' mode."));

  return {
    schema,
    adapter,
    read: notSupported,
    write: notSupported,
    createEmptyState: () => createEmptyStateImpl(schema),
    query,
    insert,
    update,
    delete: del,
  };
}

function createPerRecordOnDemandDbContext<S extends KonroSchema<any, any>>(
  schema: S,
  adapter: FileStorageAdapter,
  core: ReturnType<typeof createCoreDbContext<S>>
): OnDemandDbContext<S> {
  const { dir } = adapter.options.perRecord!;
  const { fs, serializer, fileExtension } = adapter;

  const getTableDir = (tableName: string) => path.join(dir, tableName);
  const getRecordPath = (tableName: string, recordId: string | number) => path.join(getTableDir(tableName), `${recordId}${fileExtension}`);
  const getMetaPath = (tableName: string) => path.join(getTableDir(tableName), '_meta.json');

  const getIdColumn = (tableName: string) => {
    const tableSchema = schema.tables[tableName];
    const idColumn = Object.keys(tableSchema).find((key) => tableSchema[key]?.dataType === 'id');
    if (!idColumn) {
      throw KonroError(`Table "${tableName}" must have an 'id' column to be used with 'per-record' storage.`);
    }
    return idColumn;
  };

  const readMeta = async (tableName: string): Promise<{ lastId: number }> => {
    const metaContent = await fs.readFile(getMetaPath(tableName));
    return metaContent ? JSON.parse(metaContent) : { lastId: 0 };
  };

  const writeMeta = async (tableName: string, meta: { lastId: number }): Promise<void> => {
    await fs.mkdir(getTableDir(tableName), { recursive: true });
    await writeAtomic(getMetaPath(tableName), JSON.stringify(meta, null, 2), fs);
  };

  const readTableState = async (tableName: string): Promise<TableState> => {
    const tableDir = getTableDir(tableName);
    await fs.mkdir(tableDir, { recursive: true });

    const meta = await readMeta(tableName);
    const files = await fs.readdir(tableDir);
    const recordFiles = files.filter((f) => !f.startsWith('_meta'));

    const records = (
      await Promise.all(
        recordFiles.map(async (file) => {
          const content = await fs.readFile(path.join(tableDir, file));
          return content ? serializer.parse<KRecord>(content) : null;
        })
      )
    ).filter((r): r is KRecord => r !== null);

    return { records, meta };
  };

  const getFullState = async (): Promise<DatabaseState<S>> => {
    const state = createEmptyStateImpl(schema);
    await Promise.all(
      Object.keys(schema.tables).map(async (tableName) => {
        (state as any)[tableName] = await readTableState(tableName);
      })
    );
    return state;
  };

  const query = (): OnDemandQueryBuilder<S> => ({
    from: <TName extends keyof S['tables']>(tableName: TName): OnDemandChainedQueryBuilder<S, TName, S['base'][TName]> => {
      const createBuilder = <TReturn>(currentDescriptor: QueryDescriptor): OnDemandChainedQueryBuilder<S, TName, TReturn> => ({
        select(fields) { return createBuilder<TReturn>({ ...currentDescriptor, select: fields }); },
        where(predicate) { return createBuilder<TReturn>({ ...currentDescriptor, where: normalizePredicate(predicate as any) }); },
        with<W extends WithArgument<S['types'][TName]>>(relations: W) {
          const newWith = { ...currentDescriptor.with, ...(relations as QueryDescriptor['with']) };
          return createBuilder<TReturn & ResolveWith<S, TName, W>>({ ...currentDescriptor, with: newWith });
        },
        limit(count) { return createBuilder<TReturn>({ ...currentDescriptor, limit: count }); },
        offset(count) { return createBuilder<TReturn>({ ...currentDescriptor, offset: count }); },
        all: async (): Promise<TReturn[]> => {
          const state = await getFullState();
          return _queryImpl(state, schema, currentDescriptor) as any;
        },
        first: async (): Promise<TReturn | null> => {
          const state = await getFullState();
          return (_queryImpl(state, schema, { ...currentDescriptor, limit: 1 })[0] ?? null) as any;
        },
        aggregate: async (aggregations) => {
          const state = await getFullState();
          const aggDescriptor: AggregationDescriptor = { ...currentDescriptor, aggregations };
          return _aggregateImpl(state, schema, aggDescriptor) as any;
        },
      });
      return createBuilder<S['base'][TName]>({ tableName: tableName as string });
    },
  });

  const insert = async <T extends keyof S['tables']>(tableName: T, values: S['create'][T] | Readonly<S['create'][T]>[]): Promise<any> => {
    const tableNameStr = tableName as string;
    const meta = await readMeta(tableNameStr);
    const idColumn = getIdColumn(tableNameStr);

    // We only need a shallow table state for insert, no records needed for validation context.
    const tempState: DatabaseState = { [tableNameStr]: { records: [], meta } };
    const [newState, insertedResult] = core.insert(tempState as any, tableName, values as any);

    const insertedAsArray = Array.isArray(insertedResult) ? insertedResult : insertedResult ? [insertedResult] : [];

    if (insertedAsArray.length === 0) {
      return insertedResult; // Return original empty array or null
    }

    await Promise.all(
      (insertedAsArray as KRecord[]).map((rec) => {
        const recordPath = getRecordPath(tableNameStr, rec[idColumn] as any);
        return writeAtomic(recordPath, serializer.stringify(rec), fs);
      })
    );

    const newMeta = (newState as DatabaseState)[tableNameStr]?.meta;
    if (newMeta && newMeta.lastId !== meta.lastId) {
      await writeMeta(tableNameStr, newMeta);
    }

    return insertedResult;
  };

  const update = <T extends keyof S['tables']>(tableName: T): OnDemandUpdateBuilder<S['base'][T], S['create'][T]> => ({
    set: (data) => ({
      where: async (predicate) => {
        const tableNameStr = tableName as string;
        const tableState = await readTableState(tableNameStr);
        const idColumn = getIdColumn(tableNameStr);
        const [, updatedRecords] = core.update({ [tableNameStr]: tableState } as any, tableName).set(data).where(predicate as any);

        if (updatedRecords.length > 0) {
          await Promise.all(
            (updatedRecords as KRecord[]).map((rec) => writeAtomic(getRecordPath(tableNameStr, rec[idColumn] as any), serializer.stringify(rec), fs))
          );
        }
        return updatedRecords as S['base'][T][];
      },
    }),
  });

  const del = <T extends keyof S['tables']>(tableName: T): OnDemandDeleteBuilder<S['base'][T]> => ({
    where: async (predicate) => {
      const tableNameStr = tableName as string;
      const tableState = await readTableState(tableNameStr);
      const idColumn = getIdColumn(tableNameStr);
      const [, deletedRecords] = core.delete({ [tableNameStr]: tableState } as any, tableName).where(predicate as any);

      if (deletedRecords.length > 0) {
        await Promise.all((deletedRecords as KRecord[]).map((rec) => fs.unlink(getRecordPath(tableNameStr, rec[idColumn] as any))));
      }
      return deletedRecords as S['base'][T][];
    },
  });

  const notSupported = () => Promise.reject(KonroError("This method is not supported in 'on-demand' mode."));

  return { schema, adapter, createEmptyState: () => createEmptyStateImpl(schema), read: notSupported, write: notSupported, query, insert, update, delete: del };
}


// --- DATABASE FACTORY ---

export function createDatabase<
  S extends KonroSchema<any, any>,
  TAdapter extends StorageAdapter,
>(
  options: { schema: S; adapter: TAdapter }
): TAdapter['mode'] extends 'on-demand' ? OnDemandDbContext<S> : InMemoryDbContext<S>;
export function createDatabase<S extends KonroSchema<any, any>>(
  options: { schema: S; adapter: StorageAdapter }
): DbContext<S> {
  const { schema, adapter } = options;
  const core = createCoreDbContext(schema);

  if (adapter.mode === 'on-demand') {
    const fileAdapter = adapter as FileStorageAdapter; // We can be sure it's a FileStorageAdapter due to checks
    if (fileAdapter.options.multi) {
      return createMultiFileOnDemandDbContext(schema, fileAdapter, core);
    }
    if (fileAdapter.options.perRecord) {
      return createPerRecordOnDemandDbContext(schema, fileAdapter, core);
    }
    throw KonroError("The 'on-demand' mode requires a 'multi-file' or 'per-record' storage strategy.");
  }

  // For in-memory, just combine the core logic with the adapter and I/O methods.
  return {
    ...core,
    schema, adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state, schema),
    createEmptyState: () => createEmptyStateImpl(schema),
  } as InMemoryDbContext<S>;
}
```

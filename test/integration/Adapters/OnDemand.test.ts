import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { konro } from '../../../src/index';
import { testSchema, TEST_DIR, cleanup, ensureTestDir } from '../../util';
import path from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
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
      }).toThrow(KonroError("The 'on-demand' mode requires the 'multi-file' storage strategy."));
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
});
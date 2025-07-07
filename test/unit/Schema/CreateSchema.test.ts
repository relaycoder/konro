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
});
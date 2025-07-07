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
        const post = results[0];
        expect(post.author).toBeDefined();
        expect(post.author.id).toBe(1);
        expect(post.author.name).toBe('Alice');
    });

    it('should resolve a `many` relationship and attach it as an array', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: { posts: true }
        });

        expect(results.length).toBe(1);
        const user = results[0];
        expect(user.posts).toBeDefined();
        expect(user.posts).toBeInstanceOf(Array);
        expect(user.posts.length).toBe(2);
        expect(user.posts[0].title).toBe('Alice Post 1');
        expect(user.posts[1].title).toBe('Alice Post 2');
    });

    it('should filter nested records within a .with() clause', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 1,
            with: {
                posts: {
                    where: (post) => (post.title as string).includes('Post 2')
                }
            }
        });

        expect(results.length).toBe(1);
        const user = results[0];
        expect(user.posts).toBeDefined();
        expect(user.posts.length).toBe(1);
        expect(user.posts[0].id).toBe(12);
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
        const user = results[0];
        expect(user.posts).toBeInstanceOf(Array);
        expect(user.posts.length).toBe(2);
        expect(user.profile).toBeDefined();
        expect(user.profile.bio).toBe('Bio for Alice');
    });

    it('should return null for a `one` relation if no related record is found', () => {
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 2, // Bob has no profile
            with: { profile: true }
        });

        expect(results.length).toBe(1);
        const user = results[0];
        expect(user.profile).toBeNull();
    });

    it('should return an empty array for a `many` relation if no related records are found', () => {
        // Add a user with no posts
        testState.users.records.push({ id: 3, name: 'Charlie' });
        const results = _queryImpl(testState, testSchema, {
            tableName: 'users',
            where: r => r.id === 3,
            with: { posts: true }
        });

        expect(results.length).toBe(1);
        const user = results[0];
        expect(user.posts).toBeInstanceOf(Array);
        expect(user.posts.length).toBe(0);
    });
});
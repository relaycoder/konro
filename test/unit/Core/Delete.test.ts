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
        expect(originalState.users.records.length).toBe(3);
        expect(newState.users.records.length).toBe(2);
    });

    it('should only delete records that match the predicate function', () => {
        const [newState, deleted] = _deleteImpl(testState, 'users', (r) => (r.age as number) > 35);
        
        expect(deleted.length).toBe(1);
        expect(deleted[0].id).toBe(3);
        expect(newState.users.records.length).toBe(2);
        expect(newState.users.records.find(u => u.id === 3)).toBeUndefined();
    });

    it('should return both the new state and an array of the full, deleted records in the result tuple', () => {
        const [newState, deleted] = _deleteImpl(testState, 'users', (r) => r.id === 2);

        expect(newState).toBeDefined();
        expect(deleted).toBeInstanceOf(Array);
        expect(deleted.length).toBe(1);
        expect(deleted[0]).toEqual({ id: 2, name: 'Bob', email: 'b@b.com', age: 25 });
    });

    it('should not modify the table meta lastId on delete', () => {
        const [newState] = _deleteImpl(testState, 'users', (r) => r.id === 3);
        expect(newState.users.meta.lastId).toBe(3);
    });
});
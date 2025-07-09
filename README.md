# Konro: The Type-Safe, Functional ORM for Your Local Files

<p align="center">
  <img src="https://i.imgur.com/6s2uA4Z.jpeg" alt="Konro Logo - A bowl of soup representing the database state, with spices (functions) being added" width="400" />
</p>

<p align="center">
  <strong>Slow-simmer your data. A pure, functional, and type-safe "spice rack" for your JSON, YAML, CSV, or XLSX "broth".</strong>
</p>

<p align="center">
  <a href="https://nodei.co/npm/konro/"><img src="https://nodei.co/npm/konro.png?downloads=true&compact=true" alt="NPM"></a>
  <br>
  <img alt="npm" src="https://img.shields.io/npm/v/konro?style=for-the-badge&color=c43a3a">
  <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/relaycoder/konro/ci.yml?style=for-the-badge&logo=github">
  <img alt="License" src="https://img.shields.io/npm/l/konro?style=for-the-badge">
</p>

---

Konro is a new kind of "micro-ORM" for JavaScript and TypeScript. It offers the safety and developer experience of a full-scale, relational database ORM, but for local **JSON, YAML, CSV, or XLSX files**. It is designed from the ground up to be **type-safe, immutable, relational, and ergonomic,** making it the perfect data persistence layer for local-first apps, CLIs, and small servers.

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
    *   [Data Access Modes: `in-memory` vs `on-demand`](#data-access-modes-in-memory-vs-on-demand)
    *   [The `konro.createDatabase` Function](#the-konrocreatedatabase-function)
8.  [**Pillar III: Cooking (The Fluent API)**](#8-pillar-iii-cooking-the-fluent-api)
    *   [Two API Styles: In-Memory vs. On-Demand](#two-api-styles-in-memory-vs-on-demand)
    *   [Reading Data with `db.query()`](#reading-data-with-dbquery)
    *   [Automatic Timestamps and Soft Deletes](#automatic-timestamps-and-soft-deletes)
    *   [Advanced Queries with `.with()`](#advanced-queries-with-with)
    *   [Aggregating Data](#aggregating-data)
    *   [Writing Data: `insert`, `update`, `delete`](#writing-data-insert-update-delete)
9.  [**Advanced Concepts & Patterns**](#9-advanced-concepts--patterns)
    *   [Testing Your Logic](#testing-your-logic)
    *   [Performance Considerations](#performance-considerations)
10. [**API Reference Cheatsheet**](#10-api-reference-cheatsheet)
11. [**Roadmap**](#11-roadmap)
12. [**Comparison to Other Libraries**](#12-comparison-to-other-libraries)
13. [**Contributing**](#13-contributing)
14. [**License**](#14-license)

---

## 1. The Konro Philosophy: Cooking Your Data

Konro is inspired by the art of Indonesian cooking, where a rich soup or `Konro` is made by carefully combining a base broth with a precise recipe and a collection of spices. Konro treats your data with the same philosophy.

*   **The Broth (Your Data):** Your database state is a plain, passive file (JSON, YAML, CSV, etc.). It holds no logic.
*   **The Recipe (Your Schema):** You define a schema that acts as a recipe, describing your data's structure, types, and relationships.
*   **The Spices (Pure Functions):** Konro provides a set of pure, immutable functions that act as spices. They take the broth and transform it, always returning a *new, updated broth*, never changing the original.
*   **The Fluent API (Your Guided Hand):** Konro provides an ergonomic, chainable API that guides you through the process of combining these elements, making the entire cooking process safe, predictable, and enjoyable.

## 2. Core Principles: The Konro Difference

*   **Type-First, Not Schema-First:** You don't write a schema to get types. You write a schema *as* types. Your schema definition becomes your single source of truth for both runtime validation and static TypeScript types.
*   **Stateless Core, Stateful Feel:** The internal engine is a collection of pure, stateless functions (`(state, args) => newState`). The user-facing API is a fluent, chainable "query builder" that feels intuitive and stateful, giving you the best of both worlds.
*   **Immutable by Default:** In its primary `in-memory` mode, data is never mutated. Every `insert`, `update`, or `delete` operation is an explicit API call that returns a `[newState, result]` tuple. This eliminates side effects and makes state management predictable and safe.
*   **Relational at Heart:** Define `one-to-one`, `one-to-many`, and `many-to-one` relationships directly in your schema. Eager-load related data with a powerful `.with()` clause, and define cascading delete behavior right where it belongs.
*   **Managed Lifecycle:** Automate timestamps (`createdAt`, `updatedAt`) and implement soft deletes (`deletedAt`) with simple schema declarations, reducing boilerplate code.
*   **Scales with You:** Start with a simple, atomic JSON file (`in-memory` mode). As your data grows, switch to `on-demand` mode with `multi-file` or `per-record` strategies to reduce memory usage and get more granular I/O.

## 3. When to Use Konro (and When Not To)

✅ **Use Konro for:**

*   **Local-First Applications:** The perfect data layer for Electron, Tauri, or any desktop app needing a robust, relational store.
*   **Command-Line Tools (CLIs):** Manage complex state or configuration for a CLI tool in a structured, safe way.
*   **Small to Medium Servers:** Ideal for personal projects, blogs, portfolios, or microservices where you want to avoid the overhead of a traditional database.
*   **Rapid Prototyping:** Get the benefits of a type-safe, relational ORM without spinning up a database server.

❌ **Consider other solutions if you need:**

*   **High-Concurrency Writes:** Konro's file-based adapters are not designed for environments where many processes need to write to the database simultaneously at high frequency.
*   **Extreme Performance at Scale:** While `on-demand` mode helps with memory, complex relational queries still load data into memory. For gigabyte-scale relational processing, a dedicated database server is more appropriate.
*   **Distributed Systems:** Konro is a single-node database solution by design.

---

## 4. Installation

```bash
npm install konro
```

Konro has **optional** peer dependencies for different file formats. Install the ones you need:

```bash
# For YAML file support
npm install js-yaml

# For CSV file support
npm install papaparse

# For XLSX (Excel) file support
npm install xlsx
```

---

## 5. The 5-Minute Recipe: A Quick Start

Let's build a simple, relational blog database from scratch, complete with managed timestamps and soft deletes.

**Step 1: Define the Recipe (`src/schema.ts`)**
Create a single source of truth for your entire database structure. Konro will infer your TypeScript types from this object.

```typescript
import { konro } from 'konro';

export const blogSchema = konro.createSchema({
  tables: {
    users: {
      id: konro.id(),
      name: konro.string({ min: 2 }),
      email: konro.string({ format: 'email', unique: true }),
      createdAt: konro.createdAt(),
      deletedAt: konro.deletedAt(), // Enables soft deletes
    },
    posts: {
      id: konro.id(),
      title: konro.string({ min: 5 }),
      published: konro.boolean({ default: false }),
      authorId: konro.number({ type: 'integer' }),
      createdAt: konro.createdAt(),
      updatedAt: konro.updatedAt(), // Managed timestamp
    },
  },
  relations: (t) => ({
    users: {
      // If a user is hard-deleted, all their posts are also deleted.
      posts: konro.many('posts', { on: 'id', references: 'authorId', onDelete: 'CASCADE' }),
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
Create a database context that is pre-configured with your schema and a storage adapter. This example uses the `in-memory` mode.

```typescript
import { konro } from 'konro';
import { blogSchema } from './schema';

// Use a multi-file YAML adapter to create 'users.yaml' and 'posts.yaml'.
// Other strategies: `single: { ... }` or `perRecord: { ... }`
const adapter = konro.createFileAdapter({
  format: 'yaml', // 'json', 'yaml', 'csv', 'xlsx'
  multi: { dir: './data/yaml_db' },
  // mode: 'in-memory' is the default
});

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
  // 1. READ state from disk. This loads the entire database into memory.
  let state = await db.read();
  console.log('Database state loaded.');

  // 2. INSERT a new user. `createdAt` is set automatically.
  let newUser: User;
  [state, newUser] = db.insert(state, 'users', {
    name: 'Chef Renatta',
    email: 'renatta@masterchef.dev',
  });
  console.log('User created:', newUser);

  // Use the NEW state. `createdAt` and `updatedAt` are set automatically.
  [state] = db.insert(state, 'posts', {
    title: 'The Art of Plating',
    authorId: newUser.id,
  });

  // 3. UPDATE a record. `updatedAt` is updated automatically.
  let updatedPosts; // Type inferred as Post[]
  [state, updatedPosts] = db.update(state, 'posts')
    .set({ published: true })
    .where({ id: 1 });
  console.log('Post published:', updatedPosts[0]);

  // 4. SOFT DELETE the user. Because the `users` table has a `deletedAt` column,
  // this performs a soft delete.
  let deletedUsers;
  [state, deletedUsers] = db.delete(state, 'users').where({ id: newUser.id });
  console.log('Soft-deleted user:', deletedUsers[0].name);

  // By default, queries now EXCLUDE the soft-deleted user.
  const user = db.query(state).from('users').where({ id: newUser.id }).first();
  console.log('User found after delete?', user); // null

  // But you can query for them explicitly with `withDeleted()`.
  const softDeletedUser = db.query(state).from('users').withDeleted().where({ id: newUser.id }).first();
  console.log('User found with withDeleted()?', softDeletedUser?.name);

  // 5. WRITE the final state back to disk.
  await db.write(state);
  console.log('Database saved!');
}

main().catch(console.error);
```
*(For the alternative `on-demand` API style, see [Pillar III](#8-pillar-iii-cooking-the-fluent-api)).*

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
| `konro.uuid()`     | A managed, UUID string primary key.                                                    |
| `konro.string()`   | `{ unique, default, min, max, format: 'email' \| 'uuid' \| 'url' }`                        |
| `konro.number()`   | `{ unique, default, min, max, type: 'integer' }`                                       |
| `konro.boolean()`  | `{ default }`                                                                          |
| `konro.date()`     | `{ default }` (e.g., `() => new Date()`). Stored as an ISO string.                      |
| `konro.object()`   | Stores an arbitrary JSON object.                                                       |
| `konro.createdAt()`| A managed timestamp set only when a record is created.                                   |
| `konro.updatedAt()`| A managed timestamp set when a record is created *and* updated.                          |
| `konro.deletedAt()`| A managed, nullable timestamp for enabling soft deletes on a table.                      |

### Defining Relationships

Under the `relations` key, you define how your tables connect. This centralized approach makes your data model easy to understand at a glance.

*   `konro.one(targetTable, options)`: Defines a `one-to-one` or `many-to-one` relationship. This is used on the table that holds the foreign key.
*   `konro.many(targetTable, options)`: Defines a `one-to-many` relationship. This is used on the table that is being pointed to.

The `options` object is `{ on: string, references: string, onDelete?: 'CASCADE' | 'SET NULL' }`.
*   `on`: The key on the **current** table.
*   `references`: The key on the **related** table.
*   `onDelete`: (Optional) Defines the behavior when a parent record is deleted.
    *   `'CASCADE'`: Automatically delete the related records.
    *   `'SET NULL'`: Set the foreign key on related records to `null`.

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

Konro ships with a flexible file adapter supporting multiple formats and strategies. You configure it when creating your `db` context using `konro.createFileAdapter(options)`.

*   `format`: `'json' | 'yaml' | 'csv' | 'xlsx'` (required).
*   `single`: `{ filepath: string }`. Stores the entire database state in one monolithic file. Simple and atomic.
*   `multi`: `{ dir: string }`. Stores each table in its own file within a directory. Great for organization and required for some `on-demand` features.
*   `perRecord`: `{ dir: string }`. Stores each record in its own file within a table-specific subdirectory. Best for granular I/O.
*   `mode`: `'in-memory'` (default) or `'on-demand'`. This is a crucial choice that affects performance and the API style.

### Data Access Modes: `in-memory` vs `on-demand`

| Mode           | How it Works                                                                                                    | API Style                                            | Best For                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **`in-memory`** (Default) | On `db.read()`, the entire database is loaded into a `state` object. All operations are pure functions on this object. `db.write(state)` saves it back. | Immutable: `(state, args) => [newState, result]` | Small-to-medium datasets. Fast queries. Guaranteed atomic writes.           |
| **`on-demand`** | Each operation (`insert`, `query`, `update`, etc.) reads from and writes to the filesystem directly. There is no manual `state` object to manage. | Async/Stateless: `async (args) => result`    | Larger datasets where memory is a concern. More granular I/O operations. |

**Important Constraints:**
*   `on-demand` mode **requires** either the `multi` or `perRecord` file strategy. It does not work with `single`.
*   The `perRecord` strategy only supports `json` and `yaml` formats.
*   `csv` and `xlsx` formats **require** `on-demand` mode and the `multi` strategy.

### The `konro.createDatabase` Function

This function bundles your schema and adapter into a single, convenient `db` object. This object holds all the methods you'll need, and its API will automatically adapt based on the `mode` you selected in your adapter.

---

## 8. Pillar III: Cooking (The Fluent API)

Konro provides a fluent, chainable API for building and executing queries. The exact methods change slightly depending on your chosen access mode.

### Two API Styles: In-Memory vs. On-Demand

#### In-Memory (`in-memory`)
You explicitly manage the state. This is a pure, functional approach.
1.  **Read:** `let state = await db.read();`
2.  **Mutate:** `[state, result] = db.insert(state, ...);`
3.  **Write:** `await db.write(state);`

#### On-Demand (`on-demand`)
The state is managed internally. Every operation is `async` and handles its own I/O.
```typescript
// No state management needed. Each call is a transaction.
const newUser = await db.insert('users', { name: 'Chef Juna' });
const updated = await db.update('posts').set({ published: true }).where({ id: 1 });
const results = await db.query().from('users').all();
```

### Reading Data with `db.query()`

The query builder is almost identical in both modes, but terminal methods like `.all()` and `.first()` are **async** in `on-demand` mode.

```typescript
// In-Memory
const users = db.query(state).from('users').all();

// On-Demand
const users = await db.query().from('users').all();
```
The available methods are:
```typescript
db.query(state?)   // state is omitted in on-demand mode
  .from(tableName)  // Required: The table to query, e.g., 'users'
  .where(predicate) // Optional: Filter records.
  .with(relations)  // Optional: Eager-load relations, e.g., { posts: true }
  .withDeleted()    // Optional: Include soft-deleted records in the result.
  .select(fields?)  // Optional: Pick specific fields. Fully typed!
  .limit(number)    // Optional: Limit the number of results
  .offset(number)   // Optional: Skip records for pagination
  .all();           // Returns T[] or Promise<T[]>

db.query(state?).from('users').where({ id: 1 }).first(); // Returns T | null or Promise<T | null>
```

### Automatic Timestamps and Soft Deletes

Konro automates common lifecycle tasks based on your schema.

*   **`createdAt`**: This timestamp is set automatically when you `insert` a new record.
*   **`updatedAt`**: This timestamp is set automatically on `insert` and `update`.
*   **`deletedAt`**: If a table schema includes `konro.deletedAt()`, the `db.delete()` operation will perform a **soft delete** instead of a hard delete. It sets the `deletedAt` timestamp to the current time.
*   **Query Filtering**: By default, all queries automatically filter out records that have been soft-deleted. To include them in your results, chain `.withDeleted()` to your query.

### Advanced Queries with `.with()`

The `.with()` clause is a powerful tool for building complex, nested queries in a type-safe way. It works identically in both modes. Konro's type inference engine precisely understands your `.with()` clause and constructs an exact return type, so you can't accidentally access data you didn't ask for.

**1. Filtering Related Records**
```typescript
const userWithPublishedPosts = await db.query() // on-demand example
  .from('users')
  .where({ id: 1 })
  .with({
    posts: {
      where: (post) => post.published === true
    }
  })
  .first();
```

**2. Selecting Specific Fields from Relations**
```typescript
const userWithPostTitles = await db.query() // on-demand example
  .from('users')
  .where({ id: 1 })
  .with({
    posts: {
      select: {
        title: blogSchema.tables.posts.title,
      }
    }
  })
  .first();

// The type of `userWithPostTitles.posts` is now: { title: string; }[]
```

**3. Nested Eager-Loading**
```typescript
const postsWithAuthorsAndTheirPosts = await db.query()
  .from('posts')
  .with({
    author: {       // Load post's author
      with: {       // Then, from that author...
        posts: true // ...load all of their posts
      }
    }
  })
  .all();
```

**4. `select` and nested `with` are Mutually Exclusive**

Within a relation's option object, you can either use `select` to shape the output or `with` to load deeper relations, but not both.

### Aggregating Data

The `.aggregate()` terminator computes calculations like `count`, `sum`, `avg`, `min`, and `max`. It is also `async` in `on-demand` mode.

```typescript
// On-demand example
const stats = await db.query()
  .from('posts')
  .where({ published: true })
  .aggregate({
    postCount: konro.count(),
    // Assuming a 'views' number column on posts
    averageViews: konro.avg('views'),
  });

// stats is: { postCount: number; averageViews: number | null }
```

### Writing Data: `insert`, `update`, `delete`

Write operations clearly show the difference between the two modes.

| Operation | In-Memory (`(state, ...args) => [newState, result]`)                                | On-Demand (`(...args) => Promise<result>`)                                           |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `insert`  | `const [newState, newUser] = db.insert(state, 'users', { ... });`                    | `const newUser = await db.insert('users', { ... });`                                |
| `update`  | `const [newState, updated] = db.update(state, 'users').set({..}).where({..});`       | `const updated = await db.update('users').set({..}).where({..});`                    |
| `delete`  | `const [newState, deleted] = db.delete(state, 'users').where({..});`                 | `const deleted = await db.delete('users').where({..});`                              |
**Notes:** `insert` and `update` automatically manage `createdAt`/`updatedAt` timestamps. `delete` performs a soft delete if the table schema has a `deletedAt` column.

---

## 9. Advanced Concepts & Patterns

### Testing Your Logic

Testing is a major strength of Konro. Since the core operations are pure functions, you can test your business logic without touching the filesystem by using the `in-memory` API style.

```typescript
// my-logic.test.ts
import { db } from './db'; // Your pre-configured db context
import { assert } from 'chai';

describe('User Logic', () => {
  it('should create a user and a welcome post', () => {
    // 1. Arrange: Create a clean, in-memory initial state.
    let state = db.createEmptyState();

    // 2. Act: Call your application logic, passing and re-assigning state.
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

Konro prioritizes data integrity, safety, and developer experience. Understanding the file strategies and access modes is key to performance.

*   **`in-memory` Mode:**
    *   **Pro:** Extremely fast queries, as all data is in RAM. Writes are atomic (the entire file is replaced), preventing corruption from partial writes.
    *   **Con:** Can consume significant memory for large datasets. Writing back a very large file can be slow.

*   **`on-demand` Mode:**
    *   **Pro:** Low initial memory usage. Write operations are more granular (only affected files are changed), which can be faster.
    *   **Con:** Simple queries are fast. However, **relational queries** (using `.with()`) or **aggregations** will still load all required tables into memory for the duration of that single query. It is not a replacement for a true database server for complex, large-scale relational joins.

*   **`per-record` Strategy:**
    *   **Pro:** Very granular writes. Good if you update individual records frequently. Reduces the "blast radius" of a write operation compared to `single` or `multi` file strategies.
    *   **Con:** Can create a large number of files on disk. Reading an entire table (e.g., a query with no `where` clause) can be slower due to needing many individual file system reads.

---

## 10. API Reference Cheatsheet

| Category       | Method / Function                     | Purpose                                          | Notes                                     |
| -------------- | ------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| **Schema**     | `konro.createSchema(def)`             | Defines the entire database structure.           |                                           |
|                | `konro.id/string/number/etc`          | Defines column types and validation rules.       |                                           |
|                | `konro.createdAt/updatedAt/deletedAt` | Defines managed timestamp columns.               | Enables automatic timestamps & soft deletes. |
|                | `konro.one/many(table, opts)`         | Defines relationships.                           | `onDelete` option enables cascades.       |
| **DB Context** | `konro.createDatabase(opts)`          | Creates the main `db` context object.            | API changes based on adapter's `mode`.      |
|                | `konro.createFileAdapter(opts)`       | Creates a file storage adapter. | `format`, `mode`, `single`/`multi`/`perRecord` |
| **I/O**        | `db.read()`                           | Reads state from disk.                           | `in-memory` mode only.                    |
|                | `db.write(state)`                     | Writes state to disk.                            | `in-memory` mode only.                    |
|                | `db.createEmptyState()`               | Creates a fresh, empty `DatabaseState` object.   | Useful for testing.                       |
| **Data Ops**   | `db.query(state?)`                    | Starts a fluent read-query chain.                | Terminals are `async` in `on-demand`. |
|                | `...withDeleted()`                    | Includes soft-deleted records in a query.        | Only applies if table has `deletedAt`.    |
|                | `db.insert(state?, ...)`              | Inserts records. Returns `[newState, result]` or `Promise<result>`. | Manages `createdAt`/`updatedAt`.           |
|                | `db.update(state?, ...)`              | Starts a fluent update chain.                    | Manages `updatedAt`.                      |
|                | `db.delete(state?, ...)`              | Starts a fluent delete chain.                    | Performs soft delete if `deletedAt` exists. |

---

## 11. Roadmap

Konro is actively developed. Here are some features planned for the future:

*   **🚀 Performance Enhancements:**
    *   In-memory indexing for `on-demand` mode to speed up lookups without loading full tables.
    *   More efficient partial file updates for JSON/YAML formats.
*   **✨ Querying Power:**
    *   Support for more complex query operators (`$gt`, `$in`, `$like`, etc.) in `.where()`.
    *   Full-text search capabilities.
*   **🔧 Developer Experience:**
    *   A simple data migration system.
    *   A pluggable logging system for debugging queries.
    *   An adapter "decorator" for transparent data encryption at rest.

Have an idea? Please [open an issue](https://github.com/relaycoder/konro/issues) to discuss it!

---

## 12. Comparison to Other Libraries

| Feature          | `lowdb` (v3+)                                | **Konro**                                                                | `Prisma / Drizzle` (Full-scale ORMs) |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Paradigm**     | Simple Document Store                        | **Functional, Relational ORM**                                           | Client-Server ORMs                                                                |
| **Schema**       | Schema-less, manual types                    | **Type-First**, inferred static types                                    | Schema-first (via `.prisma` file or code)                                         |
| **API Style**    | Mutable (`db.data.push(...)`)                | **Immutable & Fluent** (`db.query(state)...`) or **Async** (`await db.query()...`) | Stateful Client (`prisma.user.create(...)`)                                       |
| **State Mgmt**   | Direct mutation                              | **Explicit state passing or Async I/O**               | Managed by the client instance                                                    |
| **Storage**      | JSON/YAML files                              | **JSON, YAML, CSV, XLSX (pluggable)**                                    | External databases (PostgreSQL, MySQL, etc.)                                      |
| **Best For**     | Quick scripts, simple configs                | **Local-first apps, CLIs, small servers needing safety and structure.**  | Production web applications with traditional client-server database architecture. |

---

## 13. Contributing

Konro is a community-driven project. Contributions are warmly welcome. Whether it's reporting a bug, suggesting a feature, improving the documentation, or submitting a pull request, your input is valuable. Please open an issue to discuss your ideas first.

## 14. License

[MIT](./LICENSE) © [relaycoder]
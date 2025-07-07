# KonroDB: The Type-Safe, Functional ORM for JSON/YAML

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

// Or to get just one record:
const single = await db.query(state).from('users').where({ id: 1 }).first(); // Returns Promise<T | null>
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

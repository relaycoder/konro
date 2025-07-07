# Directory Structure
```
docs/
  api-technical-specification.md
src/
  utils/
    constants.ts
    error.util.ts
    fs.util.ts
    predicate.util.ts
    serializer.util.ts
  adapter.ts
  db.ts
  index.ts
  operations.ts
  schema.ts
  types.ts
test/
  unit/
    Core/
      Delete.test.ts
      Insert.test.ts
      Query-With.test.ts
      Query.test.ts
      Update.test.ts
    Schema/
      ColumnHelpers.test.ts
      CreateSchema.test.ts
      RelationHelpers.test.ts
    Validation/
      Constraints.test.ts
  util.ts
package.json
README.md
tsconfig.json
```

# Files

## File: docs/api-technical-specification.md
````markdown
# API & Technical Specification: KonroDB v1.0

## Table of Contents

1.  [**The Konro Philosophy**](#1-the-konro-philosophy)
2.  [**Guiding Principles**](#2-guiding-principles)
3.  [**Core Concepts & Data Structures**](#3-core-concepts--data-structures)
    *   [3.1. `DatabaseState` (The Broth)](#31-databasestate-the-broth)
    *   [3.2. `Schema` (The Recipe)](#32-schema-the-recipe)
    *   [3.3. `StorageAdapter` (The Serving Dish)](#33-storageadapter-the-serving-dish)
    *   [3.4. The `[newState, result]` Tuple Pattern](#34-the-newstate-result-tuple-pattern)
4.  [**Schema Definition API**](#4-schema-definition-api)
    *   [4.1. `konro.createSchema(definition)`](#41-konrocreateschemadefinition)
    *   [4.2. Column Definition Helpers](#42-column-definition-helpers)
    *   [4.3. Relationship Definition Helpers](#43-relationship-definition-helpers)
    *   [4.4. Type Inference Mechanism](#44-type-inference-mechanism)
5.  [**Database Context API**](#5-database-context-api)
    *   [5.1. `konro.createFileAdapter(options)`](#51-konrocreatefileadapteroptions)
    *   [5.2. `konro.createDatabase(options)`](#52-konrocreatedatabaseoptions)
6.  [**Main `db` Context API (Fluent Interface)**](#6-main-db-context-api-fluent-interface)
    *   [6.1. I/O Operations: `db.read()`, `db.write(state)`, `db.createEmptyState()`](#61-io-operations-dbread-dbwritestate-dbcreateemptystate)
    *   [6.2. Read Queries: `db.query(state).select().from().where().with().limit().offset().all() | .first()`](#62-read-queries-dbquerystateselectfromwherewithlimitoffsetall--first)
        *   6.2.1. `db.query(state)`
        *   6.2.2. `.select(fields?)`
        *   6.2.3. `.from(tableName)`
        *   6.2.4. `.where(predicate)`
        *   6.2.5. `.with(relations)`
        *   6.2.6. `.limit(count)`
        *   6.2.7. `.offset(count)`
        *   6.2.8. `.all()` and `.first()` (Terminators)
    *   [6.3. Insert Operation: `db.insert(state, tableName, values)`](#63-insert-operation-dbinsertstate-tablename-values)
    *   [6.4. Update Operation: `db.update(state, tableName).set(data).where(predicate)`](#64-update-operation-dbupdatestate-tablenamesetdatawherepredicate)
        *   6.4.1. `db.update(state, tableName)`
        *   6.4.2. `.set(data)`
        *   6.4.3. `.where(predicate)` (Terminator)
    *   [6.5. Delete Operation: `db.delete(state, tableName).where(predicate)`](#65-delete-operation-dbdeletestate-tablenamewherepredicate)
        *   6.5.1. `db.delete(state, tableName)`
        *   6.5.2. `.where(predicate)` (Terminator)
7.  [**Internal Mechanics & Technical Details**](#7-internal-mechanics--technical-details)
    *   [7.1. Stateless Core Operations (Implementation Details)](#71-stateless-core-operations-implementation-details)
    *   [7.2. Query Descriptor Structure](#72-query-descriptor-structure)
    *   [7.3. Runtime Type Validation](#73-runtime-type-validation)
    *   [7.4. ID Management (`konro.id()`)](#74-id-management-konroid)
    *   [7.5. Relationship Resolution (`.with()`)](#75-relationship-resolution-with)
    *   [7.6. Storage Atomicity](#76-storage-atomicity)
    *   [7.7. Error Handling](#77-error-handling)
    *   [7.8. Concurrency Model](#78-concurrency-model)
8.  [**Future Considerations**](#8-future-considerations)

---

## 1. The Konro Philosophy

Konro's design is inspired by the culinary art of Indonesian dishes like Konro Bakar, emphasizing a predictable process from raw ingredients to a refined dish.

*   **The Broth (DatabaseState):** A passive, immutable JavaScript object representing the entire database. It is the raw data, containing no methods or hidden logic.
*   **The Recipe (Schema):** A declarative TypeScript/JavaScript object that defines the structure, types, and relationships of the data within the Broth. It acts as the blueprint for validation and type inference.
*   **The Spices (Pure Functions):** The core Konro operations (`insert`, `update`, `delete`, `select`). These are pure functions that take the current Broth, apply transformations, and return a *new Broth* or a selection from it. The original Broth is never modified.
*   **The Guided Hand (Fluent API):** The user-facing API provides an ergonomic, chainable interface that guides the user in building complex operations. This chain is itself stateless, constructing a declarative "order" that is then executed against the provided Broth.
*   **The Serving Dish (StorageAdapter):** An abstraction layer that handles the physical reading and writing of the Broth to and from persistent storage (e.g., JSON or YAML files).

## 2. Guiding Principles

*   **Type-First Schema:** Schema definition uses standard JavaScript objects with Konro's helpers, allowing TypeScript to infer all static types for models and relationships, eliminating redundant type declarations.
*   **Pure Functional Core:** All internal data transformation logic operates on the `DatabaseState` as immutable input and produces a new `DatabaseState` as output. No internal state is held by these core functions.
*   **First-Class Immutability:** Data mutation is strictly prohibited. All "write" operations return a new `DatabaseState` object and the affected records, enforcing predictable state transitions.
*   **Explicit State Management:** Developers explicitly manage the `DatabaseState` variable, passing it into operations and receiving new states back. This removes hidden side effects and makes data flow transparent.
*   **Decoupled I/O:** The core logic has no direct knowledge of file systems or other storage mechanisms. I/O operations (read/write) are handled by pluggable `StorageAdapter` instances, managed by the `db` context.
*   **Ergonomic Fluent API:** The user-facing API is designed for developer convenience, offering chainable methods for query building, while internally translating these chains into calls to the pure functional core.
*   **Runtime Validation:** The schema not only provides static types but also powers runtime validation, ensuring data integrity before persistence.

## 3. Core Concepts & Data Structures

### 3.1. `DatabaseState` (The Broth)

The immutable, in-memory representation of the entire database. It is a plain JavaScript object.

```typescript
// Type definition for DatabaseState
type DatabaseState = {
  [tableName: string]: {
    records: Record<string, any>[]; // Array of records for a table
    meta: {
      lastId: number; // For auto-incrementing 'id' fields
      // Future: indices, unique constraints, versioning
    };
  };
};

// Example structure for a 'users' table
const usersState = {
  records: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ],
  meta: { lastId: 2 },
};

// Full DatabaseState example
const myDatabaseState: DatabaseState = {
  users: usersState,
  posts: {
    records: [],
    meta: { lastId: 0 },
  },
};
```

### 3.2. `Schema` (The Recipe)

The `Schema` object is the runtime representation of the `createSchema` definition. It contains metadata about tables, columns, and relationships, which Konro uses for validation, query processing, and type inference.

```typescript
interface ColumnDefinition {
  type: 'id' | 'string' | 'number' | 'boolean' | 'date';
  options?: {
    unique?: boolean;
    default?: any | (() => any);
    min?: number;
    max?: number;
    format?: 'email' | 'uuid' | 'url';
    // ... other type-specific options
  };
}

interface TableDefinition {
  name: string;
  columns: { [columnName: string]: ColumnDefinition };
}

interface RelationDefinition {
  type: 'one' | 'many';
  targetTable: string; // The string name of the related table
  on: string; // Key on the current table
  references: string; // Key on the target table
}

interface Schema {
  tables: { [tableName: string]: TableDefinition };
  relations: { [tableName: string]: { [relationName: string]: RelationDefinition } };
  // A special property for TypeScript type inference (runtime ignored)
  types: { [tableName: string]: any };
}
```

### 3.3. `StorageAdapter` (The Serving Dish)

The interface for reading and writing the `DatabaseState`. Adapters are responsible for serialization, deserialization, and atomicity.

```typescript
interface StorageAdapter {
  /**
   * Initializes the adapter and reads the full database state from storage.
   * If storage is empty or non-existent, it should return an initial state
   * based on the provided schema.
   * @param schema The Konro schema object.
   * @returns A Promise resolving to the DatabaseState.
   */
  read(schema: Schema): Promise<DatabaseState>;

  /**
   * Atomically writes the full database state to storage.
   * @param state The DatabaseState to persist.
   * @returns A Promise that resolves when writing is complete.
   */
  write(state: DatabaseState): Promise<void>;
}
```

### 3.4. The `[newState, result]` Tuple Pattern

All mutation operations in Konro (insert, update, delete) return a tuple:
`[newlyTransformedDatabaseState, operationSpecificResult]`.

This pattern explicitly propagates the new state, forcing the developer to acknowledge and use it for subsequent operations, reinforcing immutability.

```typescript
// Example:
const [stateAfterInsert, insertedUser] = db.insert(currentState, 'users', { ... });
// `stateAfterInsert` must be used for the next operation, not `currentState`.
```

## 4. Schema Definition API

The schema defines the structure and types of your data.

### 4.1. `konro.createSchema(definition)`

This is the primary function for schema definition.

*   **`definition`**: An object with the following structure:
    *   `tables`: `Record<string, Record<string, ColumnDefinition>>` - An object where keys are table names (strings) and values are objects defining the columns for that table.
    *   `relations`: `(tables: Record<string, TableDefinition>) => Record<string, Record<string, RelationDefinition>>` - A function that receives the `tables` object (allowing for type-safe cross-referencing and avoiding circular dependency issues in the definition itself) and returns an object defining relationships.

```typescript
import { konro } from 'konro-db';

export const myAppSchema = konro.createSchema({
  tables: {
    // Define primitive columns and their types/options
    users: {
      id: konro.id(), // Auto-incrementing primary key
      name: konro.string({ min: 2, max: 100 }),
      email: konro.string({ format: 'email', unique: true }),
      isActive: konro.boolean({ default: true }),
      createdAt: konro.date({ default: () => new Date() }),
    },
    products: {
      id: konro.id(),
      name: konro.string({ unique: true }),
      price: konro.number({ min: 0 }),
      sellerId: konro.number({ type: 'integer' }), // Foreign key
    },
  },
  relations: (t) => ({ // `t` provides type-safe access to your defined tables
    users: {
      // A user can sell many products
      productsSold: konro.many('products', { on: 'id', references: 'sellerId' }),
    },
    products: {
      // A product has one seller
      seller: konro.one('users', { on: 'sellerId', references: 'id' }),
    },
  }),
});
```

### 4.2. Column Definition Helpers

These functions create runtime schema nodes for column definitions. They also inform TypeScript of the expected type.

*   `konro.id()`: `ColumnDefinition` for a primary key. Internally: `type: 'number'`, `options: { type: 'integer', unique: true }`.
*   `konro.string(options?: { unique?: boolean, default?: string | (() => string), min?: number, max?: number, format?: 'email' | 'uuid' | 'url' })`: `ColumnDefinition` for a string.
*   `konro.number(options?: { unique?: boolean, default?: number | (() => number), min?: number, max?: number, type?: 'integer' })`: `ColumnDefinition` for a number.
*   `konro.boolean(options?: { default?: boolean | (() => boolean) })`: `ColumnDefinition` for a boolean.
*   `konro.date(options?: { default?: () => Date })`: `ColumnDefinition` for a Date. Stored as ISO 8601 string.
*   `konro.object<T>(options?: { default?: T | (() => T) })`: `ColumnDefinition` for arbitrary JSON objects. `T` provides TypeScript type hinting.

### 4.3. Relationship Definition Helpers

These define how tables are virtually linked.

*   `konro.one(targetTable: string, options: { on: string, references: string })`: `RelationDefinition` for one-to-one or many-to-one relationships.
    *   `targetTable`: The string name of the table being referenced (e.g., `'users'`).
    *   `on`: The column name on the *current* table that holds the foreign key.
    *   `references`: The column name on the *target* table that the `on` column points to (usually `id`).
*   `konro.many(targetTable: string, options: { on: string, references: string })`: `RelationDefinition` for one-to-many relationships.
    *   `targetTable`: The string name of the "many" side table (e.g., `'products'`).
    *   `on`: The column name on the *current* table (the "one" side) that foreign keys on the `targetTable` point to (usually `id`).
    *   `references`: The column name on the *target* table (the "many" side) that holds the foreign key.

### 4.4. Type Inference Mechanism

Konro leverages TypeScript's powerful `typeof` and inference capabilities.

```typescript
// From `konro.createSchema`
const myAppSchema = konro.createSchema({ /* ... */ });

// TypeScript automatically infers the full, linked types.
// The `types` property on the schema object is purely for type inference.
export type User = typeof myAppSchema.types.users;
export type Product = typeof myAppSchema.types.products;

/*
// Example of inferred `User` type:
type User = {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  productsSold: { // The inferred relationship
    id: number;
    name: string;
    price: number;
    sellerId: number;
  }[];
}
*/
```
This is achieved by sophisticated internal TypeScript mapping types that recursively build the full model type based on the schema object's structure and relation definitions.

## 5. Database Context API

This section details how to set up the `db` context, which is the main entry point for all operations.

### 5.1. `konro.createFileAdapter(options)`

A factory function to create a file-based `StorageAdapter`.

*   **`options`**: An object with the following properties:
    *   `format`: `string` (`'json' | 'yaml'`) - **Required.** Specifies the file format for serialization/deserialization.
    *   **Mutually exclusive storage strategies:**
        *   `single`: `{ filepath: string }` - Configures the adapter to use a single file for the entire `DatabaseState`.
        *   `multi`: `{ dir: string }` - Configures the adapter to store each table in its own file within the specified directory. Filenames will correspond to table names (e.g., `users.json`, `posts.yaml`).

```typescript
import { konro } from 'konro-db';

// Single JSON file
const singleJsonAdapter = konro.createFileAdapter({
  format: 'json',
  single: { filepath: './data/my_db.json' },
});

// Multi-file YAML storage
const multiYamlAdapter = konro.createFileAdapter({
  format: 'yaml',
  multi: { dir: './data/yaml_collections' },
});
```

### 5.2. `konro.createDatabase(options)`

The main factory function to create the `db` context.

*   **`options`**: An object with the following properties:
    *   `schema`: `Schema` - The schema object created by `konro.createSchema()`.
    *   `adapter`: `StorageAdapter` - An instance of a storage adapter (e.g., from `konro.createFileAdapter()`).

*   **Returns**: A `Database` object (`db` context) which provides all the fluent API methods.

```typescript
import { konro, createFileAdapter } from 'konro-db';
import { myAppSchema } from './schema'; // Assume this is defined

export const db = konro.createDatabase({
  schema: myAppSchema,
  adapter: createFileAdapter({ format: 'json', single: { filepath: './app.json' } }),
});
```

## 6. Main `db` Context API (Fluent Interface)

The `db` context object provides the public, ergonomic API. It internally translates fluent calls into interactions with the pure functional core.

### 6.1. I/O Operations: `db.read()`, `db.write(state)`, `db.createEmptyState()`

These methods handle the interaction with the `StorageAdapter`.

*   `db.read()`: `Promise<DatabaseState>`
    *   Reads the current database state from the configured adapter. If the file(s) do not exist, it initializes an empty `DatabaseState` based on the `schema`.
*   `db.write(state: DatabaseState)`: `Promise<void>`
    *   Writes the provided `DatabaseState` to disk using the configured adapter. This operation is atomic (see [Storage Atomicity](#76-storage-atomicity)).
*   `db.createEmptyState()`: `DatabaseState`
    *   A synchronous utility method to generate a pristine, empty `DatabaseState` object based on the configured `schema`. Useful for testing or initial setup before any data is written.

### 6.2. Read Queries: `db.query(state).select().from().where().with().limit().offset().all() | .first()`

This fluent chain builds a declarative query descriptor which is then executed by the terminator methods.

#### 6.2.1. `db.query(state: DatabaseState)`
*   **Returns**: A `QueryBuilder` instance (internal object) that holds a reference to the `state` and begins building the query descriptor.

#### 6.2.2. `.select(fields?: Record<string, ColumnDefinition | RelationDefinition>)`
*   Selects specific fields or relations to be returned.
*   `fields`: An object mapping desired output keys to `ColumnDefinition` references (e.g., `users.name`) or `RelationDefinition` references for nested relations.
*   **Returns**: The `QueryBuilder` for further chaining. If omitted, all fields and top-level relations are selected.

#### 6.2.3. `.from(tableName: string)`
*   Specifies the target table for the query.
*   `tableName`: The string name of the table as defined in the `schema`.
*   **Returns**: The `QueryBuilder` for further chaining.

#### 6.2.4. `.where(predicate: Partial<T> | ((record: T) => boolean))`
*   Filters the records. Can be called only once per chain.
*   `predicate`:
    *   A `Partial<T>` object for simple equality checks (e.g., `{ id: 1, status: 'active' }`). Konro performs a deep equality check on provided keys.
    *   A Higher-Order Function (HOF) `(record: T) => boolean` for complex filtering logic. `T` is the inferred type of the records in the `from` table.
*   **Returns**: The `QueryBuilder` for further chaining.

#### 6.2.5. `.with(relations: Record<string, boolean | { select?: Record<string, ColumnDefinition>, where?: (rec: any) => boolean }>)`
*   Eager-loads related data based on the schema's relationship definitions.
*   `relations`: An object where keys are the relation names (as defined in `schema.relations`). Values can be:
    *   `true`: Load all fields of the related entities.
    *   `{ select?: ..., where?: ... }`: Apply a nested select/filter to the related entities.
*   **Returns**: The `QueryBuilder` for further chaining.

#### 6.2.6. `.limit(count: number)`
*   Limits the number of records returned.
*   **Returns**: The `QueryBuilder` for further chaining.

#### 6.2.7. `.offset(count: number)`
*   Skips a specified number of records.
*   **Returns**: The `QueryBuilder` for further chaining.

#### 6.2.8. `.all()` and `.first()` (Terminators)
These methods execute the query built by the chain.

*   `.all()`: `Promise<T[]>`
    *   Executes the query and returns a promise resolving to an array of all matching records. `T` is the inferred result type from the `select` and `with` clauses.
*   `.first()`: `Promise<T | null>`
    *   Executes the query and returns a promise resolving to the first matching record or `null` if no record is found. `T` is the inferred result type.

```typescript
import { db } from './db'; // Assume db context is set up
import type { User, Product } from './schema';

let appState = await db.read(); // Load the state

const activeUsers: User[] = await db.query(appState)
  .from('users')
  .where({ isActive: true })
  .all();

const expensiveProductsOfUser: Product[] = await db.query(appState)
  .from('products')
  .where(p => p.price > 100 && p.sellerId === 1)
  .limit(5)
  .offset(0)
  .all();

const userWithTheirProducts: User | null = await db.query(appState)
  .select({
    id: db.schema.tables.users.id, // Direct reference to column definition for explicit selection
    name: db.schema.tables.users.name,
  })
  .from('users')
  .where({ id: 1 })
  .with({
    productsSold: { // Nested selection for related data
      select: { name: db.schema.tables.products.name, price: db.schema.tables.products.price },
      where: (p) => p.price > 50, // Nested filter for related data
    },
  })
  .first();
```

### 6.3. Insert Operation: `db.insert(state, tableName, values)`

A direct, non-chained function for simplicity, following the `[newState, result]` tuple pattern.

*   `state`: `DatabaseState` - The current database state.
*   `tableName`: `string` - The string name of the table to insert into.
*   `values`: `T | T[]` - A single record object or an array of record objects to insert. `T` is the inferred type of the table. Konro validates `values` against the schema.
*   **Returns**: `[newState: DatabaseState, insertedRecord(s): T | T[]]`
    *   `newState`: The new database state after the insertion.
    *   `insertedRecord(s)`: The newly created record(s), including auto-generated `id` and default values.

```typescript
import { db } from './db';
let appState = await db.read();

// Single record insert
let newUser;
[appState, newUser] = db.insert(appState, 'users', {
  name: 'New User',
  email: 'new@user.com',
});

// Multiple records insert
let newProducts;
[appState, newProducts] = db.insert(appState, 'products', [
  { name: 'Laptop', price: 1200, sellerId: newUser.id },
  { name: 'Mouse', price: 25, sellerId: newUser.id },
]);

await db.write(appState);
```

### 6.4. Update Operation: `db.update(state, tableName).set(data).where(predicate)`

This fluent chain updates records.

#### 6.4.1. `db.update(state: DatabaseState, tableName: string)`
*   **Returns**: An `UpdateBuilder` instance (internal object).

#### 6.4.2. `.set(data: Partial<T>)`
*   Specifies the fields and their new values for the update. Konro validates `data` against the schema.
*   **Returns**: The `UpdateBuilder` for further chaining.

#### 6.4.3. `.where(predicate: Partial<T> | ((record: T) => boolean))` (Terminator)
*   Filters which records to update. This method also **executes the update operation**.
*   **Returns**: `[newState: DatabaseState, updatedRecords: T[]]`
    *   `newState`: The new database state after the update.
    *   `updatedRecords`: An array of the full records that were updated.

```typescript
import { db } from './db';
let appState = await db.read();

let updatedUsers;
[appState, updatedUsers] = await db.update(appState, 'users')
  .set({ isActive: false })
  .where({ email: 'old@user.com' });

console.log(`Deactivated ${updatedUsers.length} users.`);
await db.write(appState);
```

### 6.5. Delete Operation: `db.delete(state, tableName).where(predicate)`

This fluent chain deletes records.

#### 6.5.1. `db.delete(state: DatabaseState, tableName: string)`
*   **Returns**: A `DeleteBuilder` instance (internal object).

#### 6.5.2. `.where(predicate: Partial<T> | ((record: T) => boolean))` (Terminator)
*   Filters which records to delete. This method also **executes the delete operation**.
*   **Returns**: `[newState: DatabaseState, deletedRecords: T[]]`
    *   `newState`: The new database state after the deletion.
    *   `deletedRecords`: An array of the full records that were deleted.

```typescript
import { db } from './db';
let appState = await db.read();

let deletedProducts;
[appState, deletedProducts] = await db.delete(appState, 'products')
  .where(p => p.price < 10 || p.sellerId === 5);

console.log(`Deleted ${deletedProducts.length} low-priced or old products.`);
await db.write(appState);
```

## 7. Internal Mechanics & Technical Details

### 7.1. Stateless Core Operations (Implementation Details)

The `db` context methods are thin wrappers around truly pure, stateless internal functions. These internal functions are responsible for the actual data transformations.

```typescript
// Example internal pure functions:
// (These would not be directly exposed in the public API)

/**
 * Inserts records into a table within the database state.
 * @param state The current DatabaseState.
 * @param schema The Konro schema.
 * @param tableName The name of the table.
 * @param values The records to insert.
 * @returns [newState, insertedRecords]
 */
function _insertImpl(state: DatabaseState, schema: Schema, tableName: string, values: any[]): [DatabaseState, any[]] {
  // 1. Validate 'values' against schema for 'tableName'.
  // 2. Generate new IDs and apply defaults.
  // 3. Create a NEW `DatabaseState` object by deeply copying the relevant parts.
  // 4. Return the new state and the inserted records.
}

/**
 * Selects records based on a query descriptor.
 * @param state The current DatabaseState.
 * @param schema The Konro schema.
 * @param queryDescriptor The declarative query object.
 * @returns The selected records.
 */
function _selectImpl(state: DatabaseState, schema: Schema, queryDescriptor: QueryDescriptor): any[] {
  // 1. Filter records based on 'where'.
  // 2. Resolve 'with' relations by performing in-memory lookups.
  // 3. Apply 'select', 'limit', 'offset'.
  // 4. Return the result. (No state change).
}

// Similar _updateImpl and _deleteImpl functions would exist.
```

### 7.2. Query Descriptor Structure

The fluent API (`.select().from().where()`) builds an internal plain JavaScript object. This `QueryDescriptor` is then passed to the `_selectImpl` function.

```typescript
// Example QueryDescriptor for a select operation
interface SelectQueryDescriptor {
  type: 'select';
  tableName: string;
  select?: Record<string, ColumnDefinition>; // Map of output field names to schema column defs
  where?: Partial<any> | ((record: any) => boolean);
  with?: Record<string, {
    select?: Record<string, ColumnDefinition>;
    where?: (record: any) => boolean;
  }>;
  limit?: number;
  offset?: number;
}

// Similar structures for UpdateQueryDescriptor and DeleteQueryDescriptor
```

### 7.3. Runtime Type Validation

During `db.insert` and `db.update.set()`, Konro performs runtime validation based on the `ColumnDefinition` options defined in the schema.

*   **Type Checking:** Ensures data matches `string`, `number`, `boolean`, `Date` types.
*   **Format Validation:** For `format: 'email' | 'uuid' | 'url'` on strings.
*   **Range Validation:** For `min` and `max` on numbers/strings.
*   **Uniqueness Constraints:** For `unique: true` columns, Konro checks existing records in memory.
*   **Required Fields:** Konro assumes all fields are required unless they have a `default` value or are relationships that are implicitly handled.

Validation errors will throw `KonroValidationError` (or similar custom error type) at the point of operation.

### 7.4. ID Management (`konro.id()`)

*   Konro manages a `lastId` counter within the `meta` property of each table's state.
*   When a new record is inserted into a table with a `konro.id()` column, Konro:
    1.  Increments the `lastId` for that table.
    2.  Assigns the new `lastId` value to the new record's `id` field.
*   IDs are positive integers starting from 1.

### 7.5. Relationship Resolution (`.with()`)

When a `.with()` clause is used in a `select` query:

1.  Konro identifies the relationships defined in the schema for the queried table.
2.  For each specified relation:
    *   It determines the `on` and `references` columns.
    *   It efficiently looks up related records in the `DatabaseState` (which is in memory).
    *   For `konro.one`, it finds at most one matching record.
    *   For `konro.many`, it finds all matching records.
    *   If nested `select` or `where` clauses are provided within the `with` option, these are applied to the related records.
3.  The related data is deeply cloned and attached to the parent records before being returned, ensuring the original `DatabaseState` remains pristine.

### 7.6. Storage Atomicity

For `db.write(state)`, Konro ensures atomicity to prevent data corruption due to crashes or power failures during write operations.

*   **Single File Adapter:**
    1.  Writes the `DatabaseState` to a temporary file (e.g., `db.json.tmp`).
    2.  If the write is successful, it atomically renames/moves the temporary file over the original file (`db.json`).
    3.  If a crash occurs during the write to the temp file, the original `db.json` remains untouched.
    4.  If a crash occurs during the rename, the system may end up with both `db.json` and `db.json.tmp`, but the original `db.json` is still valid. The next `db.read()` will pick up the last valid file.
*   **Multi-File Adapter:**
    1.  For each table, writes its data to a temporary file (e.g., `users.json.tmp`).
    2.  Once all temporary files are successfully written, it atomically renames/moves all temporary files over their respective original files. This ensures that all table files are updated as a single logical unit.
    3.  A failure during any temp file write means no original files are touched. A failure during the rename phase might leave some updated and some not, but the integrity of individual files is maintained.

### 7.7. Error Handling

Konro will use specific custom error classes to provide clearer context for failures:

*   `KonroError`: Base class.
*   `KonroValidationError`: Thrown during `insert`/`update` if data doesn't match schema constraints (e.g., unique constraint violation, invalid format, missing required field).
*   `KonroNotFoundError`: Potentially thrown if `.first()` is used with a non-existent record ID (though `.first()` typically returns `null`).
*   `KonroStorageError`: For adapter-related issues (e.g., file permissions, disk full, parsing errors).

### 7.8. Concurrency Model

*   **Reads:** Multiple concurrent `db.query(state)` operations are safe, as they are pure functions operating on an immutable `state`.
*   **Writes:** Konro is designed for single-writer environments. If multiple processes or asynchronous operations attempt to write to the database simultaneously using `db.write(state)`, race conditions could occur. The `db.write` operation itself is atomic for *one* state, but it doesn't manage external concurrent writes.
*   **Recommendation:** For environments requiring concurrent writes, implement an external locking mechanism (e.g., file locks, mutexes) around the entire `db.read() -> mutate -> db.write(newState)` transaction block.

## 8. Future Considerations

*   **Indices:** Internal in-memory indices for faster lookups on non-ID fields, especially for `unique: true` constraints and `where` clauses.
*   **Sorting:** `.orderBy()` chainable method.
*   **Aggregation:** `.groupBy()`, `.count()`, `.sum()`, etc.
*   **Transactions (higher-level):** A `db.transaction(callback)` function that automatically handles `read -> callback(state) -> write` and rollback on error.
*   **Lazy Loading / Virtual Relations:** For very large related datasets, only load data when accessed (though for in-memory, this has less impact).
*   **More Adapters:** Support for other local storage mechanisms (e.g., IndexedDB for browser, SQLite for more robust local storage).
*   **Migrations:** A system to handle schema evolution.
````

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

## File: src/utils/serializer.util.ts
````typescript
import { KonroStorageError } from './error.util';

let yaml: { parse: (str: string) => unknown; stringify: (obj: any, options?: any) => string; } | undefined;
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
    // The cast from `unknown` is necessary as `yaml.parse` is correctly typed to return `unknown`.
    parse: <T>(data: string): T => yaml.parse(data) as T,
    stringify: (obj: any): string => yaml.stringify(obj),
  };
};
````

## File: src/index.ts
````typescript
import { createDatabase } from './db';
import { createFileAdapter } from './adapter';
import { createSchema, id, string, number, boolean, date, object, one, many } from './schema';

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
};
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

## File: src/types.ts
````typescript
/**
 * The in-memory representation of the entire database. It is a plain, immutable object.
 */
export type DatabaseState = {
  [tableName: string]: {
    records: KRecord[];
    meta: {
      lastId: number;
    };
  };
};

/**
 * A generic representation of a single record within a table.
 * It uses `unknown` for values to enforce type-safe access.
 */
export type KRecord = Record<string, unknown>;
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
        const results = _queryImpl(testState, testSchema, { tableName: 'users', select: ['name', 'age'] });
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

## File: test/util.ts
````typescript
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
````

## File: package.json
````json
{
  "name": "konro",
  "module": "src/index.ts",
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9"
  },
  "peerDependencies": {
    "typescript": "^5.0.0",
    "js-yaml": "^4.1.0"
  },
  "peerDependenciesMeta": {
    "js-yaml": {
      "optional": true
    }
  }
}
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

export interface StorageAdapter {
  read(schema: KonroSchema<any, any>): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
}

type SingleFileStrategy = { single: { filepath: string }; multi?: never; };
type MultiFileStrategy = { multi: { dir: string }; single?: never; };

export type FileAdapterOptions = {
  format: 'json' | 'yaml';
} & (SingleFileStrategy | MultiFileStrategy);

export const createFileAdapter = (options: FileAdapterOptions): StorageAdapter => {
  const serializer = getSerializer(options.format);
  const fileExtension = `.${options.format}`;

  const readSingle = async (schema: KonroSchema<any, any>): Promise<DatabaseState> => {
    const filepath = options.single!.filepath;
    const data = await readFile(filepath);
    return data ? serializer.parse<DatabaseState>(data) : createEmptyState(schema);
  };

  const writeSingle = async (state: DatabaseState): Promise<void> => {
    const filepath = options.single!.filepath;
    await writeAtomic(filepath, serializer.stringify(state));
  };
  
  const readMulti = async (schema: KonroSchema<any, any>): Promise<DatabaseState> => {
    const dir = options.multi!.dir;
    const state = createEmptyState(schema);
    await fs.mkdir(dir, { recursive: true });

    for (const tableName in schema.tables) {
      const filepath = path.join(dir, `${tableName}${fileExtension}`);
      const data = await readFile(filepath);
      if (data) {
        state[tableName] = serializer.parse(data);
      }
    }
    return state;
  };
  
  const writeMulti = async (state: DatabaseState): Promise<void> => {
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

## File: src/db.ts
````typescript
import { KonroSchema } from './schema';
import { StorageAdapter } from './adapter';
import { DatabaseState, KRecord } from './types';
import { _queryImpl, _insertImpl, _updateImpl, _deleteImpl, createEmptyState as createEmptyStateImpl, QueryDescriptor } from './operations';
import { createPredicateFromPartial } from './utils/predicate.util';

// A helper to normalize a predicate argument
const normalizePredicate = <T extends KRecord>(
  predicate: Partial<T> | ((record: T) => boolean)
): ((record: KRecord) => boolean) =>
  // The cast is necessary due to function argument contravariance.
  // The internal operations work on the wider `KRecord`, while the fluent API provides the specific `T`.
  (typeof predicate === 'function' ? predicate : createPredicateFromPartial(predicate)) as (record: KRecord) => boolean;

// --- TYPE-SAFE FLUENT API BUILDERS ---

interface ChainedQueryBuilder<T> {
  select(fields: (keyof T)[]): this;
  where(predicate: Partial<T> | ((record: T) => boolean)): this;
  with(relations: QueryDescriptor['with']): this;
  limit(count: number): this;
  offset(count: number): this;
  all(): Promise<T[]>;
  first(): Promise<T | null>;
}

interface QueryBuilder<S extends KonroSchema<any, any>> {
  from<T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]>;
}

interface UpdateBuilder<T> {
  set(data: Partial<T>): {
    where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState, T[]];
  };
}

interface DeleteBuilder<T> {
  where(predicate: Partial<T> | ((record: T) => boolean)): [DatabaseState, T[]];
}

export interface DbContext<S extends KonroSchema<any, any>> {
  schema: S;
  adapter: StorageAdapter;
  read(): Promise<DatabaseState>;
  write(state: DatabaseState): Promise<void>;
  createEmptyState(): DatabaseState;

  query(state: DatabaseState): QueryBuilder<S>;
  insert<T extends keyof S['types']>(state: DatabaseState, tableName: T, values: S['types'][T] | Readonly<S['types'][T]>[]): [DatabaseState, S['types'][T] | S['types'][T][]];
  update<T extends keyof S['tables']>(state: DatabaseState, tableName: T): UpdateBuilder<S['types'][T]>;
  delete<T extends keyof S['tables']>(state: DatabaseState, tableName: T): DeleteBuilder<S['types'][T]>;
}

export const createDatabase = <S extends KonroSchema<any, any>>(options: { schema: S, adapter: StorageAdapter }): DbContext<S> => {
  const { schema, adapter } = options;

  return {
    schema,
    adapter,
    read: () => adapter.read(schema),
    write: (state) => adapter.write(state),
    createEmptyState: () => createEmptyStateImpl(schema),

    insert: (state, tableName, values) => {
      const valsArray = Array.isArray(values) ? values : [values];
      const [newState, inserted] = _insertImpl(state, schema, tableName as string, valsArray as KRecord[]);
      const result = Array.isArray(values) ? inserted : inserted[0];
      return [newState, result] as [DatabaseState, S['types'][typeof tableName] | S['types'][typeof tableName][]];
    },

    query: (state: DatabaseState): QueryBuilder<S> => ({
      from: <T extends keyof S['tables']>(tableName: T): ChainedQueryBuilder<S['types'][T]> => {
        const descriptor: QueryDescriptor = { tableName: tableName as string };

        const builder: ChainedQueryBuilder<S['types'][T]> = {
          select: (fields) => {
            descriptor.select = fields as string[];
            return builder;
          },
          where: (predicate) => {
            descriptor.where = normalizePredicate(predicate);
            return builder;
          },
          with: (relations) => {
            descriptor.with = relations;
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
          all: async () => _queryImpl(state, schema, descriptor) as S['types'][T][],
          first: async () => (_queryImpl(state, schema, { ...descriptor, limit: 1 })[0] ?? null) as S['types'][T] | null,
        };
        return builder;
      },
    }),

    update: <T extends keyof S['tables']>(state: DatabaseState, tableName: T): UpdateBuilder<S['types'][T]> => ({
      set: (data) => ({
        where: (predicate) => {
          const [newState, updatedRecords] = _updateImpl(state, schema, tableName as string, data as Partial<KRecord>, normalizePredicate(predicate));
          return [newState, updatedRecords as S['types'][T][]];
        },
      }),
    }),

    delete: <T extends keyof S['tables']>(state: DatabaseState, tableName: T): DeleteBuilder<S['types'][T]> => ({
      where: (predicate) => {
        const [newState, deletedRecords] = _deleteImpl(state, tableName as string, normalizePredicate(predicate));
        return [newState, deletedRecords as S['types'][T][]];
      },
    }),
  };
};
````

## File: src/schema.ts
````typescript
// --- TYPE UTILITIES ---
type Pretty<T> = { [K in keyof T]: T[K] } & {};

// --- CORE DEFINITIONS ---

export interface ColumnOptions<T> {
  unique?: boolean;
  default?: T | (() => T);
}

export interface StringColumnOptions extends ColumnOptions<string> {
  min?: number;
  max?: number;
  format?: 'email' | 'uuid' | 'url';
}

export interface NumberColumnOptions extends ColumnOptions<number> {
  min?: number;
  max?: number;
  type?: 'integer';
}

export interface ColumnDefinition<T> {
  _type: 'column';
  dataType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'object';
  options?: ColumnOptions<T>;
  _tsType: T; // For TypeScript inference only
}

export interface StringColumnDefinition extends ColumnDefinition<string> {
  dataType: 'string';
  options?: StringColumnOptions;
}

export interface NumberColumnDefinition extends ColumnDefinition<number> {
  dataType: 'number';
  options?: NumberColumnOptions;
}

export interface RelationDefinition {
  _type: 'relation';
  relationType: 'one' | 'many';
  targetTable: string;
  on: string;
  references: string;
}

// --- TYPE INFERENCE MAGIC ---

type BaseModels<TTables extends Record<string, Record<string, ColumnDefinition<any>>>> = {
  [TableName in keyof TTables]: {
    [ColumnName in keyof TTables[TableName]]: TTables[TableName][ColumnName]['_tsType'];
  };
};

type WithRelations<
  TBaseModels extends Record<string, any>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> = {
    [TableName in keyof TBaseModels]: TBaseModels[TableName] & (TableName extends keyof TRelations ? {
      [RelationName in keyof TRelations[TableName]]?: TRelations[TableName][RelationName]['relationType'] extends 'one'
      ? TBaseModels[TRelations[TableName][RelationName]['targetTable']] | null
      : TBaseModels[TRelations[TableName][RelationName]['targetTable']][];
    } : {});
  };

export interface KonroSchema<
  TTables extends Record<string, Record<string, ColumnDefinition<any>>>,
  TRelations extends Record<string, Record<string, RelationDefinition>>
> {
  tables: TTables;
  relations: TRelations;
  types: Pretty<WithRelations<BaseModels<TTables>, TRelations>>;
}

// --- SCHEMA HELPERS ---

export const id = (): ColumnDefinition<number> => ({ _type: 'column', dataType: 'id', options: { unique: true }, _tsType: 0 });
export const string = (options?: StringColumnOptions): StringColumnDefinition => ({ _type: 'column', dataType: 'string', options, _tsType: '' });
export const number = (options?: NumberColumnOptions): NumberColumnDefinition => ({ _type: 'column', dataType: 'number', options, _tsType: 0 });
export const boolean = (options?: ColumnOptions<boolean>): ColumnDefinition<boolean> => ({ _type: 'column', dataType: 'boolean', options, _tsType: false });
export const date = (options?: ColumnOptions<Date>): ColumnDefinition<Date> => ({ _type: 'column', dataType: 'date', options, _tsType: new Date() });
export const object = <T extends Record<string, any>>(options?: ColumnOptions<T>): ColumnDefinition<T> => ({ _type: 'column', dataType: 'object', options, _tsType: undefined! });

export const one = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'one', targetTable, ...options });
export const many = (targetTable: string, options: { on: string; references: string }): RelationDefinition => ({ _type: 'relation', relationType: 'many', targetTable, ...options });

// --- SCHEMA BUILDER ---

type SchemaInputDef<T> = {
  tables: T;
  relations?: (tables: T) => Record<string, Record<string, RelationDefinition>>;
};

export function createSchema<const TDef extends SchemaInputDef<any>>(definition: TDef) {
  const relations = definition.relations ? definition.relations(definition.tables) : {};
  return {
    tables: definition.tables,
    relations,
    types: null as any, // This is a runtime placeholder for the inferred types
  } as KonroSchema<
    TDef['tables'],
    TDef['relations'] extends (...args: any) => any ? ReturnType<TDef['relations']> : {}
  >;
}
````

## File: src/operations.ts
````typescript
import { DatabaseState, KRecord } from './types';
import { KonroSchema, RelationDefinition } from './schema';
import { KonroError, KonroValidationError } from './utils/error.util';

// --- HELPERS ---


/** Creates a pristine, empty database state from a schema. */
export const createEmptyState = (schema: KonroSchema<any, any>): DatabaseState => {
  const state: DatabaseState = {};
  for (const tableName in schema.tables) {
    state[tableName] = { records: [], meta: { lastId: 0 } };
  }
  return state;
};

// --- QUERY ---

export interface QueryDescriptor {
  tableName: string;
  select?: (keyof KRecord)[];
  where?: (record: KRecord) => boolean;
  with?: Record<string, boolean | { where?: (record: KRecord) => boolean }>;
  limit?: number;
  offset?: number;
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

        const filteredRelatedRecords = nestedWhere ? relatedRecords.filter(nestedWhere) : relatedRecords;
        if (relationDef.relationType === 'one') {
          record[relationName] = filteredRelatedRecords[0] ?? null;
        } else {
          record[relationName] = filteredRelatedRecords;
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
    paginatedResults = paginatedResults.map(rec => {
      const newRec: KRecord = {};
      for (const key of descriptor.select!) {
        // This includes keys from `with` if the user explicitly adds them to select.
        if (rec.hasOwnProperty(key)) {
          newRec[key] = rec[key];
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
      throw KonroValidationError(`Value '${value}' for column '${columnName}' must be unique`);
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

// Per user request: no classes. Using factory functions for errors.
const createKonroError = (name: string) => (message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

/** Base class for all Konro-specific errors. */
export const KonroError = createKonroError('KonroError');

/** Thrown for storage adapter-related issues. */
export const KonroStorageError = createKonroError('KonroStorageError');

/** Thrown for schema validation errors. */
export const KonroValidationError = createKonroError('KonroValidationError');

/** Thrown when a resource is not found. */
export const KonroNotFoundError = createKonroError('KonroNotFoundError');
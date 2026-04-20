// Brand type utility: nominally-typed primitives.
//
// Usage:
//   export type UserId = Brand<string, "UserId">;
//   export function asUserId(raw: string): UserId {
//     return raw as UserId;
//   }
//
// Prevents accidentally passing a string where a UserId is expected.

export type Brand<K, T> = K & { readonly __brand: T };

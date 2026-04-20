// Compile-time type assertion helpers for Vitest.
//
// Usage:
//   type _Test = Expect<Equal<InferOk<ReturnType<typeof ok<number>>>, number>>;

export type Expect<T extends true> = T;

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

export type NotEqual<A, B> = Equal<A, B> extends true ? false : true;

export type InferOk<T> = T extends { _tag: "Ok"; value: infer V } ? V : never;
export type InferErr<T> = T extends { _tag: "Err"; error: infer E } ? E : never;

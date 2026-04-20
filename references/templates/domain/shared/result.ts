// Result type for Railway-Oriented Programming.
// Based on Rust's Result<T, E> with functional composition methods.

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly _tag: "Ok";
  readonly value: T;
  isOk(): this is Ok<T>;
  isErr(): this is Err<never>;
  map<U>(fn: (value: T) => U): Result<U, never>;
  flatMap<U, E2>(fn: (value: T) => Result<U, E2>): Result<U, E2>;
  unwrapOr(defaultValue: T): T;
}

export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
  isOk(): this is Ok<never>;
  isErr(): this is Err<E>;
  map<U>(fn: (value: never) => U): Result<U, E>;
  flatMap<U, E2>(fn: (value: never) => Result<U, E2>): Result<never, E>;
  unwrapOr<T>(defaultValue: T): T;
}

export function ok<T>(value: T): Ok<T> {
  return {
    _tag: "Ok",
    value,
    isOk(): this is Ok<T> {
      return true;
    },
    isErr(): this is Err<never> {
      return false;
    },
    map: (fn) => ok(fn(value)),
    flatMap: (fn) => fn(value),
    unwrapOr: () => value,
  };
}

export function err<E>(error: E): Err<E> {
  return {
    _tag: "Err",
    error,
    isOk(): this is Ok<never> {
      return false;
    },
    isErr(): this is Err<E> {
      return true;
    },
    map: <_U>() => err(error) as unknown as Result<_U, E>,
    flatMap: <_U, _E2>() => err(error) as unknown as Result<never, E>,
    unwrapOr: (defaultValue) => defaultValue,
  };
}

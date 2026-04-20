import { describe, it, expect } from "vitest";
import { ok, err, type Result } from "@domain/shared/result";
import type {
  Equal,
  Expect,
  InferOk,
  InferErr,
  NotEqual,
} from "@test/helpers/type-assertions";

// Compile-time assertions (no runtime effect, but fail the build if incorrect).
// Exported so `noUnusedLocals` does not flag them — TS does not honor the
// leading-underscore convention for type aliases under TS6196.
export type _TestOk = Expect<Equal<InferOk<ReturnType<typeof ok<number>>>, number>>;
export type _TestErr = Expect<Equal<InferErr<ReturnType<typeof err<string>>>, string>>;
export type _TestDistinct = Expect<
  NotEqual<ReturnType<typeof ok<string>>, ReturnType<typeof err<string>>>
>;

describe("Result — shared kernel", () => {
  it("ok narrows to Ok<T> under isOk guard", () => {
    const res: Result<string, never> = ok("success");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      // Inside this branch, res is Ok<string>
      expect(res.value).toBe("success");
    }
  });

  it("err narrows to Err<E> under isErr guard", () => {
    const res: Result<never, string> = err("boom");
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toBe("boom");
    }
  });

  it("map transforms Ok, skips Err", () => {
    expect(ok(2).map((n) => n * 3).unwrapOr(0)).toBe(6);
    const failed = err<string>("fail") as Result<number, string>;
    expect(failed.map((n) => n * 3).unwrapOr(42)).toBe(42);
  });

  it("flatMap composes fallible steps", () => {
    const doubleIfEven = (n: number): Result<number, string> =>
      n % 2 === 0 ? ok(n * 2) : err("not even");

    expect(ok(4).flatMap(doubleIfEven).unwrapOr(-1)).toBe(8);
    expect(ok(3).flatMap(doubleIfEven).unwrapOr(-1)).toBe(-1);
  });

  it("unwrapOr returns value for Ok, default for Err", () => {
    expect(ok(42).unwrapOr(0)).toBe(42);
    const failed = err<string>("fail") as Result<number, string>;
    expect(failed.unwrapOr(99)).toBe(99);
  });
});

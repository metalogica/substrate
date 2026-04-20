import { describe, expect, it } from "vitest";

import { DomainError, err, ok } from "@domain/shared/result";
import type {
  Equal,
  Expect,
  InferErr,
  InferOk,
  NotEqual,
} from "@test/helpers/type-assertions";

type _TestOk = Expect<Equal<InferOk<ReturnType<typeof ok<number>>>, number>>;

type _TestErr = Expect<
  Equal<InferErr<ReturnType<typeof err<DomainError>>>, DomainError>
>;

type _TestDistinct = Expect<
  NotEqual<ReturnType<typeof ok<string>>, ReturnType<typeof err<DomainError>>>
>;

describe("Result Type Narrowing", () => {
  it("should narrow types correctly in conditional blocks", () => {
    // Give it a real runtime value so Vitest doesn't crash
    const res = ok<string>("success");

    if (res.isOk()) {
      // These are static type checks; they don't produce JS code
      type _VerifyOkNarrowing = Expect<Equal<typeof res.value, string>>;

      // Real runtime assertion to keep Vitest happy
      expect(res.value).toBe("success");
    } else {
      // In the else branch, res is narrowed to Err<never> because ok() returns Ok<T>
      // The error property would be 'never' type here, which is correct
      expect(true).toBe(false); // This branch should never execute
    }
  });
});

// apps/web/lib/collections/fields.test.ts
import { describe, it, expect } from "vitest";
import { defaultValueFor, normalizeValue } from "./fields";

describe("defaultValueFor", () => {
  it("text → empty string", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(defaultValueFor({ type: "text" } as any)).toBe("");
  });
  it("checkbox → false", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(defaultValueFor({ type: "checkbox" } as any)).toBe(false);
  });
  it("multi_select → empty array", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(defaultValueFor({ type: "multi_select" } as any)).toEqual([]);
  });
  it("currency → null (user must enter explicitly)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(defaultValueFor({ type: "currency" } as any)).toBeNull();
  });
});

describe("normalizeValue", () => {
  it("number coerces string to number", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeValue({ type: "number" } as any, "12.5")).toBe(12.5);
  });
  it("number rejects NaN", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => normalizeValue({ type: "number" } as any, "not-a-number")).toThrow();
  });
  it("currency requires amount + currency_code", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeValue({ type: "currency" } as any, { amount: 100, currency_code: "USD" }))
      .toEqual({ amount: 100, currency_code: "USD" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => normalizeValue({ type: "currency" } as any, { amount: 100 })).toThrow();
  });
  it("checkbox accepts boolean only", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeValue({ type: "checkbox" } as any, true)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => normalizeValue({ type: "checkbox" } as any, "yes")).toThrow();
  });
});

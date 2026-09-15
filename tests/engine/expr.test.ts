// tests/engine/expr.test.ts
import { describe, expect, it } from "vitest";
import { evaluate, template, isTemplate, ExprError } from "@/engine/expr";

const b = {
  input: { amount: 4999, payment_id: "pay_7003", note: "hi" },
  payment: { id: "pay_7003", amount: 4999 },
  refunded: [{ amount: 1000 }, { amount: 500 }],
  entity: { notes: ["a"], status: "open" },
  now: "2026-09-13T09:00:00Z",
};

describe("evaluate", () => {
  it("literals", () => {
    expect(evaluate("42", b)).toBe(42);
    expect(evaluate("'x'", b)).toBe("x");
    expect(evaluate('"y"', b)).toBe("y");
    expect(evaluate("true", b)).toBe(true);
    expect(evaluate("null", b)).toBeNull();
  });
  it("paths", () => {
    expect(evaluate("input.amount", b)).toBe(4999);
    expect(evaluate("payment.id", b)).toBe("pay_7003");
    expect(evaluate("missing.path", b)).toBeUndefined();
  });
  it("arithmetic and precedence", () => {
    expect(evaluate("1 + 2 * 3", b)).toBe(7);
    expect(evaluate("(1 + 2) * 3", b)).toBe(9);
    expect(evaluate("payment.amount - sum(refunded, 'amount')", b)).toBe(3499);
  });
  it("comparison and logic", () => {
    expect(evaluate("input.amount > payment.amount - sum(refunded, 'amount')", b)).toBe(true);
    expect(evaluate("input.amount <= 4999 && entity.status == 'open'", b)).toBe(true);
    expect(evaluate("!(1 == 1) || false", b)).toBe(false);
    expect(evaluate("missing.x > 1", b)).toBe(false);
    expect(evaluate("missing.x == null", b)).toBe(false); // undefined is not null
  });
  it("functions", () => {
    expect(evaluate("count(refunded)", b)).toBe(2);
    expect(evaluate("sum(missing, 'amount')", b)).toBe(0);
    expect(evaluate("count(missing)", b)).toBe(0);
    expect(evaluate("len(entity.notes)", b)).toBe(1);
    expect(evaluate("len('abc')", b)).toBe(3);
    expect(evaluate("append(entity.notes, input.note)", b)).toEqual(["a", "hi"]);
    expect(evaluate("contains('hello', 'ell')", b)).toBe(true);
    expect(evaluate("lower('ABC')", b)).toBe("abc");
    expect(evaluate("concat('a', 'b')", b)).toBe("ab");
  });
  it("rejects unknown functions and syntax errors", () => {
    expect(() => evaluate("nope(1)", b)).toThrow(ExprError);
    expect(() => evaluate("1 +", b)).toThrow(ExprError);
    expect(() => evaluate("input.amount.toString()", b)).toThrow(ExprError);
  });
  it("cannot reach globals or prototypes", () => {
    expect(evaluate("process", b)).toBeUndefined();
    expect(evaluate("input.constructor", b)).toBeUndefined();
    expect(evaluate("input.__proto__", b)).toBeUndefined();
  });
});

describe("the function table is not a back door to Object.prototype", () => {
  // `FNS[n.fn]` reached `Object.prototype`: `constructor(1)` evaluated to a String object and
  // `hasOwnProperty('x')` threw a raw `TypeError` instead of an `ExprError`. Neither was
  // exploitable — the parser forbids dotted calls — but a sandbox should not have the back door.
  it("rejects every inherited Object.prototype member as an unknown function", () => {
    for (const name of ["constructor", "hasOwnProperty", "toString", "valueOf", "isPrototypeOf", "propertyIsEnumerable"]) {
      expect(() => evaluate(`${name}(1)`, b), name).toThrow(ExprError);
      expect(() => evaluate(`${name}(1)`, b), name).toThrow(/Unknown function/);
    }
  });

  it("still resolves the functions the language really declares", () => {
    expect(evaluate("len('abc')", b)).toBe(3);
    expect(evaluate("lower('AB')", b)).toBe("ab");
  });
});

describe("template", () => {
  it("typed value for a whole-string template", () => {
    expect(template("${input.amount}", b)).toBe(4999);
    expect(template("${append(entity.notes, input.note)}", b)).toEqual(["a", "hi"]);
  });
  it("interpolates embedded templates to a string", () => {
    expect(template("Refund of ${input.amount} on ${payment.id}", b)).toBe("Refund of 4999 on pay_7003");
  });
  it("leaves plain values alone and recurses into objects and arrays", () => {
    expect(template("support@northwind.example", b)).toBe("support@northwind.example");
    expect(template(7, b)).toBe(7);
    expect(template({ ok: true, id: "${payment.id}", list: ["${input.amount}"] }, b)).toEqual({ ok: true, id: "pay_7003", list: [4999] });
  });
  it("isTemplate", () => {
    expect(isTemplate("${x}")).toBe(true);
    expect(isTemplate("a ${x} b")).toBe(true);
    expect(isTemplate("plain")).toBe(false);
  });
});

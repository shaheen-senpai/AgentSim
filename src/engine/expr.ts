export type Bindings = Record<string, unknown>;
export class ExprError extends Error {}

type Tok = { t: "num" | "str" | "id" | "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; out.push({ t: "num", v: src.slice(i, j) }); i = j; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; } else { s += src[j]; j++; } }
      if (j >= src.length) throw new ExprError(`Unterminated string in ${src}`);
      out.push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; out.push({ t: "id", v: src.slice(i, j) }); i = j; continue; }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/<>!(),.".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new ExprError(`Unexpected character '${c}' in ${src}`);
  }
  return out;
}

type Node =
  | { k: "lit"; v: unknown }
  | { k: "path"; parts: string[] }
  | { k: "un"; op: "!" | "-"; x: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "call"; fn: string; args: Node[] };

class Parser {
  i = 0;
  constructor(private toks: Tok[], private src: string) {}
  peek(): Tok | undefined { return this.toks[this.i]; }
  take(): Tok { const t = this.toks[this.i++]; if (!t) throw new ExprError(`Unexpected end of ${this.src}`); return t; }
  isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }
  expect(v: string): void { if (!this.isOp(v)) throw new ExprError(`Expected '${v}' in ${this.src}`); this.i++; }
  parse(): Node { const n = this.or(); if (this.i < this.toks.length) throw new ExprError(`Unexpected '${this.toks[this.i].v}' in ${this.src}`); return n; }
  or(): Node { let l = this.and(); while (this.isOp("||")) { this.i++; l = { k: "bin", op: "||", l, r: this.and() }; } return l; }
  and(): Node { let l = this.eq(); while (this.isOp("&&")) { this.i++; l = { k: "bin", op: "&&", l, r: this.eq() }; } return l; }
  eq(): Node { let l = this.cmp(); while (this.isOp("==") || this.isOp("!=")) { const op = this.take().v; l = { k: "bin", op, l, r: this.cmp() }; } return l; }
  cmp(): Node { let l = this.add(); while (["<", "<=", ">", ">="].some((o) => this.isOp(o))) { const op = this.take().v; l = { k: "bin", op, l, r: this.add() }; } return l; }
  add(): Node { let l = this.mul(); while (this.isOp("+") || this.isOp("-")) { const op = this.take().v; l = { k: "bin", op, l, r: this.mul() }; } return l; }
  mul(): Node { let l = this.un(); while (this.isOp("*") || this.isOp("/")) { const op = this.take().v; l = { k: "bin", op, l, r: this.un() }; } return l; }
  un(): Node { if (this.isOp("!")) { this.i++; return { k: "un", op: "!", x: this.un() }; } if (this.isOp("-")) { this.i++; return { k: "un", op: "-", x: this.un() }; } return this.primary(); }
  primary(): Node {
    const t = this.take();
    if (t.t === "num") return { k: "lit", v: Number(t.v) };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "op" && t.v === "(") { const n = this.or(); this.expect(")"); return n; }
    if (t.t === "id") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      if (this.isOp("(")) {
        this.i++;
        const args: Node[] = [];
        if (!this.isOp(")")) { args.push(this.or()); while (this.isOp(",")) { this.i++; args.push(this.or()); } }
        this.expect(")");
        return { k: "call", fn: t.v, args };
      }
      const parts = [t.v];
      while (this.isOp(".")) { this.i++; const p = this.take(); if (p.t !== "id") throw new ExprError(`Expected a name after '.' in ${this.src}`); parts.push(p.v); }
      if (this.isOp("(")) throw new ExprError(`Method calls are not allowed in ${this.src}`);
      return { k: "path", parts };
    }
    throw new ExprError(`Unexpected '${t.v}' in ${this.src}`);
  }
}

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function lookup(parts: string[], b: Bindings): unknown {
  let cur: unknown = b;
  for (const p of parts) {
    if (FORBIDDEN.has(p) || cur === null || cur === undefined || typeof cur !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

const FNS: Record<string, (args: unknown[]) => unknown> = {
  sum: ([list, field]) => (Array.isArray(list) ? list.reduce<number>((s, x) => s + Number((x as Record<string, unknown>)?.[String(field)] ?? 0), 0) : 0),
  count: ([list]) => (Array.isArray(list) ? list.length : 0),
  len: ([x]) => (Array.isArray(x) || typeof x === "string" ? x.length : 0),
  append: ([list, x]) => [...(Array.isArray(list) ? list : []), x],
  contains: ([s, sub]) => typeof s === "string" && s.includes(String(sub)),
  lower: ([s]) => String(s ?? "").toLowerCase(),
  concat: ([a, c]) => `${a ?? ""}${c ?? ""}`,
  coalesce: (args) => args.find((a) => a !== undefined && a !== null),
  appendIfSet: ([list, item]) => (item === undefined || item === null ? list : [...(Array.isArray(list) ? list : []), item]),
};

function run(n: Node, b: Bindings): unknown {
  switch (n.k) {
    case "lit": return n.v;
    case "path": return lookup(n.parts, b);
    case "un": { const x = run(n.x, b); return n.op === "!" ? !x : -Number(x); }
    // `hasOwnProperty.call`, not `FNS[n.fn]`: a plain index reaches `Object.prototype`, so
    // `constructor(1)` evaluated and `hasOwnProperty('x')` threw a raw `TypeError` rather than an
    // `ExprError`. The parser forbids dotted calls, so neither was exploitable — but a sandbox
    // should not have the back door at all.
    case "call": {
      const f = Object.prototype.hasOwnProperty.call(FNS, n.fn) ? FNS[n.fn] : undefined;
      if (!f) throw new ExprError(`Unknown function ${n.fn}`);
      return f(n.args.map((a) => run(a, b)));
    }
    case "bin": {
      if (n.op === "&&") return run(n.l, b) && run(n.r, b);
      if (n.op === "||") return run(n.l, b) || run(n.r, b);
      const l = run(n.l, b), r = run(n.r, b);
      switch (n.op) {
        case "==": return l === r;
        case "!=": return l !== r;
        case "<": return cmp(l, r, (a, c) => a < c);
        case "<=": return cmp(l, r, (a, c) => a <= c);
        case ">": return cmp(l, r, (a, c) => a > c);
        case ">=": return cmp(l, r, (a, c) => a >= c);
        case "+": return typeof l === "string" || typeof r === "string" ? `${l}${r}` : Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
      }
    }
  }
  throw new ExprError("Unreachable");
}
const cmp = (l: unknown, r: unknown, f: (a: number, b: number) => boolean) => (l === undefined || r === undefined || l === null || r === null ? false : f(Number(l), Number(r)));

const cache = new Map<string, Node>();
export function evaluate(src: string, bindings: Bindings): unknown {
  let ast = cache.get(src);
  if (!ast) { ast = new Parser(tokenize(src), src).parse(); cache.set(src, ast); }
  return run(ast, bindings);
}

const WHOLE = /^\$\{([^}]*)\}$/;
const EMBED = /\$\{([^}]*)\}/g;
export const isTemplate = (s: string): boolean => /\$\{[^}]*\}/.test(s);

/** Strings: `${expr}` alone → typed value; embedded → interpolated string; no `${}` → literal. Objects/arrays recurse. */
export function template(value: unknown, bindings: Bindings): unknown {
  if (typeof value === "string") {
    const whole = WHOLE.exec(value);
    if (whole) return evaluate(whole[1], bindings);
    if (!isTemplate(value)) return value;
    return value.replace(EMBED, (_, e: string) => { const v = evaluate(e, bindings); return v === undefined || v === null ? "" : String(v); });
  }
  if (Array.isArray(value)) return value.map((v) => template(v, bindings));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, template(v, bindings)]));
  return value;
}

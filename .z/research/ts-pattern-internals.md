# ts-pattern Internals Deep Dive (gvergnaud/ts-pattern)

Date: 2026-03-08
Sources:
- https://github.com/gvergnaud/ts-pattern
- src/match.ts — runtime implementation
- src/types/Match.ts — public type API
- src/types/Pattern.ts — pattern type definitions
- src/types/InvertPattern.ts — pattern-to-type inversion
- src/types/DeepExclude.ts — exhaustiveness subtraction
- src/types/DistributeUnions.ts — union distribution for deep exclusion

ts-pattern (10k+ stars, MIT, TypeScript) is the de facto pattern matching library for TypeScript. This document examines HOW its type-level machinery works internally.

---

## Overview

ts-pattern achieves three things at the type level:
1. **Exhaustive matching** — compile error if a variant is missing
2. **Type narrowing** — handler receives the narrowed type
3. **Expression-oriented API** — returns a value

The key insight: **the runtime and the types are almost entirely separate systems.** The runtime is simple (~100 lines of JS). The type system does all the heavy lifting at compile time through a parallel type-level state machine.

---

## Architecture

### The Two Layers

**Runtime layer** (`src/match.ts`): A simple `MatchExpression` class that:
- Stores `input` and `state: { matched: boolean, value: output }`
- Each `.with()` call creates a NEW `MatchExpression` instance (immutable builder)
- `.with()` uses `matchPattern()` to do runtime structural matching
- `.exhaustive()` just returns `this.state.value` or throws `NonExhaustiveError`
- `.narrow()` and `.returnType()` are **no-ops at runtime** — they return `this`

**Type layer** (`src/types/Match.ts` + supporting files): A recursive type that:
- Tracks `i` (remaining unhandled input type), `o` (output type), `handledCases` (tuple of excluded types), `inferredOutput`
- Each `.with()` call returns a new `Match<ExcludedInput, ...>`
- `.exhaustive()` checks if the remaining input type is `never`

### How `match(value)` starts

```typescript
export function match<const input, output = symbols.unset>(
  value: input
): Match<input, output> {
  return new MatchExpression(value, unmatched) as any;
  //                                            ^^^^^^
  //                              YES, `as any` is here.
}
```

The `match` function captures the input type via `const input` generic parameter (the `const` assertion preserves literal types). It returns `Match<input, output>` — but the runtime class is `MatchExpression`, which has NO public type. The cast `as any` bridges from the untyped runtime class to the rich public `Match<>` type.

### How `.with(pattern, handler)` narrows the type

The `.with()` method signature in `Match.ts`:

```typescript
with<
  const p extends Pattern<i>,     // p = the pattern, constrained to valid patterns for remaining input i
  c,                               // c = handler return type (inferred)
  value extends MatchedValue<i, InvertPattern<p, i>>  // value = narrowed type
>(
  pattern: p,
  handler: (selections: FindSelected<value, p>, value: value) => PickReturnValue<o, c>
): Match<
  Exclude<i, InvertPatternForExclude<p, value>>,  // SUBTRACT matched type from input
  o,
  [...handledCases, excluded],                     // ACCUMULATE handled cases
  Union<inferredOutput, c>                         // ACCUMULATE return types
>
```

The chain of type transformations:
1. **`Pattern<i>`** — constrains what patterns are valid for input type `i`
2. **`InvertPattern<p, i>`** — converts the pattern `p` back to the TYPE it represents (e.g., `{ mode: "terminal" }` pattern becomes the type `{ mode: "terminal"; ... }`)
3. **`MatchedValue<i, inverted>`** — intersects the inverted pattern with the input to get the narrowed type (this is what the handler receives)
4. **`InvertPatternForExclude<p, value>`** — computes what type to SUBTRACT from the remaining input
5. **`Exclude<i, excluded>`** — TypeScript's built-in `Exclude` removes the handled variant

### How `.exhaustive()` enforces completeness

```typescript
exhaustive: DeepExcludeAll<i, handledCases> extends infer remainingCases
  ? [remainingCases] extends [never]
    ? Exhaustive<o, inferredOutput>    // All cases handled -> callable
    : NonExhaustiveError<remainingCases>  // Cases remain -> NOT callable (it's a type, not a function)
  : never;
```

`DeepExcludeAll` folds over the `handledCases` tuple, repeatedly applying `DeepExclude`:

```typescript
type DeepExcludeAll<a, tupleList extends any[]> = [a] extends [never]
  ? never
  : tupleList extends [infer excluded, ...infer tail]
    ? DeepExcludeAll<DeepExclude<a, excluded>, tail>
    : a;
```

If the result is `never` (all variants excluded), `exhaustive` becomes a callable function type. If NOT `never`, it becomes `NonExhaustiveError<remainingCases>` — which is NOT callable, producing a compile error when you try to call `.exhaustive()`.

### DeepExclude — the most complex piece

```typescript
type DeepExclude<a, b> = Exclude<DistributeMatchingUnions<a, b>, b>;
```

`DistributeMatchingUnions` is the heavy machinery. It:
1. **FindUnions** — walks the data structure finding all nested union types, returning `[union, path]` pairs. Stops at depth 5.
2. **Distribute** — takes the tree of unions and creates a Cartesian product of all possible combinations
3. **BuildMany** — reconstructs the data structure for each combination

This is needed because TypeScript's `Exclude` only works on top-level unions. For `{ a: "x" | "y", b: 1 | 2 }`, you can't just `Exclude<T, { a: "x" }>` — that removes nothing because the full type isn't a union. `DistributeMatchingUnions` first EXPANDS it into `{ a: "x", b: 1 } | { a: "x", b: 2 } | { a: "y", b: 1 } | { a: "y", b: 2 }`, THEN excludes.

### Why `.narrow()` exists as opt-in

The `Match` type's `i` parameter tracks remaining input using top-level `Exclude<i, excluded>`. This works great for discriminated unions (the common case) because `Exclude` handles them directly.

But for NESTED unions (e.g., `{ config: { mode: "a" | "b" } }`), top-level `Exclude` does nothing — the outer type isn't a union. `.narrow()` triggers `DeepExcludeAll` eagerly:

```typescript
narrow(): Match<DeepExcludeAll<i, handledCases>, o, [], inferredOutput>;
```

This is expensive because `DistributeMatchingUnions` computes the Cartesian product of all nested unions. For a type with N binary unions, that's 2^N combinations. This is why it's opt-in — most code uses discriminated unions where top-level `Exclude` suffices.

---

## Well-Regarded Features

### 1. Type-safe exhaustive matching
The compile-time guarantee that all variants are handled, with the remaining unhandled type shown in the error message.

### 2. Pattern expressiveness
Object patterns, array patterns, `P.when()`, `P.not()`, `P.select()`, `P.union()` — all fully typed.

### 3. Expression-oriented
Returns a value, unlike switch statements.

---

## Poorly-Regarded Features / Pain Points

### 1. Type-checking performance
Complex patterns with many nested unions cause slow type-checking due to the Cartesian product expansion in `DistributeMatchingUnions`.

### 2. Error messages
When exhaustiveness fails, the error points to `.exhaustive()` not being callable, which is indirect. The `NonExhaustiveError<remainingCases>` type helps but requires hovering.

### 3. `as any` in the bridge
The runtime-to-type bridge uses `as any`, meaning runtime bugs won't be caught by the compiler within the library itself.

---

## Key Finding: Does ts-pattern use `as any` internally?

**YES.** The critical `as any` is in `match()`:

```typescript
export function match<const input, output = symbols.unset>(
  value: input
): Match<input, output> {
  return new MatchExpression(value, unmatched) as any;
}
```

Additionally, the entire `MatchExpression` class uses `any` for its `.with()` method signature:

```typescript
with(...args: any[]): MatchExpression<input, output> {
```

**The runtime class is entirely untyped.** All type safety comes from the PUBLIC type `Match<>` in `Match.ts`, which is a completely separate type definition that the runtime class is cast into. The runtime and type layers are parallel implementations that must be kept in sync manually.

This is a deliberate architectural choice: the runtime is simple imperative code, and the types are a separate compile-time program. The `as any` is the bridge between them.

---

## Learnings for banto

### Technical Design Lessons

- **Discriminated unions + `Exclude` is the fast path.** ts-pattern's simple case (top-level discriminated union) uses just TypeScript's built-in `Exclude<Union, Variant>`. The expensive `DistributeMatchingUnions` machinery is only needed for nested unions.

- **For discriminated unions specifically, you don't need ts-pattern's full machinery.** The core trick is:
  1. Generic type parameter `R` tracks remaining variants (starts as full union)
  2. Each `.with("variant", handler)` returns the builder with `Exclude<R, { tag: "variant" }>` as the new remaining type
  3. `.exhaustive()` is only callable when `R extends never`

- **`as any` at the runtime-type boundary is standard practice** in TypeScript library design. ts-pattern does it, Effect does it, Zod does it. The alternative would be typing the runtime class with the same complex generics, which adds no safety (the class is internal) and would make the code unreadable.

- **The `const` generic parameter** (`match<const input>`) is essential for preserving literal types in patterns. Without it, `"terminal"` would widen to `string`.

### Minimal Implementation for Discriminated Unions

The essential type trick for banto's use case (discriminated unions only) is approximately 30 lines:

```typescript
type MatchBuilder<Input, Remaining, Output> = {
  with<
    const P extends Remaining extends { mode: infer M } ? { mode: M } : never,
    R
  >(
    pattern: P,
    handler: (value: Extract<Input, P>) => R
  ): MatchBuilder<Input, Exclude<Remaining, P>, Output | R>;

  exhaustive: [Remaining] extends [never]
    ? () => Output
    : { error: "Non-exhaustive match"; remaining: Remaining };
};
```

The 3 essential type-level tricks:
1. **`Remaining` generic** — tracks what's left to handle
2. **`Exclude<Remaining, P>`** — subtracts the handled pattern
3. **`[Remaining] extends [never] ? callable : error`** — gates exhaustiveness

Everything else in ts-pattern (InvertPattern, DistributeMatchingUnions, FindUnions, BuildMany) exists to handle NON-discriminated unions, nested patterns, array patterns, guards, selections, etc. For simple discriminated union matching, none of that is needed.

### UX Pattern Lessons

- Expression-oriented APIs (returning values) are strongly preferred over statement-oriented ones (switch/case)
- The `.with().with().exhaustive()` builder chain is intuitive and reads well

### Business & Ecosystem Lessons

- ts-pattern proves there is strong demand for pattern matching in TypeScript (10k+ stars)
- TC39 pattern matching proposal has stalled, keeping the library relevant

---

## Sources

- https://github.com/gvergnaud/ts-pattern — source code repository
- src/match.ts — runtime implementation (~120 lines)
- src/types/Match.ts — public Match type with exhaustiveness checking
- src/types/DeepExclude.ts — deep type exclusion (1 line delegating to DistributeMatchingUnions)
- src/types/DistributeUnions.ts — Cartesian product expansion of nested unions (~200 lines)
- src/types/InvertPattern.ts — pattern-to-type conversion
- src/types/helpers.ts — utility types (IsNever, IsUnion, UnionToTuple, etc.)

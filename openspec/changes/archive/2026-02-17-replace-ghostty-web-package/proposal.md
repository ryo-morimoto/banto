## Why

The current implementation imports `@nicolo-ribaudo/ghostty-web`, while the actively maintained upstream package from Coder is published as `ghostty-web` on npm.

This mismatch creates avoidable confusion across code, specs, and onboarding docs. It also complicates dependency verification because our OpenSpec artifacts describe `ghostty-web`, but the runtime points elsewhere.

Aligning the codebase to the official package name reduces cognitive load and makes future upgrades straightforward.

## What Changes

- Replace client dependency `@nicolo-ribaudo/ghostty-web` with `ghostty-web`
- Update all TypeScript imports and ambient module declarations to `ghostty-web`
- Regenerate lockfile so dependency state matches `package.json`
- Keep runtime behavior unchanged (`init()`, `Terminal`, WebSocket wiring, resize flow)

## Relationship to Existing Changes

This change is a supplement to `cc-cli-pty-libghostty`, not a replacement.

- `cc-cli-pty-libghostty` established the PTY + terminal architecture and is already complete.
- This change only corrects dependency source/name alignment to match that architecture's intent.
- No scope rollback or redesign is introduced; this is a follow-up consistency fix.

## Scope

In scope:
- Package source/name alignment for terminal renderer dependency
- Build/runtime compatibility verification for the existing terminal feature

Out of scope:
- Terminal UX redesign
- Transport protocol changes
- PTY/session lifecycle changes

## Impact

- Affects only client-side terminal renderer dependency wiring
- No API surface changes
- No database/schema changes
- No expected behavior changes for users

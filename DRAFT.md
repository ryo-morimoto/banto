# banto

## Purpose

一目で把握する:
- 何が動いているか
- 何が完了しているか
- 何を確認しないといけないか

複数プロジェクト × 複数エージェントの並列実行を、1つの画面で俯瞰する。

## Target User

- 1人の開発者
- 複数のプロジェクトで複数のエージェントを同時に動かしている
- ローカルサーバー（自宅 NixOS mini PC 等）でエージェントを実行する
- どこからでもブラウザで状況を確認したい（Tailscale 等）

## Not Target

- チーム利用（マルチユーザー、権限管理）
- クラウドホスティング（SaaS、マルチテナント）
- ネイティブアプリ（まず PWA でカバーする）

## Core Loop

```
Jot   → タスクを書く（タイトル + 説明）
Throw → エージェントに投げる（ワンタップ）
Watch → 結果を見る（ステータス、タイムライン、diff）
```

「Watch」が最も重要。投げた後に放置して、後で戻ってきたときに状況がわかること。

## What the User Sees

```
Project (repository)
  └─ Task (what to do. 1 story / 1 bug)
       └─ Session (agent execution. 0..N per task)
            └─ Events (what the agent did)
```

Container, PTY, worktree, Agent Provider — all invisible to the user.

## Principles

| # | Principle | Meaning |
|---|---|---|
| 1 | One Glance | Open the dashboard, know everything in 3 seconds |
| 2 | Best Interface Per Agent | Use each agent's richest integration (native protocol > ACP > PTY fallback) |
| 3 | 1 Task = 1 Session at a time | No concurrent sessions per task |
| 4 | Browser First | PWA. Works on desktop, tablet, phone |
| 5 | Local Server | Runs on your machine, not the cloud |

## Key Scenarios

### Scenario 1: Morning Check

Developer wakes up. 5 agents ran overnight across 3 projects.
Opens banto on phone.

Sees:
- 3 done (green) — glance at diff stats
- 1 failed (red) — read error, edit description, retry
- 1 waiting for permission (orange) — tap Approve

Total time: 2 minutes.

### Scenario 2: Throw and Forget

Developer has an idea for a fix. Opens banto on laptop.
Creates task: "Fix auth bug in login flow".
Taps Start. Closes the tab.

30 minutes later, opens banto on phone.
Sees: done, +42 -12 lines, 3 files changed.
Taps "Full Diff" to review.

### Scenario 3: Parallel Monitoring

Developer is working on Project A manually.
Meanwhile, 3 agents are running on Projects B, C, D.

banto dashboard on a second monitor (or phone) shows all 3.
One enters waiting_permission — developer glances, taps Approve, continues manual work.

## Constraints

- Solo developer (no auth, no multi-user)
- Local network + Tailscale (no public internet exposure)
- NixOS (systemd, Nix store, git worktrees)
- SQLite (single writer, WAL mode)
- Bun runtime

## Scope

### In Scope

- Task management (create, list, pin, status change)
- Session lifecycle (start, stop, retry)
- Structured status view (StatusCard, Timeline, Git summary)
- Terminal access (restty: libghostty-vt + WebGPU in browser)
- Session event tracking (what the agent did)
- Permission approval from dashboard
- PWA (installable, offline-capable shell)
- Touch support (mobile-friendly)
- Real-time updates (SSE + WebSocket)
- Authentication (Tailscale auth, token-based)
- Task dependencies
- CI/CD integration
- Agent provider abstraction (Claude Code, OpenCode, Codex, ACP-compatible agents)
- Attachment management
- Push notifications

### Out of Scope

- Multi-user / team features
- Cloud hosting (SaaS, multi-tenant)
- Native apps (PWA first)

# Research Index

## Files

| File | Description | Date |
|---|---|---|
| [vde-monitor.md](./vde-monitor.md) | yuki-yano/vde-monitor の全体調査。アーキテクチャ、パターン、banto との比較 | 2026-03-06 |
| [architecture-v2.md](./architecture-v2.md) | banto v2 ゼロベース再設計。2-app 分離構成 (web dashboard + native terminal) | 2026-03-06 |
| [libghostty-status.md](./libghostty-status.md) | libghostty C ABI 調査。公開状況、レイヤー構成、Rust バインディング、gpui-ghostty | 2026-03-06 |
| [browser-terminal-options.md](./browser-terminal-options.md) | ブラウザターミナル候補比較。ghostty-web / restty / 自前 / MoonBit | 2026-03-06 |
| [learnings-vde-monitor.md](./learnings-vde-monitor.md) | vde-monitor から得た学び。banto Purpose に照らした 10 の教訓 | 2026-03-06 |
| [happy-coder.md](./happy-coder.md) | slopus/happy 全体調査 + ユーザー評価 + 学び | 2026-03-06 |
| [competitor-tools.md](./competitor-tools.md) | AI coding agent management/monitoring tools comprehensive survey. 30+ tools across 8 categories | 2026-03-07 |
| [cmux.md](./cmux.md) | manaflow-ai/cmux deep research. Architecture, notification rings, OSC sequences, sidebar metadata, philosophy, learnings for banto | 2026-03-07 |
| [gob.md](./gob.md) | juanibiapina/gob deep research. Daemon architecture, SQLite schema, stuck detection, process/terminal separation, learnings for banto | 2026-03-07 |
| [claude-squad.md](./claude-squad.md) | smtg-ai/claude-squad deep research. Go+bubbletea TUI, tmux+git worktree isolation, session lifecycle, 6.2k stars, maintenance concerns, performance issues, learnings for banto | 2026-03-07 |
| [marc-nuri-dashboard.md](./marc-nuri-dashboard.md) | Marc Nuri's AI Coding Agent Dashboard. Hook/enricher pattern, heartbeat protocol, cross-device orchestration, learnings for banto | 2026-03-07 |
| [agentos.md](./agentos.md) | saadnvd1/agent-os deep research. Mobile-first web UI, Next.js+tmux+Tauri, voice-to-text, Tailscale remote access, conductor/worker MCP, learnings for banto | 2026-03-07 |
| [agent-deck.md](./agent-deck.md) | asheshgoplani/agent-deck deep research. Go+Bubble Tea TUI on tmux, 4-state status detection, session forking, MCP socket pooling, conductor orchestration, scope creep cautionary tale, learnings for banto | 2026-03-07 |
| [claude-code-first-party.md](./claude-code-first-party.md) | Claude Code first-party features deep research. Tasks, Agent Teams, Remote Control. Architecture, constraints, user feedback, banto differentiation strategy | 2026-03-07 |
| [github-copilot-agent.md](./github-copilot-agent.md) | GitHub Copilot Coding Agent deep research. Architecture (Actions-based sandbox, Mission Control), issue-to-PR workflow, pricing backlash, cold boot UX, learnings for banto | 2026-03-07 |
| [amp.md](./amp.md) | Amp (Sourcegraph) deep research. Client-server architecture, cloud-stored threads, cross-device continuity, sub-agents, multi-model strategy, pricing concerns, learnings for banto | 2026-03-07 |
| [superset.md](./superset.md) | Superset (superset.sh) deep research. Electron desktop app, daemon process, Monaco DiffEditor, worktree isolation, macOS-only, mandatory cloud auth issues, learnings for banto | 2026-03-07 |
| [zeroshot.md](./zeroshot.md) | covibes/zeroshot deep research. Message-driven multi-agent orchestrator, SQLite pub/sub, blind validation, complexity-based auto-scaling, learnings for banto | 2026-03-07 |
| [openhands.md](./openhands.md) | All-Hands-AI/OpenHands deep research. V0→V1 evolution, Agent SDK, self-hosted Kubernetes, sandbox isolation, event condensation, cost explosion issues, learnings for banto | 2026-03-07 |
| [crystal-nimbalyst.md](./crystal-nimbalyst.md) | stravu/crystal deep research. Git worktree per session, parallel A/B comparison, Electron performance issues, scope creep into editor territory, learnings for banto | 2026-03-07 |
| [composio.md](./composio.md) | ComposioHQ/agent-orchestrator deep research. Plugin-based architecture (8 slots), CI self-correction, PR-per-agent, self-built by 30 agents, learnings for banto | 2026-03-07 |
| [praktor.md](./praktor.md) | mtzanidakis/praktor deep research. Go gateway + embedded NATS + Docker + SQLite + React Mission Control. Per-agent memory.db, secret vault, lazy container startup, learnings for banto | 2026-03-07 |
| [codex-orchestrator.md](./codex-orchestrator.md) | kingbootoshi/codex-orchestrator deep research. Bun+tmux, mid-task messaging via tmux send-keys, structured result extraction, planning-execution separation, learnings for banto | 2026-03-07 |
| [devin.md](./devin.md) | Cognition AI/Devin deep research. Brain/VM split architecture, interactive planning, Playbooks, Memory Layer, Answer.AI 15% success rate evaluation, pricing model, learnings for banto | 2026-03-07 |
| [multi-agent-shogun.md](./multi-agent-shogun.md) | yohey-w/multi-agent-shogun deep research. 4-tier hierarchy (Shogun/Karo/Ashigaru/Gunshi), YAML file-based IPC, bottom-up skill discovery, dashboard as derived view, learnings for banto | 2026-03-07 |
| [rewrite-architecture-option-scorecard.md](./rewrite-architecture-option-scorecard.md) | Non-final rewrite decision framework. Adoption matrix, countermeasure matrix, A/B/C architecture packages, weighted scorecard, and 4-week validation plan | 2026-03-07 |
| [pty-ipc-options.md](./pty-ipc-options.md) | PTY & IPC options for programmatic agent control. node-pty, Bun.Terminal, expect libs, FIFO, UDS, signals, tmux control mode. Recommendation matrix | 2026-03-07 |
| [agent-control-methods.md](./agent-control-methods.md) | 10 agent control/integration methods beyond PTY/tmux: wrapper process, filesystem IPC, D-Bus/systemd, WebSocket bridge, container isolation, LSP-like protocol, shared memory, agent-as-library, GNU Screen, K8s/Nomad. Assessment matrix for banto | 2026-03-07 |
| [learnings-cross-cutting.md](./learnings-cross-cutting.md) | 18 competitor research files cross-cutting synthesis. What users want, technical design, UX patterns, business lessons. Confidence-rated by source count | 2026-03-07 |
| [TODO.md](./TODO.md) | 競合 12 ツール/サービスのディープリサーチ TODO | 2026-03-07 |
| [user-workflows-multi-agent.md](./user-workflows-multi-agent.md) | Real-world multi-agent coding workflows ethnographic research. Pain points, organic behaviors, surprises from HN/blogs/data. 25+ sources, 10 pain point themes, direct quotes | 2026-03-07 |
| [ui-ux-design-patterns.md](./ui-ux-design-patterns.md) | 12 AI coding agent dashboards UI/UX comparative analysis. Layout archetypes, information hierarchy, one-glance patterns, mobile support, user feedback, ASCII wireframes | 2026-03-07 |
| [TEMPLATE.md](./TEMPLATE.md) | Canonical structure template for competitor deep-research files | 2026-03-07 |

## Decisions

- [x] App 構成: **1-app (web 統合)**。2-app 分離はやめる (2026-03-06)
- [x] セッションデータ: **分離テーブル** (sessions + session_events) (2026-03-06)
- [ ] ターミナルレンダラー: restty (WebGPU) vs ghostty-web (Canvas) vs 自前 vs MoonBit
- [ ] Phase 1 (サーバーリファクタ) 着手タイミング

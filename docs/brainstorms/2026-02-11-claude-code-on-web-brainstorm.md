---
date: 2026-02-11
topic: claude-code-on-web
---

# Claude Code on the Web — NixOS VM版

## What We're Building

bantoを「Claude Code on the web」に進化させる。ユーザーはWebブラウザ上でagentとリアルタイムに対話しながら開発を進める。差別化ポイントはNixOSマシン上のコンテナで開発環境を隔離・宣言的に管理すること。

OSSとして公開し、各ユーザーが自分のNixOSマシンにclone/flake importして使う形態（実質シングルユーザー）。

## Key Decisions

### 1. Agent Engine: CC CLI as subprocess

CC CLIをNixOS Container内でsubprocessとして実行し、その入出力を中継する。

- **理由:** CCの成熟したツール群（ファイル操作、シェル実行、git、コンテキスト管理、エラーリカバリ）をそのまま利用でき、自前実装の工数を大幅に削減できる
- **方式:** pty経由でCCを起動し、stdout/stdinをWebSocketで中継
- **対話性:** ターン間のメッセージ送信（stdin書き込み）、処理中断（SIGINT）、セッション再開（`--resume`）すべて対応可能
- **NixOS固有機能:** CCはBashツールで`nix build`等を直接実行可能。MCP拡張は後から必要になった時点で追加

### 2. Isolation: NixOS Container (systemd-nspawn)

- **理由:** シングルユーザーOSSに完全VM隔離は過剰。コンテナで十分
- **メリット:** Nixストア共有でディスク効率良好、起動~1-2秒、既存container.tsの延長
- **将来:** マルチテナント化する場合にmicroVM (firecracker) へ移行可能

### 3. UI: Three-panel with switchable main views

```
┌──────────────────────────────────────────────────────────────┐
│  Side Panel                │  Main Panel                     │
│  (プロジェクト/タスク一覧)    │  [Terminal] [Diff] [Markdown]   │
│                            │                                 │
│  Project A                 │  ┌───────────────────────────┐  │
│  ├── Task 1 ● running      │  │                           │  │
│  │   "テスト修正中"          │  │  View content             │  │
│  │   ⟨..→ [design] →..⟩    │  │                           │  │
│  ├── Task 2 ⏸ stopped      │  │                           │  │
│  │   "レビュー待ち"          │  │                           │  │
│  │   ⟨..→ [implement]⟩     │  │                           │  │
│  │                          │  │                           │  │
│  Project B                 │  │                           │  │
│  ├── Task 3 ● running      │  │                           │  │
│  │   "API実装中"            │  │                           │  │
│  │                          │  └───────────────────────────┘  │
│  [⚙ Workflow表示: ON/OFF]   │                                 │
└──────────────────────────────────────────────────────────────┘
```

**Side Panel:**
- マルチプロジェクト対応。プロジェクト別にタスクを表示
- 各タスクのagent動作状況（running/stopped/waiting）
- 各タスクが今何を進めているかの概要テキスト
- OpenSpecワークフロー進行状況（proposal → specs → design → tasks → implement）。トグルで表示/非表示切り替え可能

**Main Panel（3つのビューを切り替え）:**
1. **Terminal:** CC CLIの出力をghostty-webでターミナルレンダリング。pty経由の生出力
2. **Diff:** base branchとの差分をGitHub-like diffビューワーで表示
3. **Markdown:** OpenSpecのartifact（proposal, specs, design等）をマークダウンレンダリング

### 4. Terminal Rendering: ghostty-web

- [coder/ghostty-web](https://github.com/coder/ghostty-web)を使用
- GhosttyのパーサーをWASMコンパイルしたもの。xterm.js互換API
- 元々Mux（隔離された並列agent開発用アプリ）のために作られた — bantoと同じユースケース
- ゼロ依存400KB WASMブロブ

## Architecture Overview

```
Browser (React + TanStack Router)
├── ghostty-web (Terminal view)
├── diff viewer component (Diff view)
├── markdown renderer (Markdown view)
└── WebSocket ←→ banto server

banto server (Elysia)
├── WebSocket hub (セッションごとにpty中継)
├── Session management (container lifecycle)
├── Task/Project CRUD (既存)
└── OpenSpec workflow tracking

NixOS Host
├── banto server process
├── Container: session-{id}
│   ├── bind-mount: /nix/store (read-only, ホストと共有)
│   ├── bind-mount: /workspace/{project} (プロジェクトコード)
│   ├── devShell (flake.nixベース or デフォルト)
│   └── claude CLI (pty経由で実行中)
└── Container: session-{id2}
    └── ...
```

## Design Considerations

### Real-time Communication
- pty → WebSocket中継: コンテナ内のCCをptyで起動し、出力をWebSocketでブラウザに転送
- 入力: ブラウザ → WebSocket → stdinへの書き込み
- 再接続: ブラウザ切断時もコンテナ内CCは継続。再接続時に出力バッファを再送
- 複数タブ: 同一セッションを複数タブで閲覧可能にするか（読み取り専用ビューア）

### Session Lifecycle
- タスク作成 → コンテナ起動 → CC CLI起動 → 対話 → タスク完了 → コンテナ停止
- コンテナはタスク完了後も一定期間保持（結果確認用）
- スナップショット/復元は将来の拡張

### OpenSpec Integration
- タスクにOpenSpecのフェーズ情報を持たせる
- agent出力からフェーズ遷移を検知する方法が必要（OpenSpecのartifact生成をトリガーにするか、手動か）
- OpenSpecのartifact（.md）はコンテナ内のワークスペースに保存 → Markdownビューで表示

### Environment Provisioning
- プロジェクトにflake.nixがあればそのdevShellを使う
- なければbantoがデフォルトの開発環境（git, ripgrep, node等）を提供
- CCバイナリはNixストア経由で全コンテナに共有

## Open Questions

1. **agent出力からOpenSpecフェーズを自動検知する方法** — artifact生成を監視？CC出力のパース？手動でフェーズ遷移？
2. **Diffビューのデータ取得** — コンテナ内でgit diffを実行してその結果をAPIで返す？ファイルシステム監視？
3. **コンテナのリソース制限** — CPU/メモリの上限をどう設定するか。ユーザーが設定可能にするか
4. **CC CLIのバージョン管理** — Nix flakeでピン留めするか、ユーザーに任せるか
5. **複数セッション同時実行** — mini PCのリソースで何セッションまで同時実行可能か
6. **ghostty-webの成熟度** — まだ初期段階のプロジェクト。xterm.jsをフォールバックとして持つべきか

## Next Steps

→ `/workflows:plan` で実装計画を立てる

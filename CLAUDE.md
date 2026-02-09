# banto

やりたいことをメモして、agentに投げて、結果を見るダッシュボード。NixOS mini PC上で動作する。

## 原則

- CC一本足: マルチプロバイダー抽象化は作らない
- 1セッション = 1コンテナ: セッションが実行の単位
- ワンビュー: アクティブタスクがプロジェクト別に1画面に並ぶ
- メモして、投げて、見る: タスク管理 → agent実行 → 結果確認
- 見た目より機能: UIの装飾は後回し、動くことを優先

## スタック

- Runtime: Bun
- Backend: Elysia + Eden
- Frontend: React + TanStack Router + TanStack Query
- DB: bun:sqlite
- WebSocket: Elysia組み込みWS
- Styling: Tailwind CSS
- Lint: oxlint
- Format: oxfmt
- 型チェック: tsgo

## ディレクトリ構成

ドメインごとのco-locationを最優先する。技術レイヤでの分割はしない。

```
src/
├── server.ts
├── server/
│   ├── app.ts
│   ├── db.ts                 # SQLite接続（共有リソース）
│   ├── projects/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   └── repository.ts
│   ├── tasks/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   └── repository.ts
│   └── sessions/
│       ├── routes.ts
│       ├── service.ts
│       ├── repository.ts
│       ├── runner.ts         # セッション実行オーケストレーション
│       ├── container.ts      # nixos-container操作
│       └── agent.ts          # Agent SDK操作
├── client/
│   ├── app.tsx
│   ├── tasks/
│   │   ├── TaskList.tsx      # 左パネル（pinned + プロジェクト別）
│   │   ├── TaskDetail.tsx    # 右パネル（詳細 + セッション履歴）
│   │   ├── CreateTask.tsx    # モーダル
│   │   └── api.ts
│   ├── sessions/
│   │   ├── SessionDiff.tsx   # 別ページ（diff表示）
│   │   └── api.ts
│   ├── projects/
│   │   ├── CreateProject.tsx
│   │   └── api.ts
│   └── layout/
│       └── Root.tsx
├── shared/
│   └── types.ts
├── main.tsx
└── public/
    └── index.html
```

## 開発ワークフロー: TDD（t-wada準拠）

Red → Green → Refactor を厳密に守る。

1. **Red**: 失敗するテストを1つ書く。テストが失敗することを確認する
2. **Green**: そのテストを通す最小限のコードを書く。テストが通ることを確認する
3. **Refactor**: テストが通ったままコードを整理する

- テストなしにプロダクションコードを書かない
- 一度に1つのテストだけ追加する
- テストが通る最小限のコードだけ書く（先回りしない）

## コーディング規約

- 言語: TypeScript
- インポートはパスエイリアスを使う（`@/server/...`, `@/client/...`, `@/shared/...`）
- ドメインに関するコードはすべてそのドメインのディレクトリに置く
- 共有リソース（DB接続等）だけ外に出す
- エラーハンドリングは境界（API層）でのみ行う。内部コードでは不要なtry-catchを書かない

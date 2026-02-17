# Modularization: 車輪の再発明の解消とモジュール整理

**Date**: 2026-02-10
**Status**: Brainstorm complete

## What We're Building

既存の依存ライブラリ（TanStack Query, TanStack Router, Eden）を活用し、手書きの状態管理・データフェッチ・ルーティングを撤廃する。サーバー側のスキーマ重複やモジュール境界違反も合わせて修正し、コードベース全体のシンプルさとメンテナンス性を向上させる。

### 成功基準

1. **型安全性の一貫性**: Eden の end-to-end 型安全性が全 API に行き渡り、型の切れ目がない
2. **つけ外しの容易さ**: 各モジュールが独立しており、入れ替え・削除が容易
3. **状態の削減**: useState/useEffect/setInterval の手動管理をフレームワークに委譲

### 最適化の原則

State > Coupling > Complexity > Code の順に削減する:
- コードがよりステートレスになるなら、結合を増やすこともいとわない
- 結合を減らすためには、コードをもっと複雑にすることもある
- コードの複雑さが軽減されるなら、コードをコピーする
- コードの重複排除をするのは状態・結合・複雑性を増さない時のみに限る

## Why This Approach

**アプローチ: クライアント優先・段階的置き換え**

クライアント側の車輪の再発明が最も大きなインパクトを持つため、ここから着手する。
- `public/index.tsx` で useState x6、useCallback x3、setInterval x1、`TaskDetail.tsx` で setInterval x1 が手動管理されている
- TanStack Query/Router はすでに `package.json` に存在するが一切使われていない
- サーバー側はクライアント変更後でも独立して対応可能

### 却下したアプローチ

- **ドメイン単位の垂直スライス**: Router は全体に影響するためドメイン単位に分けにくい。過渡期にパターンが混在する
- **サーバー基盤からボトムアップ**: サーバー側の改善はインパクトが相対的に小さく、状態削減（最優先）が後回しになる

## Key Decisions

### クライアント側

| # | 課題 | 決定 | 理由 |
|---|------|------|------|
| A | TanStack Query 未使用 | **導入する** | useState/useEffect/setInterval による手動データフェッチ・ポーリング・キャッシュ無効化を useQuery/useMutation/refetchInterval に置き換え。最大の状態削減 |
| B | TanStack Router 未使用 | **フルルート設計で導入** | selectedTaskId の useState を URL パラメータに移行。ルート構造の詳細は計画フェーズで設計する（候補: `/`, `/tasks/:id`, `/sessions/:id/diff`, `/sessions/:id/logs`） |
| C | attachments が生 fetch | **Eden に統一** | 型安全性の切れ目をなくす。Eden Treaty は File upload をサポートしている |
| D | unwrap + api wrapper | **TanStack Query 導入に伴い整理** | queryFn/mutationFn に統合。ただし imperative な呼び出し（ペースト→アップロード等のイベントハンドラ）には useMutation の `mutateAsync` を使う |

### サーバー側

| # | 課題 | 決定 | 理由 |
|---|------|------|------|
| E | スキーマ重複（db.ts / test-helpers.ts） | **修正する** | test-helpers.ts が db.ts のスキーマ定義を再利用するように変更。Single Source of Truth |
| F | モジュール境界違反（sessions → attachments） | **修正する** | sessions/routes.ts が attachments/routes.ts から attachmentService を import している。sessions/routes.ts 内で独自に attachmentService を生成するか、runner のファクトリに注入する形に変更して依存を解消する |
| G-1 | snake_case → camelCase 手書き | **現状維持** | 共有ユーティリティを作ると結合が増える。各 repo での手書きは明示的でわかりやすい |
| G-2 | insert-then-reread | **修正する** | insert が構築済みエンティティを直接返すように変更。不要な DB アクセスの削減 |
| G-3 | find-or-throw の繰り返し | **現状維持** | 抽出すると複雑性が増える割にメリットが小さい |
| H | SSE の手動実装 | **Elysia 組み込みに置き換え** | ReadableStream + TextEncoder + heartbeat の手書きを Elysia のストリーミングサポートに委譲。クライアント側の `SessionLog.tsx`（EventSource 利用）もサーバー変更に合わせて更新が必要 |

### 実施順序

1. **TanStack Query 導入** — 状態削減が最大のインパクト
2. **TanStack Router 導入** — フルルート設計で URL ベースのナビゲーション
3. **Eden 統一 + unwrap 整理** — 型安全性の一貫性
4. **サーバー側修正** — スキーマ統一、モジュール境界、insert-then-reread、SSE

## Open Questions

- TanStack Router のルート構造の詳細設計（レイアウトルート、search params の活用範囲）
- SSE の Elysia 組み込み置き換え時に、現在の log-store の pub/sub パターンとの統合方法
- テストの書き換え戦略（TanStack Query/Router 導入後のコンポーネントテスト方針）
- 通知のステータス追跡パターンの移行方法（現在 `TaskDetail.tsx` が `useRef` で前回 session status を保持→遷移検知→通知発火。TanStack Query 導入後は `onSuccess` コールバックか別の side-effect hook で検知する必要がある）
- CLAUDE.md のディレクトリ構成と実態の乖離（`client/app.tsx`, `layout/Root.tsx`, `src/main.tsx` が未実装。エントリポイントは `public/index.tsx`）をこの作業で修正するか別途対応するか

## Scope

### In Scope
- TanStack Query / Router の導入とクライアントデータ層の全面書き換え
- Eden への統一（attachments の生 fetch 廃止）
- unwrap パターンの整理
- サーバー側: スキーマ統一、モジュール境界修正、insert-then-reread 修正、SSE 置き換え

### Dependencies to Note
- Decision H（SSE サーバー置き換え）→ `SessionLog.tsx`（SSE クライアント）の更新が必須
- Decision A（TanStack Query 導入）→ 通知ステータス追跡パターン（`TaskDetail.tsx`）の移行が必要
- Decision A の移行はデータドメイン単位（tasks, sessions 等）でアトミックに行う。中途半端に混在させると重複リクエストやstaleデータが発生する

### Out of Scope
- ORM の導入
- snake_case → camelCase の共有ユーティリティ化
- find-or-throw の抽出
- UI/UX の変更（見た目は変えない）
- 新機能の追加

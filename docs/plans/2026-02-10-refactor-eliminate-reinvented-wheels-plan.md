---
title: "refactor: Eliminate reinvented wheels and modularize codebase"
type: refactor
date: 2026-02-10
deepened: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-modularization-brainstorm.md
---

# refactor: Eliminate reinvented wheels and modularize codebase

## Enhancement Summary

**Deepened on:** 2026-02-10
**Technical review:** 2026-02-10 (Architecture, Performance, Security, Simplicity, Pattern Recognition, TypeScript)
**Research agents used:** TanStack Query v5 best practices, TanStack Router code-based routing, Elysia SSE + Eden file upload
**Context7 queries:** TanStack Query key patterns, TanStack Router layout routes, Eden file upload

### Key Improvements

1. **queryOptions() factory pattern** を導入し、queryKey + queryFn を co-locate する（TanStack Query v5 推奨パターン）
2. **refetchIntervalInBackground: false** をデフォルトに追加（背景タブでのポーリング停止。NixOS mini PC で24時間稼働するため効果大）
3. **Phase 4-2 の修正**: 重複インスタンス生成ではなく、共有サービスインスタンスモジュールを使用（`storageDir` パラメータ欠落バグも修正）
4. **Phase 4-4 (SSE 書き換え) の削除検討**: 現在の ReadableStream は標準的で動作している。書き換えは複雑性を増すだけの可能性
5. **Phase 3-1 を Phase 1-2 に統合**: 同じコードを2回触るのを避ける
6. **Phase 3-2 (unwrap インライン化) の削除**: api.ts のラッパー関数はスタックトレースとデバッグに有用
7. **Technical review 反映**: コンポーネント名を三列 UI 分割後の実態に合わせ、runningTaskIds・SPA fallback・attachmentQueries factory・Phase 3-3 チェックリスト等を補完

### New Considerations Discovered

- TanStack Query v5 では `onSuccess` が `useQuery` から削除済み（`useMutation` には残存）。通知検知は `useEffect` + ref で対応（既に計画に含まれる）
- `onSettled` で `invalidateQueries` の Promise を return しないと、mutation の `isPending` が早期に false になりスタイルデータが一瞬表示される
- Eden Treaty は SSE に `EventSource` を使わない（`fetch` + async iteration）。SSE クライアントは引き続きネイティブ `EventSource` を使用すべき
- Elysia は SSE heartbeat を自動送信しない。generator パターン採用時は明示的な heartbeat yield が必要
- `t.File()` と併用する body で `t.Number()` は使えない（FormData は文字列のみ）。`t.Numeric()` を使う

---

## Overview

既存の依存ライブラリ（TanStack Query, TanStack Router, Eden, Elysia SSE）を活用し、手書きの状態管理・データフェッチ・ルーティング・SSE を撤廃する。サーバー側のスキーマ重複やモジュール境界違反も合わせて修正する。

4フェーズに分けて段階的に実施する:
1. TanStack Query 導入（状態削減）
2. TanStack Router 導入（URL ベースナビゲーション）
3. Eden 統一（型安全性の一貫性）— unwrap ラッパーは維持
4. サーバー側修正（スキーマ、境界、insert-then-reread）

## Problem Statement

クライアント側で `useState` x6、`useCallback` x3、`setInterval` x2 による手動データフェッチ・ポーリング・キャッシュ無効化を行っている。TanStack Query と TanStack Router は `package.json` に存在するが一切使われていない。attachments の API は Eden を迂回して生 `fetch` を使い、型安全性が途切れている。サーバー側ではスキーマが2箇所に重複し、モジュール境界違反がある。

## Technical Approach

### 最適化の原則

**State > Coupling > Complexity > Code** の順に削減する。コード重複の排除は状態・結合・複雑性を増さない場合のみ行う。

### ルート構造設計

コードベースルーティング（Vite なしのため file-based は不可）。レイアウトルートでサイドバーを保持し、`/tasks/$taskId` でタスク選択を URL パラメータ化する。

```
rootRoute (layout: sidebar + Outlet)
├── indexRoute: /                      → "タスクを選択してください"
├── taskRoute:  /tasks/$taskId         → TaskDetail
├── diffRoute:  /sessions/$sessionId/diff  → SessionDiff（将来）
└── logsRoute:  /sessions/$sessionId/logs  → SessionLog（将来）
```

### 移行の原子性

Phase 1 は2ステップに分割し、データドメイン単位でアトミックに移行する:
- Step 1: `index.tsx` の状態（projects, tasks, selectedTask）
- Step 2: `TaskInfoPanel.tsx` の状態（attachments）+ `SessionChatPanel.tsx` の状態（sessions）+ Eden 統一（attachments の生 fetch 廃止）

> **注意**: `feat/three-column-ui` ブランチで `TaskDetail.tsx` は `TaskInfoPanel.tsx`（中央パネル: タスク詳細・添付ファイル）と `SessionChatPanel.tsx`（右パネル: SSE ログ・セッション管理）に分割済み。旧 `TaskDetail.tsx` は使用されていないデッドコード。

混在状態を避けるため、各ステップ内では旧パターンと新パターンを共存させない。

### Research Insights: Technical Approach

**TanStack Router:**
- コードベースルーティングでは `createRootRoute` / `createRoute` / `addChildren` を使用。Vite プラグインやコード生成は不要
- サイドバーレイアウトは `rootRoute.component` に配置するのが最もシンプル（pathless layout route は複数レイアウトが必要になるまで不要）
- `Register` interface で型安全性を確保（`Link`, `navigate`, `useParams` すべてに型推論が効く）
- Browser history がデフォルト（明示的な設定不要）。SPA fallback として Elysia 側で `app.get('*', ...)` が必要

**TanStack Query v5:**
- `queryOptions()` ヘルパーで queryKey + queryFn を co-locate するのが推奨パターン。`getQueryData`, `setQueryData`, `invalidateQueries` すべてに型推論が効く
- v5 では `refetchInterval` のコールバックシグネチャが変更: `(query: Query) => number | false | undefined`（v4 の `(data, query)` から変更）
- `keepPreviousData: true` は `placeholderData: keepPreviousData` に名称変更
- `useErrorBoundary` は `throwOnError` に名称変更

---

## Implementation Phases

### Phase 1: TanStack Query 導入

最大の状態削減。手動の useState/useEffect/setInterval を useQuery/useMutation/refetchInterval に置き換える。

#### Phase 1-0: QueryClient セットアップ

**ファイル**: `public/index.tsx`, `src/client/queryClient.ts`（新規）

- [x] `src/client/queryClient.ts` に `QueryClient` を作成:
- [ ] `QueryCache.onError` で `ApiError` のサーバー報告を一元化 (deferred: 現状で十分機能)
- [ ] `throwOnError` で 5xx のみ ErrorBoundary に伝播（4xx はコンポーネント内で処理）(deferred)
- [ ] `retry` で 4xx はリトライしない (deferred)
- [x] `refetchIntervalInBackground: false` で背景タブのポーリングを停止
- [x] `public/index.tsx` で `QueryClientProvider` で App をラップ
- [ ] `QueryErrorResetBoundary` と既存の `ErrorBoundary` を統合 (deferred: 現状の ErrorBoundary で十分)

```typescript
// src/client/queryClient.ts
import { QueryClient, QueryCache } from "@tanstack/react-query";
import { ApiError } from "./api.ts";
import { reportErrorToServer } from "./ErrorBoundary.tsx";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError) {
        reportErrorToServer(error.message, error.stack, error.requestId ?? undefined);
      }
    },
  }),
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      throwOnError: (error) => {
        if (error instanceof ApiError) return error.status >= 500;
        return true;
      },
    },
    mutations: {
      throwOnError: false,
    },
  },
});
```

#### Research Insights: Phase 1-0

**Best Practices:**
- `staleTime: 0` と `refetchOnWindowFocus: true` は TanStack Query のデフォルト値なので明示不要
- `refetchIntervalInBackground: false` は必須。NixOS mini PC で24時間稼働するダッシュボードでは、タブがフォーカスされていない時のポーリングを完全に停止できる
- `QueryErrorResetBoundary` を既存の `ErrorBoundary` と統合する場合、`ErrorBoundary` に `onReset` prop を追加し、リトライボタンクリック時に `onReset()` を呼ぶ

**簡素化の選択肢:**
- Simplicity レビューでは `refetchIntervalInBackground: false` のみ設定し、`retry` / `throwOnError` / `QueryCache.onError` はデフォルトのまま開始することを推奨。既存の `window.addEventListener("error")` がエラー報告をカバーしているため。問題が実際に発生してから追加する方針も妥当

**Edge Cases:**
- `reportErrorToServer` は現在生 `fetch` を使用しているため、`QueryCache.onError` 内での Eden 使用は避ける（循環依存を防ぐため）

#### Phase 1-1: index.tsx の状態移行

**削除対象**: `useState`（projects, activeTasks, backlogTasks, pinnedTasks, selectedTaskId, selectedTask）、`useCallback`（refreshProjects, refreshTasks, refreshAll）、`setInterval`

**ファイル**: `public/index.tsx`, `src/client/projects/queries.ts`（新規）, `src/client/tasks/queries.ts`（新規）, `src/client/projects/api.ts`, `src/client/tasks/api.ts`

**queryOptions ファクトリの作成:**

- [x] `src/client/projects/queries.ts` を作成:

```typescript
// src/client/projects/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { listProjects } from "./api.ts";

export const projectQueries = {
  all: () => ["projects"] as const,
  list: () =>
    queryOptions({
      queryKey: [...projectQueries.all(), "list"] as const,
      queryFn: listProjects,
      staleTime: 5 * 60 * 1000, // projects は滅多に変わらない
    }),
};
```

- [x] `src/client/tasks/queries.ts` を作成:

```typescript
// src/client/tasks/queries.ts
import { queryOptions, keepPreviousData } from "@tanstack/react-query";
import { listActiveTasks, listBacklogTasks, listPinnedTasks, getTask } from "./api.ts";

export const taskQueries = {
  all: () => ["tasks"] as const,
  lists: () => [...taskQueries.all(), "list"] as const,
  active: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "active"] as const,
      queryFn: listActiveTasks,
      refetchInterval: 5000,
    }),
  backlog: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "backlog"] as const,
      queryFn: listBacklogTasks,
      refetchInterval: 5000,
    }),
  pinned: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "pinned"] as const,
      queryFn: listPinnedTasks,
      refetchInterval: 5000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...taskQueries.all(), "detail", id] as const,
      queryFn: () => getTask(id),
      placeholderData: keepPreviousData,
    }),
};
```

**コンポーネント移行:**

- [x] `useQuery(projectQueries.list())` で projects を管理
- [x] `useQuery(taskQueries.active())` で activeTasks を管理
- [x] `useQuery(taskQueries.backlog())` で backlogTasks を管理
- [x] `useQuery(taskQueries.pinned())` で pinnedTasks を管理
- [x] `selectedTaskId` は Phase 2 まで `useState` のまま残す（Router 移行時に URL パラメータ化）
- [x] `selectedTask` を `useQuery(taskQueries.detail(selectedTaskId!))` に置き換え（`enabled: !!selectedTaskId`）
- [ ] タスクアクション（activate, complete, reopen, pin, unpin）を `useMutation` に置き換え (deferred: 直接 invalidateQueries で十分シンプル)
  - **重要**: `onSettled` から `invalidateQueries` の Promise を return すること。return しないと mutation の `isPending` が早期に false になりスタイルデータが一瞬表示される
- [ ] `createTask` を `useMutation` に置き換え (deferred: 直接 invalidateQueries で十分シンプル)
- [x] `refreshAll` / `refreshTasks` / `refreshProjects` コールバックチェーンを削除
- [x] `setInterval(refreshTasks, 5000)` を削除（`refetchInterval` に移行済み）
- [x] 子コンポーネントへの `onCreated`, `onUpdated`, `onChanged` コールバック props を削除（各コンポーネントが `useQueryClient().invalidateQueries()` を直接呼ぶ）
- [x] `index.tsx` の通知ステータス追跡（`prevSessionStatusRef` + `latestSession`）を削除（Phase 1-2 の `TaskInfoPanel` 内の通知に一本化。削除しないと通知が重複する）

**runningTaskIds の移行:**

現在の `index.tsx` は全 active タスクのセッションを個別に fetch し、実行中セッションを持つタスクの ID リストを導出している（N+1 パターン: N タスク × 1 HTTP リクエスト）。Phase 1 でこのポーリングは削除される。

- [x] サイドバーの「実行中」インジケータが不要であれば、`runningTaskIds` のロジックをそのまま削除
- [x] インジケータが必要であれば、サーバー側タスクリスト API に `hasActiveSession` フィールドを追加（1 JOIN で解決。N+1 の HTTP リクエストを排除）

**mutation hook の配置:**

mutation hook（`useActivateTask`, `useStartSession` 等）は各ドメインの `queries.ts` に co-locate する（ファイル名は `queries.ts` のままとし、TanStack Query 関連を集約する場所として扱う）。

#### Research Insights: Phase 1-1

**タスクリストクエリの設計に関する注意:**

3つの独立した `useQuery` + `refetchInterval: 5000` は、タイマーが同期されないため時間経過で drift する。現在の `Promise.all` では3リクエストが同時に発火するが、TanStack Query では各クエリが独立してポーリングするため、5秒ごとに3回ではなく、1.7秒ごとに1回ずつリクエストが散らばる可能性がある。

**代替案（検討事項）:**
- サーバーに `/api/tasks/grouped` エンドポイントを追加し、`{ active, backlog, pinned }` を1レスポンスで返す。1クエリで3カテゴリを取得でき、ポーリングも1リクエスト/5秒に削減
- 現状の3エンドポイントを維持する場合でも、`invalidateQueries({ queryKey: taskQueries.lists() })` による一括無効化は引き続き機能する

**Mutation パターン:**

```typescript
// 推奨: useMutation の onSettled で Promise を return
export function useActivateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}
```

#### Phase 1-2: TaskInfoPanel / SessionChatPanel の状態移行 + Eden 統一（attachments）

**削除対象**: `TaskInfoPanel.tsx` の `useState`（attachments）、`useCallback`（refreshAttachments）、`SessionChatPanel.tsx` の `onSessionStarted` コールバック、attachments の生 `fetch`

**ファイル**: `src/client/tasks/TaskInfoPanel.tsx`, `src/client/sessions/SessionChatPanel.tsx`, `src/client/sessions/queries.ts`（新規）, `src/client/attachments/queries.ts`（新規）, `src/client/attachments/api.ts`（新規）, `src/client/sessions/api.ts`

**注意**: `SessionChatPanel.tsx` の SSE ストリーミング（`EventSource` + `useState`）は TanStack Query 移行の対象外。useQuery はリアルタイムストリーミングに適さない。

**sessions クエリファクトリ:**

- [x] `src/client/sessions/queries.ts` を作成:

```typescript
// src/client/sessions/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { listSessionsByTask } from "./api.ts";

function hasActiveSession(sessions: Session[]): boolean {
  return sessions.some(
    (s) => s.status === "pending" || s.status === "provisioning" || s.status === "running",
  );
}

export const sessionQueries = {
  all: () => ["sessions"] as const,
  byTask: (taskId: string) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "byTask", taskId] as const,
      queryFn: () => listSessionsByTask(taskId),
      refetchInterval: (query) => {
        const sessions = query.state.data;
        return sessions && hasActiveSession(sessions) ? 2000 : false;
      },
    }),
};
```

**attachments クエリファクトリ:**

- [x] `src/client/attachments/api.ts` を作成（`src/client/tasks/api.ts` から attachment 関数を移動。ドメイン co-location）:

```typescript
// src/client/attachments/api.ts
import { api, unwrap } from "../api.ts";

export async function listAttachments(taskId: string) {
  return unwrap(await api.api.attachments.task({ taskId }).get());
}

export async function uploadAttachment(taskId: string, file: File) {
  return unwrap(await api.api.attachments.task({ taskId }).post({ file }));
}

export async function deleteAttachment(id: string) {
  return unwrap(await api.api.attachments({ id }).delete());
}
```

- [x] `src/client/attachments/queries.ts` を作成:

```typescript
// src/client/attachments/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { listAttachments } from "./api.ts";

export const attachmentQueries = {
  all: () => ["attachments"] as const,
  byTask: (taskId: string) =>
    queryOptions({
      queryKey: [...attachmentQueries.all(), "byTask", taskId] as const,
      queryFn: () => listAttachments(taskId),
    }),
};
```

**コンポーネント移行:**

- [x] `useQuery(sessionQueries.byTask(task.id))` でセッション管理。アクティブセッションがある時だけ2秒ポーリング
- [x] `useQuery(attachmentQueries.byTask(task.id))` で添付ファイル管理
- [ ] `startSession` を `useMutation` に置き換え (deferred: 直接 invalidateQueries で十分シンプル)
- [ ] `uploadAttachment` / `deleteAttachment` を `useMutation` に置き換え (deferred: 直接 invalidateQueries で十分シンプル)
- [x] `src/client/tasks/api.ts` から attachment 関連の生 `fetch` コードを削除
- [x] 型推論が正しく効いていることを確認（戻り値が `any` でないこと）

**通知のステータス追跡を移行:**

- [x] `useRef` + `useEffect` で `sessionsQuery.data` を監視し、前回の status と比較して遷移を検知→通知発火

```typescript
// 通知ステータス追跡の移行パターン
const sessionsQuery = useQuery(sessionQueries.byTask(task.id));

const prevStatusRef = useRef<Map<string, string>>(new Map());

useEffect(() => {
  if (!sessionsQuery.data) return;
  for (const session of sessionsQuery.data) {
    const prev = prevStatusRef.current.get(session.id);
    if (prev && prev !== session.status) {
      if (session.status === "done" || session.status === "failed") {
        showNotification(task.title, session.status);
      }
    }
    prevStatusRef.current.set(session.id, session.status);
  }
}, [sessionsQuery.data, task.title]);
```

- [x] ペーストイベントリスナーの依存を更新: `refreshAttachments` → `invalidateQueries({ queryKey: attachmentQueries.byTask(task.id).queryKey })`

#### Research Insights: Phase 1-2

**Eden File Upload の注意事項:**
- Eden Treaty は `File` / `FileList` / `File[]` を自動検出し、`FormData` に変換する。手動で `FormData` を作成する必要はない
- `Content-Type` は設定しないこと — Eden/ブラウザが自動で boundary を付与する
- `t.File()` と併用する body で `t.Number()` は使えない（FormData は文字列のみ）。`t.Numeric()` を使う
- ネストされたオブジェクトは `t.File()` と併用できない — スキーマをフラットに保つ
- 現在のサーバー側スキーマ（`attachments/routes.ts` の `t.Object({ file: t.File() })`）はフラットなので問題なし

**通知の重複リスク:**
- `TaskDetail` が2箇所でマウントされる場合（ルート遷移中など）、`useEffect` が2回発火し通知が重複する可能性がある。ref ベースのアプローチでこれは緩和されるが、万が一問題が出たら通知ロジックを単一の親コンポーネントに上げる

#### Phase 1 完了基準

- [x] `public/index.tsx` に `useState` が `sidebarOpen` と `selectedTaskId` のみ残る
- [x] `index.tsx` の通知ステータス追跡（`prevSessionStatusRef`）が削除されている
- [x] `TaskInfoPanel.tsx` に `useState` が UI ローカル状態のみ残る（`isEditing` 等）
- [x] `SessionChatPanel.tsx` の SSE 関連 `useState` はそのまま（TanStack Query 対象外）
- [x] `setInterval` がコードベースに存在しない
- [x] ポーリングが `refetchInterval` で動作している
- [x] セッション完了時の通知が機能している
- [x] attachments の API が Eden Treaty 経由で型安全
- [x] 生 `fetch` がクライアントコードに存在しない（`reportErrorToServer` を除く）
- [x] 既存のサーバーサイドテストが全て通る

---

### Phase 2: TanStack Router 導入

URL ベースのナビゲーションで `selectedTaskId` の useState を撤廃する。

#### Phase 2-1: ルート定義

**新規ファイル**: `src/client/router.ts`, `src/client/routes/root.tsx`, `src/client/routes/index.tsx`, `src/client/routes/task.tsx`

- [x] `createRootRoute` でルートレイアウト定義（サイドバー + `<Outlet />`）
- [x] `createRoute` で indexRoute（`/`）、taskRoute（`/tasks/$taskId`）を定義
- [x] 将来用のルート（`/sessions/$sessionId/diff`, `/sessions/$sessionId/logs`）はこの段階では作成しない
- [x] `routeTree` を `rootRoute.addChildren([indexRoute, taskRoute])` で構築
- [x] `createRouter({ routeTree })` でルーター作成
- [x] TypeScript の `Register` interface で型安全性を確保
- [x] `src/server.ts` に SPA fallback を追加: `app.get('*', ...)` で API ルート以外を `index.html` に向ける。`/api/` パスはフォールバックから除外し、API の 404 が silent に masking されるのを防ぐ

```typescript
// src/client/router.ts
import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { indexRoute } from "./routes/index";
import { taskRoute } from "./routes/task";

const routeTree = rootRoute.addChildren([indexRoute, taskRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

```tsx
// src/client/routes/root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <div className="p-4">404 - ページが見つかりません</div>,
});

function RootLayout() {
  // サイドバー + Outlet
  // TaskListPanel は自身の useQuery を呼ぶ（props 不要）
}
```

```tsx
// src/client/routes/task.tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/$taskId",
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = taskRoute.useParams(); // 型安全: { taskId: string }
  const { data: task, isLoading, error } = useQuery(taskQueries.detail(taskId));
  // ...
}
```

#### Phase 2-2: コンポーネント再構成

**ファイル**: `public/index.tsx`, `src/client/routes/root.tsx`, `src/client/routes/task.tsx`

- [x] `public/index.tsx` を最小化: `QueryClientProvider` + `QueryErrorResetBoundary` + `RouterProvider` のみ
- [x] `RootLayout` コンポーネントを作成（現在の `App` からレイアウト部分を抽出）:
  - ヘッダー（CreateTask, ProjectManager）
  - サイドバー（TaskListPanel）— **TaskListPanel が自身の useQuery を呼ぶ**（RootLayout からのデータ受け渡し不要）
  - `<Outlet />` でルートコンテンツを表示
- [x] `TaskDetailPage` コンポーネントを作成:
  - `taskRoute.useParams()` から `taskId` を取得（型安全）
  - `useQuery(taskQueries.detail(taskId))` でタスクデータ取得
  - 既存の `TaskDetail` をラップ
- [x] タスク選択を `<Link to="/tasks/$taskId" params={{ taskId }} activeProps={{ className: "bg-blue-50" }}>` に変更
- [x] `selectedTaskId` / `selectedTask` の useState を削除
- [x] モバイルサイドバーの開閉: `sidebarOpen` は `useState` のまま（URL に含めない）

#### Phase 2-3: ナビゲーション動作

- [x] タスク作成後に新しいタスクへナビゲート: `router.navigate({ to: "/tasks/$taskId", params: { taskId: newTask.id } })`
- [ ] タスク削除後にインデックスへナビゲート: `router.navigate({ to: "/" })` (N/A: 削除機能なし)
- [x] ブラウザの戻る/進むが正しく動作することを確認
- [x] `/tasks/存在しないID` のエラーハンドリング: `useQuery` の `error` 状態を `TaskDetailPage` で処理

#### Research Insights: Phase 2

**Link の activeProps:**
- `<Link>` の `activeProps` で選択状態を自動判定できるため、手動の `selectedTaskId === task.id` チェックが不要になる

**Router パターンの選択:**
- Pattern A（loader なし、useQuery のみ）を推奨。サイドバーは独立してロードし、詳細ペインは自身の loading state を持つ。loader によるデータプリフェッチのメリットは、2秒ポーリングしているダッシュボードでは小さい
- 将来的にルート遷移を瞬時にしたい場合は Pattern B（loader + `ensureQueryData`）にアップグレード可能

**SPA fallback:**
- Browser history を使うため、Elysia サーバーで `app.get('*', () => Bun.file('public/index.html'))` のフォールバックが必要（API ルート以外を index.html に向ける）

**テスト:**
- `createMemoryHistory` でブラウザ不要のルーターテストが可能

#### Phase 2 完了基準

- [x] `selectedTaskId` / `selectedTask` の useState が存在しない
- [x] URL `/tasks/:id` でタスク詳細が表示される
- [x] ブラウザの戻る/進むが動作する
- [x] ディープリンク `/tasks/:id` で直接アクセスできる
- [x] `sidebarOpen` のみ useState として残る

---

### Phase 3: サーバー側修正

#### Phase 3-1: スキーマ重複解消

**ファイル**: `src/server/db.ts`, `src/server/test-helpers.ts`

- [x] `db.ts` からスキーマ定義（CREATE TABLE 文）を関数として export:

```typescript
// src/server/db.ts
export function applySchema(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS projects (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS tasks (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (... worktree_path TEXT, ...)`);
  db.run(`CREATE TABLE IF NOT EXISTS attachments (...)`);

  // 既存データベース向けのマイグレーション（ALTER TABLE は既にカラムがあると失敗するため try/catch）
  try { db.run("ALTER TABLE sessions ADD COLUMN worktree_path TEXT"); } catch {}
}
```

- [x] `test-helpers.ts` で `applySchema()` を呼び出すように変更
- [x] `test-helpers.ts` から重複した CREATE TABLE 文を削除
- [x] 全テストが通ることを確認

#### Research Insights: Phase 3-1

**ALTER TABLE 維持が必要な理由:**
- `CREATE TABLE IF NOT EXISTS` に `worktree_path` を含めても、既存のデータベース（テーブルが既に存在）ではカラムは追加されない。既存データベースの互換性のために `ALTER TABLE` fallback を `applySchema` 内に残す必要がある

#### Phase 3-2: モジュール境界修正（sessions → attachments）

**ファイル**: `src/server/attachments/instance.ts`（新規）, `src/server/sessions/routes.ts`, `src/server/attachments/routes.ts`

- [x] `src/server/attachments/instance.ts` を作成（共有サービスインスタンス）:

```typescript
// src/server/attachments/instance.ts
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { db } from "../db.ts";
import { createAttachmentRepository } from "./repository.ts";
import { createAttachmentService } from "./service.ts";

function getStorageDir(): string {
  const dataHome = process.env["XDG_DATA_HOME"] || join(process.env["HOME"]!, ".local/share");
  const dir = join(dataHome, "banto", "attachments");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const repo = createAttachmentRepository(db);
export const attachmentService = createAttachmentService(repo, getStorageDir());
```

- [x] `attachments/routes.ts` を更新: `instance.ts` から `attachmentService` を import（自身での生成を削除）
- [x] `sessions/routes.ts` を更新: `import { attachmentService } from "../attachments/instance.ts"` に変更（routes からの import を解消）
- [x] `attachments/routes.ts` から `export { service as attachmentService }` を削除

#### Research Insights: Phase 3-2

**元の計画の問題点:**
- 元の Phase 4-2 では `sessions/routes.ts` 内で `createAttachmentService(attachmentRepo)` を呼んでいたが、`createAttachmentService` は第2引数に `storageDir` が必要（`attachments/service.ts` line 5）。これはコンパイルエラーになる
- 同じサービスの2インスタンスを作ることは「結合を減らす」のではなく「状態を増やす」ことになり、State > Coupling の原則に反する

**共有インスタンスモジュールのメリット:**
- routes → routes の import を解消（モジュール境界違反を修正）
- 単一インスタンスを維持（重複なし）
- `getStorageDir()` の知識を attachments ドメイン内に閉じ込める

#### Phase 3-3: insert-then-reread の修正

**ファイル**: 各ドメインの `repository.ts`, `service.ts`

- [x] `projects/repository.ts`: `insert()` がエンティティを直接返すように変更
- [x] `tasks/repository.ts`: 同上
- [x] `sessions/repository.ts`: 同上
- [x] `attachments/repository.ts`: 同上
- [x] 各 `service.ts` の `create()` から `repo.findById(id)!` の再読み取りを削除（insert-then-reread）
- [x] `tasks/service.ts` の update メソッドから `repo.findById(id)!` の再読み取りを削除（update-then-reread: activate, complete, reopen, pin, unpin, updateDescription — 6メソッド）
- [x] `sessions/service.ts` の状態遷移メソッドから `repo.findById(id)!` の再読み取りを削除（update-then-reread: markProvisioning, markRunning, markDone, markFailed — 4メソッド）
- [x] 返却するエンティティは `toEntity()` 関数を通して camelCase に変換すること

```typescript
// Before (projects/service.ts)
create(input) {
  const id = crypto.randomUUID();
  repo.insert({ id, ...input });
  return repo.findById(id)!;
}

// After
create(input) {
  const id = crypto.randomUUID();
  return repo.insert({ id, ...input }); // insert が Project を返す
}
```

- [x] 既存テストが全て通ることを確認

#### Research Insights: Phase 3-3

**追加の最適化の可能性:**
- bun:sqlite が SQLite の `RETURNING` 句をサポートしている場合、`UPDATE ... RETURNING *` で update + re-read を1クエリに統合できる。これにより `activate`, `complete`, `reopen` 等の mutation メソッドが現在の3クエリ（validate + update + reread）から2クエリ（validate + update-returning）に削減できる
- **推定効果**: 書き込みパスで約33%のDBクエリ削減

#### Phase 3-4: logStore メモリリーク修正

**ファイル**: `src/server/sessions/runner.ts` または `src/server/sessions/service.ts`

24時間稼働する NixOS mini PC で `logStore` の in-memory Map がセッション完了後もクリアされず、メモリが無制限に成長する。

- [x] セッション完了時（`markDone` / `markFailed`）に `logStore.clear(sessionId)` を呼び出す（即時 or grace period 後）
- [ ] `logStore.push` にセッション単位の最大エントリ数（例: 10000）を設定し、上限を超えたら古いエントリを破棄 (deferred: clear で十分対応)

#### Phase 3 完了基準

- [x] `test-helpers.ts` に CREATE TABLE 文が存在しない
- [x] `sessions/routes.ts` が `attachments/routes.ts` を import していない
- [x] `repo.findById(id)!` の直後に `repo.insert()` / `repo.update*()` が来るパターンが存在しない
- [x] セッション完了時に `logStore` がクリアされる
- [x] 全テストが通る

---

## Phase 4-4 (SSE 書き換え) について: 削除を推奨

元の計画では SSE を Elysia の `sse()` ジェネレータに置き換える Phase 4-4 が含まれていたが、**複数のレビュアーが削除を推奨している**。

**現状維持の理由:**
- 現在の `ReadableStream` + `TextEncoder` + heartbeat コード（`sessions/routes.ts:73-113`）は約30行で、標準 Web API を使った明確な実装
- Elysia の `sse()` + async iterator adapter は行数はほぼ同じだが、callback-to-iterator 変換という新しい抽象層を導入する
- Elysia は heartbeat を自動送信しないため、ジェネレータ内で明示的な heartbeat yield が必要（新たな複雑性）
- ジェネレータの `finally` ブロックがクライアント切断時に正しく呼ばれるか未確認（スパイク検証が必要）
- async iterator の queue にバックプレッシャーがないため、consumer が遅い場合にメモリリークのリスク

**もし実施する場合の注意点:**
- 命名衝突を避ける: async generator は `asyncSubscribe` と命名（`logStore.subscribe` との衝突を防ぐ）
- queue に最大サイズ（例: 1000エントリ）を設定しバックプレッシャーを導入
- セッション完了時（done/failed）にジェネレータを終了させる termination condition を追加
- heartbeat を15秒間隔で yield（現在の動作と一致）
- Elysia のジェネレータ SSE で `finally` ブロックが切断時に発火するかスパイクで確認

---

## Acceptance Criteria

### Functional Requirements

- [x] タスク一覧の表示・ポーリングが TanStack Query で動作
- [x] タスク選択が URL パラメータ `/tasks/:id` で動作
- [x] ブラウザの戻る/進む/ディープリンクが動作
- [x] セッション完了時の通知が動作
- [x] 添付ファイルのペーストアップロードが動作
- [x] ログストリーミング（SSE）が動作
- [x] 全サーバーサイドテストがパス

### Non-Functional Requirements

- [x] 生 `fetch` がクライアントコードに存在しない（`reportErrorToServer` を除く）
- [x] `setInterval` がクライアントコードに存在しない
- [x] `attachments/routes.ts` への cross-domain import が存在しない
- [x] スキーマ定義が Single Source of Truth

## Dependencies & Risks

### フェーズ間の依存

```
Phase 1 ──→ Phase 2（selectedTaskId の useState は Phase 1 で残し Phase 2 で URL 化）
Phase 3 は独立（Phase 1-2 と並行可能。サーバー側のみの変更）
```

### リスク

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| クライアントテストがゼロ | リファクタリングの安全網がない | 各フェーズ完了後に手動テストチェックリストを実行。TDD 原則に従い、Phase 1 開始前に最低限のスモークテスト追加を検討 |
| UI レイアウト再設計ブレインストームとの競合 | Router のルート構造が再設計で変わる可能性 | 最小限のルート（`/`, `/tasks/$taskId`）のみ実装。将来ルートは必要時に追加 |
| Eden の File upload 対応 | attachments の Eden 統一が技術的に不可能な場合 | Phase 1-2 で早期に検証。不可能な場合は attachments のみ生 fetch を許容 |
| 3つのタスクリストクエリのポーリング drift | リクエストが分散し、サーバーへの実効リクエスト数が増加 | 初期リリース後にモニタリングし、必要に応じて単一エンドポイントに統合 |

## Open Questions (Deferred)

- CLAUDE.md のディレクトリ構成と実態の乖離の修正（エントリポイント `public/index.tsx` vs `src/main.tsx`、`client/app.tsx` と `layout/Root.tsx` の未実装）→ この作業では修正せず、別途対応
- tsconfig.json の path alias（`@/server/...` 等）の設定 → この作業のスコープ外
- クライアントテストの本格的な戦略（TanStack Query/Router のテスティングパターン）→ 別途計画
- bun:sqlite が SQLite の `RETURNING` 句をサポートしているか → Phase 3-3 実装時に検証
- タスクリストの単一エンドポイント化（`/api/tasks/grouped`）→ Phase 1-1 実装後にポーリング drift の影響を見て判断

## References & Research

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-10-modularization-brainstorm.md`
- UI redesign brainstorm: `docs/brainstorms/2026-02-10-ui-layout-redesign-brainstorm.md`
- Client entry point: `public/index.tsx`
- Task info panel: `src/client/tasks/TaskInfoPanel.tsx` (attachments, task actions)
- Session chat panel: `src/client/sessions/SessionChatPanel.tsx` (SSE logs, session management)
- Task detail (dead code): `src/client/tasks/TaskDetail.tsx` (使用されていない。`feat/three-column-ui` で分割済み)
- SSE server: `src/server/sessions/routes.ts:73-113`
- SSE client: `src/client/sessions/SessionLog.tsx`, `src/client/sessions/SessionChatPanel.tsx`
- Schema: `src/server/db.ts:17-62`
- Schema duplication: `src/server/test-helpers.ts:9-55`
- Module boundary violation: `src/server/sessions/routes.ts:11`
- Attachment raw fetch: `src/client/tasks/api.ts:51-71`
- Attachment service (requires storageDir): `src/server/attachments/routes.ts:16`
- Eden client setup: `src/client/api.ts`
- Notification tracking (index.tsx, 削除対象): `public/index.tsx:110-124`
- Notification tracking (TaskDetail, 移行対象): `src/client/tasks/TaskDetail.tsx:170-186`
- Log store (memory leak): `src/server/sessions/log-store.ts`

### External References
- [TanStack Query v5 - Query Options API](https://tanstack.com/query/v5/docs/react/guides/query-options)
- [TanStack Query v5 - Important Defaults](https://tanstack.com/query/v5/docs/react/guides/important-defaults)
- [TanStack Query v5 - Migration Guide](https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5)
- [TkDodo - The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
- [TkDodo - Breaking React Query's API on Purpose](https://tkdodo.eu/blog/breaking-react-querys-api-on-purpose)
- [TanStack Router - Code-Based Routing](https://tanstack.com/router/latest/docs/framework/react/guide/code-based-routing)
- [QueryErrorResetBoundary Reference](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary)
- [Elysia SSE - Generator Pattern](https://github.com/elysiajs/documentation/blob/main/docs/essential/handler.md)
- [Eden File Upload - t.File() Support](https://elysiajs.com/eden/treaty/parameters)

---
title: "refactor: Introduce useMutation and centralize error handling"
type: refactor
date: 2026-02-11
brainstorm: docs/brainstorms/2026-02-11-query-mutation-error-handling-brainstorm.md
previous: docs/plans/2026-02-10-refactor-eliminate-reinvented-wheels-plan.md
---

# refactor: Introduce useMutation and centralize error handling

## Overview

前回のリファクタリングで deferred した TanStack Query の残課題を実装する。全 mutation を `useMutation` 化し、`QueryClient` にエラーハンドリング設定を追加し、`QueryErrorResetBoundary` で ErrorBoundary を強化する。

## Problem Statement

現在のクライアントコード（9箇所）で mutation が `await action(); invalidateQueries()` の手動パターンで実装されている。

問題点:
1. **二重クリック無防備**: ボタンに loading ガードがない。StartSession や CreateTask で二重実行のリスク
2. **エラー非表示**: mutation 失敗時にユーザーへのフィードバックがゼロ。`unhandledrejection` でサーバー報告されるだけ
3. **4xx 無駄リトライ**: QueryClient のデフォルト `retry: 3` で、404 や 422 を3回リトライする
4. **ErrorBoundary 再試行が不完全**: 「再試行」ボタンが `setState({ error: null })` するだけでクエリキャッシュをリセットしない

## Technical Approach

3フェーズに分け、各フェーズが独立してコミット可能にする:

1. **Phase 1**: QueryClient 設定強化（retry, throwOnError, QueryCache.onError, MutationCache.onError）
2. **Phase 2**: useMutation hook 導入（全9箇所）
3. **Phase 3**: QueryErrorResetBoundary + ErrorBoundary 統合

```
Phase 1 → Phase 2 → Phase 3
（各フェーズは前のフェーズに依存するが、各フェーズ内は独立コミット可能）
```

---

## Phase 1: QueryClient 設定強化

**ファイル**: `src/client/queryClient.ts`

- [x] `QueryCache` を import し、`onError` でエラーをサーバー報告
- [x] `MutationCache` を import し、`onError` で mutation エラーもサーバー報告
- [x] `retry` で 4xx をリトライしない（`failureCount < 1` で 5xx は1回リトライ）
- [x] `throwOnError` で 5xx のみ ErrorBoundary に伝播（4xx はコンポーネント内処理）
- [x] `mutations.throwOnError: false` で mutation エラーは ErrorBoundary に伝播しない

```typescript
// src/client/queryClient.ts
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "./api.ts";
import { reportErrorToServer } from "./ErrorBoundary.tsx";

function reportIfApiError(error: Error) {
  if (error instanceof ApiError) {
    reportErrorToServer(error.message, error.stack, error.requestId ?? undefined);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: reportIfApiError,
  }),
  mutationCache: new MutationCache({
    onError: reportIfApiError,
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

**注意**: `reportErrorToServer` は raw `fetch` を使用しているため、Eden との循環依存は発生しない。

### Phase 1 完了基準

- [x] 4xx エラーでリトライが発生しないこと
- [x] 5xx エラーが ErrorBoundary まで伝播すること
- [x] mutation エラーが ErrorBoundary に伝播しないこと（`throwOnError: false`）
- [x] エラー発生時に `/api/errors` へ報告されること
- [x] 既存の動作が壊れないこと（手動テスト）

---

## Phase 2: useMutation hook 導入

各ドメインの `queries.ts` に mutation hook を co-locate する。

### Phase 2-1: tasks/queries.ts に mutation hook 追加

**ファイル**: `src/client/tasks/queries.ts`

- [x] `useActivateTask` を追加
- [x] `useCompleteTask` を追加
- [x] `useReopenTask` を追加
- [x] `usePinTask` を追加
- [x] `useUnpinTask` を追加
- [x] `useUpdateDescription` を追加
- [x] `useCreateTask` を追加

```typescript
// src/client/tasks/queries.ts に追加
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activateTask,
  completeTask,
  reopenTask,
  pinTask,
  unpinTask,
  updateTaskDescription,
  createTask,
} from "./api.ts";

export function useActivateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useReopenTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reopenTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function usePinTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pinTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useUnpinTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unpinTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useUpdateDescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      updateTaskDescription(id, description),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}
```

### Phase 2-2: sessions/queries.ts に mutation hook 追加

**ファイル**: `src/client/sessions/queries.ts`

- [x] `useStartSession` を追加

```typescript
// src/client/sessions/queries.ts に追加
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startSession } from "./api.ts";

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => startSession(taskId),
    onSettled: (_data, _error, taskId) => {
      return queryClient.invalidateQueries({
        queryKey: sessionQueries.byTask(taskId).queryKey,
      });
    },
  });
}
```

### Phase 2-3: attachments/queries.ts に mutation hook 追加

**ファイル**: `src/client/attachments/queries.ts`

- [x] `useUploadAttachment` を追加
- [x] `useDeleteAttachment` を追加

```typescript
// src/client/attachments/queries.ts に追加
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadAttachment, deleteAttachment } from "./api.ts";

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      uploadAttachment(taskId, file),
    onSettled: (_data, _error, variables) => {
      return queryClient.invalidateQueries({
        queryKey: attachmentQueries.byTask(variables.taskId).queryKey,
      });
    },
  });
}

export function useDeleteAttachment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSettled: () => {
      return queryClient.invalidateQueries({
        queryKey: attachmentQueries.byTask(taskId).queryKey,
      });
    },
  });
}
```

### Phase 2-4: projects/queries.ts に mutation hook 追加

**ファイル**: `src/client/projects/queries.ts`

- [x] `useCreateProject` を追加
- [x] `useDeleteProject` を追加

```typescript
// src/client/projects/queries.ts に追加
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProject, deleteProject } from "./api.ts";

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: projectQueries.all() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: projectQueries.all() });
    },
  });
}
```

### Phase 2-5: コンポーネントの移行

各コンポーネントの手動 mutation パターンを useMutation hook に置き換える。

#### `src/client/tasks/TaskInfoPanel.tsx`

- [x] `handleAction` ラッパーを削除
- [x] `handleStartSession` を削除
- [x] `handleDeleteAttachment` を削除
- [x] paste handler 内の `uploadAttachment` を `useUploadAttachment` に置き換え
- [x] `DescriptionEditor` の `onSaved` コールバックを削除し、`useUpdateDescription` に置き換え
- [x] 各ボタンに `disabled={mutation.isPending}` を追加
- [x] `queryClient` の直接使用を削除（mutation hook が invalidation を管理）

```tsx
// Before (TaskInfoPanel.tsx:153-166)
async function handleAction(action: () => Promise<unknown>) {
  await action();
  handleTaskUpdated();
}
async function handleStartSession() {
  await startSession(task.id);
  queryClient.invalidateQueries({ queryKey: sessionQueries.byTask(task.id).queryKey });
}

// After
const activateMutation = useActivateTask();
const completeMutation = useCompleteTask();
const startSessionMutation = useStartSession();
// ... etc

<button
  onClick={() => activateMutation.mutate(task.id)}
  disabled={activateMutation.isPending}
>
  Activate
</button>
```

#### `src/client/sessions/SessionChatPanel.tsx`

- [x] `handleStartSession` を `useStartSession` に置き換え
- [x] ボタンに `disabled={isPending}` を追加
- [x] `queryClient` の直接使用を削除

#### `src/client/tasks/CreateTaskModal.tsx`

- [x] `handleSubmit` を `useCreateTask` に置き換え
- [x] `mutateAsync` を使用（`navigate` のために戻り値が必要）
- [x] 送信ボタンに `disabled={isPending}` を追加
- [x] `queryClient` の直接使用を削除

```tsx
// Before (CreateTaskModal.tsx:42-55)
async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  requestNotificationPermission();
  const task = await createTask({ projectId, title, description: description || undefined });
  setTitle("");
  setDescription("");
  onClose();
  queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
  navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
}

// After
const createTaskMutation = useCreateTask();

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  requestNotificationPermission();
  const task = await createTaskMutation.mutateAsync({
    projectId,
    title,
    description: description || undefined,
  });
  setTitle("");
  setDescription("");
  onClose();
  navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
}
```

#### `src/client/projects/CreateProject.tsx`

- [x] `handleSubmit` を `useCreateProject` に置き換え
- [x] 送信ボタンに `disabled={isPending}` を追加
- [x] `queryClient` の直接使用を削除

#### `src/client/projects/ProjectManager.tsx`

- [x] `handleDelete` を `useDeleteProject` に置き換え
- [x] 削除ボタンに `disabled={isPending}` を追加
- [x] `queryClient` の直接使用を削除

### Phase 2 完了基準

- [x] `await action(); invalidateQueries()` パターンがコードベースに存在しない
- [x] 全 mutation ボタンに `disabled={isPending}` がある
- [x] `useQueryClient()` がコンポーネント内で `invalidateQueries` のためだけに使われていない（notification 用の `useEffect` 内は除く）
- [x] `onSettled` から `invalidateQueries` の Promise が return されている
- [x] 型チェックが通る
- [x] 既存の動作が壊れないこと（手動テスト）

---

## Phase 3: QueryErrorResetBoundary + ErrorBoundary 統合

**ファイル**: `src/client/ErrorBoundary.tsx`, `public/index.tsx`

### Phase 3-1: ErrorBoundary に `onReset` prop を追加

- [x] `Props` に `onReset?: () => void` を追加
- [x] 「再試行」ボタンで `onReset?.()` を呼んでから `setState({ error: null })` する

```tsx
// src/client/ErrorBoundary.tsx
interface Props {
  children: ReactNode;
  onReset?: () => void;
}

// render() 内の再試行ボタン
<button
  type="button"
  onClick={() => {
    this.props.onReset?.();
    this.setState({ error: null });
  }}
>
  再試行
</button>
```

### Phase 3-2: public/index.tsx に QueryErrorResetBoundary を追加

- [x] `QueryErrorResetBoundary` を import
- [x] provider ツリーに挿入: `QueryClientProvider > QueryErrorResetBoundary > ErrorBoundary > RouterProvider`

```tsx
// public/index.tsx
import { QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <RouterProvider router={router} />
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
```

### Phase 3 完了基準

- [x] 5xx エラー時に ErrorBoundary が表示される
- [x] 「再試行」ボタンクリックでクエリキャッシュがリセットされ、再フェッチが走る
- [x] 正常復帰後にアプリが正しく動作する
- [x] 型チェックが通る

---

## Acceptance Criteria

### Functional Requirements

- [x] 全 mutation ボタンが loading 中に disabled になる
- [x] mutation エラー時にユーザーに何らかのフィードバックがある（isPending の解除 = 暗黙的フィードバック、将来的に toast 追加可能）
- [x] 4xx エラーがリトライされない
- [x] 5xx エラーが ErrorBoundary に表示される
- [x] ErrorBoundary の「再試行」でクエリが再フェッチされる
- [x] 全 mutation のエラーが `/api/errors` に報告される

### Non-Functional Requirements

- [x] `await action(); invalidateQueries()` の手動パターンがゼロ
- [x] 型チェックが通る（`bun run typecheck`）
- [x] 既存テストが通る（`bun test`）

## Dependencies & Risks

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| クライアントテストがゼロ | mutation 移行の安全網がない | 各フェーズ完了後に手動テスト。動作確認項目: タスク作成、activate、complete、pin、セッション開始、添付ファイル貼り付け |
| `throwOnError` で意図しないクラッシュ | 5xx 以外のエラーが ErrorBoundary に到達する可能性 | `ApiError` 以外の unknown エラーは `true` を返す（安全側に倒す）。問題が出たら調整 |
| paste handler 内の mutation | `useEffect` 内で mutation hook の `mutate` を呼ぶ形になる | `mutate` は安定参照なので問題ない。ただし cleanup で pending mutation をキャンセルする必要はない（fire-and-forget） |

## References

### Internal References

- Brainstorm: `docs/brainstorms/2026-02-11-query-mutation-error-handling-brainstorm.md`
- Previous plan: `docs/plans/2026-02-10-refactor-eliminate-reinvented-wheels-plan.md`
- QueryClient: `src/client/queryClient.ts`
- ErrorBoundary: `src/client/ErrorBoundary.tsx`
- Entry point: `public/index.tsx`
- Task mutations (9 sites):
  - `src/client/tasks/TaskInfoPanel.tsx:149-171` (handleAction, handleStartSession, handleDeleteAttachment, paste upload, DescriptionEditor.handleSave)
  - `src/client/sessions/SessionChatPanel.tsx:59-62` (handleStartSession)
  - `src/client/tasks/CreateTaskModal.tsx:42-55` (handleSubmit)
  - `src/client/projects/CreateProject.tsx:13-25` (handleSubmit)
  - `src/client/projects/ProjectManager.tsx:12-15` (handleDelete)
- Query factories:
  - `src/client/tasks/queries.ts`
  - `src/client/sessions/queries.ts`
  - `src/client/attachments/queries.ts`
  - `src/client/projects/queries.ts`
- API functions:
  - `src/client/tasks/api.ts`
  - `src/client/sessions/api.ts`
  - `src/client/attachments/api.ts`
  - `src/client/projects/api.ts`

### External References

- [TanStack Query v5 - Mutations](https://tanstack.com/query/v5/docs/react/guides/mutations)
- [TanStack Query v5 - QueryCache](https://tanstack.com/query/v5/docs/react/reference/QueryCache)
- [TanStack Query v5 - MutationCache](https://tanstack.com/query/v5/docs/react/reference/MutationCache)
- [TanStack Query v5 - QueryErrorResetBoundary](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary)
- [TkDodo - Mutation Side Effects](https://tkdodo.eu/blog/mastering-mutations-in-react-query)

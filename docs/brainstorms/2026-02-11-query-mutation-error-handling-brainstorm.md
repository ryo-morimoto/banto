---
title: "TanStack Query: useMutation + エラーハンドリング強化"
date: 2026-02-11
status: decided
previous: docs/plans/2026-02-10-refactor-eliminate-reinvented-wheels-plan.md
---

# TanStack Query: useMutation + エラーハンドリング強化

## What We're Building

前回のリファクタリング（TanStack Query 導入、TanStack Router 導入、サーバー側修正）で deferred した 5 項目のうち、3 項目を実施する。

**やること:**

1. **useMutation 導入** — 全 mutation を useMutation 化し、isPending/isError を活用
2. **QueryClient エラーハンドリング強化** — QueryCache.onError、retry 抑制、throwOnError 設定
3. **QueryErrorResetBoundary** — ErrorBoundary と統合し、クエリエラーからの復帰を正しく動かす

**やらないこと:**

4. ~~logStore 最大エントリ制限~~ — `clear()` で 30 秒後にクリア済み。実用上問題なし
5. ~~SSE 書き換え（Elysia generator）~~ — 現在の ReadableStream 実装が最適解。複数レビュアーも削除推奨

## Why This Approach

### useMutation を全面導入する理由

- **二重クリック防止**: 現状、StartSession や CreateTask にガードなし。isPending で防止できる
- **mutation 単位のエラー表示**: 現状はグローバル ErrorBoundary に丸投げ。isError で個別表示可能
- **invalidation の正しいタイミング**: `onSettled` から `invalidateQueries` の Promise を return すると、isPending が invalidation 完了まで true を維持。UI のちらつき防止
- 行数は大きく変わらないが、宣言的になり意図が明確になる

### QueryClient 設定を強化する理由

- **4xx リトライ抑制**: 404 や 422 を 3 回リトライしても結果は同じ。無駄なリクエスト削減
- **5xx のみ ErrorBoundary 伝播**: サーバーエラーだけを致命的として扱い、4xx はコンポーネント内で処理
- **QueryCache.onError**: query 失敗時に requestId 付きでサーバー報告。window listener との重複は許容（requestId の有無で差別化）

### QueryErrorResetBoundary を入れる理由

- throwOnError で 5xx が ErrorBoundary に到達するようになる
- 現状の「再試行」ボタンは `setState({ error: null })` するだけで、クエリキャッシュはリセットしない
- QueryErrorResetBoundary で `reset()` を呼べば、キャッシュもリセットされ本当に再フェッチされる

## Key Decisions

### 1. useMutation の配置

queries.ts に co-locate する（計画通り）。ファイル名は変えない。

```
src/client/tasks/queries.ts      → useActivateTask, useCompleteTask, useReopenTask, usePinTask, useUnpinTask, useUpdateDescription, useCreateTask
src/client/sessions/queries.ts   → useStartSession
src/client/attachments/queries.ts → useUploadAttachment, useDeleteAttachment
src/client/projects/queries.ts   → useCreateProject
```

### 2. useMutation の共通パターン

```typescript
export function useActivateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}
```

- `onSettled`（onSuccess ではなく）で invalidate → 失敗時もキャッシュを最新化
- Promise を return → isPending が invalidation 完了まで true を維持
- `onError` は個別には設定しない。QueryCache.onError で一元化

### 3. QueryClient 設定

```typescript
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

### 4. ErrorBoundary 統合

```tsx
// public/index.tsx
<QueryClientProvider client={queryClient}>
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary onReset={reset}>
        <RouterProvider router={router} />
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
</QueryClientProvider>
```

ErrorBoundary に `onReset` prop を追加し、「再試行」ボタンで `reset()` を呼ぶ。

## Mutation 対象一覧

| コンポーネント | 操作 | mutation hook |
|---------------|------|---------------|
| TaskInfoPanel | Activate | useActivateTask |
| TaskInfoPanel | Complete | useCompleteTask |
| TaskInfoPanel | Reopen | useReopenTask |
| TaskInfoPanel | Pin/Unpin | usePinTask / useUnpinTask |
| TaskInfoPanel | 説明編集 | useUpdateDescription |
| TaskInfoPanel | Start Session | useStartSession |
| TaskInfoPanel | Delete Attachment | useDeleteAttachment |
| TaskInfoPanel | Upload (paste) | useUploadAttachment |
| CreateTaskModal | タスク作成 | useCreateTask |
| CreateProject | プロジェクト作成 | useCreateProject |

## Open Questions

- `useMutation` 内の `onError` で toast/snackbar を出すか？ → 現時点では不要。isError + error でコンポーネント内表示
- `MutationCache.onError` も設定するか？ → QueryCache.onError と同様に設定して一元化する方が一貫性あり

## Scope Outside

- logStore 最大エントリ制限（不要と判断）
- SSE 書き換え（不要と判断）
- クライアントテスト戦略（別途計画）
- タスクリスト単一エンドポイント化（ポーリング drift 未確認）

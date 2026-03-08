# ユーザーストーリー

リサーチで確認されたユーザーの実際の行動パターンに基づく。機能ベースではなく行動ベースで記述。

出典: `.z/research/` 内 18+ ファイルの HN/Reddit/ブログ/App Store レビューから抽出したユーザーフィードバック。

**原則**: ユーザーの管理単位は「タスク（目的）」。「セッション」はシステム内部概念であり、ストーリー内ではユーザー視点で「実行」と表現する。

---

## 分類軸

ユーザーの行動を **状況（いつ・どこで）** と **動機（なぜ）** で分類する。jot/throw/watch はプロダクトのメタファーであり、ユーザーの行動分類ではない。

| カテゴリ | ユーザーの状況 | 中心的な動機 |
|---------|-------------|------------|
| トリアージ | 画面を開いた瞬間 | 今何に注意を向けるべきか知りたい |
| 投入 | やることが決まった | 最小の手数でエージェントに仕事を始めさせたい |
| 監視 | エージェントが動いている間 | 安心して他のことをしたい。異常があれば即座に気づきたい |
| 介入 | エージェントが助けを求めている / 迷走している | 最小の認知コストで正しい方向に戻したい |
| レビュー | エージェントが終わった | 成果物を素早く評価して次のアクションを決めたい |
| 復旧 | 何かが壊れた | 作業の損失を最小化して続行したい |
| 振り返り | 落ち着いた時間 | コストと効果を把握したい |

---

## トリアージ（画面を開いた瞬間）

> "The biggest bottleneck in AI-assisted parallel development isn't the AI itself -- it's the human." — Marc Nuri
> "Of all the fields on the dashboard, context usage has been the best predictor of where to look next." — Marc Nuri

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| TR1 | ダッシュボードを開いたら 3 秒で全状況を把握したい | 朝起きて / 会議終わりに / 移動中に、並列で走っているタスクの今を知りたい | WHEN ダッシュボードを開く THEN 全プロジェクトのアクティブタスクが状態色（green/red/orange）+ エージェント名 + 経過時間付きで一覧表示される | P0 | marc-nuri, vde-monitor, learnings-cross-cutting |
| TR2 | 「注意が必要なもの」が最上部に来てほしい | 5 タスク中 1 つだけ権限待ちなら、それを見落としたくない | WHEN 権限待ち or 失敗のタスクがある THEN ピン留めタスクより上に「要対応」セクションが表示される | P0 | happy-coder, cmux, claude-code-first-party |
| TR3 | 詳細を開かなくてもカードだけで判断したい | ドリルダウンは認知コストが高い。カード上の情報で「放置 OK / 要対応」を判断したい | WHEN タスクカードを見る THEN ステータス、エージェント、経過時間、Git サマリー（完了時）がカード上に表示される | P0 | learnings-cross-cutting ("情報はリスト/カードビューに出す。ドリルダウンしない") |
| TR4 | スマホで朝チェックしたい | 通勤中にスマホでダッシュボードを見て、承認/却下だけ済ませたい | WHEN モバイルでダッシュボードを開く THEN タッチで操作可能なレイアウトで全状態が表示される | P1 | vde-monitor (Issue #16, #20), agentos, happy-coder |

---

## 投入（エージェントに仕事を始めさせる）

> "His setup is 'surprisingly vanilla' and Claude Code works great out of the box" — Boris Cherny
> "Step 1: Find highest impact task, plan it, fire off the agent, proceed to next task" — Towards Data Science

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| TH1 | タスクを書いてワンタップで投げたい | 思いついたアイデアを最小の摩擦でエージェントに渡したい。セットアップに時間をかけたくない | WHEN タイトル + 説明を入力して「Start」を押す THEN エージェント選択後に実行が開始される | P0 | DRAFT.md (core loop) |
| TH2 | エージェントを選びたい | タスクの性質（CC が得意 / Codex が得意）で使い分けたい | WHEN 実行開始時にエージェントを選ぶ THEN そのプロバイダーで起動する | P0 | architecture-decision (multi-agent) |
| TH3 | 前回失敗したタスクを修正して再投入したい | 失敗の原因を見て説明を書き直し、すぐ再実行したい | WHEN 失敗タスクの説明を編集して「Retry」を押す THEN 修正後のプロンプトで新しい実行が開始される | P1 | DRAFT.md (Scenario 1) |
| TH4 | プロジェクトをすぐ登録したい | 新しいリポジトリでエージェントを使い始めるときに、パス指定だけで完了したい | WHEN リポジトリパスを入力 THEN パス存在 + .git 確認後にプロジェクトが作成される | P1 | - |
| TH5 | 調査目的でエージェントを送りたい（scout） | コードを書かせず、問題の所在だけ調べさせたい。「どこが面倒か」の偵察 | WHEN タスク説明に調査意図を書いて Start THEN エージェントが実行され、結果をイベントログで確認できる | P1 | Simon Willison ("send out a scout"), user-workflows-multi-agent |

---

## 監視（エージェントが動いている間）

> "I can finally leave my terminal knowing my agents are working" — Happy Coder ユーザー
> "Mobile Claude Code isn't a replacement for focused desktop work, but it's a powerful extension that keeps you productive in moments that were previously dead time" — Happy Coder レビュー

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| MO1 | エージェントの生出力をリアルタイムで見たい | 何をやっているか分からないと不安。ターミナル出力を見ることで「大丈夫」と判断する | WHEN 実行中のタスクを開く THEN PTY 出力がリアルタイムでターミナルパネルに表示される（mode: "terminal" の場合） | P0 | marc-nuri (terminal relay), learnings-cross-cutting |
| MO2 | 構造化されたイベントログで経過を追いたい | ターミナルがないプロバイダーでも「今何してる」を知りたい。ツール使用、ファイル変更、エラーが時系列で見えるとよい | WHEN 実行中のタスクを開く THEN タイムラインにイベント（ツール使用、メッセージ、状態変化）が表示される | P0 | codex-cli (structured events), architecture-decision (dual-mode) |
| MO6 | エージェントが今どのファイルを触っているか知りたい | 完了まで待ってから diff を見るのではなく、リアルタイムで方向性を判断したい。black box は不安 | WHEN エージェントがファイル操作する THEN タイムラインにリアルタイムでファイルパスとアクション種別が表示される | P1 | user-workflows-multi-agent ("black box forcing users to wait", jarjoura CTO) |
| MO3 | 何かあったら通知が来てほしい | 画面を見ていない間も、権限待ち・完了・失敗を知りたい。特に権限待ちは即座に知りたい | WHEN タスクが完了/失敗/権限待ちになる THEN Push 通知が届く | P1 | happy-coder, cmux (notification rings), learnings-cross-cutting |
| MO4 | ページリロードなしで状態が更新されてほしい | F5 を押さないと更新されないのは使い物にならない | WHEN タスクの状態が変わる THEN ダッシュボードがリアルタイムに反映される | P0 | - (table stakes) |
| MO5 | WebSocket が切れても再接続で復帰したい | ネットワークが不安定でも、再接続したら最新状態が見えるべき | WHEN WS 切断→再接続 THEN 最新状態 + ターミナル ring buffer が replay される | P1 | marc-nuri (terminal relay), architecture-decision (D6) |

---

## 介入（エージェントの方向を修正する）

> "For complex tasks, I spend more time steering the agent than I would have spent writing the code myself" — Devin ユーザー（babysitting tax）
> "You must explicitly stop the task to give instructions" — OpenHands の制限に対する不満
> "Send out a scout. Hand the AI agent a task just to find out where the sticky bits are" — Josh Bleecher Snyder (Simon Willison 経由)

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| IN1 | 権限リクエストを構造化された形で見て承認/拒否したい | raw JSON を見せられても判断できない。「何を」「どのファイルに」実行するか分かる形で見たい | WHEN 権限リクエストが来る THEN ツール名・対象ファイル・引数が構造化表示され、Approve/Deny ボタンがある | P0 | happy-coder ("JSON directly displayed" は最悪の UX), architecture-decision (D5) |
| IN2 | 実行中のタスクにメッセージを送りたい | 「その方針じゃなくてこっちで」と途中で軌道修正したい。停止→再開は面倒すぎる | WHEN ターミナルモードでキー入力する THEN エージェントに送信される。WHEN 構造化モードでメッセージ送信 THEN sendMessage() が呼ばれる | P1 | openhands ("stop to instruct" 問題), learnings-cross-cutting |
| IN3 | 実行を停止したい | 明らかに間違った方向に進んでいるとき、即座に止めたい | WHEN 「Stop」を押す THEN プロセスが停止し、ステータスが更新される | P0 | - (table stakes) |
| IN4 | 「このタスク内は同種の権限を自動承認」したい | 同じツールの同じファイルへのアクセスを毎回承認するのは面倒 | WHEN 承認時に「Remember」をチェック THEN 現在の実行内の同種リクエストが自動承認される | P2 | architecture-decision (D5), learnings-cross-cutting |
| IN5 | エージェントが設計意図から逸れているのを早めに気づきたい | 長時間の実行でエージェントが「自分のやり方」に引き戻される。イベントログの変化パターンで察知したい | WHEN エージェントが spec と乖離した操作をしている THEN タイムラインのツール使用パターンから人間が判断できる | P2 | user-workflows-multi-agent ("agent drift / design intent erosion", daxfohl HN) |
| IN6 | 実行中にエージェントの行動モード（探索/開発）を切り替えたい | 探索フェーズが終わったら開発モードに切り替えたい。停止→再開は面倒 | WHEN S3 ステータスバーの Build/Plan トグルをクリック THEN エージェントのモードが即座に切り替わり、タイムラインに記録される | P1 | opencode ("Tab to switch agents is brilliant UX") |

---

## レビュー（成果物の評価）

> "Barely keeping up reviewing what one agent produces" — Claude Code Tasks ユーザー
> "Copilot makes writing code cheaper, but makes owning code more expensive" — HN ユーザー
> "The bottleneck is review speed, not generation speed" — Simon Willison
> "AI-authored PRs contain 1.7x more major issues than human PRs" — CodeRabbit (470 PRs 調査)
> "67.3% of AI-generated PRs get rejected" — LinearB

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| RE1 | 完了タスクの Git 差分を素早く確認したい | エージェントが何をしたか = コード変更。diff が最も重要なレビュー手段 | WHEN 完了タスクの diff を開く THEN 変更ファイル一覧 + 差分統計 + inline diff が表示される | P0 | learnings-cross-cutting (diff view is THE review primitive, 6 sources) |
| RE2 | カード上で diff サマリーを見たい | 詳細を開かずに「+42 -12, 3 files」で規模感を掴みたい | WHEN タスクカードを見る THEN 完了タスクの行数変更 + ファイル数が表示される | P0 | DRAFT.md (Scenario 2) |
| RE3 | トークン消費とコストを確認したい | 「$30 が 1 時間で溶けた」経験がある。コストが見えないと不安 | WHEN タスクの実行画面を開く THEN 入力/出力トークン数とコスト推計が表示される | P1 | openhands, amp, learnings-cross-cutting ("cost anxiety") |
| RE4 | 過去の実行履歴を見たい | 同じタスクで 3 回失敗した経緯を振り返りたい。何が変わったか | WHEN タスク詳細を開く THEN 過去の実行が時系列で一覧される | P1 | gob (job history enables analysis) |
| RE5 | レビュー前に変更サマリーを見たい | 全 diff を読む前に「何をしたか」の概要が欲しい。エージェントの最終メッセージや変更意図がまとまっていると助かる | WHEN 完了タスクの実行画面を開く THEN エージェントの最終サマリーメッセージ（あれば）+ 変更ファイル一覧が先頭に表示される | P1 | user-workflows-multi-agent ("reviewing code that lands on your desk out of nowhere is a lot of work" -- Simon Willison) |

---

## 復旧（何かが壊れた）

> "Claude Code compaction silently destroyed 4 hours of my work" — Medium 記事
> "Claude Code lost my 4-hour session" — DEV Community
> "Users lose sessions on reboot; 'Project Seems Abandoned' sentiment" — Claude Squad Issues

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| RC1 | サーバー再起動後に中断されたタスクが検知・通知されてほしい | 夜中にサーバーが再起動しても、朝開いたときに何が起きたか分かってほしい | WHEN サーバー再起動 THEN 中断されたタスクが検知され、ダッシュボードに通知が表示される | P0 | architecture-decision (D8), gob (daemon instance_id) |
| RC2 | resume 可能なエージェントは自動再開してほしい | CC の --resume、Codex の thread resume が使えるなら、手動で再開させたくない | WHEN resume 対応エージェントの中断タスクがある THEN 自動再開が試みられ、結果が通知される | P1 | architecture-decision (D8) |
| RC3 | ターミナルスクロールバックが crash しても残っていてほしい | ブラウザを閉じて開き直したとき、直前のターミナル出力が見えないと何が起きたか分からない | WHEN ブラウザ再接続 or セッション完了後 THEN スクロールバックが ring buffer / ディスクから復元される | P2 | architecture-decision (D4, D6), superset (scrollback persistence) |
| RC4 | コンテキスト圧縮が始まる前に知りたい | 圧縮で重要なコンテキストが失われるリスクがある。事前に知って Stop するか判断したい | WHEN エージェントがコンテキスト圧縮を開始 THEN 通知 + タイムラインに表示される | P1 | "Claude Code compaction silently destroyed 4 hours of my work" (DEV Community), CC PreCompact hook |

---

## 振り返り（コストと効果の把握）

> "$5, then $10, then $20 in single sessions that went by so fast" — Amp ユーザー
> "Users feel anxious about token costs" — learnings-cross-cutting

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| RF1 | プロジェクト/期間ごとの累計コストを見たい | 今月いくら使ったか把握したい。予算感覚を持ちたい | WHEN 設定 or ダッシュボードでコスト表示を見る THEN プロジェクト別・期間別のトークン/コスト集計が表示される | P2 | amp, openhands, learnings-cross-cutting |
| RF2 | どのタスクにどれだけ時間がかかったか知りたい | 「このタイプのタスクはエージェントに向いている/向いていない」を判断したい | WHEN タスク履歴を見る THEN 所要時間・試行回数が表示される | P2 | gob (statistics enable analysis) |

---

## 横断: プロジェクト・タスク管理

| ID | ストーリー | 動機 | 受け入れ基準 | 優先度 | 出典 |
|----|----------|------|------------|--------|------|
| PM1 | タスクをプロジェクト別にグルーピングして見たい | 3 プロジェクト × 各 2-3 タスクを混在させたくない | WHEN ダッシュボードを見る THEN タスクがプロジェクト別にグルーピングされている | P0 | DRAFT.md |
| PM2 | タスクをピン留めしたい | 重要なタスクを常に目に入る場所に置きたい | WHEN ピンをトグル THEN ダッシュボード上部に固定表示される | P1 | DRAFT.md |
| PM3 | 完了タスクを非表示にしたい | 終わったものが視界に入ると、注意力が分散する | WHEN フィルターで done を除外 THEN 完了タスクが一覧から消える | P1 | - |
| PM4 | タスクのステータスを手動変更したい | エージェントが done にしたが、自分のレビューが終わるまで active にしておきたい | WHEN ステータスを変更 THEN backlog / active / done が切り替わる | P1 | - |

---

## 優先度サマリー

| 優先度 | 意味 | ストーリー数 |
|--------|------|------------|
| P0 | コアループに必須。これがないと banto の存在意義がない | 14 |
| P1 | 実用上ほぼ必須。なくても動くが、ないと日常利用に支障がある | 18 |
| P2 | あると嬉しい。初期リリース後に追加可能 | 7 |

### P0 一覧（コアループ）

1. **TR1** 3 秒で全状況把握
2. **TR2** 要対応セクション最上部表示
3. **TR3** カードだけで判断
4. **TH1** ワンタップで投入
5. **TH2** エージェント選択
6. **MO1** ターミナルリアルタイム表示
7. **MO2** 構造化イベントログ
8. **MO4** リアルタイム更新
9. **IN1** 構造化された権限応答
10. **IN3** 実行停止
11. **RE1** Git diff 確認
12. **RE2** カード上 diff サマリー
13. **RC1** 中断タスク検知
14. **PM1** プロジェクト別グルーピング

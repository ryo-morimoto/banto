# libghostty C ABI Status

Date: 2026-03-06

## TL;DR

- **libghostty-vt (VT パーサー + 状態管理)**: Zig API はマージ済み。C API は開発中、一部公開済み
- **libghostty (レンダリング + GPU + フォント)**: 未公開。ロードマップ上
- **C ヘッダー**: `include/ghostty/vt/*.h` に存在。不完全・不安定
- **Rust バインディング**: gpui-ghostty プロジェクトが実用レベルで動作中
- **タグリリース**: 2025年9月「6ヶ月以内」→ 2026年Q1-Q2目標だが未リリース

## libghostty のレイヤー構成

```
libghostty (将来)
  ├─ libghostty-vt      ← 今ここ。VT パース + 状態管理
  ├─ libghostty-input   ← 将来。キーボードエンコーディング（一部 C API 公開済み）
  ├─ libghostty-render  ← 将来。GPU レンダリング (OpenGL/Metal/Vulkan)
  ├─ libghostty-font    ← 将来。フォント処理
  └─ libghostty-gtk     ← 将来。GTK ウィジェット / Swift フレームワーク
```

banto-term に必要なのは **全レイヤー**。現在公開されているのは VT 層のみ。

## C API 公開状況 (include/ghostty/vt/)

| ヘッダー | 内容 | 状態 |
|---|---|---|
| `vt.h` | アンブレラヘッダー | 公開済み |
| `vt/key.h` | キーイベント → エスケープシーケンス変換 | 最近公開 |
| `vt/key/codes.h` | GhosttyKey, GhosttyMods, GhosttyKeyAction 等 | 公開済み |
| `vt/osc.h` | OSC (Operating System Command) パーサー | 公開済み |
| `vt/sgr.h` | SGR (Select Graphic Rendition) パーサー | 公開済み |
| `vt/paste.h` | ペースト安全性検証 | 公開済み |
| `vt/color.h` | カラー定義 | 公開済み |
| `vt/allocator.h` | カスタムアロケーター | 公開済み |
| `vt/result.h` | エラーコード | 公開済み |
| `vt/wasm.h` | WASM ユーティリティ | 公開済み |

**未公開 (C API なし):**
- Screen / Grid API（画面状態の読み取り）
- Renderer API（GPU 描画）
- Font API（フォント処理）
- Terminal 全体の統合 API

公式警告: "This is an incomplete, work-in-progress API. It is not yet stable and is definitely going to change."

## 既存の実装例

### gpui-ghostty (Xuanwo)
https://github.com/Xuanwo/gpui-ghostty

Zed の GPUI 上で libghostty-vt を使ったターミナルビュー。最も進んだサードパーティ実装。

構成:
```
crates/
  ghostty_vt_sys/     # Zig ビルド + C ABI バインディング
  ghostty_vt/         # Safe Rust ラッパー
  gpui_ghostty_terminal/  # GPUI TerminalView
```

- Ghostty v1.2.3 を git submodule でベンダリング
- Zig 0.14.1 でビルド
- 動作例: basic_terminal, pty_terminal, split_pty_terminal
- IME、マウス、スクロールバック対応済み

### ghostty crate (crates.io)
https://crates.io/crates/ghostty

Rust バインディング。libghostty の不安定 API に追従。Zig コンパイラ必須。

### その他コミュニティプロジェクト
- restty: Web ターミナル (libghostty-vt + WebGPU)
- dotty: .NET ターミナル
- spectty: iOS SSH クライアント (Metal + libghostty-vt)
- vscode-bootty: VS Code ターミナル拡張 (WASM)
- electron-libghostty: Electron シェル
- fantastty: macOS ターミナル (libghostty + セッション管理)
- libghostty (Dart): Dart FFI バインディング

## banto-term への影響

### 今すぐできること

**gpui-ghostty のアプローチを参考にする:**
1. Ghostty を submodule でベンダリング
2. `ghostty_vt_sys` crate で C ABI をビルド
3. Safe Rust ラッパーを作る
4. 自前の UI フレームワーク (Tauri / winit / GPUI) 上でレンダリング

ただしレンダリングは libghostty からは提供されない。自前で実装が必要。
gpui-ghostty は GPUI のレンダラーを使っている。

### 課題: レンダリング層がない

libghostty-vt は「VT パース + 状態」のみ。画面にピクセルを描くのは別問題。

```
PTY 出力 → [libghostty-vt: パース] → Screen State (セルグリッド)
                                           ↓
                                    ??? レンダラーが必要 ???
                                           ↓
                                    画面表示
```

レンダリングの選択肢:
1. **GPUI** (Zed のフレームワーク) — gpui-ghostty が実証済み。ただしモバイルなし
2. **wgpu** (Rust WebGPU) — クロスプラットフォーム GPU。Tauri と組み合わせ可能
3. **自前 OpenGL/Metal** — 最高性能だがコスト大
4. **Canvas 2D (Web)** — WASM 経由で libghostty-vt を使い、Canvas に描画
5. **Ghostty の renderer を流用** — C API 未公開。将来的に可能性あり

### 現実的なパス

```
短期 (Phase 3 開始時):
  gpui-ghostty の ghostty_vt_sys + ghostty_vt crate をフォーク
  → wgpu + winit (or Tauri) 上に簡易レンダラーを自作
  → デスクトップで動作確認

中期:
  タッチジェスチャー追加
  Tauri 2 でモバイルパッケージング

長期 (libghostty-render 公開後):
  自前レンダラーを libghostty-render に置き換え
```

### 代替パス: alacritty_terminal

libghostty のレンダリング API 待ちが長引く場合:
- `alacritty_terminal` crate は VT パース + 状態 + 検索 + グリッド管理を提供
- レンダリングは自前だが、Alacritty 本体のコードが参考になる
- API は安定している（Alacritty が数年使用）
- libghostty-render が公開されたら乗り換え可能

## タイムライン予測

| 時期 | libghostty 状態 | banto-term 戦略 |
|---|---|---|
| 2026 Q1 (now) | vt C API 開発中、不安定 | gpui-ghostty 参考に Rust ラッパー作成 |
| 2026 Q2 | vt C API タグリリース（予定） | VT 層を公式 API に移行 |
| 2026 H2 | input/render API 開発開始（推測） | 自前レンダラーで運用 |
| 2027+ | render API 公開（推測） | libghostty-render に移行 |

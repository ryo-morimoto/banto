# Browser Terminal Options for banto

Date: 2026-03-06
Goal: libghostty をブラウザで使い、ghostty-web よりハイパフォーマンス・ロウレイテンシ・超安定にする

## 候補一覧

### 1. ghostty-web (Coder)

https://github.com/coder/ghostty-web

- Ghostty の VT エンジンを WASM コンパイル
- xterm.js ドロップイン互換 API
- ~400KB WASM バンドル
- **レンダラー: Canvas (dirty-row 方式)**
- Zig + Bun でビルド
- Ghostty に最小パッチを当てて公開

**問題点:**
- レンダリングが Canvas ベース。per-row line grabbing が遅いと指摘あり
- WebGPU 未使用 → GPU アクセラレーションなし
- ghostty-web 固有のパッチに依存。libghostty の API 変更に追従が必要
- 安定性の実績が浅い（早期プロジェクト）
- banto v1 で使用済み → IME・リサイズの問題を経験済み

### 2. restty (wiedymi)

https://github.com/wiedymi/restty

- libghostty-vt (WASM) + WebGPU + text-shaper
- xterm.js 互換シム（部分的）
- **レンダラー: WebGPU (WebGL2 フォールバック)**
- カスタムシェーダー対応（ポストプロセス）
- マルチペイン対応
- タッチ対応（pan-first scrolling）
- Bun でビルド

**利点:**
- WebGPU レンダリング → GPU アクセラレーション
- libghostty-vt の WASM を直接使用（ghostty-web のパッチ不要）
- タッチ対応が組み込み
- テーマ 40+ (Ghostty フォーマット互換)
- プラグインシステム

**問題点:**
- 早期リリース（2026年2月公開）
- Kitty image protocol が不安定
- xterm.js 互換が不完全（buffer/parser/marker 未実装）
- text-shaper の実装詳細が不明

### 3. 自前実装 (libghostty-vt WASM + WebGPU)

libghostty-vt を直接 WASM ビルドし、WebGPU レンダラーを自作。

**利点:**
- 完全制御。banto に最適化可能
- 不要な機能を削れる（マルチペイン等不要）
- タッチジェスチャーを自由設計

**問題点:**
- レンダラー実装コストが大きい（フォントシェーピング、セルグリッド、カーソル、選択範囲）
- text-shaper 相当を自前で作るか依存が必要
- libghostty-vt の WASM ビルド手順を自前で整備

### 4. MoonBit で VT + レンダラーを書く

MoonBit は WASM 最適化言語。VT パーサー + レンダラーを MoonBit で書く。

**利点:**
- WASM バンドルサイズが極小（Rust/Zig より小さい）
- GC ありで生産性が高い
- WASM-first 設計なのでブラウザ統合が自然

**問題点:**
- libghostty を使わない（VT パーサーを自前で書く or 別の方法で統合）
- MoonBit から Zig/C ライブラリを FFI で呼ぶのは現状困難
- MoonBit 自体がベータ（1.0 は 2026年予定）
- ターミナルエミュレーション品質が libghostty に劣る可能性

### 5. MoonBit レンダラー + libghostty-vt WASM パーサー

ハイブリッド: VT パースは libghostty-vt (WASM)、レンダリングは MoonBit (WASM) で書く。

**利点:**
- VT パース品質は libghostty 由来（実績あり）
- レンダラーは MoonBit の WASM 最適化の恩恵
- バンドルサイズ最小化

**問題点:**
- 2つの WASM モジュール間通信のオーバーヘッド
- MoonBit ↔ libghostty-vt のデータ受け渡し設計が複雑
- 両方のビルドパイプラインを管理

## 比較マトリクス

| | ghostty-web | restty | 自前実装 | MoonBit 全部 | MoonBit + libghostty |
|---|---|---|---|---|---|
| VT パーサー | Ghostty WASM | libghostty-vt WASM | libghostty-vt WASM | MoonBit 自前 | libghostty-vt WASM |
| レンダラー | Canvas | WebGPU | WebGPU (自前) | MoonBit + Canvas/WebGPU | MoonBit + WebGPU |
| GPU アクセラレーション | No | Yes | Yes | 可能 | 可能 |
| WASM サイズ | ~400KB | 不明 | 小 | 極小 | 中 |
| タッチ対応 | なし | あり | 自由 | 自由 | 自由 |
| xterm.js 互換 | ドロップイン | 部分的 | なし | なし | なし |
| 実装コスト | 低 (npm install) | 低 (npm install) | 高 | 最高 | 高 |
| VT 品質 | Ghostty 級 | Ghostty 級 | Ghostty 級 | 不明 | Ghostty 級 |
| 安定性 | 低 (早期) | 低 (早期) | 自分次第 | 低 (ベータ言語) | 低 |
| 将来性 | libghostty 成熟で改善 | libghostty 成熟で改善 | 同左 | MoonBit 成熟で改善 | 両方 |

## ghostty-web の具体的な問題点

banto v1 で経験した問題:
1. **IME 合成**: ghostty-web は IME を適切にハンドルしない → 自前で ime-controller.ts を書いた
2. **リサイズ**: FitAddon 相当を自前実装する必要があった
3. **ANSI カラー**: 明示的にテーマを渡す必要があった
4. **入力ブリッジ**: compositionstart/update/end を手動でハンドル

これらは ghostty-web のレンダリング品質の問題ではなく、
ブラウザ統合レイヤー（入力、リサイズ、IME）の未成熟さが原因。

## restty が ghostty-web より優れる理由

1. **WebGPU レンダリング**: Canvas の dirty-row 方式より高速
2. **タッチ対応**: pan-first scrolling、タッチ選択モード
3. **IME 対応**: hidden IME input を自動生成
4. **libghostty-vt 直接使用**: ghostty-web のパッチ層不要
5. **プラグインシステム**: カスタマイズ可能

## 推奨パス

### 短期: restty を採用

理由:
- libghostty-vt + WebGPU + タッチ対応が揃っている
- npm パッケージとして利用可能
- banto が必要とする機能（PTY WebSocket 接続、タッチ操作）がほぼそのまま
- ghostty-web で経験した IME・リサイズ問題を回避できる可能性

リスク:
- 早期プロジェクト。API が変わる可能性
- 本番品質に達していない可能性

### 中期: restty をフォーク / コントリビュート

banto 固有の要件:
- セッション切り替え（複数セッションを1つのターミナルビューで）
- ダッシュボードとの統合（ステータス表示のオーバーレイ）
- 接続断時の再接続 + replay buffer
→ restty にコントリビュートするか、必要に応じてフォーク

### 長期: libghostty 成熟後

libghostty-render が公開されたら、restty の text-shaper + WebGPU レンダラーを
libghostty-render の WASM ビルドに置き換え。
→ Ghostty ネイティブと同等のレンダリング品質をブラウザで実現

### MoonBit の位置づけ

レンダラーを MoonBit で書く選択肢は魅力的だが、現時点では:
- VT パースは libghostty-vt が圧倒的に品質が高い（fuzz テスト済み、実績あり）
- レンダラーだけ MoonBit で書くメリットが WASM サイズ削減のみ
- restty の WebGPU レンダラーが既にある

MoonBit が 1.0 になり、WASM Component Model で libghostty-vt と組み合わせが
容易になったら再検討する価値がある。

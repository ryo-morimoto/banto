# 運用設計

## スコープ

デプロイ、ランタイム環境、監視、更新戦略。banto が NixOS ミニ PC 上で本番稼働する際の運用面。

## 成果物

| ファイル | 内容 | 状態 |
|---------|------|------|
| `deployment.md` | Nix flake / systemd サービス定義、ビルドプロセス、環境構築 | - |
| `monitoring.md` | ヘルスチェック、ログ戦略、エラー通知（ローカル） | - |
| `update-strategy.md` | banto 自体の更新方法、v1 → v2 マイグレーションパス | - |
| `backup-recovery.md` | SQLite バックアップ、セッションデータ保持、障害復旧 | - |

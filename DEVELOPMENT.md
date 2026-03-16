# 開発フロー & GitHub 連携ガイド

このドキュメントでは、GitHub リポジトリ (`MEO-collect/collect`) を使って外部エディタや別の AI で変更したコードを Manus アプリに反映する手順を説明します。

---

## 全体の流れ

```
外部エディタ / 別のAI
       ↓ コード変更
GitHub (MEO-collect/collect) の main ブランチ
       ↓ Manus でコードを取り込む
Manus のプロジェクト (btob-ai-platform)
       ↓ Publish ボタン
本番アプリ (collect-ai.manus.space)
```

---

## 1. 外部で変更する方法

### ローカルで作業する場合

```bash
# リポジトリをクローン
git clone https://github.com/MEO-collect/collect.git
cd collect

# ブランチを作成して作業
git checkout -b feature/my-change

# 変更後にコミット & プッシュ
git add .
git commit -m "変更内容の説明"
git push origin feature/my-change

# GitHub でプルリクエストを作成して main にマージ
```

### 別の AI (Cursor / GitHub Copilot / Claude など) で作業する場合

1. `git clone https://github.com/MEO-collect/collect.git` でリポジトリを取得
2. AI に変更を依頼してコードを編集
3. `git push origin main` で GitHub にプッシュ

---

## 2. GitHub の変更を Manus アプリに反映する

Manus は現在、**GitHub からの自動デプロイ（CI/CD）には対応していません**。
変更を反映するには、以下の手順で Manus に取り込みます。

### 手順（Manus チャットで依頼する）

Manus のチャットに以下のように入力してください：

```
GitHub (MEO-collect/collect) の最新コードを取り込んで、アプリに反映してください。
```

Manus が以下を自動実行します：
1. GitHub から最新コードを `git pull`
2. 差分を確認・適用
3. テストを実行
4. チェックポイントを保存
5. Publish ボタンが押せる状態にする

### 手動で取り込む場合（上級者向け）

```bash
# Manus のサンドボックス内で実行
cd /home/ubuntu/btob-ai-platform
git fetch github
git merge github/main
pnpm install
pnpm test
```

---

## 3. ファイル構成（変更してよい場所）

```
client/src/pages/      ← 各機能のUI（変更OK）
client/src/components/ ← 共通UIコンポーネント（変更OK）
server/routers/        ← APIエンドポイント（変更OK）
drizzle/schema.ts      ← DBスキーマ（変更後にpnpm db:pushが必要）
server/db.ts           ← DBクエリ（変更OK）
```

**変更しないでください：**
- `server/_core/` — フレームワーク内部
- `.env` — 環境変数（Manus の Settings から管理）

---

## 4. 環境変数について

環境変数（APIキー、DB接続情報など）は `.env` ファイルには書かず、
Manus の **Settings → Secrets** から管理してください。
コードでは `process.env.VARIABLE_NAME` で参照できます。

---

## 5. DBスキーマを変更した場合

`drizzle/schema.ts` を変更した場合は、Manus チャットで以下を依頼してください：

```
drizzle/schema.ts を変更しました。DBマイグレーションを実行してください。
```

または、Manus サンドボックス内で：

```bash
cd /home/ubuntu/btob-ai-platform
pnpm db:push
```

---

## 6. テスト

```bash
# 全テスト実行
pnpm test

# 特定のテストファイルのみ
pnpm vitest run server/voice.test.ts
```

---

## リポジトリ情報

| 項目 | 値 |
|------|-----|
| GitHub リポジトリ | https://github.com/MEO-collect/collect |
| 本番 URL | https://collect-ai.manus.space |
| 開発 URL | Manus プレビューパネルで確認 |
| メインブランチ | `main` |

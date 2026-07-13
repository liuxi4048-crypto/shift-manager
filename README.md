# シフト管理アプリ（shift-manager）

スタッフのシフトを月間カレンダーで管理するシングルページアプリ。
React + Vite 製で、データはブラウザの localStorage に自動保存される（サーバー不要）。

## 機能

- **スタッフ管理**: 追加・名前変更・削除（色は自動割り当て）
- **シフト種別管理**: 早番・遅番・夜勤・休みをデフォルト搭載。任意の種別（名前・時間帯）を追加可能
  - 日をまたぐ夜勤（例: 22:00〜07:00）も正しく9時間として計算
  - 開始=終了の種別は「休み」などの0時間枠として扱う
- **月間カレンダー**: 日付をクリックして、スタッフ×シフト種別のトグルで割り当て
- **月次集計**: スタッフ別の勤務日数・合計時間・種別ごとの回数を自動集計
- **CSV出力**: 表示中の月のシフト表を Excel で開ける CSV（BOM付きUTF-8）でダウンロード
- **自動保存**: 変更は即座に localStorage に保存
- **PWA対応**: スマホのホーム画面に追加してアプリのように起動可能
- **Googleログイン**（任意）: 指定したメールアドレスのGoogleアカウントのみ利用を許可
- **シフト希望の取り込み**（任意）: Googleスプレッドシートに集めたシフト希望をGAS経由で読み込み、カレンダー上に参考表示

## 開発

```bash
npm install
npm run dev      # 開発サーバー起動
npm test         # ユニットテスト（vitest）
npm run build    # 本番ビルド（dist/）
```

## 構成

```
src/
  App.jsx                  # 状態管理・レイアウト
  components/
    Calendar.jsx           # 月間カレンダー表示
    DayEditor.jsx          # 選択日の割り当て編集
    StaffPanel.jsx         # スタッフ管理
    ShiftTypePanel.jsx     # シフト種別管理
    SummaryPanel.jsx       # 月次集計
    ShiftRequestsPanel.jsx # シフト希望の取り込みボタン
    LoginGate.jsx          # Googleログインゲート
  utils/
    date.js                # カレンダー計算（テスト付き）
    stats.js               # 勤務時間集計・CSV生成（テスト付き）
    storage.js             # localStorage 永続化
    auth.js                # Googleログインのトークン処理（テスト付き）
    requests.js            # シフト希望データの整形・GAS呼び出し（テスト付き）
gas/
  Code.gs                  # スプレッドシートを公開するGAS Web App（別途デプロイ）
```

## データ形式

```js
{
  staff: [{ id, name, color }],
  shiftTypes: [{ id, name, short, start, end, color }],
  assignments: { "YYYY-MM-DD": [{ staffId, shiftTypeId }] }
}
```

## Googleログイン・スプレッドシート連携のセットアップ（任意）

未設定のままでも通常のシフト管理アプリとして動作する。以下は「スタッフのシフト希望をスプレッドシートで集め、ログインしたスタッフ・管理者だけがアプリで参照できる」ようにする場合の手順。

### 1. シフト希望を集めるスプレッドシートを用意する

Google フォームなどでシフト希望を集め、1シート目（または任意のシート）に以下の列を持たせる：

| タイムスタンプ | 氏名 | 対象日 | 希望シフト | 備考 |
|---|---|---|---|---|

- シート名は `シフト希望`（`gas/Code.gs` の `SHEET_NAME` で変更可能）
- 「対象日」は日付型のセルにする

### 2. GAS Web App をデプロイする

1. スプレッドシートを開き、拡張機能 > Apps Script
2. `gas/Code.gs` の内容をそのまま貼り付け
3. プロジェクトの設定 > スクリプト プロパティ で `ACCESS_TOKEN` に推測されにくい文字列を設定
4. デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
   - 実行するユーザー: 自分
   - アクセスできるユーザー: 全員
5. 発行された URL を控える

### 3. Google ログイン用の OAuth クライアントIDを発行する

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存のものを使用）
2. 「APIとサービス」>「OAuth同意画面」を設定（社内利用なら「内部」、外部の場合はテストユーザー登録）
3. 「認証情報」>「認証情報を作成」>「OAuthクライアントID」、種類は「ウェブアプリケーション」
4. 「承認済みのJavaScript生成元」に、アプリを公開するURL（例: `https://your-app.vercel.app`、開発時は `http://localhost:5173`）を追加
5. 発行されたクライアントIDを控える

### 4. 環境変数を設定する

`.env.example` を `.env` にコピーし、上記で控えた値を設定する：

```bash
cp .env.example .env
```

```
VITE_GOOGLE_CLIENT_ID=（手順3のクライアントID）
VITE_ALLOWED_STAFF_EMAILS=staff1@example.com,staff2@example.com
VITE_GAS_ENDPOINT_URL=（手順2のURL）
VITE_GAS_ACCESS_TOKEN=（手順2で設定したACCESS_TOKENと同じ値）
```

設定後は開発サーバーを再起動する（`npm run dev`）。サイドバーの「シフト希望の取り込み」ボタンで、表示中の月のシフト希望をカレンダーに反映できる。

### セキュリティに関する注意

- このアプリはサーバーを持たない静的サイトのため、`VITE_ALLOWED_STAFF_EMAILS` によるログイン制限はブラウザの開発者ツールで回避され得る「簡易的な目隠し」であり、機密情報の保護には使えない。
- GAS の `ACCESS_TOKEN` も同様にクライアントのコード上に含まれるため、真の秘密情報としては扱えない。第三者に知られた場合は Apps Script のスクリプトプロパティで値を再発行すること。
- `ACCESS_TOKEN` は URL のクエリパラメータとして送信されるため、第三者への漏洩の有無にかかわらず、GAS の「実行数」画面にリクエストURL（トークンを含む）が呼び出しのたびに記録され続ける。より高い機密性が必要な場合は、定期的なトークンのローテーションを検討すること。
- 本格的な認可・監査が必要な規模になった場合は、サーバーサイドでトークンを検証するバックエンドの追加を検討する。

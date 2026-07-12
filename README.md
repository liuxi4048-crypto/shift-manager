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

## 開発

```bash
cd application/shift-manager
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
  utils/
    date.js                # カレンダー計算（テスト付き）
    stats.js               # 勤務時間集計・CSV生成（テスト付き）
    storage.js             # localStorage 永続化
```

## データ形式

```js
{
  staff: [{ id, name, color }],
  shiftTypes: [{ id, name, short, start, end, color }],
  assignments: { "YYYY-MM-DD": [{ staffId, shiftTypeId }] }
}
```

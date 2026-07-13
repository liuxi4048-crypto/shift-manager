/**
 * シフト管理アプリ用 GAS Web App（読み取り専用）
 *
 * スプレッドシートの「シフト希望」シートを JSON API として公開する。
 * シートの1行目はヘッダーとし、以下の列名を含むこと（順不同）:
 *   タイムスタンプ / 氏名 / 対象日 / 希望シフト / 備考
 *
 * デプロイ方法:
 *   1. 対象スプレッドシートを開き、拡張機能 > Apps Script
 *   2. このファイルの内容を貼り付け
 *   3. スクリプトプロパティに ACCESS_TOKEN を設定（任意の推測されにくい文字列）
 *      （プロジェクトの設定 > スクリプト プロパティ）
 *   4. デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
 *      - 実行するユーザー: 自分
 *      - アクセスできるユーザー: 全員
 *   5. 発行された URL を、アプリの環境変数 VITE_GAS_ENDPOINT_URL に設定
 *   6. ACCESS_TOKEN を、アプリの環境変数 VITE_GAS_ACCESS_TOKEN に設定
 */

const SHEET_NAME = 'シフト希望';

function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!token || e.parameter.token !== token) {
    return jsonResponse({ error: 'unauthorized' });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ error: `シート「${SHEET_NAME}」が見つかりません` });
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return jsonResponse({ requests: [] });
  }

  const header = values[0].map((h) => String(h).trim());
  const col = (name) => header.indexOf(name);
  const idxTimestamp = col('タイムスタンプ');
  const idxName = col('氏名');
  const idxDate = col('対象日');
  const idxShift = col('希望シフト');
  const idxNote = col('備考');

  const requests = values.slice(1)
    .filter((row) => row[idxName] && row[idxDate])
    .map((row) => ({
      timestamp: idxTimestamp >= 0 ? formatDate(row[idxTimestamp]) : null,
      name: String(row[idxName]).trim(),
      date: formatDate(row[idxDate]),
      shift: idxShift >= 0 ? String(row[idxShift]).trim() : '',
      note: idxNote >= 0 ? String(row[idxNote]).trim() : '',
    }));

  const month = e.parameter.month; // "YYYY-MM" 指定があれば絞り込む
  const filtered = month ? requests.filter((r) => r.date && r.date.startsWith(month)) : requests;

  return jsonResponse({ requests: filtered });
}

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

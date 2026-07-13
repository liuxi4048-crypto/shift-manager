/**
 * シフト管理アプリ用 GAS Web App
 *
 * スタッフ・シフト種別・確定シフトをスプレッドシートに保存し、
 * アプリからの読み込み（GET）・保存（POST）を仲介する。
 * 「シフト希望」シートは読み取り専用のまま（別途フォーム等で収集）。
 *
 * 管理対象シート（初回保存時に自動作成される。手動で作る必要はない）:
 *   スタッフ:     id / 名前 / 色
 *   シフト種別:   id / 名前 / 略称 / 開始 / 終了 / 色
 *   シフト表:     日付 / スタッフID / シフト種別ID
 * 読み取り専用シート（あらかじめ用意しておくこと。1行目はヘッダー）:
 *   シフト希望:   タイムスタンプ / 氏名 / 対象日 / 希望シフト / 備考
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

const REQUESTS_SHEET = 'シフト希望';
const STAFF_SHEET = 'スタッフ';
const SHIFT_TYPES_SHEET = 'シフト種別';
const ASSIGNMENTS_SHEET = 'シフト表';

function doGet(e) {
  // Apps Script エディタから doGet を手動実行した場合、e は undefined になる
  const params = (e && e.parameter) || {};

  if (!checkToken(params.token)) {
    return jsonResponse({ error: 'unauthorized' });
  }

  const action = params.action || 'state';
  if (action === 'requests') {
    return jsonResponse({ requests: readRequests(params.month) });
  }
  if (action === 'state') {
    return jsonResponse(readState());
  }
  return jsonResponse({ error: `不明な action です: ${action}` });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'リクエストの形式が不正です' });
  }

  if (!checkToken(body.token)) {
    return jsonResponse({ error: 'unauthorized' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ error: '他の保存処理と競合しました。しばらくしてから再度お試しください' });
  }
  try {
    writeState(body);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function checkToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  return Boolean(expected) && token === expected;
}

// ---- 読み込み ----

function readState() {
  return {
    staff: readStaffSheet(),
    shiftTypes: readShiftTypesSheet(),
    assignments: readAssignmentsSheet(),
  };
}

function readStaffSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      id: String(row[0]),
      name: String(row[1] || ''),
      color: String(row[2] || ''),
    }));
}

function readShiftTypesSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHIFT_TYPES_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const tz = Session.getScriptTimeZone();
  return values.slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      id: String(row[0]),
      name: String(row[1] || ''),
      short: String(row[2] || ''),
      start: formatTimeCell(row[3], tz),
      end: formatTimeCell(row[4], tz),
      color: String(row[5] || ''),
    }));
}

function readAssignmentsSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSIGNMENTS_SHEET);
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const assignments = {};
  values.slice(1).forEach((row) => {
    const dateKey = formatDate(row[0], tz);
    const staffId = String(row[1] || '');
    const shiftTypeId = String(row[2] || '');
    if (!dateKey || !staffId || !shiftTypeId) return;
    if (!assignments[dateKey]) assignments[dateKey] = [];
    assignments[dateKey].push({ staffId, shiftTypeId });
  });
  return assignments;
}

function readRequests(month) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map((h) => String(h).trim());
  const col = (name) => header.indexOf(name);
  const idxTimestamp = col('タイムスタンプ');
  const idxName = col('氏名');
  const idxDate = col('対象日');
  const idxShift = col('希望シフト');
  const idxNote = col('備考');

  if (idxName < 0 || idxDate < 0) return [];

  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  const requests = values.slice(1)
    .filter((row) => row[idxName] && row[idxDate])
    .map((row) => ({
      timestamp: idxTimestamp >= 0 ? formatDate(row[idxTimestamp], tz) : null,
      name: String(row[idxName]).trim(),
      date: formatDate(row[idxDate], tz),
      shift: idxShift >= 0 ? String(row[idxShift]).trim() : '',
      note: idxNote >= 0 ? String(row[idxNote]).trim() : '',
    }));

  return month ? requests.filter((r) => r.date && r.date.startsWith(month)) : requests;
}

// ---- 書き込み（全件上書き） ----

function writeState(body) {
  writeStaffSheet(Array.isArray(body.staff) ? body.staff : []);
  writeShiftTypesSheet(Array.isArray(body.shiftTypes) ? body.shiftTypes : []);
  writeAssignmentsSheet(body.assignments && typeof body.assignments === 'object' ? body.assignments : {});
}

function writeStaffSheet(staff) {
  const sheet = getOrCreateSheet(STAFF_SHEET, ['id', '名前', '色']);
  clearDataRows(sheet);
  if (staff.length === 0) return;
  const rows = staff.map((s) => [s.id, s.name, s.color]);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function writeShiftTypesSheet(shiftTypes) {
  const sheet = getOrCreateSheet(SHIFT_TYPES_SHEET, ['id', '名前', '略称', '開始', '終了', '色']);
  clearDataRows(sheet);
  if (shiftTypes.length === 0) return;
  const rows = shiftTypes.map((t) => [t.id, t.name, t.short, t.start, t.end, t.color]);
  const range = sheet.getRange(2, 1, rows.length, 6);
  range.setNumberFormat('@'); // 開始/終了(07:00等)が時刻型に自動変換されるのを防ぐ
  range.setValues(rows);
}

function writeAssignmentsSheet(assignments) {
  const sheet = getOrCreateSheet(ASSIGNMENTS_SHEET, ['日付', 'スタッフID', 'シフト種別ID']);
  clearDataRows(sheet);
  const rows = [];
  Object.keys(assignments).forEach((dateKey) => {
    (assignments[dateKey] || []).forEach((entry) => {
      rows.push([dateKey, entry.staffId, entry.shiftTypeId]);
    });
  });
  if (rows.length === 0) return;
  const range = sheet.getRange(2, 1, rows.length, 3);
  range.setNumberFormat('@'); // 日付列が日付型に自動変換されるのを防ぐ
  range.setValues(rows);
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function clearDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 1)).clearContent();
  }
}

// ---- 共通ヘルパー ----

function formatDate(value, tz) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function formatTimeCell(value, tz) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, 'HH:mm');
  }
  return String(value || '');
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

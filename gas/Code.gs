/**
 * シフト管理アプリ用 GAS Web App
 *
 * スタッフ・シフト種別・確定シフト・希望休・店舗をスプレッドシートに保存し、
 * アプリからの読み込み（GET）・保存（POST）を仲介する。
 * 「シフト希望」シートは読み取り専用のまま（別途フォーム等で収集する参考情報）。
 *
 * 管理対象シート（初回保存時に自動作成される。手動で作る必要はない）:
 *   スタッフ:     id / 名前 / 色 / メールアドレス / 役割（管理者 or バイト） / 店舗ID
 *   シフト種別:   id / 名前 / 略称 / 開始 / 終了 / 色（全店舗共通）
 *   シフト表:     日付 / スタッフID / シフト種別ID
 *   希望休:       id / スタッフID / 対象日 / 理由 / ステータス / 申請日時 / 処理日時
 *                 ステータスは pending / approved / rejected / cancelled のいずれか
 *   店舗:         id / 店舗名
 * 読み取り専用シート（あらかじめ用意しておくこと。1行目はヘッダー）:
 *   シフト希望:   タイムスタンプ / 氏名 / 対象日 / 希望シフト / 備考
 *
 * 役割（管理者/バイト）は「スタッフ」シートの「メールアドレス」列と、
 * アプリにGoogleログインしたアカウントのメールアドレスを突き合わせて判定する。
 * スタッフ一覧に登録されていないアカウントでログインした場合は、
 * どちらの役割にも該当しないため利用できない。
 *
 * 複数店舗運用について:
 *   「店舗」シートに店舗を登録すると、スタッフごとに「店舗ID」を割り当てられる。
 *   店舗IDが未設定の管理者は「本部管理者」として全店舗を切り替えながら閲覧・管理できる。
 *   店舗IDを設定した管理者・バイトは自分の店舗のデータのみを見る。
 *   シフト種別は店舗共通（同じ早番/遅番等をどの店舗でも使う想定）。
 *   店舗を1件も登録しない場合は、従来通り単一店舗として動作する。
 *
 * 通知について:
 *   希望休が申請されると、対象店舗の管理者（および本部管理者）にメールで通知する。
 *   希望休が承認/却下されると、申請したスタッフにメールで通知する。
 *   MailApp の1日あたりの送信数上限に注意（個人のGoogleアカウントは1日100通程度）。
 *   通知の送信に失敗しても、申請・承認そのものの処理は失敗させない。
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
const TIME_OFF_SHEET = '希望休';
const STORES_SHEET = '店舗';

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
  if (action === 'timeOffRequests') {
    return jsonResponse({ timeOffRequests: readTimeOffRequests() });
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

  const action = body.action || 'saveState';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ error: '他の処理と競合しました。しばらくしてから再度お試しください' });
  }
  try {
    if (action === 'saveState') {
      writeState(body);
      return jsonResponse({ ok: true });
    }
    if (action === 'submitTimeOffRequest') {
      return jsonResponse(submitTimeOffRequest(body));
    }
    if (action === 'updateTimeOffRequest') {
      return jsonResponse(updateTimeOffRequest(body));
    }
    if (action === 'cancelTimeOffRequest') {
      return jsonResponse(cancelTimeOffRequest(body));
    }
    return jsonResponse({ error: `不明な action です: ${action}` });
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
    stores: readStoresSheet(),
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
      email: String(row[3] || '').trim().toLowerCase(),
      role: normalizeRole(row[4]),
      storeId: String(row[5] || ''),
    }));
}

function normalizeRole(value) {
  const v = String(value || '').trim();
  return v === '管理者' ? 'admin' : 'staff';
}

function roleLabel(role) {
  return role === 'admin' ? '管理者' : 'バイト';
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

function readTimeOffRequests() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIME_OFF_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return values.slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      id: String(row[0]),
      staffId: String(row[1] || ''),
      date: formatDate(row[2], tz),
      reason: String(row[3] || ''),
      status: String(row[4] || 'pending'),
      requestedAt: row[5] ? formatDateTime(row[5], tz) : null,
      processedAt: row[6] ? formatDateTime(row[6], tz) : null,
    }));
}

function readStoresSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STORES_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter((row) => row[0])
    .map((row) => ({ id: String(row[0]), name: String(row[1] || '') }));
}

// ---- 書き込み（シフト表等は全件上書き、希望休は行単位で操作） ----

function writeState(body) {
  writeStaffSheet(Array.isArray(body.staff) ? body.staff : []);
  writeShiftTypesSheet(Array.isArray(body.shiftTypes) ? body.shiftTypes : []);
  writeAssignmentsSheet(body.assignments && typeof body.assignments === 'object' ? body.assignments : {});
  writeStoresSheet(Array.isArray(body.stores) ? body.stores : []);
}

function writeStaffSheet(staff) {
  const sheet = getOrCreateSheet(STAFF_SHEET, ['id', '名前', '色', 'メールアドレス', '役割', '店舗ID']);
  clearDataRows(sheet);
  if (staff.length === 0) return;
  const rows = staff.map((s) => [s.id, s.name, s.color, s.email || '', roleLabel(normalizeRole(s.role)), s.storeId || '']);
  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
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

function writeStoresSheet(stores) {
  const sheet = getOrCreateSheet(STORES_SHEET, ['id', '店舗名']);
  clearDataRows(sheet);
  if (stores.length === 0) return;
  const rows = stores.map((s) => [s.id, s.name]);
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

// バイトが希望休を1件申請する。申請そのものはpendingとして常に1行追加するだけで、
// シフト表の全件上書きとは独立した「追記」操作にする（他の人の同時申請と競合しないように）。
function submitTimeOffRequest(body) {
  if (!body.staffId || !body.date) {
    return { error: 'スタッフIDと対象日は必須です' };
  }
  const sheet = getOrCreateSheet(TIME_OFF_SHEET, ['id', 'スタッフID', '対象日', '理由', 'ステータス', '申請日時', '処理日時']);
  const id = Utilities.getUuid();
  const now = new Date();
  sheet.appendRow([id, body.staffId, body.date, body.reason || '', 'pending', now, '']);
  notifyAdminsOfNewTimeOffRequest(body.staffId, body.date, body.reason);
  return { ok: true, id: id };
}

// 管理者が希望休1件を承認/却下する。id で該当行を特定し、ステータスと処理日時だけ更新する。
function updateTimeOffRequest(body) {
  if (!body.requestId || (body.status !== 'approved' && body.status !== 'rejected')) {
    return { error: 'requestId と有効な status(approved/rejected) が必要です' };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIME_OFF_SHEET);
  if (!sheet) return { error: `シート「${TIME_OFF_SHEET}」が見つかりません` };
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === body.requestId) {
      const staffId = String(values[i][1]);
      const date = values[i][2];
      sheet.getRange(i + 1, 5).setValue(body.status);
      sheet.getRange(i + 1, 7).setValue(new Date());
      notifyStaffOfTimeOffDecision(staffId, date, body.status);
      return { ok: true };
    }
  }
  return { error: '指定された希望休が見つかりません' };
}

// バイトが自分の「審査中」の希望休を取り消す。承認/却下済みは取り消せない。
function cancelTimeOffRequest(body) {
  if (!body.requestId) return { error: 'requestId が必要です' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIME_OFF_SHEET);
  if (!sheet) return { error: `シート「${TIME_OFF_SHEET}」が見つかりません` };
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === body.requestId) {
      if (String(values[i][4]) !== 'pending') {
        return { error: '審査中の申請のみ取り消せます' };
      }
      sheet.getRange(i + 1, 5).setValue('cancelled');
      sheet.getRange(i + 1, 7).setValue(new Date());
      return { ok: true };
    }
  }
  return { error: '指定された希望休が見つかりません' };
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

// ---- メール通知 ----
// 通知の送信失敗が申請/承認そのものの成否に影響しないよう、必ず try/catch で囲む。

function notifyAdminsOfNewTimeOffRequest(staffId, date, reason) {
  try {
    const staff = readStaffSheet();
    const requester = staff.find((s) => s.id === staffId);
    if (!requester) return;
    const admins = staff.filter((s) => s.role === 'admin' && s.email &&
      (!s.storeId || s.storeId === requester.storeId));
    if (admins.length === 0) return;
    const subject = `【シフト管理】${requester.name}さんから希望休の申請`;
    const body = `${requester.name}さんから希望休が申請されました。\n\n` +
      `対象日: ${date}\n理由: ${reason || '(なし)'}\n\n` +
      'アプリの「希望休の申請一覧」から承認・却下してください。';
    admins.forEach((a) => {
      try {
        MailApp.sendEmail(a.email, subject, body);
      } catch (err) {
        // 1件の送信失敗で他の管理者への通知まで止めない
      }
    });
  } catch (err) {
    // 通知処理全体が失敗しても申請自体は成功させる
  }
}

function notifyStaffOfTimeOffDecision(staffId, date, status) {
  try {
    const staff = readStaffSheet();
    const person = staff.find((s) => s.id === staffId);
    if (!person || !person.email) return;
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const dateLabel = formatDate(date, tz);
    const statusLabel = status === 'approved' ? '承認されました' : '却下されました';
    const subject = `【シフト管理】希望休が${status === 'approved' ? '承認' : '却下'}されました`;
    const body = `${dateLabel} の希望休が${statusLabel}。\n\nアプリの「申請状況」からご確認ください。`;
    MailApp.sendEmail(person.email, subject, body);
  } catch (err) {
    // 通知の送信失敗は無視する（承認/却下そのものは既に完了している）
  }
}

// ---- 共通ヘルパー ----

function formatDate(value, tz) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function formatDateTime(value, tz) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
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

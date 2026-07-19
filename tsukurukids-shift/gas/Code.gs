/**
 * ツクルキッズ・シフト作成システム【完全版 v4.7】
 *
 * v4.7 追加・変更点：
 *   [Change] 土曜の人数を変更
 *          - 通常土曜:那覇校③8:30〜13:30 を 2名 → 3名(合計:那覇校5名)
 *          - 体験期間:③3名 + ③9:00 1名 + ④2名 に統一(合計:那覇校6名)
 *
 * v4.2 追加・変更点：
 *   [Add8] 体験カレンダー(2回体験・3回体験)を別カレンダーIDから取得
 *          - タイトル「体験」を含む日は特別ルール適用
 *   [Add9] シフト自動生成のプレビュー方式化
 *          - runAutoAssignmentPreview → 完成シフト表_プレビュー
 *          - commitPreviewShift で本反映
 *          - discardPreviewShift で破棄
 *   [Add10] 希望休集中警告(getHopeOffAlerts)
 *          - 同じ日に3人以上の希望休申請で警告
 *
 * v4.1 追加・変更点：
 *   [Add6] 3回体験期間対応
 *          開校日シートのイベント名に「3回体験」を含む日は人数増ルールを適用
 *          - 平日：15:30〜19:00を必ず2名確保
 *          - 土曜：③8:30〜13:30×2名 + ③9:00〜13:30×1名 + ④13:30〜18:00×3名
 *   [Add7] 9:00〜13:30 時間帯を給与計算に追加（4.5h）
 *
 * v4.0 追加・変更点：
 *   [Add1] 「勤務エリア」シートの読み込みを追加（loadAllData）
 *   [Add2] 完成シフト表_DBに「エリア」列を追加（6列構成）
 *   [Add3] assignSaturday を那覇校・うるま校に分離
 *          タカラさん → うるま校③（8:30〜13:30）に固定アサイン
 *          那覇校土曜 → タカラさんを候補から除外
 *   [Add4] getShiftData / getMyShiftData でエリア列を参照するよう更新
 *   [Add5] エリア別カラーをカレンダーイベントに反映
 *
 * 運用フロー：
 *   毎月1日  → 翌月シフト自動生成・公表
 *   毎月10日 → スタッフ同士のシフト調整締切
 *   毎月15日 → シフト確定（以降変更不可・管理者へ直接相談）
 *
 * --- リポジトリ取り込み時の修正メモ ---
 *   [Fix] fetchOpenDaysByOffset 内の `new Daate(...)` を `new Date(...)` に修正
 *         （タイプミスで開校日取得・自動生成が起動時にクラッシュしていた）
 *   [Fix] assignSaturdaySpecial の ④ 選出人数のコメントを実装(2名)に合わせて修正
 */

// ============================================================
// 定数
// ============================================================
const ADMIN_EMAIL           = 'tsukurukids4f@gmail.com';
const TRAVEL_TIME           = 10;
const HOPE_OFF_DEADLINE_DAY = 10;
const SHIFT_PRESENT_DAY     = 1;
const SHIFT_EXCHANGE_START  = 1;
const SHIFT_EXCHANGE_END    = 10;
const SHIFT_CONFIRM_DAY     = 15;

// 体験カレンダーID(2回体験・3回体験等)
const TAIKEN_CALENDAR_ID = '4ce9ab6e0eb69adb88164a7af246bee2d2ce63365f6beff7064b57253c262d54@group.calendar.google.com';
const HOPE_OFF_ALERT_THRESHOLD = 3; // 希望休集中警告のしきい値(3人以上で警告)
const PREVIEW_SHEET_NAME = '完成シフト表_プレビュー';

// QR勤怠(打刻)
const ATTENDANCE_SHEET = '勤怠';
const PAYROLL_RESULT_SHEET = '給与計算_実績';
const QR_PUNCH_PREFIX = 'TSUKURUKIDS_PUNCH:';

// ============================================================
// メニュー
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ シフト作成システム')
    .addItem('★ 初回セットアップ（シート＋サンプルデータ作成）', 'initializeSpreadsheet')
    .addSeparator()
    .addItem('1. カレンダーから開校日を取得',    'fetchOpenDays')
    .addItem('2. シフトの自動割り当てを実行',    'runAutoAssignment')
    .addSeparator()
    .addItem('【設定】自動実行トリガーをセット', 'setupTriggers')
    .addToUi();
}

// ============================================================
// 初回セットアップ：必要なシートとサンプルデータを一括作成
// ============================================================
// - すでにデータが入っているシートは上書きしない（既存データ保護）
// - 入力用シート（スタッフ・時間割・エリア・必要人数・ログイン等）に
//   動作確認用のサンプルデータを投入する
// - 出力用シート（完成シフト表_DB 等）はヘッダーのみ作成する
// メニュー「★ 初回セットアップ」から実行する。
function initializeSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const skipped = [];

  function seed(name, header, rows) {
    let sheet = ss.getSheetByName(name);
    // 既にデータ（ヘッダー以外の行）があるシートは触らない
    if (sheet && sheet.getLastRow() > 1) { skipped.push(name); return; }
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clear();
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    if (rows && rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
    created.push(name);
  }

  // --- 入力シート（サンプルデータつき） ---
  // 実スタッフ名簿（アップロードCSVより）。列: 名前/学校/クラス/コース/土曜可否/15:30可否/水曜可否/ワンオペ可否
  seed('学生スタッフ情報',
    ['名前', '学校', 'クラス', 'コース', '土曜可否', '15:30可否', '水曜可否', 'ワンオペ可否'],
    [
      ['サキヤマ',   'こども校', 'C3B', '病児', '可',   '可',   '可',   '不可'],
      ['サイジョウ', 'こども校', 'C3B', '病児', '可',   '可',   '可',   '不可'],
      ['ナカザト',   'AI校',     'P2A', 'CG',   '可',   '可',   '可',   '可'],
      ['タジマ',     'AI校',     'P2A', 'AI',   '可',   '可',   '可',   '可'],
      ['オガワ',     'AI校',     'P2B', 'AI',   '可',   '可',   '可',   '可'],
      ['モロミザト', 'AI校',     'P2B', 'AI',   '可',   '可',   '可',   '可'],
      ['タカラ',     'AI校',     'P2C', 'CG',   '不可', '不可', '不可', '不可'],
      ['ナカムラ',   'AI校',     'P2C', 'AI',   '可',   '不可', '可',   '可'],
      ['カメハマ',   'AI校',     'P2C', 'AI',   '不可', '不可', '可',   '不可'],
      ['エグチ',     'AI校',     'W2A', 'WEB',  '不可', '可',   '可',   '可'],
      ['スナガワ',   '大原',     '',    '',     '不可', '不可', '不可', '不可'],
      ['キシャバ',   '琉大',     '',    '',     '可',   '不可', '不可', '不可'],
    ]);

  // 学生の学校/クラス/コースの組み合わせごとの授業終了時刻。
  // ★終了時刻は仮値(15:00)。実際の時間割に必ず差し替えてください
  //   （canWorkFrom が「終了時刻+移動10分 <= シフト開始」で判定するため、割り当てに直結）。
  seed('学校時間割',
    ['学校', 'クラス', 'コース', '月', '火', '水', '木', '金'],
    [
      ['こども校', 'C3B', '病児', '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'P2A', 'CG',   '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'P2A', 'AI',   '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'P2B', 'AI',   '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'P2C', 'CG',   '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'P2C', 'AI',   '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['AI校',     'W2A', 'WEB',  '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['大原',     '',    '',     '15:00', '15:00', '15:00', '15:00', '15:00'],
      ['琉大',     '',    '',     '15:00', '15:00', '15:00', '15:00', '15:00'],
    ]);

  // ペア条件は初期は空（ヘッダーのみ）。必要に応じて「セット」「禁止」を追加する。
  seed('ペア条件専用',
    ['スタッフ', '相手', '条件（セット/禁止）'],
    []);

  // 勤務エリア：名前 / 日 / 月 / 火 / 水 / 木 / 金 / 土（列2以降が各曜日）
  // タカラのみ土曜=うるま校（固定アサイン）。他は全曜日=那覇校。
  seed('勤務エリア',
    ['名前', '日', '月', '火', '水', '木', '金', '土'],
    [
      ['サキヤマ',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['サイジョウ', '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['ナカザト',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['タジマ',     '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['オガワ',     '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['モロミザト', '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['タカラ',     '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', 'うるま校'],
      ['ナカムラ',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['カメハマ',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['エグチ',     '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['スナガワ',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
      ['キシャバ',   '', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校', '那覇校'],
    ]);

  seed('曜日・時間別必要スタッフ数',
    ['曜日', '時間帯', '人数'],
    [
      ['月', '16:00-17:30', 2],
      ['火', '16:00-17:30', 2],
      ['水', '16:00-17:30', 2],
      ['木', '16:00-17:30', 2],
      ['金', '16:00-17:30', 2],
    ]);

  // ログインアカウント：先頭は管理者（メールが ADMIN_EMAIL と一致すると管理者画面になる）
  // ★メールとパスワードは仮値。本番前に各スタッフの実際のGmail等とパスワードに差し替えてください。
  //   管理者にしたい人（例: モロミザト）がいれば、その人のメールを ADMIN_EMAIL と同じにするか、
  //   Code.gs 冒頭の ADMIN_EMAIL をその人のメールに変更してください。
  seed('ログインアカウント情報',
    ['スタッフ名', 'メール', 'パスワード'],
    [
      ['管理者',     ADMIN_EMAIL,               'admin1234'],
      ['サキヤマ',   'sakiyama@example.com',    'pass1234'],
      ['サイジョウ', 'saijo@example.com',       'pass1234'],
      ['ナカザト',   'nakazato@example.com',    'pass1234'],
      ['タジマ',     'tajima@example.com',      'pass1234'],
      ['オガワ',     'ogawa@example.com',       'pass1234'],
      ['モロミザト', 'moromizato@example.com',  'pass1234'],
      ['タカラ',     'takara@example.com',      'pass1234'],
      ['ナカムラ',   'nakamura@example.com',    'pass1234'],
      ['カメハマ',   'kamehama@example.com',    'pass1234'],
      ['エグチ',     'eguchi@example.com',      'pass1234'],
      ['スナガワ',   'sunagawa@example.com',    'pass1234'],
      ['キシャバ',   'kishaba@example.com',     'pass1234'],
    ]);

  // 時給は仮値（全員1050円）。実際の時給に差し替えてください。
  seed('給与設定',
    ['スタッフ名', '時給(円)'],
    [
      ['サキヤマ',   1050],
      ['サイジョウ', 1050],
      ['ナカザト',   1050],
      ['タジマ',     1050],
      ['オガワ',     1050],
      ['モロミザト', 1050],
      ['タカラ',     1050],
      ['ナカムラ',   1050],
      ['カメハマ',   1050],
      ['エグチ',     1050],
      ['スナガワ',   1050],
      ['キシャバ',   1050],
    ]);

  // --- 出力シート（ヘッダーのみ・データは運用中に追記される） ---
  seed('完成シフト表_DB',
    ['日付', '曜日', '時間帯', '担当スタッフ名', 'カテゴリ', 'エリア'], []);
  seed('希望休申請',
    ['申請日時', '対象日', 'スタッフ名', '理由', 'ステータス'], []);
  seed('シフト交換管理',
    ['申請日時', '対象日', '時間帯', '曜日', '申請者', '承認者', 'ステータス', '種別', '理由', '補足'], []);
  seed('開校日',
    ['日付', '曜日', 'イベント名'], []);
  seed('開校日（翌月）',
    ['日付', '曜日', 'イベント名'], []);
  seed('開校日（再来月）',
    ['日付', '曜日', 'イベント名'], []);
  seed(ATTENDANCE_SHEET,
    ['日付', 'スタッフ名', '出勤時刻', '退勤時刻', '勤務時間(h)'], []);
  seed(PAYROLL_RESULT_SHEET,
    ['対象月', 'スタッフ名', '勤務日数', '勤務時間(h)', '時給(円)', '給与(円)', '計算日時'], []);

  const msg =
    '初回セットアップが完了しました。\n\n' +
    '作成/初期化したシート:\n・' + (created.length ? created.join('\n・') : '（なし）') + '\n\n' +
    (skipped.length ? '既にデータがあり保護したシート:\n・' + skipped.join('\n・') + '\n\n' : '') +
    '次の手順:\n' +
    '1. メニュー「1. カレンダーから開校日を取得」（カレンダー未設定なら開校日を手入力）\n' +
    '2. メニュー「2. シフトの自動割り当てを実行」\n' +
    '3. デプロイ > ウェブアプリ でURLを発行しログイン\n' +
    '   （管理者ログイン: スタッフ名「管理者」/ パスワード「admin1234」）';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  return { success: true, created: created, skipped: skipped };
}

// ============================================================
// Googleカレンダーから開校日取得
// ============================================================
const OPEN_DAY_SHEETS = {
  0: '開校日',
  1: '開校日（翌月）',
  2: '開校日（再来月）',
};

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('fetchAndPublishMonthly')
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert(
    'トリガーをセットしました。\n毎月1日：今月・翌月・再来月の開校日取得、翌月シフト自動生成・公表'
  );
}

function fetchAndPublishMonthly() {
  fetchOpenDaysMulti(true);
  runAutoAssignmentForMonth(1, true);
  // 毎月1日: 先月の勤怠実績から給与を計算し「給与計算_実績」シートへ保存
  try { monthlyPayrollJob(); } catch (e) { Logger.log('月次給与計算に失敗: ' + e.message); }
}

function fetchOpenDays() {
  const result = fetchOpenDaysMulti(false);
  try {
    SpreadsheetApp.getUi().alert(
      '開校日を取得しました。\n' +
      '今月:' + result[0] + '日\n' +
      '翌月:' + result[1] + '日\n' +
      '再来月:' + result[2] + '日'
    );
  } catch(e) {}
  return result;
}

function fetchOpenDaysMulti(silent) {
  const result = {};
  [0, 1, 2].forEach(offset => {
    result[offset] = fetchOpenDaysByOffset(offset);
  });
  return result;
}

function fetchOpenDaysByOffset(offset) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = OPEN_DAY_SHEETS[offset] || '開校日';
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  const mainCalendar = CalendarApp.getCalendarById('tsukurukids4f@gmail.com');
  let taikenCalendar = null;
  try {
    taikenCalendar = CalendarApp.getCalendarById(TAIKEN_CALENDAR_ID);
  } catch(e) {
    Logger.log('体験カレンダー取得失敗: ' + e.message);
  }

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);

  const daysOfWeek = ['日','月','火','水','木','金','土'];

  // 1. メインカレンダー(通常開校)から開校日を取得
  //    「休校」を含むイベントは除外して集める
  const dateMap = {}; // { 'yyyy/MM/dd': タイトル }
  mainCalendar.getEvents(from, to).forEach(ev => {
    if (ev.getTitle().includes('休校')) return;
    const d = ev.getStartTime();
    const str = Utilities.formatDate(d, 'JST', 'yyyy/MM/dd');
    if (!dateMap[str]) {
      dateMap[str] = ev.getTitle() || '通常開校';
    }
  });

  // 2. 体験カレンダーから体験イベントを取得(該当日を上書き)
  //    体験イベントは複数日にわたる場合があるので、期間展開する
  if (taikenCalendar) {
    taikenCalendar.getEvents(from, to).forEach(ev => {
      const title = ev.getTitle();
      const start = ev.getStartTime();
      const end = ev.getEndTime();

      // 期間内の全ての日に対して展開
      let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      // 終日イベントは終了日が翌日0時になっている場合があるので1日引く判定
      const isAllDay = ev.isAllDayEvent();

      while (cursor < end) {
        // 対象月範囲内かチェック
        if (cursor >= from && cursor <= to) {
          const str = Utilities.formatDate(cursor, 'JST', 'yyyy/MM/dd');
          const dow = daysOfWeek[cursor.getDay()];
          // 日曜日はスキップ(休校日)
          // 体験イベントは平日と土曜のみに反映
          if (dow !== '日') {
            // 既に開校日として登録されているか、新規に体験開校日として追加
            dateMap[str] = title;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  }

  // 3. マップから行データに変換
  const rows = Object.keys(dateMap).sort().map(str => {
    const d = new Date(str);
    return [str, daysOfWeek[d.getDay()], dateMap[str]];
  });

  sheet.clear();
  sheet.appendRow(['日付','曜日','イベント名']);
  if (rows.length) sheet.getRange(2, 1, rows.length, 3).setValues(rows);

  return rows.length;
}

function runAutoAssignment() {
  return runAutoAssignmentForMonth(1, false);
}

function runAutoAssignmentForSelectedMonth(offset) {
  return runAutoAssignmentForMonth(Number(offset || 1), false);
}

function runAutoAssignmentForMonth(offset, silent) {
  return runAutoAssignmentInternal(offset, silent, false);
}

/** プレビュー用シートに書き込むモード */
function runAutoAssignmentPreview(offset) {
  return runAutoAssignmentInternal(Number(offset || 1), true, true);
}

function runAutoAssignmentInternal(offset, silent, previewMode) {
  offset = Number(offset || 1);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const openDaySheetName = OPEN_DAY_SHEETS[offset] || '開校日（翌月）';
  const data = loadAllData(ss, openDaySheetName);

  const workHours = {};
  const shiftCount = {};
  data.staff.forEach(s => {
    workHours[s.name] = 0;
    shiftCount[s.name] = 0;
  });

  const hopeOffMap = buildHopeOffMap(ss);
  const weekCounter = {};
  const dateAssigned = {};
  const finalShifts = [];

  data.openDays.forEach(day => {
    const dateStr = Utilities.formatDate(day.date, 'JST', 'yyyy/MM/dd');
    const dow = day.dow;
    const isSpecialEvent = String(day.type || '').includes('体験');

    weekCounter[dow] = (weekCounter[dow] || 0) + 1;
    const weekNum = weekCounter[dow];
    dateAssigned[dateStr] = [];

    if (dow === '土' || dow === '日') {
      if (isSpecialEvent) {
        assignSaturdaySpecial(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned);
      } else {
        assignSaturdayV2(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned);
      }
    } else {
      if (isSpecialEvent) {
        assignWeekdaySpecial(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned);
      } else {
        assignWeekdayV2(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned);
      }
    }
  });

  finalShifts.sort((a, b) => {
    const da = new Date(a[0]).getTime();
    const db = new Date(b[0]).getTime();
    if (da !== db) return da - db;
    return String(a[4]).localeCompare(String(b[4]));
  });

  if (previewMode) {
    writePreviewShift(ss, finalShifts);
  } else {
    upsertShiftRowsForMonth(ss, finalShifts, offset);
  }

  if (!silent) {
    SpreadsheetApp.getUi().alert(
      openDaySheetName + ' をもとにシフトを自動生成しました。\n' +
      finalShifts.length + '件'
    );
  }

  return { success: true, count: finalShifts.length };
}

/** プレビューシートに書き込み */
function writePreviewShift(ss, finalShifts) {
  const sheet = ss.getSheetByName(PREVIEW_SHEET_NAME) || ss.insertSheet(PREVIEW_SHEET_NAME);
  const header = ['日付','曜日','時間帯','担当スタッフ名','カテゴリ','エリア'];
  sheet.clear();
  sheet.appendRow(header);
  if (finalShifts.length) sheet.getRange(2, 1, finalShifts.length, 6).setValues(finalShifts);
}

/** プレビューデータ取得(管理画面用) */
function getPreviewShift() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PREVIEW_SHEET_NAME);
  if (!sheet) return { rows: [], warnings: [] };

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { rows: [], warnings: [] };

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate) continue;
    const dateStr = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM/dd');
    rows.push({ date: dateStr, dow: String(dow), time: String(time), name: String(name), cat: String(cat), area: String(area || '那覇校') });
  }

  const warnings = detectPreviewWarnings(rows);
  return { rows: rows, warnings: warnings };
}

/** プレビューの警告判定(人数不足・偏り) */
function detectPreviewWarnings(rows) {
  const warnings = [];
  const byDate = {};
  const byDateSlot = {};

  rows.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { dow: r.dow, count: 0, isTaiken: false };
    byDate[r.date].count++;

    const key = r.date + '|' + r.time;
    byDateSlot[key] = (byDateSlot[key] || 0) + 1;
  });

  // 各日付ごとの想定人数と実際の人数を比較
  // 詳細判定は省略・大まかな警告のみ

  // スタッフ別の勤務回数の偏り
  const byStaff = {};
  rows.forEach(r => {
    byStaff[r.name] = (byStaff[r.name] || 0) + 1;
  });
  const counts = Object.values(byStaff);
  if (counts.length > 0) {
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max - min >= 5) {
      warnings.push({
        type: 'imbalance',
        message: '勤務回数の偏りが大きいです(最多' + max + '回 / 最少' + min + '回)'
      });
    }
  }

  return warnings;
}

/** プレビューを本反映(完成シフト表_DBに書き込み) */
function commitPreviewShift(offset) {
  offset = Number(offset || 1);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const previewSheet = ss.getSheetByName(PREVIEW_SHEET_NAME);
  if (!previewSheet) return { success: false, message: 'プレビューデータがありません' };

  const values = previewSheet.getDataRange().getValues();
  if (values.length <= 1) return { success: false, message: 'プレビューデータが空です' };

  const finalShifts = values.slice(1).filter(r => r[0]);
  upsertShiftRowsForMonth(ss, finalShifts, offset);

  // プレビューをクリア
  previewSheet.clear();
  previewSheet.appendRow(['日付','曜日','時間帯','担当スタッフ名','カテゴリ','エリア']);

  return { success: true, message: '本反映しました(' + finalShifts.length + '件)' };
}

/** プレビューを破棄 */
function discardPreviewShift() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PREVIEW_SHEET_NAME);
  if (sheet) {
    sheet.clear();
    sheet.appendRow(['日付','曜日','時間帯','担当スタッフ名','カテゴリ','エリア']);
  }
  return { success: true, message: 'プレビューを破棄しました' };
}

/** 希望休集中警告データ取得 */
function getHopeOffAlerts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return { alerts: [] };

  const rows = sheet.getDataRange().getValues().slice(1);
  const today = new Date();
  const nextYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
    'JST',
    'yyyy/MM'
  );
  const currentYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth(), 1),
    'JST',
    'yyyy/MM'
  );

  // 日付ごとに希望休申請をカウント(承認・申請中のみ)
  const byDate = {};
  rows.forEach(r => {
    const status = String(r[4]).trim();
    if (status !== '承認' && status !== '申請中') return;
    if (!r[1]) return;
    const d = new Date(r[1]);
    const dateStr = Utilities.formatDate(d, 'JST', 'yyyy/MM/dd');
    const ym = Utilities.formatDate(d, 'JST', 'yyyy/MM');
    // 今月・翌月のみ対象
    if (ym !== currentYm && ym !== nextYm) return;

    if (!byDate[dateStr]) byDate[dateStr] = { count: 0, names: [], dow: '' };
    byDate[dateStr].count++;
    byDate[dateStr].names.push(String(r[2]).trim());
    const dayIdx = d.getDay();
    byDate[dateStr].dow = ['日','月','火','水','木','金','土'][dayIdx];
  });

  // しきい値以上の日を警告として返す
  const alerts = [];
  Object.keys(byDate).sort().forEach(dateStr => {
    const info = byDate[dateStr];
    if (info.count >= HOPE_OFF_ALERT_THRESHOLD) {
      alerts.push({
        date: dateStr,
        dow: info.dow,
        count: info.count,
        names: info.names,
        level: info.count >= 5 ? 'critical' : 'warning'
      });
    }
  });

  return { alerts: alerts, threshold: HOPE_OFF_ALERT_THRESHOLD };
}

function upsertShiftRowsForMonth(ss, finalShifts, offset) {
  const sheet = ss.getSheetByName('完成シフト表_DB') || ss.insertSheet('完成シフト表_DB');
  const today = new Date();
  const targetYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth() + Number(offset || 1), 1),
    'JST',
    'yyyy/MM'
  );

  const header = ['日付','曜日','時間帯','担当スタッフ名','カテゴリ','エリア'];
  const values = sheet.getDataRange().getValues();

  const kept = [];
  if (values.length > 1) {
    values.slice(1).forEach(r => {
      if (!r[0]) return;
      const ym = Utilities.formatDate(new Date(r[0]), 'JST', 'yyyy/MM');
      if (ym !== targetYm) kept.push(r);
    });
  }

  sheet.clear();
  sheet.appendRow(header);

  const rows = kept.concat(finalShifts);
  if (rows.length) sheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

function loadAllData(ss, openDaySheetName) {
  openDaySheetName = openDaySheetName || '開校日';

  const raw = {
    staffRaw: getSheetValues(ss, '学生スタッフ情報'),
    timetableRaw: getSheetValues(ss, '学校時間割'),
    pairRaw: getSheetValues(ss, 'ペア条件専用'),
    openDaysRaw: getSheetValues(ss, openDaySheetName),
    reqCountRaw: getSheetValues(ss, '曜日・時間別必要スタッフ数'),
    areaRaw: getSheetValues(ss, '勤務エリア'),
  };

  const staff = raw.staffRaw.slice(1).map(r => ({
    name: String(r[0]).trim(),
    school: String(r[1]).trim(),
    cls: String(r[2]).trim(),
    course: String(r[3]).trim(),
    satShift: String(r[4]).trim(),
    weekday1530: String(r[5]).trim(),
    suiyoShift: String(r[6]).trim(),
    oneop: String(r[7]).trim(),
  })).filter(s => s.name);

  const pairConditions = raw.pairRaw.slice(1).map(r => ({
    staff: String(r[0]).trim(),
    partner: String(r[1]).trim(),
    condition: String(r[2]).trim(),
  })).filter(p => p.staff);

  const openDays = raw.openDaysRaw.slice(1).map(r => {
    const d = new Date(r[0]);
    return { date: d, dow: String(r[1]).trim(), type: String(r[2]).trim() };
  }).filter(d => d.date && !isNaN(d.date.getTime()));

  const requiredCount = raw.reqCountRaw.slice(1).map(r => [
    String(r[0]).trim(), String(r[1]).trim(), r[2]
  ]);

  const timetable = raw.timetableRaw.slice(1);

  const dowCols = { '月': 2, '火': 3, '水': 4, '木': 5, '金': 6, '土': 7 };
  const areaMap = {};
  raw.areaRaw.slice(1).forEach(r => {
    const name = String(r[0]).trim();
    if (!name) return;
    areaMap[name] = {};
    Object.entries(dowCols).forEach(([dow, col]) => {
      areaMap[name][dow] = String(r[col] || '').trim();
    });
  });

  return { staff, pairConditions, openDays, requiredCount, timetable, areaMap };
}


// ============================================================
// 平日割り当て v2(通常)
// ============================================================
function assignWeekdayV2(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned) {
  const required = getRequiredCount(data.requiredCount, dow, '16:00-17:30');

  let candidates = data.staff.filter(s => {
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return false;
    if (dow === '水' && s.suiyoShift === '不可') return false;
    return canWorkFrom(data, s, dow, '16:00');
  });

  if (!candidates.length) return;

  const sorted = sortByFairnessAndRotation(candidates, weekNum, workHours, shiftCount);

  const selected = selectForWeekday(data, sorted, required, dow);
  if (!selected.length) return;

  const allCan1530 = selected.every(s => canWorkFrom(data, s, dow, '15:30'));
  const use1530    = required >= 2 ? allCan1530 : canWorkFrom(data, selected[0], dow, '15:30');

  selected.forEach(s => {
    const cat  = use1530 ? '①' : '②';
    const time = use1530 ? '15:30~19:00' : '16:00~19:00';
    const area = getStaffArea(data, s.name, dow);
    finalShifts.push([dateStr, dow, time, s.name, cat, area]);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration(time);
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  });
}

// ============================================================
// 土曜割り当て v2(通常)
// ============================================================
function assignSaturdayV2(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned) {

  data.staff.forEach(s => {
    const satArea = data.areaMap[s.name] ? String(data.areaMap[s.name]['土'] || '').trim() : '';
    if (satArea !== 'うるま校') return;
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return;
    finalShifts.push([dateStr, dow, '8:30~13:30', s.name, '③', 'うるま校']);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration('8:30~13:30');
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  });

  const recentlyWorked = getRecentlyWorkedStaff(dateStr, dateAssigned);

  const urumaSatNames = new Set(
    data.staff
      .filter(s => data.areaMap[s.name] && String(data.areaMap[s.name]['土']).trim() === 'うるま校')
      .map(s => s.name)
  );

  let pool = data.staff.filter(s => {
    if (urumaSatNames.has(s.name)) return false;
    if (s.satShift === '不可') return false;
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return false;
    return true;
  });

  if (!pool.length) return;

  pool = sortByFairnessAndRotation(pool, weekNum, workHours, shiftCount, recentlyWorked);

  const amSelected = [];
  selectSatSlot(data, pool, 3, [], amSelected);

  const amNames    = amSelected.map(s => s.name);
  const pmPool     = pool.filter(s => !amNames.includes(s.name));
  const pmSelected = [];
  selectSatSlotPM(data, pmPool, 2, amNames, pmSelected);

  const pushSat = (s, cat, time) => {
    finalShifts.push([dateStr, dow, time, s.name, cat, '那覇校']);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration(time);
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  };
  amSelected.forEach(s => pushSat(s, '③', '8:30~13:30'));
  pmSelected.forEach(s => pushSat(s, '④', '13:30~18:00'));
}

// ============================================================
// 【3回体験】平日割り当て
// 15:30〜19:00を必ず2名確保
// 15:30開始できないスタッフが含まれる場合は ① + ② で2名
// ============================================================
function assignWeekdaySpecial(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned) {
  const required = 2;

  let candidates = data.staff.filter(s => {
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return false;
    if (dow === '水' && s.suiyoShift === '不可') return false;
    return canWorkFrom(data, s, dow, '16:00');
  });

  if (!candidates.length) return;

  const sorted = sortByFairnessAndRotation(candidates, weekNum, workHours, shiftCount);

  const selected = selectForWeekday(data, sorted, required, dow);
  if (!selected.length) return;

  selected.forEach(s => {
    const can1530 = canWorkFrom(data, s, dow, '15:30');
    const cat  = can1530 ? '①' : '②';
    const time = can1530 ? '15:30~19:00' : '16:00~19:00';
    const area = getStaffArea(data, s.name, dow);
    finalShifts.push([dateStr, dow, time, s.name, cat, area]);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration(time);
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  });
}

// ============================================================
// 【体験期間】土曜割り当て
// ③ 8:30〜13:30 × 3名 + ③ 9:00〜13:30 × 1名 + ④ 13:30〜18:00 × 2名
// = 那覇校合計6名(全員違う人) + うるま校③1名(タカラ固定)
// ============================================================
function assignSaturdaySpecial(data, dateStr, dow, weekNum, hopeOffMap, workHours, shiftCount, finalShifts, dateAssigned) {

  data.staff.forEach(s => {
    const satArea = data.areaMap[s.name] ? String(data.areaMap[s.name]['土'] || '').trim() : '';
    if (satArea !== 'うるま校') return;
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return;
    finalShifts.push([dateStr, dow, '8:30~13:30', s.name, '③', 'うるま校']);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration('8:30~13:30');
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  });

  const recentlyWorked = getRecentlyWorkedStaff(dateStr, dateAssigned);

  const urumaSatNames = new Set(
    data.staff
      .filter(s => data.areaMap[s.name] && String(data.areaMap[s.name]['土']).trim() === 'うるま校')
      .map(s => s.name)
  );

  let pool = data.staff.filter(s => {
    if (urumaSatNames.has(s.name)) return false;
    if (s.satShift === '不可') return false;
    if (isHopeOff(hopeOffMap, s.name, dateStr)) return false;
    return true;
  });

  if (!pool.length) return;

  pool = sortByFairnessAndRotation(pool, weekNum, workHours, shiftCount, recentlyWorked);

  // ③ 8:30〜13:30 を3名選出
  const am1Selected = [];
  selectSatSlot(data, pool, 3, [], am1Selected);
  const am1Names = am1Selected.map(s => s.name);

  // ③ 9:00〜13:30 を1名選出(8:30〜13:30の2名を除外)
  const am2Pool = pool.filter(s => !am1Names.includes(s.name));
  const am2Selected = [];
  selectSatSlot(data, am2Pool, 1, am1Names, am2Selected);
  const am2Names = am2Selected.map(s => s.name);

  // ④ 13:30〜18:00 を2名選出(午前の4名を全員除外)
  const allAmNames = am1Names.concat(am2Names);
  const pmPool = pool.filter(s => !allAmNames.includes(s.name));
  const pmSelected = [];
  selectSatSlotPM(data, pmPool, 2, allAmNames, pmSelected);

  const pushSat = (s, cat, time) => {
    finalShifts.push([dateStr, dow, time, s.name, cat, '那覇校']);
    workHours[s.name]  = (workHours[s.name]  || 0) + calculateDuration(time);
    shiftCount[s.name] = (shiftCount[s.name] || 0) + 1;
    if (dateAssigned[dateStr]) dateAssigned[dateStr].push(s.name);
  };

  am1Selected.forEach(s => pushSat(s, '③', '8:30~13:30'));
  am2Selected.forEach(s => pushSat(s, '③', '9:00~13:30'));
  pmSelected.forEach(s => pushSat(s, '④', '13:30~18:00'));
}

// ============================================================
// 直近の平日(土曜前6日以内)に入ったスタッフを返す
// ============================================================
function getRecentlyWorkedStaff(satDateStr, dateAssigned) {
  const satDate    = new Date(satDateStr);
  const recentNames = new Set();
  Object.keys(dateAssigned).forEach(ds => {
    if (ds === satDateStr) return;
    const d    = new Date(ds);
    const diff = (satDate - d) / (1000 * 60 * 60 * 24);
    if (diff > 0 && diff <= 7) {
      (dateAssigned[ds] || []).forEach(n => recentNames.add(n));
    }
  });
  return [...recentNames];
}

// ============================================================
// 公平性最優先＋AABBソフトルールのソート
// ============================================================
function sortByFairnessAndRotation(candidates, weekNum, workHours, shiftCount, recentlyWorked) {
  const arr = [...candidates];
  fisherYates(arr);

  const half        = Math.ceil(arr.length / 2);
  const isFirstHalf = weekNum % 4 <= 2;

  arr.sort((a, b) => {
    const recentA = recentlyWorked ? (recentlyWorked.includes(a.name) ? 1 : 0) : 0;
    const recentB = recentlyWorked ? (recentlyWorked.includes(b.name) ? 1 : 0) : 0;
    if (recentA !== recentB) return recentA - recentB;

    const cntDiff = (shiftCount[a.name]||0) - (shiftCount[b.name]||0);
    if (cntDiff !== 0) return cntDiff;

    const hourDiff = (workHours[a.name]||0) - (workHours[b.name]||0);
    if (Math.abs(hourDiff) >= 1) return hourDiff;

    const idxA  = arr.indexOf(a);
    const idxB  = arr.indexOf(b);
    const wRotA = isFirstHalf ? (idxA < half ? 0 : 1) : (idxA < half ? 1 : 0);
    const wRotB = isFirstHalf ? (idxB < half ? 0 : 1) : (idxB < half ? 1 : 0);
    if (wRotA !== wRotB) return wRotA - wRotB;

    return hourDiff;
  });

  return arr;
}

// ============================================================
// 旧assignWeekday・assignSaturday(フォールバック)
// ============================================================
function assignWeekday(data, dateStr, dow, hopeOffMap, workHours, shiftCount, finalShifts) {
  assignWeekdayV2(data, dateStr, dow, 1, hopeOffMap, workHours, shiftCount, finalShifts, {});
}
function assignSaturday(data, dateStr, dow, hopeOffMap, workHours, shiftCount, finalShifts) {
  assignSaturdayV2(data, dateStr, dow, 1, hopeOffMap, workHours, shiftCount, finalShifts, {});
}

// ============================================================
// 平日：ペアルール込みで必要人数を選出
// ============================================================
function selectForWeekday(data, candidates, needed, dow) {
  const selected = [];

  for (let i = 0; i < candidates.length && selected.length < needed; i++) {
    const s = candidates[i];
    if (selected.some(x => x.name === s.name)) continue;

    if (hasForbiddenPair(data, s.name, selected.map(x => x.name))) continue;

    const pairInfo = data.pairConditions.find(p => p.staff === s.name && p.condition === 'セット');
    if (pairInfo) {
      const partner = candidates.find(c => c.name === pairInfo.partner);
      if (!partner) continue;
      if (selected.some(x => x.name === partner.name)) {
        selected.push(s);
        continue;
      }
      if (needed - selected.length < 2) continue;
      if (hasForbiddenPair(data, partner.name, [...selected.map(x => x.name), s.name])) continue;
      selected.push(s, partner);
      continue;
    }

    const wouldBeAlone = (needed === 1) || (selected.length === needed - 1);
    if (wouldBeAlone && !canWorkAlone(data, s.name)) continue;

    selected.push(s);
  }

  return selected;
}

// ============================================================
// 土曜：スロット選出(必ずneeded名・セット条件＋禁止ペアを守る)
// ============================================================
function selectSatSlot(data, pool, needed, excludeNames, selected) {
  const usedNames = () => [...selected.map(s => s.name), ...excludeNames];

  for (let i = 0; i < pool.length && selected.length < needed; i++) {
    const s = pool[i];
    if (usedNames().includes(s.name)) continue;
    if (hasForbiddenPair(data, s.name, usedNames())) continue;

    const pairInfo = data.pairConditions.find(p => p.staff === s.name && p.condition === 'セット');
    if (pairInfo) {
      if (selected.some(x => x.name === pairInfo.partner)) {
        selected.push(s);
        continue;
      }
      const partner = pool.find(c => c.name === pairInfo.partner && !usedNames().includes(c.name));
      if (!partner) continue;
      if (needed - selected.length < 2) continue;
      if (hasForbiddenPair(data, partner.name, [...usedNames(), s.name])) continue;
      selected.push(s, partner);
      continue;
    }

    selected.push(s);
    if (selected.length >= needed) break;
  }
}

// ============================================================
// 土曜④専用：セットペアのパートナーが③にいる場合は単独でも可
// ============================================================
function selectSatSlotPM(data, pool, needed, amNames, selected) {
  const usedNames = () => [...selected.map(s => s.name), ...amNames];

  for (let i = 0; i < pool.length && selected.length < needed; i++) {
    const s = pool[i];
    if (usedNames().includes(s.name)) continue;
    if (hasForbiddenPair(data, s.name, usedNames())) continue;

    const pairInfo = data.pairConditions.find(p => p.staff === s.name && p.condition === 'セット');
    if (pairInfo) {
      if (amNames.includes(pairInfo.partner)) {
        selected.push(s);
        continue;
      }
      if (selected.some(x => x.name === pairInfo.partner)) {
        selected.push(s);
        continue;
      }
      const partner = pool.find(c => c.name === pairInfo.partner && !usedNames().includes(c.name));
      if (!partner) continue;
      if (needed - selected.length < 2) continue;
      if (hasForbiddenPair(data, partner.name, [...usedNames(), s.name])) continue;
      selected.push(s, partner);
      continue;
    }

    selected.push(s);
    if (selected.length >= needed) break;
  }
}

// ============================================================
// 各種チェック関数
// ============================================================

function hasForbiddenPair(data, name, assignedNames) {
  return data.pairConditions.some(p =>
    p.staff === name && p.condition === '禁止' && assignedNames.includes(p.partner)
  );
}

function canWorkAlone(data, name) {
  const s = data.staff.find(st => st.name === name);
  return s && s.oneop === '可';
}

function getSchoolEndTime(table, school, cls, course, dow) {
  const colMap = { '月': 3, '火': 4, '水': 5, '木': 6, '金': 7 };
  const col = colMap[dow];
  if (col === undefined) return null;

  const row = table.find(r =>
    String(r[0]).trim() === String(school).trim() &&
    String(r[1]).trim() === String(cls).trim()    &&
    String(r[2]).trim() === String(course).trim()
  );
  if (!row) return null;
  return row[col];
}

function canWorkFrom(data, s, dow, shiftStart) {
  if (shiftStart === '15:30' && s.weekday1530 === '不可') return false;

  const schoolEnd = getSchoolEndTime(data.timetable, s.school, s.cls, s.course, dow);
  if (schoolEnd === null || schoolEnd === undefined || schoolEnd === '') return false;

  return isTimeOk(schoolEnd, shiftStart, TRAVEL_TIME);
}

function isNoSchoolDay(dateStr, dow) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (dow === '日') return true;
  if (month === 6 && day === 23) return true;

  return false;
}

function isHopeOff(hopeOffMap, name, dateStr) {
  return !!(hopeOffMap[name] && hopeOffMap[name].has(dateStr));
}

function isTimeOk(end, start, travel) {
  const fmt = t => {
    if (t instanceof Date) return Utilities.formatDate(t, 'JST', 'HH:mm');
    return String(t).trim();
  };
  const e = fmt(end), s = fmt(start);
  if (!e.includes(':') || !s.includes(':')) return false;
  return timeToMin(e) + travel <= timeToMin(s);
}

function getRequiredCount(requiredCount, dow, slot) {
  const row = requiredCount.find(r => String(r[0]) === dow && String(r[1]) === slot);
  return row ? parseInt(row[2]) : 1;
}

function getStaffArea(data, name, dow) {
  if (!data.areaMap || !data.areaMap[name]) return '那覇校';
  return data.areaMap[name][dow] || '那覇校';
}

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function timeToMin(t) {
  const m = String(t).match(/(\d+):(\d+)/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

function calculateDuration(timeRange) {
  const parts = String(timeRange).split('~');
  if (parts.length < 2) return 0;
  return (timeToMin(parts[1]) - timeToMin(parts[0])) / 60;
}

function getSheetValues(ss, name) {
  const s = ss.getSheetByName(name);
  return s ? s.getDataRange().getValues() : [];
}

// ============================================================
// 希望休マップ構築
// ============================================================
function buildHopeOffMap(ss) {
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return {};
  const map = {};
  sheet.getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[4]).trim() !== '承認') return;
    const name    = String(r[2]).trim();
    const dateStr = Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM/dd');
    if (!map[name]) map[name] = new Set();
    map[name].add(dateStr);
  });
  return map;
}

// ============================================================
// Web アプリ
// ============================================================
function doGet(e) {
  const path  = (e && e.parameter && e.parameter.path)  || '';
  const token = (e && e.parameter && e.parameter.token) || '';

  if (path === 'manifest') {
    const appUrl = ScriptApp.getService().getUrl();
    const manifest = {
      name:             'ツクルキッズ シフト管理',
      short_name:       'シフト管理',
      description:      'ツクルキッズのシフト管理アプリ',
      start_url:        appUrl,
      display:          'standalone',
      background_color: '#f4f6f9',
      theme_color:      '#185FA5',
      orientation:      'portrait',
      icons: [
        { src: appUrl + '?path=icon192', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: appUrl + '?path=icon512', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    };
    return ContentService
      .createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (path === 'icon192' || path === 'icon512') {
    const size = path === 'icon512' ? 512 : 192;
    const r    = Math.round(size * 0.208);
    const svg  = `<svg width="${size}" height="${size}" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
<rect width="192" height="192" rx="${Math.round(192*0.208)}" fill="#185FA5"/>
<rect x="28" y="52" width="136" height="14" rx="7" fill="white" opacity="0.25"/>
<rect x="28" y="76" width="90"  height="14" rx="7" fill="white" opacity="0.9"/>
<rect x="28" y="100" width="110" height="14" rx="7" fill="white" opacity="0.6"/>
<rect x="28" y="124" width="70"  height="14" rx="7" fill="white" opacity="0.9"/>
<rect x="106" y="100" width="56" height="38" rx="7" fill="#10b981"/>
<text x="134" y="124" font-family="sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">&#10003;</text>
</svg>`;
    return ContentService
      .createTextOutput(svg)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  if (path === 'sw') {
    const appUrl = ScriptApp.getService().getUrl();
    const sw = `
const CACHE = 'tsukurukids-v4';
const APP_URL = '${appUrl}';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.add(APP_URL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(APP_URL))
    );
  }
});`;
    return ContentService
      .createTextOutput(sw)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  const template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('ツクルキッズ シフト管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getUserNameByEmail(email) {
  if (!email) return '';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ログインアカウント情報');
  if (!sheet) return email;
  const row = sheet.getDataRange().getValues().slice(1)
    .find(r => String(r[1]).trim().toLowerCase() === email.trim().toLowerCase());
  return row ? String(row[0]).trim() : email;
}

// ============================================================
// クライアントから呼ばれる関数
// ============================================================

function getShiftData(isAdmin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const values = ss.getSheetByName('完成シフト表_DB').getDataRange().getValues();
  const events = [];

  const today = new Date();
  const visibleYms = new Set();
  visibleYms.add(Utilities.formatDate(new Date(today.getFullYear(), today.getMonth(), 1), 'JST', 'yyyy/MM'));
  visibleYms.add(Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 1), 'JST', 'yyyy/MM'));

  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate) continue;

    if (!isAdmin) {
      const ym = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM');
      if (!visibleYms.has(ym)) continue;
    }

    const dateStr = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy-MM-dd');
    const areaStr = String(area || '那覇校').trim();
    const color = areaStr === 'うるま校' ? '#b45309' : '#475569';
    events.push({
      title: name,
      start: dateStr,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { time, cat, name, dow, area: areaStr }
    });
  }
  return events;
}

function getMyShiftData(staffName, isAdmin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const values = ss.getSheetByName('完成シフト表_DB').getDataRange().getValues();
  const events = [];

  const today = new Date();
  const visibleYms = new Set();
  visibleYms.add(Utilities.formatDate(new Date(today.getFullYear(), today.getMonth(), 1), 'JST', 'yyyy/MM'));
  visibleYms.add(Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 1), 'JST', 'yyyy/MM'));

  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate || name !== staffName) continue;

    if (!isAdmin) {
      const ym = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM');
      if (!visibleYms.has(ym)) continue;
    }

    const dateStr = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy-MM-dd');
    const areaStr = String(area || '那覇校').trim();
    events.push({
      title: cat + ' ' + time + (areaStr !== '那覇校' ? ' (' + areaStr + ')' : ''),
      start: dateStr,
      backgroundColor: areaStr === 'うるま校' ? '#d97706' : '#3b82f6',
      borderColor: areaStr === 'うるま校' ? '#b45309' : '#2563eb',
      extendedProps: { time, cat, name, dow, area: areaStr }
    });
  }
  return events;
}

function submitHopeOff(data) {
  const today = new Date();
  if (today.getDate() > HOPE_OFF_DEADLINE_DAY) {
    return { success: false, message: `今月の希望休申請は締め切りました(締切：毎月${HOPE_OFF_DEADLINE_DAY}日)` };
  }
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName('希望休申請');
  if (!sheet) {
    sheet = ss.insertSheet('希望休申請');
    sheet.appendRow(['申請日時','対象日','スタッフ名','理由','ステータス']);
  }
  sheet.appendRow([
    Utilities.formatDate(today, 'JST', 'yyyy/MM/dd HH:mm:ss'),
    data.date, data.staffName, data.reason || '', '申請中'
  ]);
  MailApp.sendEmail(ADMIN_EMAIL,
    `【希望休申請】${data.staffName}さんから申請`,
    `${data.staffName}さんが ${data.date} の希望休を申請しました。\n理由：${data.reason || 'なし'}`
  );
  return { success: true, message: '希望休を申請しました。管理者の承認をお待ちください。' };
}

function getHopeOffList() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1).map((r, i) => ({
    rowIndex: i + 2,
    appliedAt: r[0], date: r[1], staffName: r[2], reason: r[3], status: r[4]
  }));
}

function updateHopeOffStatus(rowIndex, status) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return { success: false };
  sheet.getRange(rowIndex, 5).setValue(status);
  // 承認/却下時にメール通知
  if (status === '承認' || status === '却下') {
    try {
      const row = sheet.getRange(rowIndex, 1, 1, 5).getValues()[0];
      const staffName = String(row[2]).trim();
      const dateStr = row[1] ? Utilities.formatDate(new Date(row[1]), 'JST', 'yyyy/MM/dd') : '';
      // スタッフのメールアドレスを取得
      const loginSheet = ss.getSheetByName('ログインアカウント情報');
      if (loginSheet) {
        const lr = loginSheet.getDataRange().getValues().slice(1);
        const staff = lr.find(r => String(r[0]).trim() === staffName);
        if (staff && staff[1]) {
          MailApp.sendEmail(
            String(staff[1]).trim(),
            '【希望休' + status + '】' + dateStr,
            staffName + ' さん\n\n' + dateStr + ' の希望休申請が「' + status + '」されました。'
          );
        }
      }
    } catch(e) {}
  }
  return { success: true };
}

/**
 * スタッフ別に希望休申請を取得(自分の履歴確認用)
 */
function getMyHopeOffList(staffName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return [];
  const today = new Date();
  const thisMonth = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth(), 1), 'JST', 'yyyy/MM');
  const nextMonth = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 1), 'JST', 'yyyy/MM');
  const afterNext = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 2, 1), 'JST', 'yyyy/MM');

  return sheet.getDataRange().getValues().slice(1)
    .map((r, i) => ({
      rowIndex: i + 2,
      appliedAt: r[0] ? Utilities.formatDate(new Date(r[0]), 'JST', 'yyyy/MM/dd HH:mm') : '',
      date: r[1] ? Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM/dd') : '',
      dateYm: r[1] ? Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM') : '',
      staffName: String(r[2] || ''),
      reason: String(r[3] || ''),
      status: String(r[4] || '')
    }))
    .filter(r => r.staffName === staffName)
    .filter(r => [thisMonth, nextMonth, afterNext].includes(r.dateYm))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function submitShiftSwap(data) {
  const today = new Date();
  const day   = today.getDate();

  if (day >= SHIFT_CONFIRM_DAY) {
    return {
      success: false,
      message: `シフトは確定済みです(毎月${SHIFT_CONFIRM_DAY}日以降は変更不可です)。管理者へ直接相談してください。`
    };
  }

  if (day < SHIFT_EXCHANGE_START || day > SHIFT_EXCHANGE_END) {
    return {
      success: false,
      message: `シフト調整依頼は毎月${SHIFT_EXCHANGE_START}日〜${SHIFT_EXCHANGE_END}日までです。承認されない場合は管理者へ直接相談してください。`
    };
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName('シフト交換管理');
  if (!sheet) {
    sheet = ss.insertSheet('シフト交換管理');
    sheet.appendRow(['申請日時','対象日','時間帯','曜日','申請者','承認者','ステータス']);
  }

  const shifts = data.shifts || [{
    date: data.date,
    timeRange: data.timeRange,
    dow: data.dow || ''
  }];

  const ts = Utilities.formatDate(today, 'JST', 'yyyy/MM/dd HH:mm:ss');

  shifts.forEach(s => {
    sheet.appendRow([
      ts,
      s.date,
      s.timeRange,
      s.dow || '',
      data.requester,
      '',
      '募集中'
    ]);
  });

  const shiftLines = shifts
    .map(s => `・${s.date}(${s.dow || ''}) ${s.timeRange}`)
    .join('\n');

  MailApp.sendEmail(
    ADMIN_EMAIL,
    `【シフト調整依頼】${data.requester}さんから全体発信`,
    `${data.requester}さんが以下のシフトの調整依頼を全体へ発信しました。\n\n${shiftLines}\n\n入れる学生はシフト管理アプリから承認してください。\n承認されない場合は管理者へ直接相談してください。`
  );

  return {
    success: true,
    message: '調整依頼を全体へ発信しました。LINE報告用テンプレをコピーしてLINEにも報告してください。'
  };
}

function approveSwap(rowIndex) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) return { success: false, message: 'シートが見つかりません' };

  const row    = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
  const status = String(row[6]).trim();

  if (status !== '募集中' && status !== '緊急募集中') {
    return { success: false, message: 'この依頼はすでに締め切られています(先着済み)。' };
  }

  return { success: true, needName: true, rowIndex: rowIndex };
}

function confirmSwapApproval(rowIndex, approverName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) return { success: false, message: 'シートが見つかりません' };
  const row    = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
  const status = String(row[6]).trim();
  if (status !== '募集中' && status !== '緊急募集中') {
    return { success: false, message: 'すでに他の人が先に承認しました。' };
  }
  sheet.getRange(rowIndex, 6).setValue(approverName);
  sheet.getRange(rowIndex, 7).setValue('承認済');
  const date      = row[1];
  const timeRange = String(row[2]);
  const requester = String(row[4]);
  swapInDB(date, timeRange, requester, approverName);
  return { success: true, message: `${approverName}さんの承認が確定しました!` };
}

function hasActiveSwapRequest(staffName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) return false;
  const today = new Date();
  const ym    = Utilities.formatDate(today, 'JST', 'yyyy/MM');
  const rows  = sheet.getDataRange().getValues().slice(1);
  return rows.some(r => {
    const requester = String(r[4]).trim();
    const status    = String(r[6]).trim();
    const dateStr   = r[1] ? Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM') : '';
    return requester === staffName
  && (status === '募集中' || status === '緊急募集中' || status === '承認済')
  && dateStr === ym;
  });
}

function getSwapList() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) return [];
  try {
    return sheet.getDataRange().getValues().slice(1).map((r, i) => ({
      rowIndex:  i + 2,
      appliedAt: String(r[0] || ''),
      date:      r[1] ? Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM/dd') : '',
      timeRange: String(r[2] || ''),
      dow:       String(r[3] || ''),
      requester: String(r[4] || ''),
      approver:  String(r[5] || ''),
      status:    String(r[6] || ''),
      type:      String(r[7] || ''),
      category:  String(r[8] || ''),
      note:      String(r[9] || ''),
    }));
  } catch(e) { return []; }
}

function getMyShiftsForSwap(staffName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return [];

  const today = new Date();
  const nextYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
    'JST',
    'yyyy/MM'
  );

  const values = sheet.getDataRange().getValues();
  const shifts = [];

  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate || String(name).trim() !== String(staffName).trim()) continue;

    const d = new Date(rawDate);
    const ym = Utilities.formatDate(d, 'JST', 'yyyy/MM');
    if (ym !== nextYm) continue;

    const dateStr = Utilities.formatDate(d, 'JST', 'yyyy/MM/dd');

    shifts.push({
      label: dateStr + '(' + String(dow) + ') ' + String(cat) + ' ' + String(time),
      date: dateStr,
      dow: String(dow),
      time: String(time),
      cat: String(cat),
      area: String(area || '那覇校')
    });
  }

  return shifts;
}

function getMyCurrentMonthShiftsForUrgentSwap(staffName) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return [];

  const today  = new Date();
  const values = sheet.getDataRange().getValues();
  const shifts = [];

  const currentYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth(), 1),
    'JST',
    'yyyy/MM'
  );

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate || String(name).trim() !== String(staffName).trim()) continue;

    const d = new Date(rawDate);
    if (d < todayStart) continue;

    const ym = Utilities.formatDate(d, 'JST', 'yyyy/MM');
    if (ym !== currentYm) continue;

    const dateStr = Utilities.formatDate(d, 'JST', 'yyyy/MM/dd');

    shifts.push({
      label: dateStr + '(' + String(dow) + ') ' + String(cat) + ' ' + String(time),
      date:  dateStr,
      dow:   String(dow),
      time:  String(time),
      cat:   String(cat),
      area:  String(area || '那覇校'),
    });
  }

  return shifts;
}

function submitUrgentSwap(data) {
  const today = new Date();

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) {
    sheet = ss.insertSheet('シフト交換管理');
    sheet.appendRow(['申請日時','対象日','時間帯','曜日','申請者','承認者','ステータス','種別','理由','補足']);
  } else {
    // 既存シートに列がない場合、追加
    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    const headers = headerRange.getValues()[0];
    if (headers.length < 10) {
      // 既存シートに追加列
      if (!headers[7]) sheet.getRange(1, 8).setValue('種別');
      if (!headers[8]) sheet.getRange(1, 9).setValue('理由');
      if (!headers[9]) sheet.getRange(1, 10).setValue('補足');
    }
  }

  const shifts = data.shifts || [];
  if (!shifts.length) {
    return { success: false, message: '代打依頼するシフトを選択してください。' };
  }
  if (!data.category) {
    return { success: false, message: '理由カテゴリを選択してください。' };
  }

  const ts = Utilities.formatDate(today, 'JST', 'yyyy/MM/dd HH:mm:ss');

  shifts.forEach(s => {
    sheet.appendRow([
      ts,
      s.date,
      s.timeRange,
      s.dow || '',
      data.requester,
      '',
      '緊急募集中',
      '急な代打',
      data.category || '',
      data.note || ''
    ]);
  });

  const shiftLines = shifts
    .map(s => `・${s.date}(${s.dow || ''}) ${s.timeRange}`)
    .join('\n');

  MailApp.sendEmail(
    ADMIN_EMAIL,
    `【急な代打依頼】${data.requester}さんから申請`,
    `${data.requester}さんが以下のシフトについて急な代打依頼を出しました。\n\n${shiftLines}\n\n理由：${data.category}${data.note ? '(' + data.note + ')' : ''}\n\n入れる学生はシフト管理アプリから承認します。管理者も状況を確認してください。`
  );

  return {
    success: true,
    message: '急な代打依頼を発信しました。LINEにも報告してください。'
  };
}

function cancelSwap(rowIndex) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シフト交換管理');
  if (!sheet) return { success: false, message: 'シートが見つかりません' };
  const row = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
  const status = String(row[6]).trim();
  if (status !== '募集中' && status !== '緊急募集中') {
    return { success: false, message: '募集中の依頼のみキャンセルできます' };
  }
  sheet.getRange(rowIndex, 7).setValue('キャンセル');
  return { success: true, message: '依頼をキャンセルしました' };
}

function swapInDB(date, timeRange, fromStaff, toStaff) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName('完成シフト表_DB');
  const values = sheet.getDataRange().getValues();
  const dateStr = (date instanceof Date)
    ? Utilities.formatDate(date, 'JST', 'yyyy/MM/dd') : String(date);

  for (let i = 1; i < values.length; i++) {
    const rowDate = (values[i][0] instanceof Date)
      ? Utilities.formatDate(values[i][0], 'JST', 'yyyy/MM/dd') : String(values[i][0]);
    if (rowDate === dateStr && String(values[i][2]) === String(timeRange) && values[i][3] === fromStaff) {
      sheet.getRange(i + 1, 4).setValue(toStaff);
      break;
    }
  }
}

function getStaffList() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ログインアカウント情報');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .map(r => ({ name: String(r[0]).trim(), email: String(r[1]).trim() }))
    .filter(s => s.name);
}

// ============================================================
// シフト編集(管理者用)
// ============================================================

function getShiftDataForEdit() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const rows   = [];
  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate) continue;
    const dateStr = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM/dd');
    rows.push({ rowIndex: i + 1, date: dateStr, dow: String(dow), time: String(time), name: String(name), cat: String(cat), area: String(area || '那覇校') });
  }
  return rows;
}

function updateShiftRow(req) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return { success: false, message: 'DBシートが見つかりません' };

  const values  = sheet.getDataRange().getValues();
  const row     = values[req.rowIndex - 1];
  const dateStr = Utilities.formatDate(new Date(row[0]), 'JST', 'yyyy/MM/dd');
  const time    = String(row[2]);
  const oldName = String(row[3]);
  const newName = String(req.newName).trim();

  if (oldName === newName) return { success: true, message: '変更なし' };

  const data = loadAllData(ss);

  const sameSlot = values.slice(1).filter((r, i) => {
    if (i + 2 === req.rowIndex) return false;
    const d = Utilities.formatDate(new Date(r[0]), 'JST', 'yyyy/MM/dd');
    return d === dateStr && String(r[2]) === time;
  }).map(r => String(r[3]));

  if (hasForbiddenPair(data, newName, sameSlot)) {
    const partners = data.pairConditions
      .filter(p => p.staff === newName && p.condition === '禁止' && sameSlot.includes(p.partner))
      .map(p => p.partner);
    return { success: false, message: `⚠️ 禁止ペア違反：${newName}さんと${partners.join('・')}さんは同じシフトに入れません。` };
  }

  const pairInfo = data.pairConditions.find(p => p.staff === newName && p.condition === 'セット');
  if (pairInfo && !sameSlot.includes(pairInfo.partner)) {
    return { success: false, message: `⚠️ セット条件違反：${newName}さんは${pairInfo.partner}さんとセットで入る必要があります。` };
  }

  const dow = String(row[1]);
  if (dow !== '土' && sameSlot.length === 0 && !canWorkAlone(data, newName)) {
    return { success: false, message: `⚠️ ワンオペ不可：${newName}さんは1人でのシフトに入れません。` };
  }

  const isSchoolHoliday = isNoSchoolDay(dateStr, dow);

  if (dow !== '土' && !isSchoolHoliday) {
    const staffInfo = data.staff.find(s => s.name === newName);
    if (staffInfo) {
      const shiftStart = time.split('~')[0];
      if (!canWorkFrom(data, staffInfo, dow, shiftStart)) {
        return { success: false, message: `⚠️ 時間割違反：${newName}さんは${dow}曜日の${shiftStart}からのシフトに間に合いません(授業終了時刻を確認してください)。` };
      }
      if (dow === '水' && staffInfo.suiyoShift === '不可') {
        return { success: false, message: `⚠️ ${newName}さんは水曜シフトが不可です。` };
      }
    }
  }


  sheet.getRange(req.rowIndex, 4).setValue(newName);
  return { success: true, message: `${oldName} → ${newName} に変更しました。` };
}

function issueToken(staffName) {
  const token = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  const today = new Date();
  const expire = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年有効
  props.setProperty('token_' + token, JSON.stringify({
    staffName: staffName,
    expire:    expire.getTime()
  }));
  return token;
}

function loginWithToken(token) {
  if (!token) return { success: false };
  try {
    const props = PropertiesService.getScriptProperties();
    const val   = props.getProperty('token_' + token);
    if (!val) return { success: false };
    const data  = JSON.parse(val);
    if (new Date().getTime() > data.expire) {
      props.deleteProperty('token_' + token);
      return { success: false };
    }
    return buildLoginResult(data.staffName);
  } catch(e) {
    return { success: false };
  }
}

function revokeToken(token) {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty('token_' + token);
}

function buildLoginResult(staffName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ログインアカウント情報');
  if (!sheet) return { success: false, message: 'ログインアカウント情報シートが見つかりません' };
  const rows  = sheet.getDataRange().getValues().slice(1);
  const row   = rows.find(r => String(r[0]).trim() === staffName.trim());
  if (!row) return { success: false, message: 'アカウントが見つかりません' };
  const name    = String(row[0]).trim();
  const email   = String(row[1]).trim();
  const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const today   = new Date();
  const day     = today.getDate();
  return {
    success:            true,
    userName:           name,
    userEmail:          email,
    isAdmin:            isAdmin,
    isShiftConfirmed:   day >= SHIFT_CONFIRM_DAY,
    isHopeOffDeadline:  day > HOPE_OFF_DEADLINE_DAY,
    isExchangePeriod: day >= SHIFT_EXCHANGE_START && day <= SHIFT_EXCHANGE_END,
    confirmDay:         SHIFT_CONFIRM_DAY,
    hopeOffDeadlineDay: HOPE_OFF_DEADLINE_DAY,
    presentDay:         SHIFT_PRESENT_DAY,
    exchangeStart:      SHIFT_EXCHANGE_START,
    exchangeEnd:        SHIFT_EXCHANGE_END,
  };
}

function loginWithPassword(staffName, password) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('ログインアカウント情報');
    if (!sheet) return { success: false, message: 'ログインアカウント情報シートが見つかりません' };

    const rows = sheet.getDataRange().getValues().slice(1);
    const row  = rows.find(r =>
      String(r[0]).trim() === String(staffName).trim() &&
      String(r[2]).trim() === String(password).trim()
    );
    if (!row) return { success: false, message: 'スタッフ名またはパスワードが間違っています' };

    const name    = String(row[0]).trim();
    const email   = String(row[1]).trim();
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const today   = new Date();
    const day     = today.getDate();
    return {
      success:            true,
      userName:           name,
      userEmail:          email,
      isAdmin:            isAdmin,
      isShiftConfirmed:   day >= SHIFT_CONFIRM_DAY,
      isHopeOffDeadline:  day > HOPE_OFF_DEADLINE_DAY,
      isExchangePeriod:   day >= SHIFT_EXCHANGE_START && day <= SHIFT_EXCHANGE_END,
      confirmDay:         SHIFT_CONFIRM_DAY,
      hopeOffDeadlineDay: HOPE_OFF_DEADLINE_DAY,
      presentDay:         SHIFT_PRESENT_DAY,
      exchangeStart:      SHIFT_EXCHANGE_START,
      exchangeEnd:        SHIFT_EXCHANGE_END,
    };
  } catch(e) {
    return { success: false, message: 'エラーが発生しました: ' + e.message };
  }
}

function getStaffNames() {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets().map(s => s.getName());
    Logger.log('シート一覧: ' + JSON.stringify(sheets));
    const sheet  = ss.getSheetByName('ログインアカウント情報');
    if (!sheet) {
      Logger.log('ログインアカウント情報シートが見つかりません');
      return [];
    }
    const values = sheet.getDataRange().getValues();
    Logger.log('行数: ' + values.length);
    const names = values.slice(1)
      .map(r => String(r[0]).trim())
      .filter(n => n && n !== 'スタッフ名');
    Logger.log('スタッフ名: ' + JSON.stringify(names));
    return names;
  } catch(e) {
    Logger.log('エラー: ' + e.message);
    return [];
  }
}

function getPageInfo() {
  const today = new Date();
  const day   = today.getDate();
  return {
    isShiftConfirmed:   day >= SHIFT_CONFIRM_DAY,
    isHopeOffDeadline:  day > HOPE_OFF_DEADLINE_DAY,
    isExchangePeriod:   day >= SHIFT_EXCHANGE_START && day <= SHIFT_EXCHANGE_END,
    confirmDay:         SHIFT_CONFIRM_DAY,
    hopeOffDeadlineDay: HOPE_OFF_DEADLINE_DAY,
    presentDay:         SHIFT_PRESENT_DAY,
    exchangeStart:      SHIFT_EXCHANGE_START,
    exchangeEnd:        SHIFT_EXCHANGE_END,
  };
}

// ============================================================
// 給与計算
// ============================================================

function getWageSettings() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName('給与設定');
  if (!sheet) {
    sheet = ss.insertSheet('給与設定');
    sheet.appendRow(['スタッフ名', '時給(円)']);
    sheet.getRange(1,1,1,2).setFontWeight('bold');
  }
  const rows = sheet.getDataRange().getValues().slice(1);
  const result = {};
  rows.forEach(r => {
    const name = String(r[0]).trim();
    const wage = Number(r[1]) || 0;
    if (name) result[name] = wage;
  });
  return result;
}

function saveWageSettings(wages) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName('給与設定');
    if (!sheet) {
      sheet = ss.insertSheet('給与設定');
    }
    sheet.clearContents();
    sheet.appendRow(['スタッフ名', '時給(円)']);
    sheet.getRange(1,1,1,2).setFontWeight('bold');
    Object.entries(wages).forEach(([name, wage]) => {
      if (name) sheet.appendRow([name, Number(wage) || 0]);
    });
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function calcWages(month) {
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const dbSheet = ss.getSheetByName('完成シフト表_DB');
    if (!dbSheet) return { success: false, message: 'DBシートが見つかりません' };

    const wages   = getWageSettings();
    const rows    = dbSheet.getDataRange().getValues().slice(1);

    const duration = {
      '15:30~19:00': 3.5,
      '16:00~19:00': 3.0,
      '8:30~13:30':  5.0,
      '9:00~13:30':  4.5,
      '13:30~18:00': 4.5,
      '9:00~18:00':  9.0,
    };

    const summary = {};

    rows.forEach(r => {
      const rawDate = r[0];
      if (!rawDate) return;
      const dateStr = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM');
      if (dateStr !== month) return;

      const name = String(r[3]).trim();
      const time = String(r[2]).trim();
      const h    = duration[time] || 0;
      const wage = wages[name] || 0;

      if (!summary[name]) summary[name] = { hours: 0, shifts: 0, pay: 0 };
      summary[name].hours  += h;
      summary[name].shifts += 1;
      summary[name].pay    += h * wage;
    });

    let totalPay   = 0;
    let totalHours = 0;
    Object.values(summary).forEach(s => {
      totalPay   += s.pay;
      totalHours += s.hours;
    });

    return {
      success:    true,
      month:      month,
      summary:    summary,
      totalPay:   totalPay,
      totalHours: totalHours,
      wages:      wages,
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function addManualOpenDay(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const date = new Date(data.date);
    if (!data.date || isNaN(date.getTime())) {
      return { success: false, message: '日付が正しくありません' };
    }

    const today = new Date();
    const targetYm = Utilities.formatDate(date, 'JST', 'yyyy/MM');
    const currentYm = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth(), 1), 'JST', 'yyyy/MM');
    const nextYm = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 1), 'JST', 'yyyy/MM');
    const afterNextYm = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 2, 1), 'JST', 'yyyy/MM');

    let sheetName = '';
    if (targetYm === currentYm) sheetName = '開校日';
    if (targetYm === nextYm) sheetName = '開校日（翌月）';
    if (targetYm === afterNextYm) sheetName = '開校日（再来月）';

    if (!sheetName) {
      return { success: false, message: '登録できるのは今月・翌月・再来月のみです' };
    }

    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) sheet.appendRow(['日付','曜日','イベント名']);

    const dateStr = Utilities.formatDate(date, 'JST', 'yyyy/MM/dd');
    const dow = ['日','月','火','水','木','金','土'][date.getDay()];
    const type = data.type || 'イレギュラー開校';

    const rows = sheet.getDataRange().getValues().slice(1);
    const exists = rows.some(r => {
      if (!r[0]) return false;
      return Utilities.formatDate(new Date(r[0]), 'JST', 'yyyy/MM/dd') === dateStr;
    });

    if (exists) {
      return { success: false, message: 'この日はすでに開校日に登録されています' };
    }

    sheet.appendRow([dateStr, dow, type]);
    sortOpenDaySheet(sheet);

    return { success: true, message: sheetName + ' に追加しました' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function sortOpenDaySheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return;
  sheet.getRange(2, 1, lastRow - 1, 3).sort({ column: 1, ascending: true });
}

function getShiftDataForEditByMonth(offset) {
  offset = Number(offset || 1);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return [];

  const today = new Date();
  const targetYm = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth() + offset, 1),
    'JST',
    'yyyy/MM'
  );

  const values = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const [rawDate, dow, time, name, cat, area] = values[i];
    if (!rawDate) continue;

    const date = new Date(rawDate);
    const ym = Utilities.formatDate(date, 'JST', 'yyyy/MM');
    if (ym !== targetYm) continue;

    const dateStr = Utilities.formatDate(date, 'JST', 'yyyy/MM/dd');
    rows.push({
      rowIndex: i + 1,
      date: dateStr,
      dow: String(dow),
      time: String(time),
      name: String(name),
      cat: String(cat),
      area: String(area || '那覇校')
    });
  }

  return rows;
}

function getMonthlyHoursByStaff(month) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbSheet = ss.getSheetByName('完成シフト表_DB');
    if (!dbSheet) return { success: false, message: 'DBシートが見つかりません' };

    const loginSheet = ss.getSheetByName('ログインアカウント情報');
    let adminName = '';
    if (loginSheet) {
      const lr = loginSheet.getDataRange().getValues().slice(1);
      const ad = lr.find(r => String(r[1]).trim().toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (ad) adminName = String(ad[0]).trim();
    }

    const rows = dbSheet.getDataRange().getValues().slice(1);
    const duration = {
      '15:30~19:00': 3.5,
      '16:00~19:00': 3.0,
      '8:30~13:30':  5.0,
      '9:00~13:30':  4.5,
      '13:30~18:00': 4.5,
      '9:00~18:00':  9.0,
    };
    const summary = {};

    rows.forEach(r => {
      const rawDate = r[0];
      if (!rawDate) return;
      const ym = Utilities.formatDate(new Date(rawDate), 'JST', 'yyyy/MM');
      if (ym !== month) return;
      const name = String(r[3]).trim();
      if (!name) return;
      if (name === adminName) return;
      const time = String(r[2]).trim();
      const h = duration[time] || 0;
      if (!summary[name]) summary[name] = { hours: 0, shifts: 0 };
      summary[name].hours += h;
      summary[name].shifts += 1;
    });

    return { success: true, month: month, summary: summary };
  } catch(e) {
    return { success: false, message: e.message };
  }
}


// ============================================================
// 【ヘルプ募集機能】
// 不足している日を検出し、指定スタッフが入れる日だけを返す
// ============================================================

/**
 * 指定スタッフが入れる不足日リストを取得
 * - 完成シフト表_DBから今月・翌月の現状シフトを取得
 * - 曜日・時間別必要スタッフ数と比較
 * - 不足している日を検出
 * - 対象スタッフの時間割・希望休をチェックして「入れる日」のみ返す
 */
function getShortageDaysForStaff(staffName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = loadAllData(ss, '開校日');
  const dbSheet = ss.getSheetByName('完成シフト表_DB');
  if (!dbSheet) return { days: [] };

  // 対象スタッフの情報
  const targetStaff = data.staff.find(s => s.name === staffName);
  if (!targetStaff) return { days: [] };

  // 希望休マップ
  const hopeOffMap = buildHopeOffMap(ss);

  // 今月・翌月の日付範囲
  const today = new Date();
  const rangeStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  // 現状のシフト取得 → 日付+時間帯ごとの人数マップ
  const shiftCount = {}; // {'yyyy/MM/dd|time': count}
  const shiftNames = {}; // {'yyyy/MM/dd|time': [names]}
  const rows = dbSheet.getDataRange().getValues().slice(1);
  rows.forEach(r => {
    if (!r[0]) return;
    const d = new Date(r[0]);
    if (d < rangeStart || d > rangeEnd) return;
    const dateStr = Utilities.formatDate(d, 'JST', 'yyyy/MM/dd');
    const time = String(r[2]).trim();
    const name = String(r[3]).trim();
    const key = dateStr + '|' + time;
    shiftCount[key] = (shiftCount[key] || 0) + 1;
    if (!shiftNames[key]) shiftNames[key] = [];
    shiftNames[key].push(name);
  });

  // 全開校日を取得(今月・翌月・再来月)
  const allOpenDays = [];
  ['開校日', '開校日(翌月)', '開校日（翌月）', '開校日(再来月)', '開校日（再来月）'].forEach(sn => {
    const s = ss.getSheetByName(sn);
    if (!s) return;
    s.getDataRange().getValues().slice(1).forEach(r => {
      if (!r[0]) return;
      const d = new Date(r[0]);
      if (d < rangeStart || d > rangeEnd) return;
      allOpenDays.push({
        date: d,
        dow: String(r[1]).trim(),
        type: String(r[2] || '').trim()
      });
    });
  });

  // 各開校日について、不足があるか&自分が入れるかを判定
  const shortageDays = [];
  allOpenDays.forEach(day => {
    const dateStr = Utilities.formatDate(day.date, 'JST', 'yyyy/MM/dd');
    const dow = day.dow;
    const isSpecialEvent = String(day.type || '').includes('体験');

    // 既にこの日にシフトに入っているスタッフ
    const alreadyInDay = [];
    Object.keys(shiftNames).forEach(key => {
      if (key.startsWith(dateStr + '|')) {
        alreadyInDay.push.apply(alreadyInDay, shiftNames[key]);
      }
    });
    // 自分がもう入っている日はスキップ
    if (alreadyInDay.indexOf(staffName) !== -1) return;

    // 希望休申請中/承認済みならスキップ
    if (isHopeOff(hopeOffMap, staffName, dateStr)) return;

    // 曜日別の必要人数チェック
    let slotsToCheck = [];
    if (dow === '土' || dow === '日') {
      // 土曜は ③8:30~13:30(那覇3名), ③9:00~13:30(体験時のみ1名), ④13:30~18:00(2名)
      slotsToCheck.push({time: '8:30~13:30', required: 3, cat: '③', area: '那覇校'});
      if (isSpecialEvent) {
        slotsToCheck.push({time: '9:00~13:30', required: 1, cat: '③', area: '那覇校'});
      }
      slotsToCheck.push({time: '13:30~18:00', required: 2, cat: '④', area: '那覇校'});
    } else {
      // 平日
      if (isSpecialEvent) {
        slotsToCheck.push({time: '15:30~19:00', required: 2, cat: '①', area: '那覇校'});
      } else {
        slotsToCheck.push({time: '16:00~19:00', required: 2, cat: '②', area: '那覇校'});
      }
    }

    // 各スロットについて不足チェック+自分が入れるかチェック
    slotsToCheck.forEach(slot => {
      const key = dateStr + '|' + slot.time;
      const currentCount = shiftCount[key] || 0;
      const shortage = slot.required - currentCount;
      if (shortage <= 0) return; // 不足なし

      // 自分が入れる時間割かチェック
      const shiftStart = slot.time.split('~')[0];
      // 水曜不可チェック
      if (dow === '水' && targetStaff.suiyoShift === '不可') return;
      // 土曜不可チェック
      if ((dow === '土' || dow === '日') && targetStaff.satShift === '不可') return;
      // 平日の時間割チェック(土曜以外)
      if (dow !== '土' && dow !== '日') {
        if (!canWorkFrom(data, targetStaff, dow, shiftStart)) return;
      }

      // 一緒に入るスタッフの名前
      const partners = (shiftNames[key] || []).filter(n => n !== staffName);

      shortageDays.push({
        date: dateStr,
        dow: dow,
        time: slot.time,
        cat: slot.cat,
        area: slot.area,
        currentCount: currentCount,
        required: slot.required,
        shortage: shortage,
        partners: partners,
        isSpecialEvent: isSpecialEvent
      });
    });
  });

  // 日付順にソート
  shortageDays.sort((a, b) => new Date(a.date) - new Date(b.date));

  return { days: shortageDays };
}

/**
 * スタッフがヘルプ募集の穴に入る
 */
function applyForShift(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('完成シフト表_DB');
  if (!sheet) return { success: false, message: 'DBシートが見つかりません' };

  // 再度チェック(他の人が先に入ってないか)
  const check = getShortageDaysForStaff(data.staffName);
  const stillAvailable = check.days.find(d =>
    d.date === data.date && d.time === data.time
  );
  if (!stillAvailable) {
    return { success: false, message: 'この時間帯は既に埋まっています。' };
  }

  // 追加
  sheet.appendRow([
    data.date,
    data.dow,
    data.time,
    data.staffName,
    data.cat,
    data.area || '那覇校'
  ]);

  // メール通知(管理者へ)
  try {
    MailApp.sendEmail(
      ADMIN_EMAIL,
      '【ヘルプ募集で応募】' + data.staffName + 'さんが' + data.date + 'に参加',
      data.staffName + ' さんが不足していた ' + data.date + '(' + data.dow + ') ' + data.time + ' のシフトに自主的に入りました。'
    );
  } catch(e) {}

  return { success: true, message: 'シフトに入りました!ありがとうございます。' };
}

/**
 * 管理者用:全ての希望休申請を取得(承認待ちと過去分含む)
 * 修正: dateRaw の Date オブジェクトを削除
 *       → google.script.run 経由でブラウザに正しく渡るように
 */
function getAllHopeOffList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('希望休申請');
  if (!sheet) return [];
  const today = new Date();
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const rows = sheet.getDataRange().getValues().slice(1)
    .map((r, i) => ({
      rowIndex: i + 2,
      appliedAt: r[0] ? Utilities.formatDate(new Date(r[0]), 'JST', 'yyyy/MM/dd HH:mm') : '',
      date: r[1] ? Utilities.formatDate(new Date(r[1]), 'JST', 'yyyy/MM/dd') : '',
      dateMs: r[1] ? new Date(r[1]).getTime() : 0,
      staffName: String(r[2] || ''),
      reason: String(r[3] || ''),
      status: String(r[4] || '')
    }))
    .filter(r => r.dateMs > 0 && r.dateMs >= rangeStart.getTime());

  // ソート: 申請中を優先、その次に日付順
  rows.sort((a, b) => {
    if (a.status === '申請中' && b.status !== '申請中') return -1;
    if (a.status !== '申請中' && b.status === '申請中') return 1;
    return a.dateMs - b.dateMs;
  });

  // dateMs は不要なので削除して返す
  return rows.map(r => ({
    rowIndex: r.rowIndex,
    appliedAt: r.appliedAt,
    date: r.date,
    staffName: r.staffName,
    reason: r.reason,
    status: r.status
  }));
}

// ============================================================
// 【QR勤怠】スキャン打刻・勤怠記録・実績給与計算
// ============================================================
// 仕組み:
//   - 管理者画面に「今日の出勤用QRコード」を表示(印刷して掲示も可)
//   - QRの中身は QR_PUNCH_PREFIX + その日限りのトークン
//     (トークン = SHA-256(日付|秘密鍵) の先頭8桁。秘密鍵はスクリプトプロパティに自動生成)
//     → 前日のQRの写真や自宅からの再利用では打刻できない
//   - スタッフはアプリの「打刻」画面でカメラスキャン(手入力フォールバックあり)
//   - 1回目のスキャン=出勤、2回目=退勤。3回目以降は退勤時刻を上書き(最後の打刻が退勤)
//   - 毎月1日のトリガーで先月分を集計し「給与計算_実績」シートへ保存

function getQrSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('QR_SECRET');
  if (!s) {
    s = Utilities.getUuid();
    props.setProperty('QR_SECRET', s);
  }
  return s;
}

function attendanceTokenFor_(dateStr) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, dateStr + '|' + getQrSecret_());
  return raw.slice(0, 4)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

/** 管理者画面: 今日のQRコードの中身(テキスト)を取得 */
function getQrPunchInfo() {
  const today = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd');
  const token = attendanceTokenFor_(today);
  return { date: today, token: token, text: QR_PUNCH_PREFIX + token };
}

function fmtTimeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'JST', 'HH:mm');
  return String(v || '').trim();
}

function attendanceHours_(inT, outT) {
  const a = timeToMin(fmtTimeCell_(inT));
  const b = timeToMin(fmtTimeCell_(outT));
  if (!a || !b || b <= a) return 0;
  return Math.round((b - a) / 60 * 100) / 100;
}

/**
 * スタッフの打刻。qrText はスキャンしたQRの中身(または手入力トークン)。
 * 1回目=出勤 / 2回目=退勤 / 3回目以降=退勤を上書き。
 */
function punchAttendance(staffName, qrText) {
  if (!staffName) return { success: false, message: 'スタッフ名がありません' };
  let text = String(qrText || '').trim();
  // 手入力ではトークンのみの入力も許可
  if (text.indexOf(QR_PUNCH_PREFIX) === 0) text = text.slice(QR_PUNCH_PREFIX.length);
  if (!text) return { success: false, message: 'QRコードを読み取れませんでした' };

  const today = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd');
  if (text.toLowerCase() !== attendanceTokenFor_(today)) {
    return { success: false, message: 'QRコードが正しくないか、期限切れです。今日の出勤用QRを読み取ってください。' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ATTENDANCE_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(ATTENDANCE_SHEET);
      sheet.appendRow(['日付', 'スタッフ名', '出勤時刻', '退勤時刻', '勤務時間(h)']);
    }
    const nowStr = Utilities.formatDate(new Date(), 'JST', 'HH:mm');
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (!values[i][0]) continue;
      const d = Utilities.formatDate(new Date(values[i][0]), 'JST', 'yyyy/MM/dd');
      if (d !== today || String(values[i][1]).trim() !== String(staffName).trim()) continue;
      const inT = fmtTimeCell_(values[i][2]);
      // 2回目以降: 退勤時刻を記録(既にあれば上書き=最後の打刻が退勤)
      sheet.getRange(i + 1, 4).setValue(nowStr);
      sheet.getRange(i + 1, 5).setValue(attendanceHours_(inT, nowStr));
      return {
        success: true, type: '退勤', time: nowStr,
        message: '退勤を記録しました（' + nowStr + '） おつかれさまでした！'
      };
    }
    sheet.appendRow([today, staffName, nowStr, '', '']);
    return {
      success: true, type: '出勤', time: nowStr,
      message: '出勤を記録しました（' + nowStr + '） 今日もよろしくお願いします！'
    };
  } finally {
    lock.releaseLock();
  }
}

/** 勤怠記録を月指定で取得(管理者用)。month='yyyy/MM' */
function getAttendanceForMonth(month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!sheet) return [];
  const rows = [];
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[0]) return;
    const d = new Date(r[0]);
    const ym = Utilities.formatDate(d, 'JST', 'yyyy/MM');
    if (month && ym !== month) return;
    const inT = fmtTimeCell_(r[2]);
    const outT = fmtTimeCell_(r[3]);
    rows.push({
      date: Utilities.formatDate(d, 'JST', 'yyyy/MM/dd'),
      name: String(r[1] || '').trim(),
      in: inT,
      out: outT,
      hours: outT ? (Number(r[4]) || attendanceHours_(inT, outT)) : 0,
      open: !outT
    });
  });
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || a.name.localeCompare(b.name); });
  return rows;
}

/** 自分の勤怠記録(スタッフ用・当月) */
function getMyAttendance(staffName) {
  const month = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM');
  return getAttendanceForMonth(month).filter(function (r) { return r.name === String(staffName).trim(); });
}

/** 勤怠実績×時給から給与を計算。month='yyyy/MM' */
function calcAttendancePayroll(month) {
  try {
    const rows = getAttendanceForMonth(month);
    const wages = getWageSettings();
    const summary = {};
    rows.forEach(function (r) {
      if (!r.name) return;
      if (!summary[r.name]) summary[r.name] = { hours: 0, days: 0, pay: 0, openDays: 0 };
      summary[r.name].days += 1;
      if (r.open) { summary[r.name].openDays += 1; return; } // 退勤なしは時間0(要確認として件数のみ)
      summary[r.name].hours = Math.round((summary[r.name].hours + r.hours) * 100) / 100;
    });
    let totalPay = 0, totalHours = 0;
    Object.keys(summary).forEach(function (name) {
      const s = summary[name];
      s.wage = wages[name] || 0;
      s.pay = Math.round(s.hours * s.wage);
      totalPay += s.pay;
      totalHours = Math.round((totalHours + s.hours) * 100) / 100;
    });
    return { success: true, month: month, summary: summary, totalPay: totalPay, totalHours: totalHours };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/** 計算結果を「給与計算_実績」シートへ保存(同月の既存行は置き換え) */
function writePayrollResult_(month, result) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PAYROLL_RESULT_SHEET);
  const header = ['対象月', 'スタッフ名', '勤務日数', '勤務時間(h)', '時給(円)', '給与(円)', '計算日時'];
  if (!sheet) {
    sheet = ss.insertSheet(PAYROLL_RESULT_SHEET);
    sheet.appendRow(header);
  }
  const values = sheet.getDataRange().getValues();
  const kept = values.slice(1).filter(function (r) { return String(r[0]) !== month; });
  sheet.clear();
  sheet.appendRow(header);
  const ts = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm');
  const newRows = Object.keys(result.summary).sort().map(function (name) {
    const s = result.summary[name];
    return [month, name, s.days, s.hours, s.wage, s.pay, ts];
  });
  const all = kept.concat(newRows);
  if (all.length) sheet.getRange(2, 1, all.length, header.length).setValues(all);
}

/** 毎月1日のトリガーから呼ばれる: 先月分を計算して保存 */
function monthlyPayrollJob() {
  const today = new Date();
  const prevMonth = Utilities.formatDate(
    new Date(today.getFullYear(), today.getMonth() - 1, 1), 'JST', 'yyyy/MM');
  const result = calcAttendancePayroll(prevMonth);
  if (result.success) writePayrollResult_(prevMonth, result);
  return result;
}

/**
 * 管理者画面用: 実績給与を取得。
 * 保存済み(給与計算_実績)があればそれを、無ければその場で計算して返す。
 */
function getAttendancePayroll(month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PAYROLL_RESULT_SHEET);
  if (sheet) {
    const rows = sheet.getDataRange().getValues().slice(1)
      .filter(function (r) { return String(r[0]) === month; });
    if (rows.length) {
      const summary = {};
      let totalPay = 0, totalHours = 0, calculatedAt = '';
      rows.forEach(function (r) {
        summary[String(r[1])] = {
          days: Number(r[2]) || 0, hours: Number(r[3]) || 0,
          wage: Number(r[4]) || 0, pay: Number(r[5]) || 0, openDays: 0
        };
        totalPay += Number(r[5]) || 0;
        totalHours = Math.round((totalHours + (Number(r[3]) || 0)) * 100) / 100;
        calculatedAt = String(r[6] || '');
      });
      return { success: true, month: month, summary: summary, totalPay: totalPay, totalHours: totalHours, fromSheet: true, calculatedAt: calculatedAt };
    }
  }
  const live = calcAttendancePayroll(month);
  live.fromSheet = false;
  return live;
}

/** 管理者画面用: 手動で計算してシートに保存(月次トリガーを待たずに確定したい場合) */
function recalcAndSavePayroll(month) {
  const result = calcAttendancePayroll(month);
  if (!result.success) return result;
  writePayrollResult_(month, result);
  result.fromSheet = true;
  return result;
}

// =====================================================================
// LMS Spreadsheet Relay - GAS Web App
// 配置先: Apps Script project (Spreadsheet と紐付け済み)
// 必要な ScriptProperties:
//   GAS_SECRET ... HMAC 共有秘密 (LMS の env と同じ値)
// =====================================================================

const SHEET_NAMES = ["Course", "Lesson", "Test", "Question", "Choice"];
const HEADERS = {
  Course:   ["id", "title", "description", "order", "published", "createdAt", "updatedAt"],
  Lesson:   ["id", "courseId", "title", "description", "videoUrl", "durationSec", "order", "blockSeek", "requiredCompletionRate", "createdAt", "updatedAt"],
  Test:     ["id", "courseId", "title", "passingScore", "maxAttempts", "published", "createdAt", "updatedAt"],
  Question: ["id", "testId", "order", "type", "text", "createdAt", "updatedAt"],
  Choice:   ["id", "questionId", "order", "text", "isCorrect", "createdAt", "updatedAt"],
};
const HEADER_LABELS_JA = {
  Course:   ["id (主キー)", "title (コース名)", "description (説明)", "order (表示順)", "published (公開)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Lesson:   ["id (主キー)", "courseId (所属コースID)", "title (レッスン名)", "description (説明)", "videoUrl (動画URL)", "durationSec (動画長秒)", "order (表示順)", "blockSeek (早送り抑止)", "requiredCompletionRate (完了率)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Test:     ["id (主キー)", "courseId (対象コースID)", "title (テスト名)", "passingScore (合格点)", "maxAttempts (最大受験回数)", "published (公開)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Question: ["id (主キー)", "testId (所属テストID)", "order (表示順)", "type (出題形式)", "text (設問文)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Choice:   ["id (主キー)", "questionId (所属設問ID)", "order (表示順)", "text (選択肢文)", "isCorrect (正解)", "createdAt (作成日時)", "updatedAt (更新日時)"],
};
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 分

// ---------------------- doPost (entry point) ----------------------
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "";
    const ts  = headerOf_(e, "X-Timestamp");
    const sig = headerOf_(e, "X-Signature");

    const verify = verifySignature_(ts, raw, sig);
    if (!verify.ok) return jsonOut_({ ok: false, error: verify.error });

    let body;
    try { body = JSON.parse(raw); }
    catch (_) { return jsonOut_({ ok: false, error: { code: "BAD_REQUEST", message: "invalid JSON body" } }); }

    const action = body.action;
    const params = Object.assign({}, body); delete params.action;

    switch (action) {
      case "list_courses":   return jsonOut_(handleList_("Course"));
      case "list_lessons":   return jsonOut_(handleList_("Lesson",   filterBy_(params, "courseId")));
      case "list_tests":     return jsonOut_(handleList_("Test",     filterBy_(params, "courseId")));
      case "list_questions": return jsonOut_(handleList_("Question", filterBy_(params, "testId")));
      case "list_choices":   return jsonOut_(handleList_("Choice",   filterBy_(params, "questionId")));
      case "send_mail":      return jsonOut_(handleSendMail_(params));
      default:
        return jsonOut_({ ok: false, error: { code: "BAD_REQUEST", message: "unknown action: " + String(action) } });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: { code: "INTERNAL", message: String(err && err.message || err) } });
  }
}

// ---------------------- list handler ----------------------
function handleList_(sheetName, filter) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return { ok: false, error: { code: "INTERNAL", message: "sheet not found: " + sheetName } };
  const range = sh.getDataRange().getValues();
  if (range.length < 2) return { ok: true, data: [] };

  const headerRow = range[0].map(extractHeaderId_);
  const expected = HEADERS[sheetName];
  for (const h of expected) {
    if (headerRow.indexOf(h) < 0) {
      return { ok: false, error: { code: "INTERNAL", message: "missing column: " + h + " in " + sheetName } };
    }
  }

  const rows = [];
  for (let i = 1; i < range.length; i++) {
    const row = range[i];
    if (isEmptyRow_(row)) continue;
    const obj = {};
    expected.forEach((col) => {
      obj[col] = coerceValue_(sheetName, col, row[headerRow.indexOf(col)]);
    });
    if (filter && !matchFilter_(obj, filter)) continue;
    rows.push(obj);
  }
  return { ok: true, data: rows };
}

// ---------------------- send_mail handler ----------------------
function handleSendMail_(params) {
  const to             = String(params.to || "").trim();
  const subject        = String(params.subject || "").trim();
  const body           = String(params.body || "");
  const idempotencyKey = String(params.idempotencyKey || "").trim();

  if (!to || !subject || !idempotencyKey) {
    return { ok: false, error: { code: "BAD_REQUEST", message: "to / subject / idempotencyKey are required" } };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = "mail:" + idempotencyKey;
  if (cache.get(cacheKey)) {
    return { ok: true, data: { accepted: true, deduped: true } };
  }

  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
    cache.put(cacheKey, "1", 60 * 60 * 24);
    return { ok: true, data: { accepted: true } };
  } catch (e) {
    return { ok: false, error: { code: "MAIL_FAILED", message: String(e && e.message || e) } };
  }
}

// ---------------------- HMAC verification ----------------------
function verifySignature_(ts, raw, sig) {
  const secret = PropertiesService.getScriptProperties().getProperty("GAS_SECRET");
  if (!secret) return { ok: false, error: { code: "INTERNAL", message: "GAS_SECRET is not set" } };
  if (!ts || !sig) return { ok: false, error: { code: "INVALID_SIGNATURE", message: "missing X-Timestamp or X-Signature" } };

  const tsNum = Number(ts);
  if (!isFinite(tsNum)) return { ok: false, error: { code: "INVALID_SIGNATURE", message: "invalid X-Timestamp" } };
  if (Math.abs(Date.now() - tsNum) > TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, error: { code: "EXPIRED_TIMESTAMP", message: "X-Timestamp out of tolerance" } };
  }

  const msg = ts + "." + raw;
  const macBytes = Utilities.computeHmacSha256Signature(msg, secret);
  const expectedHex = macBytes.map((b) => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");

  if (!constantTimeEqual_(expectedHex, String(sig).toLowerCase())) {
    return { ok: false, error: { code: "INVALID_SIGNATURE", message: "signature mismatch" } };
  }
  return { ok: true };
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------- 型変換 / フィルタ / utility ----------------------
function coerceValue_(sheetName, col, v) {
  const booleanCols = {
    Lesson:   ["blockSeek"],
    Course:   ["published"],
    Test:     ["published"],
    Choice:   ["isCorrect"],
  };
  const numberCols = {
    Course:   ["order"],
    Lesson:   ["durationSec", "order", "requiredCompletionRate"],
    Test:     ["passingScore", "maxAttempts"],
    Question: ["order"],
    Choice:   ["order"],
  };
  const dateCols = ["createdAt", "updatedAt"];

  if (v === "" || v === null || v === undefined) {
    if ((numberCols[sheetName] || []).indexOf(col) >= 0) return null;
    if ((booleanCols[sheetName] || []).indexOf(col) >= 0) return false;
    if (dateCols.indexOf(col) >= 0) return null;
    return "";
  }
  if ((booleanCols[sheetName] || []).indexOf(col) >= 0) {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES";
  }
  if ((numberCols[sheetName] || []).indexOf(col) >= 0) {
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  if (dateCols.indexOf(col) >= 0) {
    if (Object.prototype.toString.call(v) === "[object Date]") return v.toISOString();
    return String(v);
  }
  return String(v);
}

function filterBy_(params, key) {
  const v = params && params[key];
  if (v === undefined || v === null || v === "") return null;
  const f = {}; f[key] = String(v);
  return f;
}
function matchFilter_(obj, filter) {
  for (const k in filter) if (String(obj[k]) !== String(filter[k])) return false;
  return true;
}
function isEmptyRow_(row) {
  for (let i = 0; i < row.length; i++) if (row[i] !== "" && row[i] !== null) return false;
  return true;
}
function extractHeaderId_(label) {
  return String(label).split(/\s|\(/)[0].trim();
}
function headerOf_(e, name) {
  if (!e || !e.parameter) return null;
  if (e.parameter[name]) return e.parameter[name];
  if (e.parameter[name.toLowerCase()]) return e.parameter[name.toLowerCase()];
  // 短縮形: GAS は HTTP ヘッダを受け取れないため、LMS adapter は ?ts= / ?sig= も併送する
  if (name === "X-Timestamp" && e.parameter.ts) return e.parameter.ts;
  if (name === "X-Signature" && e.parameter.sig) return e.parameter.sig;
  return null;
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------- setupSheets (初回 1 回だけ実行) ----------------------
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  for (const name of SHEET_NAMES) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, 1, HEADER_LABELS_JA[name].length).setValues([HEADER_LABELS_JA[name]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADER_LABELS_JA[name].length).setFontWeight("bold").setBackground("#f0f0f0");
  }
  const secret = PropertiesService.getScriptProperties().getProperty("GAS_SECRET");
  if (!secret) {
    SpreadsheetApp.getUi().alert("注意: ScriptProperties に GAS_SECRET が未設定です。Apps Script エディタの「プロジェクトの設定」→「スクリプト プロパティ」で追加してください。");
  } else {
    SpreadsheetApp.getUi().alert("setupSheets 完了。シート 5 種を初期化しました。");
  }
}

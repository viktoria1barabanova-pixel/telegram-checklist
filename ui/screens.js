/* ui/screens.js — экраны приложения (start / checklist / result / readonly result) */


(function () {
  let DATA = null;

  // ---------- safe fallbacks (in case core/utils was not loaded) ----------
  const norm = (window.norm && typeof window.norm === "function")
    ? window.norm
    : (v) => String(v ?? "").trim();

  const escapeHtml = (window.escapeHtml && typeof window.escapeHtml === "function")
    ? window.escapeHtml
    : (s) => String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");

  const toBool = (window.toBool && typeof window.toBool === "function")
    ? window.toBool
    : (v) => {
        const s = String(v ?? "").trim().toLowerCase();
        if (!s) return true;
        if (["false","0","no","нет"].includes(s)) return false;
        return true;
      };

  const formatRuDateTime = (window.formatRuDateTime && typeof window.formatRuDateTime === "function")
    ? window.formatRuDateTime
    : (iso) => {
        try {
          const d = new Date(iso);
          if (!isFinite(d.getTime())) return "";
          return d.toLocaleString("ru-RU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
        } catch { return ""; }
      };

  const formatRuDateTimeMsk = (window.formatRuDateTimeMsk && typeof window.formatRuDateTimeMsk === "function")
    ? window.formatRuDateTimeMsk
    : (value) => formatRuDateTime(value);

  const truncateText = (window.truncateText && typeof window.truncateText === "function")
    ? window.truncateText
    : (value, maxLen = 1000) => {
        const limit = Number(maxLen);
        if (!Number.isFinite(limit) || limit <= 0) return "";
        const str = String(value ?? "");
        return str.length > limit ? str.slice(0, limit) : str;
      };

  // ---------- robust field getter (ENG/RU headers, разные регистры/пробелы) ----------
  function keyNorm(k) {
    return String(k || "")
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^a-zа-я0-9_]/g, "")
      .replace(/_+/g, "_")
      .trim();
  }

  function getAny(obj, candidates, fallback = "") {
    if (!obj) return fallback;

    for (const c of candidates) {
      if (obj[c] !== undefined && obj[c] !== null && String(obj[c]).trim() !== "") return obj[c];
    }

    const map = {};
    for (const k of Object.keys(obj)) map[keyNorm(k)] = k;

    for (const c of candidates) {
      const nk = keyNorm(c);
      const real = map[nk];
      if (real && obj[real] !== undefined && obj[real] !== null && String(obj[real]).trim() !== "") return obj[real];
    }

    return fallback;
  }

  // ---------- text normalizers (keep Cyrillic for UI lists) ----------
  function t(v) {
    return String(v ?? "").trim().replace(/\s+/g, " ");
  }
  function tkey(v) {
    return t(v).toLowerCase();
  }

  // ---------- mount ----------
  function mount(html) {
    const root = document.getElementById("app") || document.body;
    root.innerHTML = html;
  }

  function buildResultLink(submissionId) {
    const id = norm(submissionId);
    if (!id) return "";
    return `${location.origin}${location.pathname}?result=${encodeURIComponent(id)}`;
  }

  function getTelegramInitData() {
    try {
      return window.Telegram?.WebApp?.initData || "";
    } catch {
      return "";
    }
  }

  function getTelegramUserIdFromInitData(initData) {
    if (!initData) return "";
    try {
      const params = new URLSearchParams(String(initData || ""));
      const userRaw = params.get("user");
      if (!userRaw) return "";
      const user = JSON.parse(userRaw);
      return user?.id || "";
    } catch {
      return "";
    }
  }

  function zoneLabelLower(zone) {
    const v = String(zone ?? "").toLowerCase();
    if (v === "green") return "зелёная зона";
    if (v === "yellow") return "жёлтая зона";
    if (v === "red") return "красная зона";
    return "серая зона";
  }

  function normalizeNumberOrEmpty(value) {
    if (value === "" || value === null || value === undefined) return "";
    const num = Number(String(value).replace(",", "."));
    return Number.isFinite(num) ? num : "";
  }

  const WEIGHT_TOLERANCE_GRAMS = 5;

  function formatWeightDisplay(value, { signed = false } = {}) {
    const num = normalizeNumberOrEmpty(value);
    if (num === "") return "—";
    const rounded = Math.round(num * 10) / 10;
    const base = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, "");
    if (signed && rounded > 0) return `+${base}`;
    return base;
  }

  function formatWeightComparison(meta) {
    if (!meta || meta.plannedWeight === "" || meta.actualWeight === "" || meta.diff === "") return "";
    const planned = formatWeightDisplay(meta.plannedWeight);
    const actual = formatWeightDisplay(meta.actualWeight);
    const diff = formatWeightDisplay(meta.diff, { signed: true });
    return `${planned}/${actual} (${diff} гр)`;
  }

  function getRollWeightRows() {
    if (!DATA) return [];
    return (
      DATA.roll_weights ||
      DATA.rollWeights ||
      DATA.rolls_weights ||
      DATA.rollsWeights ||
      DATA.rolls ||
      []
    );
  }

  function buildRollWeightsCatalog(rows) {
    const options = [];
    const map = new Map();

    (rows || []).forEach((row, idx) => {
      const name = norm(getAny(row, [
        "roll",
        "roll_name",
        "name",
        "roll_title",
        "ролл",
        "ролл_название",
        "название",
        "наименование"
      ], ""));
      const weight = normalizeNumberOrEmpty(getAny(row, [
        "weight",
        "weight_g",
        "grams",
        "gram",
        "грамм",
        "граммы",
        "вес"
      ], ""));
      if (!name) return;
      const id = norm(getAny(row, [
        "roll_id",
        "id",
        "код",
        "code"
      ], name)) || name || `roll_${idx + 1}`;

      const entry = { id, name, weight };
      options.push(entry);

      const idKey = tkey(id);
      const nameKey = tkey(name);
      if (!map.has(idKey)) map.set(idKey, entry);
      if (!map.has(nameKey)) map.set(nameKey, entry);
    });

    options.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return { options, map };
  }

  function getRollWeightsCatalog() {
    return buildRollWeightsCatalog(getRollWeightRows());
  }

  function formatScoreDisplay(value) {
    const num = normalizeNumberOrEmpty(value);
    if (num === "") return "—";
    if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
    return String(num.toFixed(2)).replace(/\.?0+$/, "").replace(".", ",");
  }

  function formatScorePair(earned, max) {
    const earnedNorm = normalizeNumberOrEmpty(earned);
    const maxNorm = normalizeNumberOrEmpty(max);
    if (earnedNorm === "" && maxNorm === "") return "—";
    if (earnedNorm !== "" && maxNorm !== "") {
      return `${formatScoreDisplay(earnedNorm)}/${formatScoreDisplay(maxNorm)}`;
    }
    return formatScoreDisplay(earnedNorm !== "" ? earnedNorm : maxNorm);
  }

  function zoneBadgeHtml(zone) {
    const key = String(zone ?? "").toLowerCase();
    const label = zoneLabelLower(key);
    const cap = label ? `${label[0].toUpperCase()}${label.slice(1)}` : "Серая зона";
    const cls = ["green", "yellow", "red"].includes(key) ? key : "gray";
    return `<span class="zoneBadge ${escapeHtml(cls)}">${escapeHtml(cap)}</span>`;
  }

  async function sendTelegramResultMessage(result, submissionId) {
    if (!STATE.isFinished) return false;
    const zoneRaw = String(result?.zone ?? "").toLowerCase();
    const zoneText = (
      zoneRaw === "green" ? "зелёную зону" :
      zoneRaw === "yellow" ? "жёлтую зону" :
      zoneRaw === "red" ? "красную зону" :
      "серую зону"
    );
    const zoneLabel = (
      zoneRaw === "green" ? "зелёная" :
      zoneRaw === "yellow" ? "жёлтая" :
      zoneRaw === "red" ? "красная" :
      "серая"
    );
    const zoneEmoji = (
      zoneRaw === "green" ? "🟢" :
      zoneRaw === "yellow" ? "🟡" :
      zoneRaw === "red" ? "🔴" :
      "⚪️"
    );
    const link = buildResultLink(submissionId) || "";
    const linkHtml = link ? `<a href="${escapeHtml(link)}">Открыть проверку</a>` : "—";
    const { branchName } = getBranchMeta();
    const branchLine = [norm(STATE.city || ""), branchName].filter(Boolean).join(", ");
    const checker = getCheckerMeta();
    const percentText = formatPercentDisplay(result?.percent);
    const percentSuffix = (percentText && percentText !== "—") ? ` ${percentText}` : "";
    const submittedAtText = STATE.lastSubmittedAt ? formatRuDateTime(STATE.lastSubmittedAt) : "";

    const template = (typeof TELEGRAM_RESULT_MESSAGE_TEMPLATE !== "undefined")
      ? String(TELEGRAM_RESULT_MESSAGE_TEMPLATE || "").trim()
      : "";
    const placeholderValues = {
      zoneText: escapeHtml(zoneText),
      zone: escapeHtml(zoneRaw || "unknown"),
      zoneLabel: escapeHtml(zoneLabel),
      zoneEmoji,
      branch: escapeHtml(branchLine || "—"),
      checker: escapeHtml(checker.fio || "—"),
      percent: escapeHtml(percentSuffix),
      date: escapeHtml(submittedAtText || "—"),
      link: linkHtml,
    };
    const text = template
      ? template
        .replace(/\{zoneText\}/g, placeholderValues.zoneText)
        .replace(/\{zone\}/g, placeholderValues.zone)
        .replace(/\{zoneLabel\}/g, placeholderValues.zoneLabel)
        .replace(/\{zoneEmoji\}/g, placeholderValues.zoneEmoji)
        .replace(/\{branch\}/g, placeholderValues.branch)
        .replace(/\{checker\}/g, placeholderValues.checker)
        .replace(/\{percent\}/g, placeholderValues.percent)
        .replace(/\{date\}/g, placeholderValues.date)
        .replace(/\{link\}/g, placeholderValues.link)
      : [
          "Проверка завершена 🤝",
          "",
          `Филиал: ${escapeHtml(branchLine || "—")}`,
          `Проверяющий: ${escapeHtml(checker.fio || "—")}`,
          `Зона: ${zoneEmoji} ${escapeHtml(zoneLabel)}${percentSuffix}`,
          `Дата проверки: ${escapeHtml(submittedAtText || "—")}`,
          "",
          "Ссылка на проверку",
          linkHtml,
        ].join("\n");
    const initData = getTelegramInitData();
    const fallbackUserId = getTelegramUserIdFromInitData(initData);
    const tgUserId = checker.tg_user_id || checker.tg_id || fallbackUserId || "";
    const payload = {
      action: "send_message",
      message_text: text,
      result_link: link,
      result_id: norm(submissionId),
      zone: zoneRaw || "unknown",
      zone_text: zoneText,
      zone_label: zoneLabel,
      zone_emoji: zoneEmoji,
      inspection_area: "Общая",
      branch_name: branchLine || branchName || "",
      checker_fio: checker.fio || "",
      percent: percentText || "",
      submitted_at: submittedAtText || "",
      init_data: initData,
      tg_user_id: tgUserId,
      parse_mode: "HTML",
    };

    try {
      await api.sendBotMessage(payload, { usePostMessage: false });
      const tgApp = window.Telegram?.WebApp;
      const shouldAutoClose = (typeof AUTO_CLOSE_AFTER_SUBMIT !== "undefined") ? AUTO_CLOSE_AFTER_SUBMIT : false;
      if (shouldAutoClose && typeof tgApp?.close === "function") {
        setTimeout(() => tgApp.close(), 500);
      }
      console.info("Telegram message sent", {
        result_id: payload.result_id,
        tg_user_id: payload.tg_user_id,
      });
      return true;
    } catch (err) {
      console.info("Telegram message failed", {
        result_id: payload.result_id,
        tg_user_id: payload.tg_user_id,
        error: String(err),
      });
      return false;
    }
  }

  function clearResultQuery() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("result")) return;
      url.searchParams.delete("result");
      const search = url.searchParams.toString();
      const next = `${url.origin}${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
      window.history.replaceState(null, "", next);
    } catch (e) {}
  }

  // ---------- normalize branches (адреса) & sections ----------
  // ---------- question type normalization ----------
  function normalizeQuestionType(raw) {
    const t0 = String(raw ?? "single").trim();
    const t = t0.toLowerCase();
    const isNumber = (
      t.includes("number") || t.includes("numeric") ||
      t.includes("числ")
    );
    const isCb = (
      t.includes("checkbox") || t.includes("check") ||
      t.includes("bool") || t.includes("boolean") ||
      t.includes("multi") || t.includes("multiple") ||
      t.includes("галоч") || t.includes("чек")
    );
    if (isNumber) return "number";
    return isCb ? "checkbox" : "single";
  }

  function isCheckboxQuestion(q) {
    return normalizeQuestionType(getAny(q, [
      "question_type",
      "type", "answer_type", "kind",
      "тип", "тип_ответа"
    ], "single")) === "checkbox";
  }

  function isNumberQuestion(q) {
    return normalizeQuestionType(getAny(q, [
      "question_type",
      "type", "answer_type", "kind",
      "тип", "тип_ответа"
    ], "single")) === "number";
  }

  function checkboxHasItems(q) {
    const jsonStr = getAny(q, [
      "items_json", "checklist_items_json", "itemsJson",
      "checkbox_items_json", "check_items_json", "cb_items_json",
      "чекбоксы_json", "чекбокс_варианты_json", "галочки_json"
    ], "");
    if (jsonStr) {
      try {
        const arr = JSON.parse(String(jsonStr));
        if (Array.isArray(arr) && arr.length) return true;
      } catch {}
    }

    const listStr = getAny(q, [
      "items", "checklist_items",
      "checkbox_items", "check_items", "cb_items",
      "чекбоксы", "чекбоксы_список", "галочки", "галочки_список"
    ], "");
    if (listStr) {
      const items = String(listStr)
        .split(/\s*[;|\n]+\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length > 0;
    }

    return false;
  }

  function getCheckboxItems(q) {
    let items = [];
    try {
      const jsonStr = getAny(q, [
        "items_json", "checklist_items_json", "itemsJson",
        "checkbox_items_json", "check_items_json", "cb_items_json",
        "чекбоксы_json", "чекбокс_варианты_json", "галочки_json"
      ], "");
      if (jsonStr) {
        const arr = JSON.parse(String(jsonStr));
        if (Array.isArray(arr)) items = arr;
      }
    } catch {}

    if (!items.length) {
      const listStr = getAny(q, [
        "items", "checklist_items",
        "checkbox_items", "check_items", "cb_items",
        "чекбоксы", "чекбоксы_список", "галочки", "галочки_список"
      ], "");
      if (listStr) {
        items = String(listStr)
          .split(/\s*[;|\n]+\s*/)
          .map(s => s.trim())
          .filter(Boolean)
          .map((text, i) => ({ id: `${q.id}_${i + 1}`, text }));
      }
    }

    return items
      .map((item, i) => ({
        id: norm(item?.id || item?.key || item?.value || `${q.id}_${i + 1}`),
        text: norm(item?.text || item?.label || item?.name || item?.value || item?.title || item?.id || "")
      }))
      .filter(item => item.id || item.text);
  }

  function getCheckboxAnswerLabels(q, answerSet) {
    const hasItems = checkboxHasItems(q);
    const set = answerSet instanceof Set ? answerSet : new Set(answerSet || []);

    if (!hasItems) {
      const checked = (set.has("1") || set.has("true") || set.has("yes") || set.has("да"));
      const ideal = norm(getAny(q, [
        "ideal_answer", "good", "good_text", "option_good",
        "идеал", "эталон", "хорошо"
      ], "Есть"));
      const bad = norm(getAny(q, [
        "bad_answer", "bad", "bad_text", "option_bad",
        "плохо", "плохой", "стрем"
      ], "Отсутствует"));
      return [checked ? ideal : bad].filter(Boolean);
    }

    const items = getCheckboxItems(q);
    const labels = items
      .filter(item => set.has(item.id))
      .map(item => item.text)
      .filter(Boolean);
    return labels;
  }
  function getBranches() {
    return (DATA && (DATA.addresses || DATA.branches)) ? (DATA.addresses || DATA.branches) : [];
  }

  function findBranchById(branchId) {
    const bid = norm(branchId);
    const rows = getBranches();
    return rows.find(b => norm(getBranchId(b)) === bid) || null;
  }
  function getOblast(b) {
    // Prefer `region` (sheet column) first
    return t(getAny(b, ["region", "oblast", "area", "область", "регион", "край", "Region", "REGION"], ""));
  }

  function getCity(b) {
    return t(getAny(b, ["city", "город", "City", "CITY"], ""));
  }

  function getAddressLabel(b) {
    return t(getAny(b, ["branch_name", "address", "addr", "адрес", "name", "title", "название", "Branch_name", "BRANCH_NAME"], ""));
  }

  function getBranchId(b) {
    return norm(getAny(b, ["branch_id", "id", "branchId", "филиал_id", "id_филиала"], ""));
  }

  function activeAddressRows(branches) {
    return (branches || []).filter(b => {
      const v = getAny(b, ["active", "is_active", "активно", "активный", "Active", "ACTIVE"], "");
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) return true; // empty => active
      if (s === "false" || s === "0" || s === "no" || s === "нет") return false;
      return true;
    });
  }

  function listOblasts(branches) {
    const rows = activeAddressRows(branches);
    return uniq(rows.map(getOblast).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function citiesByOblast(branches, oblast) {
    const ok = tkey(oblast);
    const rows = activeAddressRows(branches).filter(b => tkey(getOblast(b)) === ok);
    return uniq(rows.map(getCity).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function addressesByCity(branches, oblast, city) {
    const ok = tkey(oblast);
    const ck = tkey(city);
    const rows = activeAddressRows(branches).filter(b => tkey(getOblast(b)) === ok && tkey(getCity(b)) === ck);
    const list = rows
      .map(b => ({ id: getBranchId(b), label: getAddressLabel(b) }))
      .filter(x => x.id && x.label);
    list.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return list;
  }

  function parsePossibleDate(value) {
    if (!value) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      const dNum = new Date(value);
      if (Number.isFinite(dNum.getTime())) return dNum;
    }
    const d = new Date(String(value));
    if (Number.isFinite(d.getTime())) return d;
    return null;
  }

  function normalizePercentValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const hasPercentSign = raw.includes("%");
    const cleaned = raw.replace("%", "").replace(",", ".").trim();
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    if (!hasPercentSign && Math.abs(num) <= 1) return num * 100;
    return num;
  }

  function formatPercentForSheet(value) {
    const num = normalizePercentValue(value);
    if (num === null) return "";
    const decimal = num / 100;
    return Number(decimal.toFixed(4));
  }

  function formatPercentDisplay(value) {
    const num = normalizePercentValue(value);
    if (num === null) return "—";
    const rounded = Math.round(num * 10) / 10;
    const str = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, "");
    return `${str.replace(".", ",")}%`;
  }

  function ensureSubmissionId() {
    if (!STATE.lastResultId) {
      STATE.lastResultId = (crypto?.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    return STATE.lastResultId;
  }

  function getLastCheckFromServer(branchId) {
    const bid = norm(branchId);
    if (!bid || !DATA) return null;

    const sources = [
      DATA.results,
      DATA.submissions,
      DATA.checks,
      DATA.history,
      DATA.last_checks,
    ].filter(Array.isArray);

    let best = null;

    sources.forEach(rows => {
      rows.forEach(row => {
        const rowBranch = norm(getAny(row, [
          "branch_id", "branchId", "id_филиала", "филиал_id", "branch", "branch_code"
        ], ""));
        if (!rowBranch || rowBranch !== bid) return;

        const ts = getAny(row, [
          "submitted_at", "submittedAt", "date", "created_at",
          "timestamp", "ts", "дата", "дата_проверки"
        ], "");
        const date = parsePossibleDate(ts);
        const percent = normalizePercentValue(getAny(row, [
          "percent", "score_percent", "процент", "score_pct"
        ], null));
        const zone = norm(getAny(row, ["zone", "зона"], ""));
        const fio = norm(getAny(row, [
          "fio", "name", "имя", "фио", "checked_by", "checker"
        ], ""));

        const item = {
          ts: date ? date.toISOString() : "",
          percent,
          zone,
          fio,
        };

        if (!best) {
          best = item;
          return;
        }

        const bestDate = parsePossibleDate(best.ts);
        if (!bestDate && date) {
          best = item;
          return;
        }
        if (bestDate && date && date.getTime() > bestDate.getTime()) {
          best = item;
        }
      });
    });

    return best;
  }

  function mergeLastChecks(local, server) {
    if (!local && !server) return null;
    if (server) return server;
    return local || null;
  }

  function normalizeLocalLastCheck(local, branchRow) {
    if (!local) return null;
    const branchName = norm(getAddressLabel(branchRow || {}));
    const city = norm(getCity(branchRow || {}));
    const storedName = norm(getAny(local, ["branch_name", "branchName", "branch"], ""));
    const storedCity = norm(getAny(local, ["city", "город"], ""));

    if (!storedName && !storedCity) return null;
    if (storedName && branchName && tkey(storedName) !== tkey(branchName)) return null;
    if (storedCity && city && tkey(storedCity) !== tkey(city)) return null;
    return local;
  }

  function formatLastCheckHint(last) {
    if (!last) return "";
    const pct = (last.percent != null && isFinite(Number(last.percent)))
      ? `${Math.round(Number(last.percent))}%`
      : "";
    const dt = last.ts ? formatRuDateTime(last.ts) : "";
    const z = last.zone ? last.zone : "";
    const fio = last.fio ? `Проверял: ${escapeHtml(last.fio)}` : "";
    const bits = [pct, dt, z].filter(Boolean).join(" • ");
    const main = bits ? `Последняя проверка: ${escapeHtml(bits)}` : "";
    return [main, fio].filter(Boolean).map(line => `<div>${line}</div>`).join("");
  }

  function activeSections(sections) {
    return (sections || [])
      .filter(s => toBool(s.active) !== false)
      .map(s => ({
        id: norm(getAny(s, [
          "section_code", // основной ключ из таблицы
          "section_id", "id", "section", "sectionId",
          "секция_id", "секция", "раздел_id", "раздел"
        ], "")),
        title: norm(getAny(s, [
          "title", "name", "section_title",
          "название", "заголовок", "раздел", "секция"
        ], "")),
        sort: Number(getAny(s, [
          "sort_order", "sort", "order",
          "порядок", "sort_order_", "sortorder"
        ], 9999)),
      }))
      .sort((a, b) => (a.sort - b.sort) || a.title.localeCompare(b.title, "ru"))
      .filter(s => s.id && s.title);
  }

  function questionsForSection(checklist, sectionId) {
    const sid = norm(sectionId);
    const seenIds = new Map();
    return (checklist || [])
      .filter(q => toBool(getAny(q, ["active", "is_active", "активно", "активный"], true)) !== false)
      .filter(q => {
        // Пропускаем строку-заголовок (часто приходит как первая строка из таблицы)
        const headerQid = norm(getAny(q, ["question_id", "id", "qid"], ""));
        const headerText = tkey(getAny(q, ["question_text", "question", "name", "title"], ""));
        if (headerQid === "id_вопроса" || headerQid === "question_id") return false;
        if (headerText === "текст вопроса" || headerText === "question_text") return false;
        const qSid = norm(getAny(q, [
          "section_code", // основной ключ из таблицы
          "section_id", "section", "sectionId",
          "секция_id", "секция", "раздел_id", "раздел"
        ], ""));
        return qSid === sid;
      })
      .map((q, idx) => {
        const qid = norm(getAny(q, [
          "question_id", "id", "questionId", "qid",
          "вопрос_id", "вопрос", "id_вопроса"
        ], ""));

        const qType = normalizeQuestionType(getAny(q, [
  "question_type", // ключ из таблицы
  "type", "answer_type", "kind",
  "тип", "тип_ответа"
], "single"));

        const sev = (norm(getAny(q, [
          "severity", "criticality", "error_type",
          "критичность", "тип_ошибки"
        ], "noncritical")) || "noncritical").toLowerCase();

        const titleText = norm(getAny(q, [
          "title", "question", "name", "question_text", "question_title",
          "вопрос", "вопрос_текст", "текст_вопроса", "заголовок", "название"
        ], ""));

        // Ensure deterministic unique IDs (important for state + scoring + submission).
        let finalId = qid || `row_${idx + 1}`;
        const n = (seenIds.get(finalId) || 0) + 1;
        seenIds.set(finalId, n);
        if (n > 1) finalId = `${finalId}__dup${n}`;

        return {
          ...q,
          id: finalId,
          type: qType,
          severity: sev,
          title_text: titleText,
        };
      })
      .filter(q => q.id);
  }

  // ---------- settings-driven zones ----------
  function computeZone(percent, maxScore, hasCritical) {
    if (maxScore <= 0) return "gray";

    const redMax = getSettingNumber(DATA, "red_zone_max_percent", DEFAULT_RED_ZONE_MAX_PERCENT);
    const yellowMax = getSettingNumber(DATA, "yellow_zone_max_percent", DEFAULT_YELLOW_ZONE_MAX_PERCENT);
    const blockGreen = getSettingBool(DATA, "block_green_if_critical", DEFAULT_BLOCK_GREEN_IF_CRITICAL);

    let zone = "green";
    if (percent <= redMax) zone = "red";
    else if (percent <= yellowMax) zone = "yellow";
    else zone = "green";

    if (zone === "green" && blockGreen && hasCritical) zone = "yellow";
    return zone;
  }

  function resolveRollEntry(catalog, rollId, rollName) {
    const map = catalog?.map instanceof Map ? catalog.map : new Map();
    const idKey = tkey(rollId);
    const nameKey = tkey(rollName);
    return map.get(idKey) || map.get(nameKey) || null;
  }

  function computeNumberAnswerMeta(answer, catalog) {
    const rollId = norm(answer?.roll_id || answer?.rollId || answer?.roll || "");
    const rollName = norm(answer?.roll_name || answer?.rollName || "");
    const actualWeight = normalizeNumberOrEmpty(answer?.actual_weight ?? answer?.actualWeight ?? answer?.actual ?? answer?.weight ?? "");
    const entry = resolveRollEntry(catalog, rollId, rollName);
    const plannedWeight = normalizeNumberOrEmpty(
      answer?.planned_weight ?? answer?.plannedWeight ?? entry?.weight ?? ""
    );
    const hasAnswer = Boolean(rollId || rollName) && actualWeight !== "";
    const diff = (actualWeight !== "" && plannedWeight !== "")
      ? Math.round((actualWeight - plannedWeight) * 10) / 10
      : "";
    const withinTolerance = (actualWeight !== "" && plannedWeight !== "")
      ? Math.abs(actualWeight - plannedWeight) <= WEIGHT_TOLERANCE_GRAMS
      : false;
    return {
      rollId,
      rollName: rollName || entry?.name || "",
      actualWeight,
      plannedWeight,
      diff,
      hasAnswer,
      withinTolerance,
    };
  }

  // ---------- scoring model ----------
  // Single question: good=1, ok=0.5, bad=0
  // Checkbox: “не стоит галочка” = ок (то есть ошибка не выбрана).
  // Если выбран хотя бы один checkbox item → это ошибка. Critical if any selected item is critical? (we treat checkbox question severity)
  function computeResultFromState({ sectionId } = {}) {
    // maxScore = number of single questions (each max 1)
    // percent = total / max * 100
    const sections = activeSections(DATA.sections);
    const allQs = sections.flatMap(s => questionsForSection(DATA.checklist, s.id));
    const rollCatalog = getRollWeightsCatalog();

    // maxScore counts all questions except those explicitly excluded from max
    const targetSectionId = sectionId ? norm(sectionId) : "";
    let maxScore = 0;
    let score = 0;
    let hasCritical = false;

    const issues = []; // list items for result screen

    for (const q of allQs) {
      const qid = q.id;
      const qSectionId = norm(getAny(q, [
        "section_code",
        "section_id", "section", "sectionId",
        "секция_id", "секция", "раздел_id", "раздел"
      ], ""));
      const sectionTitle = sections.find(s => s.id === qSectionId)?.title || "";
      if (targetSectionId && targetSectionId !== qSectionId) continue;

      const qScore = Number(getAny(q, ["score", "баллы", "points"], 1)) || 1;

      // skip from max/score if excluded
      const ex = String(getAny(q, ["exclude_from_max", "exclude", "skip_max", "исключить_из_макс"], false) ?? "").trim().toLowerCase();
      const isExcluded = (ex === "true" || ex === "1" || ex === "yes" || ex === "да");
      if (!isExcluded) maxScore += 1;

      if (isCheckboxQuestion(q)) {
        const hasItems = checkboxHasItems(q);
        const set = STATE.checkboxAnswers[qid] instanceof Set ? STATE.checkboxAnswers[qid] : new Set();
        const checked = (set.has("1") || set.has("true") || set.has("yes") || set.has("да"));
        const anySelected = set.size > 0;
        const scoreUnit = hasItems ? (anySelected ? 0 : 1) : (checked ? 1 : 0);
        const earnedScore = isExcluded ? "" : scoreUnit * qScore;

        if (!isExcluded) {
          score += scoreUnit;
        }

        if ((hasItems && anySelected) || (!hasItems && !checked)) {
          const severity = (q.severity === "critical") ? "critical" : "noncritical";
          if (severity === "critical") hasCritical = true;

          const note = safeEnsureNote(qid);
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity,
            score: earnedScore,
            scoreEarned: earnedScore,
            scoreMax: isExcluded ? "" : qScore,
            scoreUnit,
            comment: norm(note.text),
            photos: notePhotos(qid),
          });
        }
      } else if (isNumberQuestion(q)) {
        const answer = STATE.numberAnswers?.[qid] || {};
        const meta = computeNumberAnswerMeta(answer, rollCatalog);
        const scoreUnit = meta.hasAnswer && meta.withinTolerance ? 1 : 0;
        const earnedScore = isExcluded ? "" : scoreUnit * qScore;

        if (!isExcluded) {
          score += scoreUnit;
        }

        if (meta.hasAnswer && !meta.withinTolerance) {
          const severity = (q.severity === "critical") ? "critical" : "noncritical";
          if (severity === "critical") hasCritical = true;

          const note = safeEnsureNote(qid);
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity,
            score: earnedScore,
            scoreEarned: earnedScore,
            scoreMax: isExcluded ? "" : qScore,
            scoreUnit,
            comment: norm(note.text),
            photos: notePhotos(qid),
          });
        }
      } else {
        // table-driven single: compare selected label with ideal/acceptable/bad
        const selectedValue = norm(STATE.singleAnswers[qid]);
        const selectedLabel = norm(STATE.singleAnswerLabels?.[qid] || "");
        const ideal = norm(getAny(q, ["ideal_answer", "good_text", "good", "эталон", "идеал"], ""));
        const ok = norm(getAny(q, ["acceptable_answer", "ok_text", "ok", "норм"], ""));
        const bad = norm(getAny(q, ["bad_answer", "bad_text", "bad", "стрем", "плохо"], ""));

        let kind = "bad";
        if (selectedValue === "good") kind = "good";
        else if (selectedValue === "ok") kind = "ok";
        else if (selectedValue === "bad") kind = "bad";
        else if (selectedLabel && ideal && selectedLabel === ideal) kind = "good";
        else if (selectedLabel && ok && selectedLabel === ok) kind = "ok";
        else if (selectedLabel && bad && selectedLabel === bad) kind = "bad";

        const scoreUnit = kind === "good" ? 1 : (kind === "ok" ? 0.5 : 0);
        const earnedScore = isExcluded ? "" : scoreUnit * qScore;

        if (!isExcluded) {
          score += scoreUnit;
        }

        if ((selectedValue || selectedLabel) && kind !== "good") {
          const severity = (q.severity === "critical") ? "critical" : "noncritical";
          if (severity === "critical") hasCritical = true;

          const note = safeEnsureNote(qid);
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity,
            score: earnedScore,
            scoreEarned: earnedScore,
            scoreMax: isExcluded ? "" : qScore,
            scoreUnit,
            comment: norm(note.text),
            photos: notePhotos(qid),
          });
        }
      }
    }

    const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const zone = computeZone(percent, maxScore, hasCritical);

    return { score, maxScore, percent, zone, hasCritical, issues };
  }

  function normalizeAnswersPayload(answers) {
    let payload = answers || {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }
    return {
      single: payload.single || payload.single_answers || {},
      single_labels: payload.single_labels || payload.singleLabels || {},
      checkbox: payload.checkbox || payload.checkbox_answers || {},
      number: payload.number || payload.number_answers || {},
      number_labels: payload.number_labels || payload.numberLabels || {},
    };
  }

  function normalizeNumberAnswer(raw) {
    if (!raw) return { rollId: "", rollName: "", actualWeight: "", plannedWeight: "" };
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") raw = parsed;
      } catch {
        const num = normalizeNumberOrEmpty(raw);
        return { rollId: "", rollName: "", actualWeight: num, plannedWeight: "" };
      }
    }
    if (typeof raw === "number") {
      return { rollId: "", rollName: "", actualWeight: raw, plannedWeight: "" };
    }
    if (typeof raw !== "object") return { rollId: "", rollName: "", actualWeight: "", plannedWeight: "" };
    return {
      rollId: norm(raw.roll_id || raw.rollId || raw.roll || raw.roll_name || raw.rollName || ""),
      rollName: norm(raw.roll_name || raw.rollName || raw.rollLabel || ""),
      actualWeight: normalizeNumberOrEmpty(raw.actual_weight ?? raw.actualWeight ?? raw.actual ?? raw.weight ?? ""),
      plannedWeight: normalizeNumberOrEmpty(raw.planned_weight ?? raw.plannedWeight ?? raw.plan ?? raw.expected ?? ""),
    };
  }

  function normalizeCheckboxSet(raw) {
    if (raw instanceof Set) return raw;
    if (Array.isArray(raw)) return new Set(raw.map(v => String(v)));
    if (typeof raw === "string") {
      const parts = raw.split(/\s*[;|,]\s*/).map(s => norm(s)).filter(Boolean);
      return new Set(parts);
    }
    if (raw === true || raw === 1) return new Set(["1"]);
    if (raw === false || raw === 0) return new Set();
    return new Set();
  }

  function buildQuestionMap() {
    const map = new Map();
    const sections = activeSections(DATA.sections);
    sections.forEach(section => {
      const qs = questionsForSection(DATA.checklist, section.id);
      qs.forEach(q => map.set(q.id, { ...q, sectionTitle: section.title || "" }));
    });
    return map;
  }

  function normalizePhotosList(raw) {
    if (Array.isArray(raw)) return raw.map(v => norm(v)).filter(Boolean);
    const str = norm(raw);
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map(v => norm(v)).filter(Boolean);
    } catch {}
    return [str];
  }

  function normalizeAnswerRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const questionMap = buildQuestionMap();

    return rows.map(row => {
      const qid = norm(getAny(row, ["question_id", "qid", "questionId"], ""));
      const question = questionMap.get(qid);

      const scoreEarned = normalizeNumberOrEmpty(getAny(row, [
        "score_earned", "earned_score", "scoreEarned", "earned"
      ], ""));
      const scoreMax = normalizeNumberOrEmpty(getAny(row, [
        "score_max", "max_score", "scoreMax", "max"
      ], ""));
      const hasScores = scoreEarned !== "" && scoreMax !== "";
      const maxPositive = hasScores && Number(scoreMax) > 0;

      let isIssue = false;
      const isIssueRaw = getAny(row, ["is_issue", "issue", "has_issue"], "");
      if (isIssueRaw !== "") {
        isIssue = toBool(isIssueRaw);
      } else if (maxPositive) {
        isIssue = Number(scoreEarned) < Number(scoreMax);
      }

      const scoreUnit = maxPositive ? Number(scoreEarned) / Number(scoreMax) : "";
      const severityRaw = norm(getAny(row, ["severity", "critikal", "criticality"], question?.severity || "noncritical")).toLowerCase();
      const severity = severityRaw === "critical" ? "critical" : "noncritical";

      return {
        ...row,
        qid,
        question,
        sectionTitle: norm(getAny(row, ["section_title", "section", "section_name"], question?.sectionTitle || "")),
        title: norm(getAny(row, ["question_text", "title", "question"], question?.title_text || question?.title || question?.question || "")),
        severity,
        scoreEarned,
        scoreMax,
        scoreUnit,
        isIssue,
        comment: norm(getAny(row, ["comment", "note"], "")),
        photos: normalizePhotosList(getAny(row, ["photos", "photos_json", "photosJson"], "")),
      };
    });
  }

  function buildIssuesFromAnswerRows(answerRows) {
    const normalizedRows = normalizeAnswerRows(answerRows);
    return normalizedRows
      .filter(row => row.isIssue)
      .map(row => ({
        qid: row.qid,
        title: row.title,
        sectionTitle: row.sectionTitle,
        severity: row.severity === "critical" ? "critical" : "noncritical",
        score: row.scoreEarned,
        scoreEarned: row.scoreEarned,
        scoreMax: row.scoreMax,
        scoreUnit: row.scoreUnit,
        comment: row.comment,
        photos: row.photos,
      }));
  }

  function buildIssuesFromAnswers(answers) {
    if (Array.isArray(answers)) return buildIssuesFromAnswerRows(answers);
    const normalized = normalizeAnswersPayload(answers);
    const sections = activeSections(DATA.sections);
    const issues = [];

    sections.forEach(section => {
      const qs = questionsForSection(DATA.checklist, section.id);
      qs.forEach(q => {
        const qid = q.id;
        const sectionTitle = section.title || "";
        const qScore = Number(getAny(q, ["score", "баллы", "points"], 1)) || 1;

        if (isCheckboxQuestion(q)) {
          const set = normalizeCheckboxSet(normalized.checkbox?.[qid]);
          const hasItems = checkboxHasItems(q);
          const checked = (set.has("1") || set.has("true") || set.has("yes") || set.has("да"));
          const anySelected = set.size > 0;
          const isIssue = hasItems ? anySelected : !checked;
          const scoreUnit = hasItems ? (anySelected ? 0 : 1) : (checked ? 1 : 0);
          const earnedScore = scoreUnit * qScore;

          if (isIssue) {
            issues.push({
              qid,
              title: norm(q.title_text || q.title || q.question || q.name),
              sectionTitle,
              severity: (q.severity === "critical") ? "critical" : "noncritical",
              score: earnedScore,
              scoreEarned: earnedScore,
              scoreMax: qScore,
              scoreUnit,
              comment: "",
              photos: [],
            });
          }
          return;
        }

        if (isNumberQuestion(q)) {
          const raw = normalized.number?.[qid];
          const answer = normalizeNumberAnswer(raw);
          const rollCatalog = getRollWeightsCatalog();
          const meta = computeNumberAnswerMeta({
            roll_id: answer.rollId,
            roll_name: answer.rollName,
            actual_weight: answer.actualWeight,
            planned_weight: answer.plannedWeight,
          }, rollCatalog);
          if (!meta.hasAnswer) return;
          const scoreUnit = meta.withinTolerance ? 1 : 0;
          const earnedScore = scoreUnit * qScore;
          if (!meta.withinTolerance) {
            issues.push({
              qid,
              title: norm(q.title_text || q.title || q.question || q.name),
              sectionTitle,
              severity: (q.severity === "critical") ? "critical" : "noncritical",
              score: earnedScore,
              scoreEarned: earnedScore,
              scoreMax: qScore,
              scoreUnit,
              comment: "",
              photos: [],
            });
          }
          return;
        }

        const selectedValue = norm(normalized.single?.[qid]);
        const selectedLabel = norm(normalized.single_labels?.[qid] || "");
        if (!selectedValue && !selectedLabel) return;

        const ideal = norm(getAny(q, ["ideal_answer", "good_text", "good", "эталон", "идеал"], ""));
        const ok = norm(getAny(q, ["acceptable_answer", "ok_text", "ok", "норм"], ""));
        const bad = norm(getAny(q, ["bad_answer", "bad_text", "bad", "стрем", "плохо"], ""));

        let kind = "bad";
        if (selectedValue === "good") kind = "good";
        else if (selectedValue === "ok") kind = "ok";
        else if (selectedValue === "bad") kind = "bad";
        else if (selectedLabel && ideal && selectedLabel === ideal) kind = "good";
        else if (selectedLabel && ok && selectedLabel === ok) kind = "ok";
        else if (selectedLabel && bad && selectedLabel === bad) kind = "bad";

        const scoreUnit = kind === "good" ? 1 : (kind === "ok" ? 0.5 : 0);
        const earnedScore = scoreUnit * qScore;

        if (kind !== "good") {
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity: (q.severity === "critical") ? "critical" : "noncritical",
            score: earnedScore,
            scoreEarned: earnedScore,
            scoreMax: qScore,
            scoreUnit,
            comment: "",
            photos: [],
          });
        }
      });
    });

    return issues;
  }

  function renderIssuesGrouped(issues) {
    function sevText(sev){
      return sev === "critical" ? "Критическая" : "Некритическая";
    }

    const by = new Map();
    for (const it of issues) {
      const key = norm(it.sectionTitle || "Без раздела");
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(it);
    }

    const blocks = [];
    for (const [sec, arr] of by.entries()) {
      blocks.push(`
        <div class="issueSection">
          <div class="issueSectionName">${escapeHtml(sec)}</div>
          <div class="issueTableWrap">
            <table class="issueTable">
              <thead>
                <tr>
                  <th style="width:260px">Ошибка</th>
                  <th style="width:90px">Баллы</th>
                  <th style="width:140px">Критичность</th>
                  <th>Комментарий</th>
                  <th style="width:90px">Фото</th>
                </tr>
              </thead>
              <tbody>
                ${arr.map(it => {
                  const photos = (it.photos || []).map(driveToDirect);
                  const photoHtml = photos.length
                    ? `<div class="thumbRow">${photos.map(src=>`<img class="thumb" src="${escapeHtml(src)}" data-src="${escapeHtml(src)}" />`).join("")}</div>`
                    : `<span class="muted">—</span>`;

                  const commentHtml = (it.comment && String(it.comment).trim())
                    ? escapeHtml(it.comment)
                    : `<span class="muted">—</span>`;
                  const scoreValue = it.scoreEarned ?? it.score_earned ?? it.score;
                  const scoreMax = it.scoreMax ?? it.score_max ?? "";
                  const scoreHtml = escapeHtml(formatScorePair(scoreValue, scoreMax));

                  return `
                    <tr>
                      <td>${escapeHtml(it.title || "")}</td>
                      <td>${scoreHtml}</td>
                      <td>${escapeHtml(sevText(it.severity))}</td>
                      <td>${commentHtml}</td>
                      <td>${photoHtml}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `);
    }

    return blocks.join("");
  }

  // ---------- required validation ----------
  function isAnswered(q) {
    if (isCheckboxQuestion(q)) return true; // unchecked is a valid state
    if (isNumberQuestion(q)) {
      const meta = computeNumberAnswerMeta(STATE.numberAnswers?.[q.id] || {}, getRollWeightsCatalog());
      return meta.hasAnswer;
    }
    return !!norm(STATE.singleAnswers[q.id]);
  }

  function missingBySection() {
    const sections = activeSections(DATA.sections);
    const missing = [];
    for (const s of sections) {
      if (STATE.completedSections?.includes(s.id)) continue;
      const qs = questionsForSection(DATA.checklist, s.id);
      const miss = qs.filter(q => !isCheckboxQuestion(q)).filter(q => !isAnswered(q));
      if (miss.length) missing.push({ sectionId: s.id, title: s.title, count: miss.length });
    }
    return missing;
  }

  function missingInSection(sectionId) {
    const qs = questionsForSection(DATA.checklist, sectionId);
    return qs.filter(q => !isCheckboxQuestion(q)).filter(q => !isAnswered(q));
  }

  function isSectionCompleted(sectionId) {
    return (STATE.completedSections || []).includes(sectionId);
  }

  function initialsFromName(name) {
    return norm(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join("") || "TG";
  }

  function draftExpiresAt(draft) {
    const savedAt = Number(draft?.savedAt || 0);
    if (!savedAt) return null;
    const ttl = typeof DRAFT_TTL_MS !== "undefined" ? DRAFT_TTL_MS : 5 * 60 * 60 * 1000;
    return new Date(savedAt + ttl);
  }

  function applyDraftToState(draft) {
    if (!draft) return;
    STATE.oblast = draft.oblast || STATE.oblast;
    STATE.city = draft.city || STATE.city;
    STATE.fio = draft.fio || STATE.fio;
    STATE.branchId = draft.branchId || STATE.branchId;

    STATE.enabledSections = draft.enabledSections || [];
    STATE.activeSection = draft.activeSection || "";
    STATE.completedSections = draft.completedSections || [];

    STATE.singleAnswers = draft.singleAnswers || {};
    STATE.checkboxAnswers = draft.checkboxAnswers || {};
    STATE.singleAnswerLabels = draft.singleAnswerLabels || {};
    STATE.numberAnswers = draft.numberAnswers || {};
    STATE.isFinished = !!draft.isFinished;
    STATE.lastResult = draft.lastResult || null;
    STATE.lastResultId = draft.lastResultId || null;
    STATE.lastSubmittedAt = draft.lastSubmittedAt || "";
    STATE.lastBotSendStatus = draft.lastBotSendStatus || "";
    STATE.lastBotSendError = draft.lastBotSendError || "";

    STATE.issueNotes = draft.issueNotes || {};
    STATE.noteOpen = draft.noteOpen || {};
    migrateAllNotes();

    if (!STATE.enabledSections.length) {
      const secs = activeSections(DATA.sections);
      STATE.enabledSections = secs.map(s => s.id);
      STATE.activeSection = secs[0]?.id || "";
    }
    if (!STATE.activeSection) STATE.activeSection = STATE.enabledSections?.[0] || "";
  }

  function renderBranchPickerScreen(data) {
    DATA = data;
    clearResultQuery();

    const BRANCHES = getBranches();
    const oblasts = listOblasts(BRANCHES);
    mount(tplStartScreen({ oblasts, showCabinet: IS_TG }));

    const branchBackBtn = document.getElementById("branchPickerBackBtn");
    const oblastSelect = document.getElementById("oblastSelect");
    const citySelect = document.getElementById("citySelect");
    const addressSelect = document.getElementById("addressSelect");
    const startBtn = document.getElementById("startBtn");
    const startDefaultText = startBtn?.textContent || "Начать";
    const myChecksBtn = document.getElementById("myChecksBtn");
    const hint = document.getElementById("startHint");
    const cabinetHint = document.getElementById("cabinetHint");
      const lastCheckHint = document.getElementById("lastCheckHint");
    const fioRow = document.getElementById("fioRow");
    const fioInput = document.getElementById("fioInput");
    const nonTgBlock = document.getElementById("nonTgBlock");
    const draftActions = document.getElementById("draftActions");
    const userLine = document.getElementById("userNameLine");
    const userCard = document.getElementById("tgUserCard");
    const userCardName = document.getElementById("tgUserName");
    const userCardHandle = document.getElementById("tgUserHandle");
    const userCardAvatar = document.getElementById("tgUserAvatar");

    const tgUser = IS_TG ? (window.getTgUser ? window.getTgUser() : null) : null;
    STATE.tgUser = tgUser;
    const tgId = norm(tgUser?.id || "");

    if (branchBackBtn) {
      branchBackBtn.onclick = () => renderStart(DATA);
    }

    // TG vs non-TG
    if (IS_TG) {
      if (fioRow) fioRow.style.display = "none";
      STATE.fio = getTgName();
      if (nonTgBlock) nonTgBlock.style.display = "none";
    } else {
      if (fioRow) fioRow.style.display = "";
      STATE.fio = "";
      if (nonTgBlock) nonTgBlock.style.display = "";
    }

    function updateUserCard() {
      if (userCard && IS_TG && tgUser?.name) {
        userCard.style.display = "flex";
        if (userCardName) userCardName.textContent = tgUser.name;
        if (userCardHandle) {
          if (tgUser.username) {
            userCardHandle.textContent = `@${tgUser.username}`;
            userCardHandle.style.display = "";
          } else {
            userCardHandle.textContent = "";
            userCardHandle.style.display = "none";
          }
        }
        if (userCardAvatar) {
          userCardAvatar.textContent = initialsFromName(tgUser.name);
        }
      } else if (userCard) {
        userCard.style.display = "none";
      }
    }

    // show username line for non-TG (fallback)
    function updateUserLine(name) {
      if (!userLine) return;
      if (name) {
        userLine.style.display = "";
        userLine.textContent = name;
      } else {
        userLine.style.display = "none";
        userLine.textContent = "";
      }
    }

    updateUserCard();
    updateUserLine(!IS_TG ? norm(STATE.fio) : "");

    if (myChecksBtn) {
      if (!tgId) {
        myChecksBtn.disabled = true;
        if (cabinetHint) {
          cabinetHint.style.display = "";
          cabinetHint.textContent = "Не удалось определить ваш Telegram ID.";
        }
      } else if (cabinetHint) {
        cabinetHint.style.display = "none";
        cabinetHint.textContent = "";
      }

      myChecksBtn.onclick = () => {
        if (!tgId) return;
        renderCabinetScreen(DATA);
      };
    }

    function draftHintText(draft) {
      const expiresAt = draftExpiresAt(draft);
      const untilTxt = expiresAt ? formatRuDateTime(expiresAt.toISOString()) : "";
      return untilTxt
        ? `Есть черновик этого адреса (до ${untilTxt}).`
        : `Есть черновик этого адреса.`;
    }

    function resetCities() {
      if (!citySelect) return;
      citySelect.innerHTML = `<option value="">Сначала выбери область</option>`;
      citySelect.disabled = true;
      resetAddresses();
    }

    function resetAddresses() {
      if (!addressSelect) return;
      addressSelect.innerHTML = `<option value="">Сначала выбери город</option>`;
      addressSelect.disabled = true;
    }

    function refreshStartReady() {
      if (!startBtn || !oblastSelect || !citySelect || !addressSelect || !fioInput) return;

      const oblast = norm(oblastSelect.value);
      const city = norm(citySelect.value);
      const branchId = norm(addressSelect.value);

      STATE.oblast = oblast;
      STATE.city = city;
      STATE.branchId = branchId;

      if (!IS_TG) {
        fioInput.disabled = false;
        STATE.fio = norm(fioInput.value);
        if (startBtn.textContent !== startDefaultText) startBtn.textContent = startDefaultText;
      }

      const fioReady = IS_TG || STATE.fio;
      startBtn.disabled = !(STATE.oblast && STATE.city && STATE.branchId && fioReady);
    }

    function fillCities(oblast) {
      if (!citySelect) return;
      const cities = citiesByOblast(BRANCHES, oblast);
      citySelect.innerHTML = `<option value="">Выбери город</option>` +
        cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      citySelect.disabled = !cities.length;
      resetAddresses();
    }

    function fillAddresses(oblast, city) {
      if (!addressSelect || !startBtn) return;
      const list = addressesByCity(BRANCHES, oblast, city);
      addressSelect.innerHTML = `<option value="">Выбери адрес</option>` +
        list.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`).join("");
      addressSelect.disabled = !list.length;
      startBtn.disabled = true;
      if (lastCheckHint) lastCheckHint.innerHTML = "";
    }

    if (oblastSelect) {
      oblastSelect.onchange = () => {
        const oblast = norm(oblastSelect.value);
        if (hint) hint.textContent = "";
        if (!oblast) {
          resetCities();
          refreshStartReady();
          return;
        }
        fillCities(oblast);
        refreshStartReady();
      };
    }

    if (citySelect) {
      citySelect.onchange = () => {
        const oblast = norm(oblastSelect?.value || "");
        const city = norm(citySelect.value);
        if (hint) hint.textContent = "";
        if (!city) {
          resetAddresses();
          refreshStartReady();
          return;
        }
        fillAddresses(oblast, city);
        refreshStartReady();
      };
    }

    if (addressSelect) {
      addressSelect.onchange = () => {
        refreshStartReady();
        if (draftActions) {
          draftActions.innerHTML = "";
          draftActions.style.display = "none";
        }

        // show last check for this address (stored locally)
        if (lastCheckHint) {
          const bidNow = norm(addressSelect.value);
          const branchRow = findBranchById(bidNow);
          const server = getLastCheckFromServer(bidNow);
          const local = normalizeLocalLastCheck(getLastCheck(bidNow), branchRow);
          const last = mergeLastChecks(local, server);
          if (last && (last.ts || last.percent != null || last.zone || last.fio)) {
            const hintHtml = formatLastCheckHint(last);
            lastCheckHint.innerHTML = hintHtml || "";
          } else {
            lastCheckHint.textContent = "Последней проверки пока нет";
          }
        }

        // restore draft for this address (branchId)
        const bid = norm(addressSelect.value);
        const d = loadDraft(bid);
        if (d && !d.isFinished) {
          if (hint) hint.innerHTML = draftHintText(d);
          if (draftActions) {
            draftActions.style.display = "";
            draftActions.innerHTML = `
              <div class="actions">
                <button id="useDraftBtn" class="btn btnSecondary" type="button">Продолжить черновик</button>
              </div>
            `;
            const useBtn = document.getElementById("useDraftBtn");
            if (useBtn) {
              useBtn.onclick = () => {
                STATE.branchId = d.branchId || bid;
                applyDraftToState(d);
                renderChecklist(DATA);
              };
            }
          }
        }
      };
    }

    if (!IS_TG && fioInput) {
      fioInput.oninput = () => {
        refreshStartReady();
        updateUserLine(norm(fioInput.value));
      };
    }

    // initial state
    resetCities();
    refreshStartReady();

    if (startBtn) {
      startBtn.onclick = () => {
        if (!IS_TG) {
          STATE.fio = norm(fioInput?.value || "");
          if (!STATE.fio) {
            alert("Введите ФИО, чтобы начать проверку.");
            refreshStartReady();
            return;
          }
        }
        const secs = activeSections(DATA.sections);
        STATE.enabledSections = secs.map(s => s.id);
        STATE.activeSection = secs[0]?.id || "";
        STATE.completedSections = [];

        STATE.isFinished = false;
        STATE.lastResult = null;
        STATE.lastResultId = null;
        STATE.lastSubmittedAt = "";
        STATE.lastBotSendStatus = "";
        STATE.lastBotSendError = "";
        STATE.singleAnswerLabels = {};

        saveDraft();
        renderChecklist(DATA);
      };
    }
  }

  window.renderBranchPickerScreen = renderBranchPickerScreen;

  // ---------- Start screen ----------
  window.renderStart = function renderStart(data) {
    DATA = data;
    clearResultQuery();

    const tgUser = IS_TG ? (window.getTgUser ? window.getTgUser() : null) : null;
    STATE.tgUser = tgUser;
    const tgId = norm(tgUser?.id || "");

    mount(tplHomeScreen({ showCabinet: IS_TG }));

    const nonTgBlock = document.getElementById("nonTgBlock");
    const nameEl = document.getElementById("homeUserName");
    const handleEl = document.getElementById("homeUserHandle");
    const avatarEl = document.getElementById("homeUserAvatar");
    const newCheckBtn = document.getElementById("homeNewCheckBtn");
    const currentCheckBtn = document.getElementById("homeCurrentCheckBtn");
    const currentCheckBlock = document.getElementById("homeCurrentCheckBlock");
    const currentCheckHint = document.getElementById("homeCurrentCheckHint");
    const resetDraftBtn = document.getElementById("homeResetDraftBtn");
    const historyBtn = document.getElementById("homeHistoryBtn");
    const tasksBtn = document.getElementById("homeTasksBtn");
    const cabinetHint = document.getElementById("homeCabinetHint");

    const displayName = tgUser?.name || "Пользователь Telegram";

    if (nameEl) {
      nameEl.textContent = IS_TG ? displayName : "Откройте в Telegram";
    }
    if (handleEl) {
      if (IS_TG && tgUser?.username) {
        handleEl.textContent = `@${tgUser.username}`;
        handleEl.style.display = "";
      } else {
        handleEl.textContent = IS_TG ? "Без username" : "";
        handleEl.style.display = IS_TG ? "" : "none";
      }
    }
    if (avatarEl) {
      avatarEl.textContent = IS_TG ? initialsFromName(displayName) : "TG";
    }

    if (nonTgBlock) nonTgBlock.style.display = IS_TG ? "none" : "";

    if (newCheckBtn) newCheckBtn.disabled = false;
    if (historyBtn) historyBtn.disabled = !IS_TG || !tgId;
    if (tasksBtn) tasksBtn.disabled = !IS_TG;

    if (cabinetHint) {
      if (!IS_TG) {
        cabinetHint.style.display = "";
        cabinetHint.textContent = "Личный кабинет доступен только из Telegram.";
      } else if (!tgId) {
        cabinetHint.style.display = "";
        cabinetHint.textContent = "Не удалось определить ваш Telegram ID.";
      } else {
        cabinetHint.style.display = "none";
        cabinetHint.textContent = "";
      }
    }

    if (newCheckBtn) {
      newCheckBtn.onclick = () => {
        renderBranchPickerScreen(DATA);
      };
    }

    if (historyBtn) {
      historyBtn.onclick = () => {
        if (!IS_TG || !tgId) return;
        renderCabinetScreen(DATA);
      };
    }

    if (tasksBtn) {
      tasksBtn.onclick = () => {
        alert("Раздел «Мои задачи» пока в разработке.");
      };
    }

    function updateHomeCurrentCheck() {
      if (!IS_TG) {
        if (currentCheckBtn) currentCheckBtn.style.display = "none";
        if (currentCheckBlock) currentCheckBlock.style.display = "none";
        if (currentCheckHint) currentCheckHint.textContent = "";
        if (newCheckBtn) newCheckBtn.classList.add("homeActionWide");
        return;
      }

      const lastDraftBranchId = (window.getLastDraftBranchId ? window.getLastDraftBranchId() : "") || "";
      const draft = lastDraftBranchId ? loadDraft(lastDraftBranchId) : null;
      if (!draft || draft.isFinished) {
        if (currentCheckBtn) currentCheckBtn.style.display = "none";
        if (currentCheckBlock) currentCheckBlock.style.display = "none";
        if (currentCheckHint) currentCheckHint.textContent = "";
        if (newCheckBtn) newCheckBtn.classList.add("homeActionWide");
        return;
      }

      if (newCheckBtn) newCheckBtn.classList.remove("homeActionWide");
      if (currentCheckBtn) currentCheckBtn.style.display = "";
      if (currentCheckBlock) currentCheckBlock.style.display = "";

      const branchRow = findBranchById(draft.branchId);
      const city = norm(draft.city || getCity(branchRow || {}));
      const addr = norm(getAddressLabel(branchRow || {}));
      const addrLine = [city, addr].filter(Boolean).join(", ");
      const expiresAt = draftExpiresAt(draft);
      const untilTxt = expiresAt ? formatRuDateTime(expiresAt.toISOString()) : "";

      if (currentCheckHint) {
        currentCheckHint.innerHTML = [
          addrLine ? `Адрес: ${escapeHtml(addrLine)}` : "",
          untilTxt ? `Черновик хранится до ${escapeHtml(untilTxt)}` : "",
        ].filter(Boolean).join("<br>");
      }

      if (currentCheckBtn) {
        currentCheckBtn.onclick = () => {
          STATE.oblast = draft.oblast || STATE.oblast;
          STATE.city = draft.city || STATE.city;
          STATE.fio = draft.fio || STATE.fio;
          STATE.branchId = draft.branchId || STATE.branchId;
          applyDraftToState(draft);
          renderChecklist(DATA);
        };
      }

      if (resetDraftBtn) {
        resetDraftBtn.onclick = () => {
          clearDraftForBranch(draft.branchId);
          if (currentCheckHint) currentCheckHint.textContent = "Черновик сброшен. Можно начать новую проверку.";
          updateHomeCurrentCheck();
        };
      }
    }

    updateHomeCurrentCheck();
  };

  // ---------- Cabinet screen ----------
  window.renderCabinetScreen = function renderCabinetScreen(data, { forceReload = false } = {}) {
    DATA = data;
    clearResultQuery();

    const tgUser = STATE.tgUser || (window.getTgUser ? window.getTgUser() : null);
    const tgId = norm(tgUser?.id || "");
    if (!IS_TG || !tgId) {
      alert("Личный кабинет доступен только из Telegram.");
      renderStart(DATA);
      return;
    }

    mount(`
      <div class="container cabinetScreen">
        <div class="screenHeader cabinetHeader">
          <div class="screenHeaderTitles">
            <div class="title">История моих проверок</div>
          </div>
          <button id="cabinetBackBtn" class="iconBtn cabinetBackBtn" type="button" aria-label="Назад">←</button>
        </div>
        <div id="cabinetStatus" class="hint cabinetMeta"></div>
        <div id="cabinetTimeHint" class="hint cabinetMeta">Время указано по часовому поясу устройства.</div>
        <div class="card cabinetCard">
          <div id="cabinetTableWrap" class="cabinetTableWrap"></div>
        </div>
        <div class="resultActions cabinetActions">
          <button id="cabinetReloadBtn" class="btn btnSecondary" type="button">Обновить</button>
        </div>
      </div>
    `);

    const backBtn = document.getElementById("cabinetBackBtn");
    const reloadBtn = document.getElementById("cabinetReloadBtn");
    const statusEl = document.getElementById("cabinetStatus");
    const tableWrap = document.getElementById("cabinetTableWrap");
    const sortState = { key: "date", dir: "desc", showAll: false };

    let latestRawItems = [];
    let latestTotal = 0;

    const renderStatus = (text, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = text || "";
      statusEl.style.color = isError ? "var(--danger)" : "";
    };

    const formatDateSmart = (value) => {
      const parsed = parsePossibleDate(value);
      const formatted = parsed ? formatRuDateTime(parsed.toISOString()) : "";
      return formatted || norm(value) || "—";
    };

    const SORT_LABELS = {
      date: "Дата",
      address: "Адрес",
      percent: "% прохождения",
    };

    const dateValue = (row, fallback) => {
      const d = parsePossibleDate(row?.submitted_at);
      return d ? d.getTime() : fallback;
    };

    const percentValue = (row, fallback) => {
      const pct = normalizePercentValue(row?.percent);
      return pct === null ? fallback : pct;
    };

    const sortComparators = {
      date: (a, b) => dateValue(a, Number.POSITIVE_INFINITY) - dateValue(b, Number.POSITIVE_INFINITY),
      percent: (a, b) => percentValue(a, Number.POSITIVE_INFINITY) - percentValue(b, Number.POSITIVE_INFINITY),
      address: (a, b) => addressFromRow(a).localeCompare(addressFromRow(b), "ru"),
    };

    const currentSortLabel = () => {
      const keyLabel = SORT_LABELS[sortState.key] || SORT_LABELS.date;
      const dirLabel = sortState.dir === "asc" ? "↑" : "↓";
      return `${keyLabel} ${dirLabel}`;
    };

    function isGeneralInspectionArea(row) {
      const area = t(getAny(row, ["inspection_area", "inspectionArea", "area"], ""));
      return tkey(area).includes("общ");
    }

    function zoneClassKey(zone) {
      const key = String(zone ?? "").toLowerCase();
      return ["green", "yellow", "red"].includes(key) ? key : "gray";
    }

    function addressFromRow(row) {
      const branchName = norm(getAny(row, ["branch_name", "branchName"], ""));
      if (branchName) return branchName;
      const branchId = norm(getAny(row, ["branch_id", "branchId"], ""));
      const branchRow = branchId ? findBranchById(branchId) : null;
      return norm(getAddressLabel(branchRow || {})) || "—";
    }

    function sortItems(list) {
      const base = Array.isArray(list) ? list : [];
      const comparator = sortComparators[sortState.key] || sortComparators.date;
      const dir = sortState.dir === "asc" ? 1 : -1;
      const indexed = base.map((item, index) => ({ item, index }));

      indexed.sort((a, b) => {
        const primary = comparator(a.item, b.item) * dir;
        if (primary !== 0) return primary;
        const tieByDate = sortComparators.date(a.item, b.item) * -1;
        if (tieByDate !== 0) return tieByDate;
        return a.index - b.index;
      });

      return indexed.map(entry => entry.item);
    }

    const openSubmission = async (submissionId, rowEl) => {
      const id = norm(submissionId);
      if (!id || !rowEl) return;
      if (rowEl.dataset.loading === "true") return;

      rowEl.dataset.loading = "true";
      renderStatus("Открываю результат…");

      try {
        const res = await api.getSubmission(id);
        if (!res?.ok) throw new Error(res?.error || "Не удалось открыть результат");
        renderReadonlyResult(DATA, res, { backMode: "cabinet" });
        return;
      } catch (err) {
        alert("Не удалось открыть результат. Попробуйте ещё раз.");
        rowEl.dataset.loading = "false";
        renderStatus("Не удалось открыть результат.", true);
      }
    };

    const renderTable = (items, total) => {
      const rawList = Array.isArray(items) ? items : [];
      latestRawItems = rawList;
      latestTotal = total || rawList.length;
      if (!tableWrap) return;
      if (!rawList.length) {
        tableWrap.innerHTML = `<div class="hint">Вы пока еще не провели ни одну проверку</div>`;
        renderStatus("Как только вы завершите проверку, она появится здесь.");
        return;
      }
      const generalList = rawList.filter(isGeneralInspectionArea);
      if (!generalList.length) {
        tableWrap.innerHTML = `<div class="hint">Нет проверок по зоне «Общая».</div>`;
        renderStatus("Проверки появятся здесь после завершения общей оценки.");
        return;
      }

      const list = sortItems(generalList);
      const baseCount = generalList.length;
      const previewLimit = 5;
      const showAll = sortState.showAll;
      const visibleList = showAll ? list : list.slice(0, previewLimit);
      const hiddenCount = Math.max(0, list.length - visibleList.length);
      const shownCount = visibleList.length;
      const previewLabel = showAll
        ? `Показаны все ${shownCount} из ${baseCount}.`
        : `Показаны последние ${shownCount} из ${baseCount}.`;
      renderStatus(`Всего проверок «Общая»: ${baseCount}. ${previewLabel} Сортировка: ${currentSortLabel()}. Нажмите на строку, чтобы открыть результат.`);

      tableWrap.innerHTML = `
        <table class="cabinetTable">
          <thead>
            <tr>
              <th style="width:140px;">
                <button class="cabinetSortBtn ${sortState.key === "date" ? "is-active" : ""}" data-sort="date" data-dir="${sortState.key === "date" ? sortState.dir : "desc"}" type="button">
                  <span class="cabinetSortLabel">Дата</span>
                  <span class="cabinetSortIndicator" aria-hidden="true">
                    <svg class="cabinetSortIcon" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M3 4h14l-5.5 6.2v4.8l-3 2v-6.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    </svg>
                    <span class="cabinetSortDirection"></span>
                  </span>
                </button>
              </th>
              <th>
                <button class="cabinetSortBtn ${sortState.key === "address" ? "is-active" : ""}" data-sort="address" data-dir="${sortState.key === "address" ? sortState.dir : "asc"}" type="button">
                  <span class="cabinetSortLabel">Адрес</span>
                  <span class="cabinetSortIndicator" aria-hidden="true">
                    <svg class="cabinetSortIcon" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M3 4h14l-5.5 6.2v4.8l-3 2v-6.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    </svg>
                    <span class="cabinetSortDirection"></span>
                  </span>
                </button>
              </th>
              <th style="width:140px;">
                <button class="cabinetSortBtn ${sortState.key === "percent" ? "is-active" : ""}" data-sort="percent" data-dir="${sortState.key === "percent" ? sortState.dir : "desc"}" type="button">
                  <span class="cabinetSortLabel">% прохождения</span>
                  <span class="cabinetSortIndicator" aria-hidden="true">
                    <svg class="cabinetSortIcon" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M3 4h14l-5.5 6.2v4.8l-3 2v-6.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    </svg>
                    <span class="cabinetSortDirection"></span>
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            ${visibleList.map(item => {
              const submissionId = norm(item.submission_id);
              const submittedAt = formatDateSmart(item.submitted_at);
              const address = addressFromRow(item);
              const zoneKey = zoneClassKey(item.zone);
              const percent = formatPercentDisplay(item.percent);
              const percentCellClass = `cabinetZoneCell cabinetZoneCell--${zoneKey}`;

              return `
                <tr class="cabinetRow" data-open-submission="${escapeHtml(submissionId)}" tabindex="0" role="button" aria-label="Открыть проверку ${escapeHtml(submittedAt)} • ${escapeHtml(address)}">
                  <td>${escapeHtml(submittedAt)}</td>
                  <td>${escapeHtml(address)}</td>
                  <td class="${escapeHtml(percentCellClass)}">${escapeHtml(percent)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        ${hiddenCount > 0 || showAll ? `
          <div class="cabinetShowMore">
            <button id="cabinetShowMoreBtn" class="btn btnSecondary" type="button">
              ${showAll ? "Показать 5 последних" : `Показать ещё ${hiddenCount}`}
            </button>
          </div>
        ` : ""}
      `;

      tableWrap.querySelectorAll("[data-open-submission]").forEach(row => {
        const submissionId = row.getAttribute("data-open-submission");
        row.onclick = () => openSubmission(submissionId, row);
        row.onkeydown = (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openSubmission(submissionId, row);
          }
        };
      });

      tableWrap.querySelectorAll(".cabinetSortBtn").forEach(btn => {
        btn.onclick = () => {
          const key = btn.getAttribute("data-sort") || "date";
          const isSame = sortState.key === key;
          const defaultDir = key === "address" ? "asc" : "desc";
          const nextDir = isSame ? (sortState.dir === "asc" ? "desc" : "asc") : defaultDir;
          sortState.key = key;
          sortState.dir = nextDir;
          renderTable(latestRawItems, latestTotal);
        };
      });

      const showMoreBtn = document.getElementById("cabinetShowMoreBtn");
      if (showMoreBtn) {
        showMoreBtn.onclick = () => {
          sortState.showAll = !sortState.showAll;
          renderTable(latestRawItems, latestTotal);
        };
      }
    };

    const renderLoading = () => {
      if (!tableWrap) return;
      latestRawItems = [];
      latestTotal = 0;
      tableWrap.innerHTML = `<div class="hint">Загружаю ваши проверки…</div>`;
      renderStatus("Запрашиваю данные из таблицы…");
    };

    const loadItems = async () => {
      renderLoading();
      const cache = STATE.cabinetCache;
      const cacheAgeMs = cache?.fetchedAt ? (Date.now() - cache.fetchedAt) : Infinity;
      const cacheTtlMs = 60 * 1000;
      if (!forceReload && cache?.rawItems && cacheAgeMs < cacheTtlMs) {
        renderTable(cache.rawItems, cache.total);
        return;
      }

      try {
        const limit = (typeof MY_SUBMISSIONS_DEFAULT_LIMIT !== "undefined") ? MY_SUBMISSIONS_DEFAULT_LIMIT : 200;
        const res = await api.getMySubmissions(tgId, { limit });
        if (!res?.ok) throw new Error(res?.error || "Не удалось загрузить список");
        const rawItems = Array.isArray(res.items) ? res.items : [];
        STATE.cabinetCache = { rawItems, total: res.total || rawItems.length, fetchedAt: Date.now() };
        renderTable(rawItems, res.total || rawItems.length);
      } catch (err) {
        if (tableWrap) tableWrap.innerHTML = `<div class="hint">Не удалось загрузить список проверок 😕</div>`;
        renderStatus("Попробуйте обновить список чуть позже.", true);
      }
    };

    if (backBtn) {
      backBtn.onclick = () => {
        renderStart(DATA);
      };
    }
    if (reloadBtn) {
      reloadBtn.onclick = () => {
        renderCabinetScreen(DATA, { forceReload: true });
      };
    }

    loadItems();
  };

  // ---------- Checklist screen ----------
  window.renderChecklist = function renderChecklist(data) {
    DATA = data;

    const secs = activeSections(DATA.sections);
    const completedSet = new Set(STATE.completedSections || []);
    const orderedSecs = [
      ...secs.filter(s => !completedSet.has(s.id)),
      ...secs.filter(s => completedSet.has(s.id)),
    ];

    if (!STATE.activeSection) STATE.activeSection = orderedSecs[0]?.id || "";
    if (!secs.find(s => s.id === STATE.activeSection)) {
      STATE.activeSection = orderedSecs[0]?.id || "";
    }

    const BRANCHES = getBranches();
    const branchRow = findBranchById(STATE.branchId);
    const city = norm(STATE.city || getCity(branchRow || {}));
    const addr = norm(getAddressLabel(branchRow || {}));
    const addrLine = [norm(STATE.city || ""), addr].filter(Boolean).join(", ");
    const fio = norm(STATE.fio || "");

    const ctxLine = [fio, city, addr].filter(Boolean).join(" • ");
    const activeTitle = secs.find(s => s.id === STATE.activeSection)?.title || "";
    const isLockedSection = isSectionCompleted(STATE.activeSection);

    // base layout
    mount(`
      <div class="container">
        <div class="card" style="margin-bottom:12px;">
          <div class="cardHeader">
            <div class="title">Проверка</div>
            <div class="subTitle" id="ctxLine">${escapeHtml(ctxLine || "")}</div>
            ${fio ? `<div class="subTitle">Проверяет: <span class="userGlow">${escapeHtml(fio)}</span></div>` : ``}
            <div class="subTitle" id="sectionLine">${activeTitle ? `Раздел: ${escapeHtml(activeTitle)}` : ``}</div>
          </div>
        </div>

        <div class="stickyHeader stickyTabsHeader">
          ${tplSectionTabs({ sections: orderedSecs, active: STATE.activeSection, completed: STATE.completedSections || [] })}
        </div>
        <div id="qList"></div>

        <div class="bottomBar">
          <div id="missingHint" class="missingHint"></div>
          <div class="bottomActions">
            <button id="sendZoneBtn" class="btn btnSecondary" type="button">Отправить зону</button>
            <button id="finishBtn" class="btn primary" type="button">Завершить</button>
          </div>
        </div>
      </div>
    `);

    const sectionLine = document.getElementById("sectionLine");
    if (sectionLine && activeTitle) {
      sectionLine.innerHTML = `Раздел: ${escapeHtml(activeTitle)} <span class="loadingPill" id="sectionLoadingPill">Загружаю…</span>`;
    }

    // wire tabs
    document.querySelectorAll(".tab").forEach(btn => {
      btn.onclick = () => {
        const sid = btn.getAttribute("data-section");
        STATE.activeSection = sid;
        saveDraft();
        renderChecklist(DATA);
        window.scrollTo({ top: 0, behavior: "auto" });
      };
    });

    // render questions for active section
    let qs = questionsForSection(DATA.checklist, STATE.activeSection);

    const qList = document.getElementById("qList");
    const rollCatalog = getRollWeightsCatalog();
    qList.innerHTML = qs.map(q => {
      const qWithSection = { ...q, section_title: activeTitle };
      const isCheckbox = isCheckboxQuestion(qWithSection);
      const isNumber = isNumberQuestion(qWithSection);
      const state = isCheckbox
        ? (STATE.checkboxAnswers[qWithSection.id] instanceof Set ? STATE.checkboxAnswers[qWithSection.id] : new Set())
        : isNumber
          ? (STATE.numberAnswers?.[qWithSection.id] || {})
          : norm(STATE.singleAnswers[qWithSection.id]);
      return tplQuestionCard(qWithSection, {
        answerState: state,
        showRightToggle: true,
        showNotes: !isCheckbox,
        rollOptions: isNumber ? rollCatalog.options : [],
        tolerance: WEIGHT_TOLERANCE_GRAMS,
      });
    }).join("");

    const sectionLoadingPill = document.getElementById("sectionLoadingPill");
    if (sectionLoadingPill) {
      setTimeout(() => {
        if (sectionLoadingPill.isConnected) sectionLoadingPill.remove();
      }, 300);
    }

    if (isLockedSection) {
      qList.classList.add("sectionLocked");
      qList.querySelectorAll(".qCard").forEach(card => card.classList.add("locked"));
    }

    // wire photo toggle buttons
    document.querySelectorAll(".photoToggle").forEach(btn => {
      btn.onclick = () => {
        const photo = btn.getAttribute("data-photo");
        if (!photo) return;
        openImageModal([photo], 0);
      };
    });

    // wire single options
    document.querySelectorAll(".qCard .optRow").forEach(row => {
      const card = row.closest(".qCard");
      const qid = card.getAttribute("data-qid");

      row.querySelectorAll(".optBtn").forEach(btn => {
        if (isLockedSection) {
          btn.disabled = true;
          btn.classList.add("is-locked");
          return;
        }
        btn.onclick = () => {
          const v = btn.getAttribute("data-val");
          const label = (btn.textContent || "").trim();

          // canonical key for scoring/UI
          STATE.singleAnswers[qid] = v;

          // human label for dashboards
          STATE.singleAnswerLabels ??= {};
          STATE.singleAnswerLabels[qid] = label;

          // selected style
          row.querySelectorAll(".optBtn").forEach(x => x.classList.remove("selected"));
          btn.classList.add("selected");

          // show notes if not ideal
          const qObj = qs.find(x => x.id === qid) || {};
          const ideal = norm(getAny(qObj, ["ideal_answer", "good_text", "good", "эталон", "идеал"], ""));
          toggleNotesByAnswer(qid, (label && ideal && label === ideal) ? "good" : "bad");

          // clear required mark
          markRequired(card, true);

          saveDraft();
          refreshFinishState();
        };
      });

      // initial notes visibility
      toggleNotesByAnswer(qid, norm(STATE.singleAnswers[qid]));
    });

    // wire checkbox options
    document.querySelectorAll(".qCard .optCol.checkbox").forEach(col => {
      const card = col.closest(".qCard");
      const qid = card.getAttribute("data-qid");
      const isBoolean = col.getAttribute("data-mode") === "boolean";
      STATE.checkboxAnswers[qid] ??= new Set();
      const set = STATE.checkboxAnswers[qid];

      const inputs = Array.from(col.querySelectorAll("input[type=checkbox]"));
      const updateNotes = () => {
        if (isBoolean) {
          const checked = inputs[0]?.checked;
          toggleNotesByAnswer(qid, checked ? "good" : "bad");
          return;
        }
        const anyChecked = inputs.some((input) => input.checked);
        toggleNotesByAnswer(qid, anyChecked ? "bad" : "good");
      };

      inputs.forEach(cb => {
        if (isLockedSection) {
          cb.disabled = true;
          return;
        }
        cb.onchange = () => {
          if (isBoolean) {
            set.clear();
            if (cb.checked) set.add("1");
          } else {
            const itemId = cb.getAttribute("data-item") || "1";
            if (cb.checked) {
              set.add(itemId);
            } else {
              set.delete(itemId);
            }
          }

          updateNotes();

          saveDraft();
          refreshFinishState();
        };
      });

      // initial notes visibility
      updateNotes();
    });

    // wire number options
    document.querySelectorAll(".qCard .optCol.number").forEach(col => {
      const card = col.closest(".qCard");
      const qid = card.getAttribute("data-qid");
      const rollSelect = col.querySelector(".numberSelect");
      const actualInput = col.querySelector(".numberInput");
      const hideBtn = col.querySelector(".numberHideBtn");
      const inputRow = col.querySelector(".numberInputRow");
      const planEl = col.querySelector('[data-role="plan"]');
      const diffEl = col.querySelector('[data-role="diff"]');
      const rollCatalog = getRollWeightsCatalog();
      const clearStickyState = () => {
        document.querySelectorAll(".numberInputRow.is-active").forEach(row => row.classList.remove("is-active"));
        document.querySelectorAll(".numberHideBtn.is-sticky").forEach(btn => btn.classList.remove("is-sticky"));
      };
      const refreshEditingState = () => {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.classList.contains("numberInput")) {
          return;
        }
        document.body.classList.remove("is-number-editing");
        clearStickyState();
      };
      const setStickyState = () => {
        clearStickyState();
        if (inputRow) inputRow.classList.add("is-active");
        if (hideBtn) hideBtn.classList.add("is-sticky");
        document.body.classList.add("is-number-editing");
      };
      const ensureInputInView = () => {
        if (!actualInput) return;
        const rect = actualInput.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const safeTop = 96;
        const safeBottom = viewportHeight * 0.6;
        if (rect.top < safeTop || rect.bottom > safeBottom) {
          actualInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      const applyMeta = (meta) => {
        if (planEl) {
          const planText = meta.plannedWeight !== "" ? `${formatWeightDisplay(meta.plannedWeight)} г` : "—";
          planEl.textContent = planText;
        }
        if (diffEl) {
          const diffText = meta.diff !== "" ? `${formatWeightDisplay(meta.diff, { signed: true })} г` : "—";
          diffEl.textContent = diffText;
        }
      };

      const updateFromInputs = (shouldSave = true) => {
        const rollId = norm(rollSelect?.value || "");
        const selectedOption = rollSelect?.options?.[rollSelect.selectedIndex];
        const rollName = norm(selectedOption?.getAttribute("data-name") || selectedOption?.textContent || "");
        const plannedAttr = selectedOption?.getAttribute("data-weight") || "";
        const plannedWeight = normalizeNumberOrEmpty(plannedAttr);
        const actualWeight = normalizeNumberOrEmpty(actualInput?.value ?? "");

        const meta = computeNumberAnswerMeta({
          roll_id: rollId,
          roll_name: rollName,
          actual_weight: actualWeight,
          planned_weight: plannedWeight,
        }, rollCatalog);

        STATE.numberAnswers ??= {};
        STATE.numberAnswers[qid] = {
          roll_id: meta.rollId,
          roll_name: meta.rollName,
          actual_weight: meta.actualWeight,
          planned_weight: meta.plannedWeight,
          diff: meta.diff,
          within_tolerance: meta.withinTolerance,
        };

        applyMeta(meta);

        if (meta.hasAnswer) {
          toggleNotesByAnswer(qid, meta.withinTolerance ? "good" : "bad");
          markRequired(card, true);
        } else {
          toggleNotesByAnswer(qid, "");
        }

        if (shouldSave) {
          saveDraft();
          refreshFinishState();
        }
      };

      if (isLockedSection) {
        if (rollSelect) rollSelect.disabled = true;
        if (actualInput) actualInput.disabled = true;
        if (hideBtn) hideBtn.disabled = true;
      } else {
        if (rollSelect) rollSelect.onchange = () => updateFromInputs(true);
        if (actualInput) {
          actualInput.oninput = () => updateFromInputs(true);
          actualInput.addEventListener("focus", () => {
            setStickyState();
            requestAnimationFrame(() => {
              ensureInputInView();
            });
            setTimeout(() => {
              if (actualInput.isConnected) ensureInputInView();
            }, 300);
          });
          actualInput.addEventListener("blur", () => {
            setTimeout(() => {
              refreshEditingState();
            }, 0);
          });
        }
        if (hideBtn) {
          hideBtn.onclick = () => {
            updateFromInputs(true);
            if (actualInput) actualInput.blur();
            refreshEditingState();
          };
        }
      }

      updateFromInputs(false);
    });

    // wire notes UI
    document.querySelectorAll(".noteBlock").forEach(block => {
      const qid = block.getAttribute("data-note-for");
      const note = safeEnsureNote(qid);

      const ta = block.querySelector(".noteInput");
      if (ta) {
        ta.value = note.text || "";
        attachAutoGrow(ta, { maxRows: 3 });
        ta.oninput = () => {
          safeEnsureNote(qid).text = ta.value;
          saveDraft();
        };
      }

      const file = block.querySelector(".noteFile");
      if (file) {
        file.onchange = async () => {
          const files = Array.from(file.files || []);
          if (!files.length) return;

          const n = safeEnsureNote(qid);
          for (const f of files) {
            if (n.photos.length >= (typeof MAX_PHOTOS_PER_ISSUE !== "undefined" ? MAX_PHOTOS_PER_ISSUE : 5)) break;
            if (f.size > (typeof MAX_PHOTO_SIZE_BYTES !== "undefined" ? MAX_PHOTO_SIZE_BYTES : 4 * 1024 * 1024)) continue;

            const dataUrl = await readFileAsDataUrl(f);
            if (dataUrl) n.photos.push(dataUrl);
          }

          file.value = "";
          renderThumbs(block, qid);
          saveDraft();
        };
      }

      renderThumbs(block, qid);
    });

    const sendZoneBtn = document.getElementById("sendZoneBtn");
    if (sendZoneBtn) {
      if (isLockedSection) {
        sendZoneBtn.disabled = true;
        sendZoneBtn.textContent = "Зона отправлена";
      } else {
        sendZoneBtn.disabled = false;
        sendZoneBtn.textContent = "Отправить зону";
      }

      sendZoneBtn.onclick = async () => {
        if (isLockedSection) return;
        const missing = missingInSection(STATE.activeSection);
        if (missing.length) {
          showMissing([{ sectionId: STATE.activeSection, title: activeTitle, count: missing.length }]);
          const first = document.querySelector(".qCard.missing");
          if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        const sectionResult = computeResultFromState({ sectionId: STATE.activeSection });
        const submissionId = ensureSubmissionId();
        const payload = buildSectionPayload(STATE.activeSection, sectionResult, submissionId);

        try {
          sendZoneBtn.disabled = true;
          sendZoneBtn.textContent = UI_TEXT?.submitSending || "Отправляю…";
          await api.submit(payload, { usePostMessage: false });
          sendZoneBtn.textContent = UI_TEXT?.submitOk || "Отправлено ✅";
        } catch (e) {
          alert(UI_TEXT?.submitFail || "Не удалось отправить результаты в таблицу. Попробуй ещё раз");
          sendZoneBtn.disabled = false;
          sendZoneBtn.textContent = "Отправить зону";
          return;
        }

        if (!STATE.completedSections) STATE.completedSections = [];
        if (!STATE.completedSections.includes(STATE.activeSection)) STATE.completedSections.push(STATE.activeSection);
        const nextIncomplete = orderedSecs.find(s => !isSectionCompleted(s.id));
        STATE.activeSection = nextIncomplete?.id || STATE.activeSection;
        saveDraft();
        renderChecklist(DATA);
      };
    }

    // finish button
    const finishBtn = document.getElementById("finishBtn");
    finishBtn.onclick = async () => {
      const missing = missingBySection();
      if (missing.length) {
        showMissing(missing);
        // scroll to first missing question in current section if any
        const first = document.querySelector(".qCard.missing");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      try {
        finishBtn.disabled = true;
        finishBtn.textContent = UI_TEXT?.submitSending || "Отправляю…";

        const pendingSections = secs.filter(s => !isSectionCompleted(s.id));
        const submissionId = ensureSubmissionId();
        if (pendingSections.length) {
          for (let i = 0; i < pendingSections.length; i += 1) {
            const section = pendingSections[i];
            finishBtn.textContent = `Отправляю раздел ${i + 1}/${pendingSections.length}…`;
            const sectionResult = computeResultFromState({ sectionId: section.id });
            const sectionPayload = buildSectionPayload(section.id, sectionResult, submissionId);
            await api.submit(sectionPayload, { usePostMessage: false });

            if (!STATE.completedSections) STATE.completedSections = [];
            if (!STATE.completedSections.includes(section.id)) STATE.completedSections.push(section.id);
          }
        }

        const result = computeResultFromState();
        STATE.isFinished = true;
        STATE.lastResult = result;

        // create submission payload for sheet
        STATE.lastResultId = submissionId;
        STATE.lastSubmittedAt = new Date().toISOString();
        STATE.lastBotSendStatus = "";
        STATE.lastBotSendError = "";

        const payload = buildSubmissionPayload(submissionId, result);
        saveDraft();

        finishBtn.textContent = UI_TEXT?.submitSending || "Отправляю…";

        // try postMessage response for result_id (share links), fallback to load-only
        let submitResult = null;
        try {
          submitResult = await api.submit(payload, { usePostMessage: true });
        } catch (err) {
          submitResult = await api.submit(payload, { usePostMessage: false });
        }

        const returnedId = norm(submitResult?.result_id || "");
        if (returnedId) STATE.lastResultId = returnedId;

        STATE.lastBotSendStatus = IS_TG ? "pending" : "skipped";
        STATE.lastBotSendError = "";

        // invalidate cabinet cache so new check appears immediately
        STATE.cabinetCache = null;

        // last check meta for branch (local)
        const branchRow = findBranchById(STATE.branchId);
        const branchName = norm(getAddressLabel(branchRow || {}));
        const city = norm(STATE.city || getCity(branchRow || {}));
        setLastCheck(STATE.branchId, {
          percent: result.percent,
          zone: result.zone,
          fio: STATE.fio || "",
          branch_name: branchName,
          city,
        });

        // keep draft data so results can be restored if the app reloads after submit
        finishBtn.textContent = UI_TEXT?.submitOk || "Готово ✅";
      } catch (e) {
        alert(UI_TEXT?.submitFail || "Не удалось отправить результаты в таблицу. Попробуй ещё раз");
        finishBtn.disabled = false;
        finishBtn.textContent = "Завершить";
        return;
      }

      renderResultScreen(DATA, STATE.lastResult);
    };

    refreshFinishState();
  };

  function toggleNotesByAnswer(qid, ans) {
    const block = document.querySelector(`.noteBlock[data-note-for="${CSS.escape(qid)}"]`);
    if (!block) return;

    const show = (ans && ans !== "good");
    block.style.display = show ? "" : "none";
  }

  function markRequired(card, ok) {
    const msg = card.querySelector(".qReqMsg");
    if (!msg) return;

    if (ok) {
      card.classList.remove("missing");
      msg.style.display = "none";
      msg.textContent = "";
    } else {
      card.classList.add("missing");
      msg.style.display = "";
      msg.textContent = "Нужно выбрать ответ";
    }
  }

  function showMissing(missing) {
    // mark missing in UI
    const secs = activeSections(DATA.sections);
    const targetSections = new Set((missing || []).map(m => m.sectionId));

    for (const s of secs) {
      if (targetSections.size && !targetSections.has(s.id)) continue;
      const qs = questionsForSection(DATA.checklist, s.id).filter(q => !isCheckboxQuestion(q));
      for (const q of qs) {
        if (isAnswered(q)) continue;
        const card = document.querySelector(`.qCard[data-qid="${CSS.escape(q.id)}"]`);
        if (card) markRequired(card, false);
      }
    }

    const names = missing.map(m => m.title).join(", ");
    const el = document.getElementById("missingHint");
    if (el) el.textContent = `Не заполнены ответы в разделах: ${names}`;
  }

  function refreshFinishState() {
    const missing = missingBySection();
    const el = document.getElementById("missingHint");
    if (el) el.textContent = missing.length ? `Не заполнены ответы в разделах: ${missing.map(m => m.title).join(", ")}` : "";

    const finishBtn = document.getElementById("finishBtn");
    if (finishBtn) finishBtn.disabled = missing.length > 0;
  }

  // ---------- thumbs ----------
  function renderThumbs(block, qid) {
    const row = block.querySelector(".thumbRow");
    if (!row) return;

    const photos = notePhotos(qid);
    row.innerHTML = photos.map((p, i) => {
      const src = driveToDirect(p);
      return `
        <div class="thumbWrap">
          <img class="thumb" src="${escapeHtml(src)}" data-i="${i}" />
          <button class="thumbDel" type="button" data-i="${i}">×</button>
        </div>
      `;
    }).join("");

    row.querySelectorAll(".thumb").forEach(img => {
      img.onclick = () => {
        const idx = Number(img.getAttribute("data-i") || "0");
        openImageModal(photos, idx);
      };
    });

    row.querySelectorAll(".thumbDel").forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-i") || "0");
        const n = safeEnsureNote(qid);
        n.photos.splice(idx, 1);
        renderThumbs(block, qid);
        saveDraft();
      };
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve("");
      fr.readAsDataURL(file);
    });
  }

  // ---------- submission payload ----------
  function getBranchMeta() {
    const branchRow = findBranchById(STATE.branchId);
    return {
      branchRow,
      branchName: norm(getAddressLabel(branchRow || {})),
    };
  }

  function getCheckerMeta() {
    const tgUser = STATE.tgUser || (window.getTgUser ? window.getTgUser() : null);
    const fio = norm(STATE.fio || tgUser?.name || "");
    if (!STATE.fio && fio) STATE.fio = fio;
    return {
      fio,
      tg_id: tgUser?.id || "",
      tg_user_id: tgUser?.id || "",
      tg_username: tgUser?.username || "",
      tg_first_name: tgUser?.first_name || "",
      tg_last_name: tgUser?.last_name || "",
      tg_name: tgUser?.name || "",
    };
  }

  function buildAnswersRows(submissionId, submittedAt) {
    const rows = [];
    const sections = activeSections(DATA.sections);
    const { branchName } = getBranchMeta();
    const checker = getCheckerMeta();

    sections.forEach(section => {
      const qs = questionsForSection(DATA.checklist, section.id);
      qs.forEach(q => {
        const qid = q.id;
        const questionText = norm(q.title_text || q.title || q.question || q.name);
        const note = safeEnsureNote(qid);
        const isCheckbox = isCheckboxQuestion(q);
        const isNumber = isNumberQuestion(q);
        const qScore = Number(getAny(q, ["score", "баллы", "points"], 1)) || 1;
        const ex = String(getAny(q, ["exclude_from_max", "exclude", "skip_max", "исключить_из_макс"], false) ?? "").trim().toLowerCase();
        const isExcluded = (ex === "true" || ex === "1" || ex === "yes" || ex === "да");
        const severity = (q.severity === "critical") ? "critical" : "noncritical";
        const baseRow = {
          submission_id: submissionId,
          submitted_at: submittedAt,
          zone_room: section.title || "",
          section_id: section.id,
          section_title: section.title || "",
          question_id: qid,
          question_text: questionText,
          question_type: isCheckbox ? "checkbox" : (isNumber ? "number" : "single"),
          severity,
          answer_key: "",
          answer_text: "",
          answer_value: "",
          answer_label: "",
          is_issue: false,
          score_earned: isExcluded ? "" : 0,
          score_max: isExcluded ? "" : qScore,
          comment: norm(note.text),
          photos: notePhotos(qid),

          oblast: STATE.oblast || "",
          city: STATE.city,
          branch_id: STATE.branchId,
          branch_name: branchName,
          fio: checker.fio,
          tg_id: checker.tg_id,
          tg_user_id: checker.tg_user_id,
          tg_username: checker.tg_username,
          tg_first_name: checker.tg_first_name,
          tg_last_name: checker.tg_last_name,
          tg_name: checker.tg_name,
        };

        if (isCheckbox) {
          const set = STATE.checkboxAnswers[qid] instanceof Set ? STATE.checkboxAnswers[qid] : new Set(STATE.checkboxAnswers[qid] || []);
          const labels = getCheckboxAnswerLabels(q, set);
          const ids = [...set];
          const hasItems = checkboxHasItems(q);
          const checked = (set.has("1") || set.has("true") || set.has("yes") || set.has("да"));
          const anySelected = set.size > 0;
          const isIssue = hasItems ? anySelected : !checked;
          const earned = isExcluded ? "" : ((hasItems ? (anySelected ? 0 : 1) : (checked ? 1 : 0)) * qScore);
          const hasAnswer = ids.length > 0;
          const emptyLabel = hasItems ? "Нет нарушений" : "";
          baseRow.answer_value = hasAnswer ? ids.join(", ") : (hasItems ? "0" : "0");
          baseRow.answer_label = labels.length ? labels.join(", ") : (hasItems ? emptyLabel : "");
          baseRow.answer_key = baseRow.answer_value;
          baseRow.answer_text = baseRow.answer_label;
          baseRow.is_issue = isIssue;
          baseRow.score_earned = earned;
        } else if (isNumber) {
          const rollCatalog = getRollWeightsCatalog();
          const answer = STATE.numberAnswers?.[qid] || {};
          const meta = computeNumberAnswerMeta(answer, rollCatalog);
          const hasAnswer = meta.hasAnswer;
          const scoreUnit = hasAnswer && meta.withinTolerance ? 1 : 0;
          const earned = isExcluded ? "" : scoreUnit * qScore;
          const labelText = formatWeightComparison(meta);
          baseRow.answer_value = meta.actualWeight !== "" ? String(meta.actualWeight) : "";
          baseRow.answer_label = labelText;
          baseRow.answer_key = meta.rollId || meta.rollName || "";
          baseRow.answer_text = labelText;
          baseRow.is_issue = hasAnswer ? !meta.withinTolerance : false;
          baseRow.score_earned = earned;
        } else {
          const selectedValue = norm(STATE.singleAnswers[qid] || "");
          let selectedLabel = norm(STATE.singleAnswerLabels?.[qid] || "");
          const ideal = norm(getAny(q, ["ideal_answer", "good_text", "good", "эталон", "идеал"], ""));
          const ok = norm(getAny(q, ["acceptable_answer", "ok_text", "ok", "норм"], ""));
          const bad = norm(getAny(q, ["bad_answer", "bad_text", "bad", "стрем", "плохо"], ""));

          let kind = "bad";
          if (selectedValue === "good") kind = "good";
          else if (selectedValue === "ok") kind = "ok";
          else if (selectedValue === "bad") kind = "bad";
          else if (selectedLabel && ideal && selectedLabel === ideal) kind = "good";
          else if (selectedLabel && ok && selectedLabel === ok) kind = "ok";
          else if (selectedLabel && bad && selectedLabel === bad) kind = "bad";

          const answered = Boolean(selectedValue || selectedLabel);
          const isIssue = answered && kind !== "good";
          let earned = "";
          if (!isExcluded) {
            if (kind === "good") earned = 1 * qScore;
            else if (kind === "ok") earned = 0.5 * qScore;
            else earned = 0;
          }

          if (!selectedLabel && selectedValue) {
            if (selectedValue === "good") selectedLabel = ideal;
            if (selectedValue === "ok") selectedLabel = ok;
            if (selectedValue === "bad") selectedLabel = bad;
          }

          baseRow.answer_value = selectedValue;
          baseRow.answer_label = selectedLabel;
          baseRow.answer_key = selectedValue;
          baseRow.answer_text = selectedLabel;
          baseRow.is_issue = isIssue;
          baseRow.score_earned = earned;
        }

        rows.push(baseRow);
      });
    });

    return rows;
  }

  function buildSectionPayload(sectionId, result, submissionId) {
    const ts = formatRuDateTime(new Date());
    const sections = activeSections(DATA.sections);
    const sectionTitle = sections.find(s => s.id === sectionId)?.title || "";
    const sectionQs = questionsForSection(DATA.checklist, sectionId);
    const qids = new Set(sectionQs.map(q => q.id));

    const single = {};
    const single_labels = {};
    const checkbox = {};
    const checkbox_labels = {};
    const number = {};
    const number_labels = {};

    for (const qid of qids) {
      if (STATE.singleAnswers[qid] !== undefined) single[qid] = STATE.singleAnswers[qid];
      if (STATE.singleAnswerLabels?.[qid]) single_labels[qid] = STATE.singleAnswerLabels[qid];
      if (STATE.checkboxAnswers[qid]) checkbox[qid] = [...(STATE.checkboxAnswers[qid] || [])];
      if (STATE.numberAnswers?.[qid]) number[qid] = STATE.numberAnswers[qid];
    }

    sectionQs.forEach(q => {
      if (!isCheckboxQuestion(q)) return;
      const set = STATE.checkboxAnswers[q.id] instanceof Set ? STATE.checkboxAnswers[q.id] : new Set();
      const labels = getCheckboxAnswerLabels(q, set);
      if (labels.length) checkbox_labels[q.id] = labels;
    });

    sectionQs.forEach(q => {
      if (!isNumberQuestion(q)) return;
      const meta = computeNumberAnswerMeta(STATE.numberAnswers?.[q.id] || {}, getRollWeightsCatalog());
      const labelText = formatWeightComparison(meta);
      if (labelText) number_labels[q.id] = labelText;
    });

    const checker = getCheckerMeta();
    const { branchName } = getBranchMeta();

    const payload = {
      action: "submit",
      submission_id: submissionId || "",
      submitted_at: ts,
      init_data: getTelegramInitData(),
      result_link: buildResultLink(submissionId || ""),
      partial: true,
      section_id: sectionId,
      section_title: sectionTitle,
      zone_room: sectionTitle,
      inspection_area: sectionTitle,

      oblast: STATE.oblast || "",
      city: STATE.city,
      branch_id: STATE.branchId,
      branch_name: branchName,
      fio: checker.fio,
      tg_id: checker.tg_id,
      tg_user_id: checker.tg_user_id,
      tg_username: checker.tg_username,
      tg_first_name: checker.tg_first_name,
      tg_last_name: checker.tg_last_name,
      tg_name: checker.tg_name,

      zone: result.maxScore > 0 ? result.zone : "",
      percent: result.maxScore > 0 ? formatPercentForSheet(result.percent) : "",
      percent_value: result.maxScore > 0 ? result.percent : "",
      score: result.score,
      earned: result.score,
      max_score: result.maxScore > 0 ? result.maxScore : "",
      zones_score_total: "",
      has_critical: result.hasCritical,

      issues: result.issues,
      answers: { single, single_labels, checkbox, checkbox_labels, number, number_labels },
      meta: {
        app_version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : ""),
        is_tg: IS_TG,
        checker,
      },
      meta_json: JSON.stringify({
        app_version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : ""),
        is_tg: IS_TG,
        checker,
      }),
    };

    return payload;
  }

  function buildSubmissionPayload(submissionId, result) {
    const ts = formatRuDateTime(new Date());

    // You can expand with more columns expected by Apps Script doPost.
    // Keep it self-contained: result + answers + notes.
    const single = { ...STATE.singleAnswers };
    const single_labels = { ...(STATE.singleAnswerLabels || {}) };
    const checkbox = {};
    const checkbox_labels = {};
    const number = { ...(STATE.numberAnswers || {}) };
    const number_labels = {};
    for (const [k, set] of Object.entries(STATE.checkboxAnswers || {})) checkbox[k] = [...(set || [])];
    const allSections = activeSections(DATA.sections);
    allSections.forEach(section => {
      questionsForSection(DATA.checklist, section.id).forEach(q => {
        if (!isCheckboxQuestion(q)) return;
        const set = STATE.checkboxAnswers[q.id] instanceof Set ? STATE.checkboxAnswers[q.id] : new Set();
        const labels = getCheckboxAnswerLabels(q, set);
        if (labels.length) checkbox_labels[q.id] = labels;
      });
    });

    allSections.forEach(section => {
      questionsForSection(DATA.checklist, section.id).forEach(q => {
        if (!isNumberQuestion(q)) return;
        const meta = computeNumberAnswerMeta(STATE.numberAnswers?.[q.id] || {}, getRollWeightsCatalog());
        const labelText = formatWeightComparison(meta);
        if (labelText) number_labels[q.id] = labelText;
      });
    });

    const checker = getCheckerMeta();
    const { branchName } = getBranchMeta();
    const answers_rows = buildAnswersRows(submissionId, ts);
    const answers_rows_count = answers_rows.length;

    const payload = {
      action: "submit",
      submission_id: submissionId,
      submitted_at: ts,
      init_data: getTelegramInitData(),
      result_link: buildResultLink(submissionId),
      zone_room: "общая",
      inspection_area: "Общая",

      oblast: STATE.oblast || "",
      city: STATE.city,
      branch_id: STATE.branchId,
      branch_name: branchName,
      fio: checker.fio,
      tg_id: checker.tg_id,
      tg_user_id: checker.tg_user_id,
      tg_username: checker.tg_username,
      tg_first_name: checker.tg_first_name,
      tg_last_name: checker.tg_last_name,
      tg_name: checker.tg_name,

      zone: result.zone,
      percent: formatPercentForSheet(result.percent),
      percent_value: result.percent,
      score: result.score,
      earned: result.score,
      max_score: result.maxScore,
      zones_score_total: result.score,
      has_critical: result.hasCritical,

      issues: result.issues, // already includes notes/photos

      answers: { single, single_labels, checkbox, checkbox_labels, number, number_labels },
      answers_rows,
      answers_rows_count,
      meta: {
        app_version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : ""),
        is_tg: IS_TG,
        checker,
      },
      meta_json: JSON.stringify({
        app_version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : ""),
        is_tg: IS_TG,
        checker,
      }),
    };

    return payload;
  }

  // ---------- Result screen ----------
  window.renderResultScreen = function renderResultScreen(data, result) {
    DATA = data;
    let safeResult = result && typeof result === "object" ? result : null;
    if (!safeResult) safeResult = STATE.lastResult;
    if (!safeResult) {
      try {
        safeResult = computeResultFromState();
      } catch (err) {}
    }
    if (!safeResult) safeResult = { zone: "gray", percent: null, issues: [] };

    const branchRow = findBranchById(STATE.branchId);
    const last = normalizeLocalLastCheck(getLastCheck(STATE.branchId), branchRow);
    const lastTs = last?.ts || null;
    const addr = norm(getAddressLabel(branchRow || {}));
    const addrLine = [norm(STATE.city || ""), addr].filter(Boolean).join(", ");
    const metaDate = STATE.lastSubmittedAt ? formatRuDateTime(STATE.lastSubmittedAt) : "";

    mount(`
      <div class="container">
        ${tplResultHeader({
          zone: safeResult.zone,
          percent: safeResult.percent,
          lastTs,
          meta: {
            fio: norm(STATE.fio || ""),
            address: addrLine,
            date: metaDate,
          },
        })}
        ${tplResultActions({ showShare: true })}

        <div class="card">
          <div class="cardHeader">
            <div class="title">Ошибки</div>
          </div>
          <div id="issuesList"></div>
        </div>
      </div>
    `);

    const list = document.getElementById("issuesList");
    const issues = (safeResult.issues || []).slice();

    if (!issues.length) {
      list.innerHTML = `<div class="hint">Ошибок не найдено 🎉</div>`;
    } else {
      list.innerHTML = renderIssuesGrouped(issues);
      list.querySelectorAll(".thumb").forEach(img => {
        img.onclick = () => {
          const src = img.getAttribute("data-src") || img.getAttribute("src");
          if (!src) return;
          openImageModal([src], 0);
        };
      });
    }

    const newBtn = document.getElementById("newCheckBtn");
    newBtn.onclick = () => {
      if (STATE.branchId) clearDraftStorageOnly(STATE.branchId);
      resetAllState();
      saveDraft();
      renderStart(DATA);
    };

    const resultId = norm(STATE.lastResultId);
    if (IS_TG && resultId && STATE.lastBotSendStatus !== "sent") {
      (async () => {
        try {
          const sent = await sendTelegramResultMessage(safeResult, resultId);
          STATE.lastBotSendStatus = sent ? "sent" : "failed";
          STATE.lastBotSendError = sent ? "" : "initData отсутствует или сообщение не доставлено";
          saveDraft();
          const statusEl = document.getElementById("botSendStatusText");
          if (statusEl) {
            statusEl.textContent = sent ? "Сообщение отправлено боту." : "Сообщение боту не отправлено.";
          }
          const errorEl = document.getElementById("botSendErrorText");
          if (errorEl) {
            errorEl.textContent = sent ? "" : `Причина: ${STATE.lastBotSendError}`;
          }
        } catch (err) {
          STATE.lastBotSendStatus = "failed";
          STATE.lastBotSendError = String(err);
          saveDraft();
          const statusEl = document.getElementById("botSendStatusText");
          if (statusEl) statusEl.textContent = "Сообщение боту не отправлено.";
          const errorEl = document.getElementById("botSendErrorText");
          if (errorEl) errorEl.textContent = `Причина: ${STATE.lastBotSendError}`;
        }
      })();
    }

    const sendBotAgainBtn = document.getElementById("sendBotAgainBtn");
    if (sendBotAgainBtn) {
      sendBotAgainBtn.onclick = async () => {
        const id = norm(STATE.lastResultId);
        if (!id) return;
        let sent = false;
        try {
          sent = await sendTelegramResultMessage(safeResult, id);
          STATE.lastBotSendStatus = sent ? "sent" : "failed";
          STATE.lastBotSendError = sent ? "" : "initData отсутствует или сообщение не доставлено";
        } catch (err) {
          STATE.lastBotSendStatus = "failed";
          STATE.lastBotSendError = String(err);
        }
        saveDraft();
        const statusEl = document.getElementById("botSendStatusText");
        if (statusEl) {
          statusEl.textContent = sent ? "Сообщение отправлено боту." : "Сообщение боту не отправлено.";
        }
        const errorEl = document.getElementById("botSendErrorText");
        if (errorEl) {
          errorEl.textContent = STATE.lastBotSendError
            ? `Причина: ${STATE.lastBotSendError}`
            : "";
        }
      };
    }

    const copyBtn = document.getElementById("copyResultLinkBtn");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const id = norm(STATE.lastResultId);
        if (!id) return;

        const url = buildResultLink(id);
        const ok = await copyTextToClipboard(url);
        copyBtn.textContent = ok ? "Ссылка скопирована ✅" : "Не удалось скопировать";
        setTimeout(() => (copyBtn.textContent = "Скопировать ссылку"), 1500);
      };
    }
  };

  // ---------- Readonly result by link ----------
  window.renderReadonlyResult = function renderReadonlyResult(data, submissionPayload, opts = {}) {
    DATA = data;

    const sub = submissionPayload?.submission || {};

    // If Apps Script returns answers & you want to reconstruct issues — can do later.
    // For now we use submission.issues if exists in stored payload_json.
    const stored = submissionPayload?.payload || submissionPayload;
    const payloadIssues = stored?.issues || sub?.issues || [];
    const storedAnswers = stored?.answers || sub?.answers || {};
    const answerRows = Array.isArray(submissionPayload?.answers_normalized)
      ? submissionPayload.answers_normalized
      : (Array.isArray(submissionPayload?.answers) ? submissionPayload.answers : []);

    const buildIssueKey = (item = {}) => {
      const id = norm(item.qid || item.id || "");
      if (id) return `id:${id}`;
      const title = norm(item.title || item.question || "");
      const section = norm(item.sectionTitle || item.section || item.section_title || "");
      return `title:${title}|section:${section}`;
    };

    const payloadIssueMap = new Map();
    payloadIssues.forEach(it => {
      const key = buildIssueKey(it);
      if (!payloadIssueMap.has(key)) payloadIssueMap.set(key, it);
    });

    const hasAnswersPayload = (() => {
      if (!storedAnswers) return false;
      if (typeof storedAnswers === "string") return storedAnswers.trim().length > 0;
      return Object.keys(storedAnswers).length > 0;
    })();

    const mergeIssue = (issue) => {
      const match = payloadIssueMap.get(buildIssueKey(issue));
      const severityRaw = norm(issue.severity || match?.severity || "").toLowerCase();
      const severity = severityRaw === "critical" ? "critical" : "noncritical";
      const scoreVal = issue.scoreEarned ?? issue.score ?? match?.scoreEarned ?? match?.score_earned ?? match?.score ?? "";
      const scoreMax = issue.scoreMax ?? match?.scoreMax ?? match?.score_max ?? "";
      const photos = (issue.photos && issue.photos.length) ? issue.photos : (match?.photos || []);
      return {
        ...issue,
        severity,
        score: scoreVal,
        scoreEarned: scoreVal,
        scoreMax,
        comment: issue.comment || match?.comment || "",
        photos,
      };
    };

    let issues = [];
    if (answerRows.length) {
      issues = buildIssuesFromAnswerRows(answerRows).map(mergeIssue);
    } else if (hasAnswersPayload) {
      issues = buildIssuesFromAnswers(storedAnswers).map(mergeIssue);
    } else if (payloadIssues.length) {
      issues = payloadIssues.map(it => {
        const scoreVal = it.scoreEarned ?? it.score_earned ?? it.score ?? "";
        const scoreMax = it.scoreMax ?? it.score_max ?? "";
        const severityRaw = norm(it.severity || "").toLowerCase();
        const severity = severityRaw === "critical" ? "critical" : "noncritical";
        return {
          title: it.title || it.question || "",
          sectionTitle: it.sectionTitle || it.section || it.section_title || "",
          severity,
          score: scoreVal,
          scoreEarned: scoreVal,
          scoreMax,
          comment: it.comment || "",
          photos: it.photos || [],
        };
      });
    }

    const zone = sub.zone || stored.zone || "gray";
    const percent = sub.percent ?? stored.percent ?? null;
    const lastTs = sub.submitted_at || stored.submitted_at || null;
    const branchId = stored.branch_id || sub.branch_id || "";
    const branchRow = findBranchById(branchId);
    const addr = norm(getAddressLabel(branchRow || {}));
    const addrLine = [norm(stored.city || sub.city || ""), addr].filter(Boolean).join(", ");
    const fio = norm(stored.fio || sub.fio || "");
    const submittedAt = lastTs ? (formatRuDateTime(lastTs) || norm(lastTs)) : "";
    const backMode = opts?.backMode === "cabinet" ? "cabinet" : "start";
    const backLabel = backMode === "cabinet" ? "К моим проверкам" : "На главную";

    mount(`
      <div class="container">
        ${tplResultHeader({
          zone,
          percent,
          lastTs,
          meta: {
            fio,
            address: addrLine,
            date: submittedAt,
          },
        })}
        <div class="resultActions">
          <button id="backToStartBtn" class="btn primary">${escapeHtml(backLabel)}</button>
        </div>

        <div class="card">
          <div class="cardHeader">
            <div class="title">Ошибки</div>
          </div>
          <div id="issuesList"></div>
        </div>
      </div>
    `);

    const list = document.getElementById("issuesList");
    if (!issues.length) {
      list.innerHTML = `<div class="hint">Ошибок не найдено 🎉</div>`;
    } else {
      list.innerHTML = renderIssuesGrouped(issues);
      list.querySelectorAll(".thumb").forEach(img => {
        img.onclick = () => {
          const src = img.getAttribute("data-src") || img.getAttribute("src");
          if (!src) return;
          openImageModal([src], 0);
        };
      });
    }

    const backBtn = document.getElementById("backToStartBtn");
    if (backBtn) {
      backBtn.onclick = () => {
        clearResultQuery();
        if (backMode === "cabinet") {
          renderCabinetScreen(DATA);
          return;
        }
        resetCheckKeepMeta();
        STATE.branchId = "";
        saveDraft();
        renderStart(DATA);
      };
    }
  };

})();

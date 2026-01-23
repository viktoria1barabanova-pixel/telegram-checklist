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

  function zoneLabelLower(zone) {
    const v = String(zone ?? "").toLowerCase();
    if (v === "green") return "зелёная зона";
    if (v === "yellow") return "жёлтая зона";
    if (v === "red") return "красная зона";
    return "серая зона";
  }

  function sendTelegramResultMessage(result, submissionId) {
    if (!IS_TG) return;
    const sendData = Telegram?.WebApp?.sendData;
    if (typeof sendData !== "function") return;

    const percentRaw = Number(result?.percent);
    const percent = Number.isFinite(percentRaw) ? Math.round(percentRaw) : "—";
    const zoneText = zoneLabelLower(result?.zone);
    const link = buildResultLink(submissionId) || "—";

    const lines = [
      "Поздравляю, вы прошли проверку.",
      `Результаты: ${zoneText} (${percent}% прохождения)`,
      "",
      "С результатами можно повторно ознакомиться по ссылке",
      link,
    ];

    sendData(lines.join("\n"));
  }

  function clearResultQuery() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("result")) return;
      url.searchParams.delete("result");
      const search = url.searchParams.toString();
      const next = `${url.origin}${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
      window.history.replaceState(null, "", next);
    } catch (e) {
      console.warn("Failed to clear result param", e);
    }
  }

  // ---------- normalize branches (адреса) & sections ----------
  // ---------- question type normalization ----------
  function normalizeQuestionType(raw) {
    const t0 = String(raw ?? "single").trim();
    const t = t0.toLowerCase();
    const isCb = (
      t.includes("checkbox") || t.includes("check") ||
      t.includes("bool") || t.includes("boolean") ||
      t.includes("multi") || t.includes("multiple") ||
      t.includes("галоч") || t.includes("чек")
    );
    return isCb ? "checkbox" : "single";
  }

  function isCheckboxQuestion(q) {
    return normalizeQuestionType(getAny(q, [
      "question_type",
      "type", "answer_type", "kind",
      "тип", "тип_ответа"
    ], "single")) === "checkbox";
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
    const cleaned = String(value).replace("%", "").replace(",", ".").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function formatPercentForSheet(value) {
    if (value === null || value === undefined || value === "") return "";
    const cleaned = String(value).replace("%", "").replace(",", ".").trim();
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return "";
    return `${num.toFixed(1).replace(".", ",")}%`;
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
    if (!local) return server;
    if (!server) return local;

    const localDate = parsePossibleDate(local.ts);
    const serverDate = parsePossibleDate(server.ts);
    if (localDate && serverDate) {
      return serverDate.getTime() >= localDate.getTime() ? server : local;
    }
    return serverDate ? server : local;
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

  // ---------- scoring model ----------
  // Single question: good=1, ok=0.5, bad=0
  // Checkbox: “не стоит галочка” = ок (то есть ошибка не выбрана).
  // Если выбран хотя бы один checkbox item → это ошибка. Critical if any selected item is critical? (we treat checkbox question severity)
  function computeResultFromState({ sectionId } = {}) {
    // maxScore = number of single questions (each max 1)
    // percent = total / max * 100
    const sections = activeSections(DATA.sections);
    const allQs = sections.flatMap(s => questionsForSection(DATA.checklist, s.id));

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

        if (!isExcluded) {
          if (hasItems) {
            score += anySelected ? 0 : 1;
          } else {
            score += checked ? 1 : 0;
          }
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
            score: qScore,
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

        if (!isExcluded) {
          if (kind === "good") score += 1;
          else if (kind === "ok") score += 0.5;
          else score += 0;
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
            score: qScore,
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

  function buildIssuesFromAnswers(answers) {
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

          if (isIssue) {
            issues.push({
              qid,
              title: norm(q.title_text || q.title || q.question || q.name),
              sectionTitle,
              severity: (q.severity === "critical") ? "critical" : "noncritical",
              score: qScore,
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

        if (kind !== "good") {
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity: (q.severity === "critical") ? "critical" : "noncritical",
            score: qScore,
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
                  <th>Ошибка</th>
                  <th style="width:70px">Баллы</th>
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

                  return `
                    <tr>
                      <td>${escapeHtml(it.title || "")}</td>
                      <td>${escapeHtml(it.score ?? "")}</td>
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

  // ---------- Start screen ----------
  window.renderStart = function renderStart(data) {
    DATA = data;
    clearResultQuery();

    // Поддержка старого ключа branches и нового ключа addresses
    const BRANCHES = getBranches();

    const oblasts = listOblasts(BRANCHES);
    mount(tplStartScreen({ oblasts }));

    const oblastSelect = document.getElementById("oblastSelect");
    const citySelect = document.getElementById("citySelect");
    const addressSelect = document.getElementById("addressSelect");
    const startBtn = document.getElementById("startBtn");
    const hint = document.getElementById("startHint");
    const lastCheckHint = document.getElementById("lastCheckHint");
    const fioRow = document.getElementById("fioRow");
    const fioInput = document.getElementById("fioInput");
    const nonTgBlock = document.getElementById("nonTgBlock");
    const currentCheckBlock = document.getElementById("currentCheckBlock");
    const currentCheckBtn = document.getElementById("currentCheckBtn");
    const currentCheckHint = document.getElementById("currentCheckHint");
    const userLine = document.getElementById("userNameLine");
    const userCard = document.getElementById("tgUserCard");
    const userCardName = document.getElementById("tgUserName");
    const userCardHandle = document.getElementById("tgUserHandle");
    const userCardAvatar = document.getElementById("tgUserAvatar");

    const tgUser = IS_TG ? (window.getTgUser ? window.getTgUser() : null) : null;
    STATE.tgUser = tgUser;

    // TG vs non-TG
    if (IS_TG) {
      fioRow.style.display = "none";
      STATE.fio = getTgName();
      if (nonTgBlock) nonTgBlock.style.display = "none";
    } else {
      fioRow.style.display = "";
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
          const initials = tgUser.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join("");
          userCardAvatar.textContent = initials || "TG";
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

    function draftExpiresAt(draft) {
      const savedAt = Number(draft?.savedAt || 0);
      if (!savedAt) return null;
      const ttl = typeof DRAFT_TTL_MS !== "undefined" ? DRAFT_TTL_MS : 5 * 60 * 60 * 1000;
      return new Date(savedAt + ttl);
    }

    function draftHintText(draft) {
      const expiresAt = draftExpiresAt(draft);
      const untilTxt = expiresAt ? formatRuDateTime(expiresAt.toISOString()) : "";
      return untilTxt
        ? `Есть черновик этого адреса (до ${untilTxt}).`
        : `Есть черновик этого адреса.`;
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
      STATE.isFinished = !!draft.isFinished;
      STATE.lastResult = draft.lastResult || null;
      STATE.lastResultId = draft.lastResultId || null;
      STATE.lastSubmittedAt = draft.lastSubmittedAt || "";

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

    function updateCurrentCheck(draft) {
      if (!currentCheckBlock || !currentCheckBtn) return;
      if (!draft) {
        currentCheckBlock.style.display = "none";
        if (currentCheckHint) currentCheckHint.textContent = "";
        return;
      }

      currentCheckBlock.style.display = "";

      const branchRow = findBranchById(draft.branchId);
      const city = norm(draft.city || getCity(branchRow || {}));
      const addr = norm(getAddressLabel(branchRow || {}));
      const label = [city, addr].filter(Boolean).join(", ");
      const expiresAt = draftExpiresAt(draft);
      const expiresTxt = expiresAt ? formatRuDateTime(expiresAt.toISOString()) : "";

      if (currentCheckHint) {
        if (label || expiresTxt) {
          currentCheckHint.innerHTML = [
            label ? escapeHtml(label) : "",
            expiresTxt ? `до ${escapeHtml(expiresTxt)}` : ""
          ].filter(Boolean).join(" • ");
        } else {
          currentCheckHint.textContent = "";
        }
      }

      currentCheckBtn.onclick = () => {
        applyDraftToState(draft);
        renderChecklist(DATA);
      };
    }

    function resetCities() {
      citySelect.innerHTML = `<option value="">Сначала выбери область</option>`;
      citySelect.disabled = true;
      resetAddresses();
    }

    function resetAddresses() {
      addressSelect.innerHTML = `<option value="">Сначала выбери город</option>`;
      addressSelect.disabled = true;
      startBtn.disabled = true;
      if (lastCheckHint) lastCheckHint.innerHTML = "";
    }

    function refreshStartReady() {
      if (!IS_TG) {
        startBtn.disabled = true;
        startBtn.textContent = "Откройте в Telegram";
        oblastSelect.disabled = true;
        citySelect.disabled = true;
        addressSelect.disabled = true;
        fioInput.disabled = true;
        return;
      }

      const oblast = norm(oblastSelect.value);
      const city = norm(citySelect.value);
      const branchId = norm(addressSelect.value);

      STATE.oblast = oblast;
      STATE.city = city;
      STATE.branchId = branchId;

      if (!IS_TG) STATE.fio = norm(fioInput.value);

      startBtn.disabled = !(STATE.oblast && STATE.city && STATE.branchId && (IS_TG || STATE.fio));
    }

    function fillCities(oblast) {
      const cities = citiesByOblast(BRANCHES, oblast);
      citySelect.innerHTML = `<option value="">Выбери город</option>` +
        cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      citySelect.disabled = !cities.length;
      resetAddresses();
    }

    function fillAddresses(oblast, city) {
      const list = addressesByCity(BRANCHES, oblast, city);
      addressSelect.innerHTML = `<option value="">Выбери адрес</option>` +
        list.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`).join("");
      addressSelect.disabled = !list.length;
      startBtn.disabled = true;
      if (lastCheckHint) lastCheckHint.innerHTML = "";
    }

    oblastSelect.onchange = () => {
      const oblast = norm(oblastSelect.value);
      hint.textContent = "";
      if (!oblast) {
        resetCities();
        refreshStartReady();
        return;
      }
      fillCities(oblast);
      refreshStartReady();
    };

    citySelect.onchange = () => {
      const oblast = norm(oblastSelect.value);
      const city = norm(citySelect.value);
      hint.textContent = "";
      if (!city) {
        resetAddresses();
        refreshStartReady();
        return;
      }
      fillAddresses(oblast, city);
      refreshStartReady();
    };

    addressSelect.onchange = () => {
      refreshStartReady();

      // show last check for this address (stored locally)
      if (lastCheckHint) {
        const bidNow = norm(addressSelect.value);
        const local = getLastCheck(bidNow);
        const server = getLastCheckFromServer(bidNow);
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
      if (d) {
        STATE.branchId = d.branchId || bid;
        applyDraftToState(d);
        hint.innerHTML = draftHintText(d);
        // if draft exists, keep last-check hint in sync with current selection
        if (lastCheckHint && !lastCheckHint.textContent) {
          const local = getLastCheck(STATE.branchId);
          const server = getLastCheckFromServer(STATE.branchId);
          const last = mergeLastChecks(local, server);
          if (last && (last.ts || last.percent != null || last.fio || last.zone)) {
            lastCheckHint.innerHTML = formatLastCheckHint(last) || "";
          }
        }
      }
    };

    if (!IS_TG) {
      fioInput.oninput = () => {
        refreshStartReady();
        updateUserLine(norm(fioInput.value));
      };
    }

    // initial state
    resetCities();
    refreshStartReady();

    const lastDraftBranchId = (window.getLastDraftBranchId ? window.getLastDraftBranchId() : "") || "";
    const lastDraft = lastDraftBranchId ? loadDraft(lastDraftBranchId) : null;
    updateCurrentCheck(lastDraft);

    startBtn.onclick = () => {
      const secs = activeSections(DATA.sections);
      STATE.enabledSections = secs.map(s => s.id);
      STATE.activeSection = secs[0]?.id || "";
      STATE.completedSections = [];

      STATE.isFinished = false;
      STATE.lastResult = null;
      STATE.lastResultId = null;
      STATE.lastSubmittedAt = "";
      STATE.singleAnswerLabels = {};

      saveDraft();
      renderChecklist(DATA);
    };
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
        <div class="stickyHeader">
          <div class="card" style="margin-bottom:12px;">
            <div class="cardHeader">
              <div class="title">Проверка</div>
              <div class="subTitle" id="ctxLine">${escapeHtml(ctxLine || "")}</div>
              ${fio ? `<div class="subTitle">Проверяет: <span class="userGlow">${escapeHtml(fio)}</span></div>` : ``}
              <div class="subTitle" id="sectionLine">${activeTitle ? `Раздел: ${escapeHtml(activeTitle)}` : ``}</div>
            </div>
          </div>

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
    qList.innerHTML = qs.map(q => {
      const qWithSection = { ...q, section_title: activeTitle };
      const isCheckbox = isCheckboxQuestion(qWithSection);
      const state = isCheckbox
        ? (STATE.checkboxAnswers[qWithSection.id] instanceof Set ? STATE.checkboxAnswers[qWithSection.id] : new Set())
        : norm(STATE.singleAnswers[qWithSection.id]);
      return tplQuestionCard(qWithSection, { answerState: state, showRightToggle: true, showNotes: !isCheckbox });
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
          console.error(e);
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

        const payload = buildSubmissionPayload(submissionId, result);
        saveDraft();

        finishBtn.textContent = UI_TEXT?.submitSending || "Отправляю…";

        // try postMessage response for result_id (share links), fallback to load-only
        let submitResult = null;
        try {
          submitResult = await api.submit(payload, { usePostMessage: true });
        } catch (err) {
          console.warn("postMessage submit failed, fallback to load", err);
          submitResult = await api.submit(payload, { usePostMessage: false });
        }

        const returnedId = norm(submitResult?.result_id || "");
        if (returnedId) STATE.lastResultId = returnedId;

        // last check meta for branch (local)
        setLastCheck(STATE.branchId, { percent: result.percent, zone: result.zone, fio: STATE.fio || "" });

        sendTelegramResultMessage(result, STATE.lastResultId || submissionId);

        finishBtn.textContent = UI_TEXT?.submitOk || "Готово ✅";
      } catch (e) {
        console.error(e);
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
          question_type: isCheckbox ? "checkbox" : "single",
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
    const ts = formatRuDateTimeMsk(new Date());
    const sections = activeSections(DATA.sections);
    const sectionTitle = sections.find(s => s.id === sectionId)?.title || "";
    const sectionQs = questionsForSection(DATA.checklist, sectionId);
    const qids = new Set(sectionQs.map(q => q.id));

    const single = {};
    const single_labels = {};
    const checkbox = {};
    const checkbox_labels = {};

    for (const qid of qids) {
      if (STATE.singleAnswers[qid] !== undefined) single[qid] = STATE.singleAnswers[qid];
      if (STATE.singleAnswerLabels?.[qid]) single_labels[qid] = STATE.singleAnswerLabels[qid];
      if (STATE.checkboxAnswers[qid]) checkbox[qid] = [...(STATE.checkboxAnswers[qid] || [])];
    }

    sectionQs.forEach(q => {
      if (!isCheckboxQuestion(q)) return;
      const set = STATE.checkboxAnswers[q.id] instanceof Set ? STATE.checkboxAnswers[q.id] : new Set();
      const labels = getCheckboxAnswerLabels(q, set);
      if (labels.length) checkbox_labels[q.id] = labels;
    });

    const checker = getCheckerMeta();
    const { branchName } = getBranchMeta();

    const payload = {
      action: "submit",
      submission_id: submissionId || "",
      submitted_at: ts,
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

      zone: result.zone,
      percent: formatPercentForSheet(result.percent),
      percent_value: result.percent,
      score: result.score,
      earned: result.score,
      max_score: result.maxScore,
      zones_score_total: "",
      has_critical: result.hasCritical,

      issues: result.issues,
      answers: { single, single_labels, checkbox, checkbox_labels },
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

    const maxLogChars = (typeof LOG_PREVIEW_MAX_CHARS !== "undefined") ? LOG_PREVIEW_MAX_CHARS : 1000;
    payload.payload_log = truncateText(JSON.stringify(payload), maxLogChars);

    return payload;
  }

  function buildSubmissionPayload(submissionId, result) {
    const ts = formatRuDateTimeMsk(new Date());

    // You can expand with more columns expected by Apps Script doPost.
    // Keep it self-contained: result + answers + notes.
    const single = { ...STATE.singleAnswers };
    const single_labels = { ...(STATE.singleAnswerLabels || {}) };
    const checkbox = {};
    const checkbox_labels = {};
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

    const checker = getCheckerMeta();
    const { branchName } = getBranchMeta();
    const answers_rows = buildAnswersRows(submissionId, ts);
    const answers_rows_count = answers_rows.length;

    const payload = {
      action: "submit",
      submission_id: submissionId,
      submitted_at: ts,
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

      answers: { single, single_labels, checkbox, checkbox_labels },
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

    const maxLogChars = (typeof LOG_PREVIEW_MAX_CHARS !== "undefined") ? LOG_PREVIEW_MAX_CHARS : 1000;
    payload.payload_log = truncateText(JSON.stringify(payload), maxLogChars);

    return payload;
  }

  // ---------- Result screen ----------
  window.renderResultScreen = function renderResultScreen(data, result) {
    DATA = data;

    const last = getLastCheck(STATE.branchId);
    const lastTs = last?.ts || null;
    const branchRow = findBranchById(STATE.branchId);
    const addr = norm(getAddressLabel(branchRow || {}));
    const addrLine = [norm(STATE.city || ""), addr].filter(Boolean).join(", ");
    const metaDate = STATE.lastSubmittedAt ? formatRuDateTime(STATE.lastSubmittedAt) : "";

    mount(`
      <div class="container">
        ${tplResultHeader({
          zone: result.zone,
          percent: result.percent,
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
    const issues = (result.issues || []).slice();

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
      resetCheckKeepMeta();
      saveDraft();
      renderChecklist(DATA);
    };

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
  window.renderReadonlyResult = function renderReadonlyResult(data, submissionPayload) {
    DATA = data;

    const sub = submissionPayload?.submission || {};

    // If Apps Script returns answers & you want to reconstruct issues — can do later.
    // For now we use submission.issues if exists in stored payload_json.
    const stored = submissionPayload?.payload || submissionPayload;
    const payloadIssues = stored?.issues || sub?.issues || [];
    const storedAnswers = stored?.answers || sub?.answers || {};

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

    const hasAnswers = (() => {
      if (!storedAnswers) return false;
      if (typeof storedAnswers === "string") return storedAnswers.trim().length > 0;
      return Object.keys(storedAnswers).length > 0;
    })();

    let issues = [];
    if (hasAnswers) {
      issues = buildIssuesFromAnswers(storedAnswers).map(issue => {
        const match = payloadIssueMap.get(buildIssueKey(issue));
        return {
          ...issue,
          severity: issue.severity || match?.severity || "noncritical",
          score: issue.score ?? match?.score,
          comment: issue.comment || match?.comment || "",
          photos: (issue.photos && issue.photos.length) ? issue.photos : (match?.photos || []),
        };
      });
    } else if (payloadIssues.length) {
      issues = payloadIssues.map(it => ({
        title: it.title || it.question || "",
        sectionTitle: it.sectionTitle || it.section || it.section_title || "",
        severity: it.severity || "noncritical",
        score: it.score,
        comment: it.comment || "",
        photos: it.photos || [],
      }));
    }

    const zone = sub.zone || stored.zone || "gray";
    const percent = sub.percent ?? stored.percent ?? null;
    const lastTs = sub.submitted_at || stored.submitted_at || null;
    const branchId = stored.branch_id || sub.branch_id || "";
    const branchRow = findBranchById(branchId);
    const addr = norm(getAddressLabel(branchRow || {}));
    const addrLine = [norm(stored.city || sub.city || ""), addr].filter(Boolean).join(", ");
    const fio = norm(stored.fio || sub.fio || "");
    const submittedAt = lastTs ? formatRuDateTime(lastTs) : "";

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
          <button id="backToStartBtn" class="btn primary">К выбору филиала</button>
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

    document.getElementById("backToStartBtn").onclick = async () => {
      // reload start flow
      clearResultQuery();
      resetCheckKeepMeta();
      STATE.branchId = "";
      saveDraft();
      renderStart(DATA);
    };
  };

})();

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
    return normalizeQuestionType(q?.type ?? q?.answer_type ?? q?.kind ?? q?.тип ?? q?.тип_ответа) === "checkbox";
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
  function computeResultFromState() {
    // maxScore = number of single questions (each max 1)
    // percent = total / max * 100
    const sections = activeSections(DATA.sections);
    const allQs = sections.flatMap(s => questionsForSection(DATA.checklist, s.id));

    const singleQs = allQs.filter(q => !isCheckboxQuestion(q));
    const maxScore = singleQs.length;

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

      if (isCheckboxQuestion(q)) {
        const set = STATE.checkboxAnswers[qid] instanceof Set ? STATE.checkboxAnswers[qid] : new Set();
        if (set.size > 0) {
          // considered error(s)
          const severity = (q.severity === "critical") ? "critical" : "noncritical";
          if (severity === "critical") hasCritical = true;

          const note = safeEnsureNote(qid);
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity,
            comment: norm(note.text),
            photos: notePhotos(qid),
          });
        }
      } else {
        const ans = norm(STATE.singleAnswers[qid]);
        if (ans === "good") score += 1;
        else if (ans === "ok") score += 0.5;
        else score += 0;

        if (ans && ans !== "good") {
          const severity = (q.severity === "critical") ? "critical" : "noncritical";
          if (severity === "critical") hasCritical = true;

          const note = safeEnsureNote(qid);
          issues.push({
            qid,
            title: norm(q.title_text || q.title || q.question || q.name),
            sectionTitle,
            severity,
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

  // ---------- required validation ----------
  function isAnswered(q) {
    if (isCheckboxQuestion(q)) {
      // Always “answered”: if nothing checked, it's still a valid state
      return true;
    }
    const v = norm(STATE.singleAnswers[q.id]);
    return v === "good" || v === "ok" || v === "bad";
  }

  function missingBySection() {
    const sections = activeSections(DATA.sections);
    const missing = [];
    for (const s of sections) {
      const qs = questionsForSection(DATA.checklist, s.id);
      const miss = qs.filter(q => !isCheckboxQuestion(q)).filter(q => !isAnswered(q));
      if (miss.length) missing.push({ sectionId: s.id, title: s.title, count: miss.length });
    }
    return missing;
  }

  // ---------- Start screen ----------
  window.renderStart = function renderStart(data) {
    DATA = data;

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
    const userLine = document.getElementById("userNameLine");

    // TG vs non-TG
    if (IS_TG) {
      fioRow.style.display = "none";
      STATE.fio = getTgName();
    } else {
      fioRow.style.display = "";
      STATE.fio = "";
    }

    // show username line (only if known)
    if (userLine) {
      const uname = IS_TG ? norm(STATE.fio) : "";
      if (uname) {
        userLine.style.display = "";
        userLine.textContent = uname;
      } else {
        userLine.style.display = "none";
        userLine.textContent = "";
      }
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
      if (lastCheckHint) lastCheckHint.textContent = "";
    }

    function refreshStartReady() {
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
      if (lastCheckHint) lastCheckHint.textContent = "";
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
        const last = getLastCheck(bidNow);
        if (last && (last.ts || last.percent != null || last.zone)) {
          const pct = (last.percent != null && isFinite(Number(last.percent))) ? `${Math.round(Number(last.percent))}%` : "";
          const dt = last.ts ? formatRuDateTime(last.ts) : "";
          const z = last.zone ? last.zone : "";
          const bits = [pct, dt].filter(Boolean).join(" • ");
          lastCheckHint.textContent = bits ? `Последняя проверка: ${bits}` : "";
        } else {
          lastCheckHint.textContent = "Последней проверки пока нет";
        }
      }

      // restore draft for this address (branchId)
      const bid = norm(addressSelect.value);
      const d = loadDraft(bid);
      if (d) {
        STATE.oblast = d.oblast || STATE.oblast;
        STATE.city = d.city || STATE.city;
        STATE.fio = d.fio || STATE.fio;
        STATE.branchId = d.branchId || bid;

        STATE.enabledSections = d.enabledSections || [];
        STATE.activeSection = d.activeSection || "";

        STATE.singleAnswers = d.singleAnswers || {};
        STATE.checkboxAnswers = d.checkboxAnswers || {};
	STATE.singleAnswerLabels = d.singleAnswerLabels || {};
        STATE.isFinished = !!d.isFinished;
        STATE.lastResult = d.lastResult || null;
        STATE.lastResultId = d.lastResultId || null;

        STATE.issueNotes = d.issueNotes || {};
        STATE.noteOpen = d.noteOpen || {};
        migrateAllNotes();

        const untilIso = d.savedAt ? new Date(d.savedAt).toISOString() : "";
        const untilTxt = untilIso ? formatRuDateTime(untilIso) : "";
        hint.innerHTML = untilTxt
          ? `Есть черновик этого адреса (до ${untilTxt}).`
          : `Есть черновик этого адреса.`;
        // if draft exists, keep last-check hint in sync with current selection
        if (lastCheckHint && !lastCheckHint.textContent) {
          const last = getLastCheck(STATE.branchId);
          if (last && (last.ts || last.percent != null)) {
            const pct = (last.percent != null && isFinite(Number(last.percent))) ? `${Math.round(Number(last.percent))}%` : "";
            const dt = last.ts ? formatRuDateTime(last.ts) : "";
            const bits = [pct, dt].filter(Boolean).join(" • ");
            lastCheckHint.textContent = bits ? `Последняя проверка: ${bits}` : "";
          }
        }
      }
    };

    if (!IS_TG) fioInput.oninput = refreshStartReady;

    // initial state
    resetCities();
    refreshStartReady();

    startBtn.onclick = () => {
      const secs = activeSections(DATA.sections);
      STATE.enabledSections = secs.map(s => s.id);
      STATE.activeSection = secs[0]?.id || "";

      STATE.isFinished = false;
      STATE.lastResult = null;
      STATE.lastResultId = null;
      STATE.singleAnswerLabels = {};

      saveDraft();
      renderChecklist(DATA);
    };
  };

  // ---------- Checklist screen ----------
  window.renderChecklist = function renderChecklist(data) {
    DATA = data;

    const secs = activeSections(DATA.sections);
    if (!STATE.activeSection) STATE.activeSection = secs[0]?.id || "";

    const BRANCHES = getBranches();
    const branchRow = findBranchById(STATE.branchId);
    const city = norm(STATE.city || getCity(branchRow || {}));
    const addr = norm(getAddressLabel(branchRow || {}));
    const fio = norm(STATE.fio || "");

    const ctxLine = [fio, city, addr].filter(Boolean).join(" • ");
    const activeTitle = secs.find(s => s.id === STATE.activeSection)?.title || "";

    // base layout
    mount(`
      <div class="container">
        <div class="card" style="margin-bottom:12px;">
          <div class="cardHeader">
            <div class="title">Проверка</div>
            <div class="subTitle" id="ctxLine">${escapeHtml(ctxLine || "")}</div>
            <div class="subTitle" id="sectionLine">${activeTitle ? `Раздел: ${escapeHtml(activeTitle)}` : ``}</div>
          </div>
        </div>

        ${tplSectionTabs({ sections: secs, active: STATE.activeSection })}
        <div id="qList"></div>

        <div class="bottomBar">
          <div id="missingHint" class="missingHint"></div>
          <button id="finishBtn" class="btn primary" type="button">Завершить</button>
        </div>
      </div>
    `);

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
  const state = isCheckboxQuestion(qWithSection)
    ? (STATE.checkboxAnswers[qWithSection.id] instanceof Set ? STATE.checkboxAnswers[qWithSection.id] : new Set())
    : norm(STATE.singleAnswers[qWithSection.id]);
  return tplQuestionCard(qWithSection, { answerState: state, showRightToggle: true, showNotes: true });
}).join("");

    // wire photo toggle buttons
    document.querySelectorAll(".photoToggle").forEach(btn => {
      btn.onclick = () => {
        const photo = btn.getAttribute("data-photo");
        if (!photo) return;
        openImageModal([photo], 0);
      };
    });

    // wire single options
    document.querySelectorAll(".qCard .optRow.single, .qCard .optRow.optRow3, .qCard .optRow.three").forEach(row => {
      const card = row.closest(".qCard");
      const qid = card.getAttribute("data-qid");

      row.querySelectorAll(".optBtn").forEach(btn => {
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

          // show notes if not good
          toggleNotesByAnswer(qid, v);

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
      STATE.checkboxAnswers[qid] ??= new Set();
      const set = STATE.checkboxAnswers[qid];

      col.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.onchange = () => {
          const itemId = cb.getAttribute("data-item");
          if (cb.checked) set.add(itemId);
          else set.delete(itemId);

          // notes shown if any checked
          toggleNotesByAnswer(qid, set.size > 0 ? "bad" : "good");

          saveDraft();
          refreshFinishState();
        };
      });

      // initial notes visibility
      toggleNotesByAnswer(qid, set.size > 0 ? "bad" : "good");
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

      const result = computeResultFromState();
      STATE.isFinished = true;
      STATE.lastResult = result;

      // create submission payload for sheet
      const submissionId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      STATE.lastResultId = submissionId;

      const payload = buildSubmissionPayload(submissionId, result);
      saveDraft();

      // send
      try {
        finishBtn.disabled = true;
        finishBtn.textContent = UI_TEXT?.submitSending || "Отправляю…";

        // use postMessage if you later want response; now OK with load as well
        await api.submit(payload, { usePostMessage: false });

        // last check meta for branch (local)
        setLastCheck(STATE.branchId, { percent: result.percent, zone: result.zone });

        finishBtn.textContent = UI_TEXT?.submitOk || "Готово ✅";
      } catch (e) {
        console.error(e);
        alert(UI_TEXT?.submitFail || "Не удалось отправить результаты в таблицу. Попробуй ещё раз");
        finishBtn.disabled = false;
        finishBtn.textContent = "Завершить";
        return;
      }

      renderResultScreen(DATA, result);
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

    for (const s of secs) {
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
  function buildSubmissionPayload(submissionId, result) {
    const ts = new Date().toISOString();

    // You can expand with more columns expected by Apps Script doPost.
    // Keep it self-contained: result + answers + notes.
const single = { ...STATE.singleAnswers };
const single_labels = { ...(STATE.singleAnswerLabels || {}) };
    const checkbox = {};
    for (const [k, set] of Object.entries(STATE.checkboxAnswers || {})) checkbox[k] = [...(set || [])];

    return {
      action: "submit",
      submission_id: submissionId,
      submitted_at: ts,

      oblast: STATE.oblast || "",
      city: STATE.city,
      branch_id: STATE.branchId,
      fio: STATE.fio,

      zone: result.zone,
      percent: result.percent,
      score: result.score,
      max_score: result.maxScore,
      has_critical: result.hasCritical,

      issues: result.issues, // already includes notes/photos

answers: { single, single_labels, checkbox },
      meta: { app_version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : ""), is_tg: IS_TG },
    };
  }

  // ---------- Result screen ----------
  window.renderResultScreen = function renderResultScreen(data, result) {
    DATA = data;

    const last = getLastCheck(STATE.branchId);
    const lastTs = last?.ts || null;

    mount(`
      <div class="container">
        ${tplResultHeader({ zone: result.zone, percent: result.percent, lastTs })}
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
      list.innerHTML = issues.map(it => tplIssueItem({
        title: it.title,
        sectionTitle: it.sectionTitle,
        severity: it.severity,
        photos: it.photos,
        comment: it.comment
      })).join("");

      // thumbnails click
      list.querySelectorAll(".thumb").forEach(img => {
        img.onclick = () => {
          const row = img.closest(".thumbRow");
          const imgs = Array.from(row.querySelectorAll(".thumb")).map(i => i.getAttribute("src"));
          const idx = Array.from(row.querySelectorAll(".thumb")).indexOf(img);
          openImageModal(imgs, idx);
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

        const url = `${location.origin}${location.pathname}?result=${encodeURIComponent(id)}`;
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
    const issues = [];

    // If Apps Script returns answers & you want to reconstruct issues — can do later.
    // For now we use submission.issues if exists in stored payload_json.
    const stored = submissionPayload?.payload || submissionPayload;
    const payloadIssues = stored?.issues || sub?.issues || [];

    for (const it of payloadIssues) {
      issues.push({
        title: it.title || it.question || "",
        sectionTitle: it.sectionTitle || it.section || "",
        severity: it.severity || "noncritical",
        comment: it.comment || "",
        photos: it.photos || [],
      });
    }

    const zone = sub.zone || stored.zone || "gray";
    const percent = sub.percent ?? stored.percent ?? null;
    const lastTs = sub.submitted_at || stored.submitted_at || null;

    mount(`
      <div class="container">
        ${tplResultHeader({ zone, percent, lastTs })}
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
      list.innerHTML = issues.map(it => tplIssueItem(it)).join("");
      list.querySelectorAll(".thumb").forEach(img => {
        img.onclick = () => {
          const row = img.closest(".thumbRow");
          const imgs = Array.from(row.querySelectorAll(".thumb")).map(i => i.getAttribute("src"));
          const idx = Array.from(row.querySelectorAll(".thumb")).indexOf(img);
          openImageModal(imgs, idx);
        };
      });
    }

    document.getElementById("backToStartBtn").onclick = async () => {
      // reload start flow
      resetCheckKeepMeta();
      STATE.branchId = "";
      saveDraft();
      renderStart(DATA);
    };
  };

})();

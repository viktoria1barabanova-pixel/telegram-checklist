/* ui/templates.js — генерация HTML для экранов и карточек */

(function () {
  // ---------- helpers ----------
  // Берём утилиты из core/utils.js (если они уже есть), иначе используем безопасные фолбэки.
  const _escapeHtml = (typeof window !== "undefined" && window.escapeHtml)
    ? window.escapeHtml
    : function escapeHtmlFallback(str) {
        return String(str == null ? "" : str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      };

  const norm = (typeof window !== "undefined" && window.norm)
    ? window.norm
    : function normFallback(v) {
        const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
        return s;
      };

  const richTextHtml = (typeof window !== "undefined" && window.richTextHtml)
    ? window.richTextHtml
    : function richTextHtmlFallback(v) {
        // минимально безопасно: без разметки, просто текст
        return _escapeHtml(String(v == null ? "" : v)).replace(/\n/g, "<br>");
      };

  const driveToDirect = (typeof window !== "undefined" && window.driveToDirect)
    ? window.driveToDirect
    : function driveToDirectFallback(u) { return String(u == null ? "" : u); };

  const zoneLabel = (typeof window !== "undefined" && window.zoneLabel)
    ? window.zoneLabel
    : function zoneLabelFallback(z) {
        const v = String(z == null ? "" : z).toLowerCase();
        if (v === "green") return "ЗЕЛЁНАЯ ЗОНА";
        if (v === "yellow") return "ЖЁЛТАЯ ЗОНА";
        if (v === "red") return "КРАСНАЯ ЗОНА";
        return "СЕРАЯ ЗОНА";
      };

  const formatRuDateTime = (typeof window !== "undefined" && window.formatRuDateTime)
    ? window.formatRuDateTime
    : function formatRuDateTimeFallback(ts) {
        try {
          const d = new Date(ts);
          if (Number.isNaN(d.getTime())) return String(ts == null ? "" : ts);
          const pad = (n) => String(n).padStart(2, "0");
          return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (e) {
          return String(ts == null ? "" : ts);
        }
      };

  function h(s) { return _escapeHtml(s == null ? "" : s); }

  // Robust field getter: поддерживает разные названия колонок (ENG/RU), регистры, пробелы/дефисы
  function keyNorm(k) {
    return String(k || "")
      .toLowerCase()
      .replace(/[\s\-]+/g, "_")
      .replace(/[^a-zа-я0-9_]/g, "")
      .replace(/_+/g, "_")
      .trim();
  }

  function getAny(obj, candidates, fallback) {
    if (fallback === undefined) fallback = "";
    if (!obj) return fallback;

    // 1) direct hit
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (obj[c] !== undefined && obj[c] !== null && String(obj[c]).trim() !== "") return obj[c];
    }

    // 2) normalized key hit
    const map = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) map[keyNorm(keys[i])] = keys[i];

    for (let i = 0; i < candidates.length; i++) {
      const nk = keyNorm(candidates[i]);
      const real = map[nk];
      if (real && obj[real] !== undefined && obj[real] !== null && String(obj[real]).trim() !== "") return obj[real];
    }

    return fallback;
  }

  // ---------- home screen ----------
  window.tplHomeScreen = function tplHomeScreen(opts) {
    opts = opts || {};
    const appVersion = (typeof APP_VERSION !== "undefined" && APP_VERSION) ? `v${APP_VERSION}` : "";
    const versionLine = appVersion ? `<div class="muted homeVersion">Версия: ${h(appVersion)}</div>` : "";

    return `
      <div class="container">
        <div class="card homeCard">
          <div class="homeHeader">
            <div class="homeUserInfo">
              <div id="homeUserName" class="homeUserName"></div>
              <div id="homeUserHandle" class="homeUserHandle"></div>
            </div>
            <div id="homeUserAvatar" class="homeUserAvatar" aria-hidden="true"></div>
          </div>

          <div id="nonTgBlock" class="noticeBlock" style="display:none;">
            <div class="noticeTitle">Открыто вне Telegram</div>
            <div class="noticeText">
              Можно пройти проверку и в браузере, но для корректной отправки результатов лучше открывать через бота @sc_control_bot.
            </div>
          </div>

          <div class="homeActions">
            <div class="homePrimaryActions" id="homePrimaryActions">
              <button id="homeNewCheckBtn" class="btn btnOutline homeActionBtn" type="button">Новая проверка</button>
              <button id="homeCurrentCheckBtn" class="btn btnOutline homeActionBtn" type="button" style="display:none;">Текущая проверка</button>
            </div>
            <div id="homeCurrentCheckBlock" class="homeCurrentCheck" style="display:none;">
              <button id="homeResetDraftBtn" class="btn btnOutline homeActionBtn homeResetBtn" type="button">Сбросить</button>
              <div id="homeCurrentCheckHint" class="hint"></div>
            </div>
            <div class="homeSecondaryActions">
              <button id="homeHistoryBtn" class="btn btnOutline homeActionBtn" type="button">История моих проверок</button>
              <button id="homeTasksBtn" class="btn btnOutline homeActionBtn" type="button">Мои задачи</button>
            </div>
          </div>

          <div class="homeAnalytics">
            <div class="homeAnalyticsTitle">Аналитика</div>
            <div class="hint homeAnalyticsHint">Скоро здесь появятся сводные показатели по вашим проверкам.</div>
          </div>

          ${versionLine}
          <div id="homeCabinetHint" class="hint" style="display:none;"></div>
        </div>
      </div>
    `;
  };

  // ---------- branch picker screen ----------
  // 3 шага: область → город → адрес
  window.tplStartScreen = function tplStartScreen(opts) {
    opts = opts || {};
    const oblasts = opts.oblasts || [];

    const startText = (typeof UI_TEXT !== "undefined" && UI_TEXT && UI_TEXT.startButton)
      ? UI_TEXT.startButton
      : "Начать";
    const appVersion = (typeof APP_VERSION !== "undefined" && APP_VERSION) ? `v${APP_VERSION}` : "";
    const versionLine = appVersion ? `<div class="muted" style="margin-top:6px;">Версия: ${h(appVersion)}</div>` : "";
    const cabinetBtn = "";

    return `
      <div class="container">
        <div class="card">
          <div class="screenHeader">
            <div class="screenHeaderTitles">
              <div class="title">Новая проверка</div>
              <div class="subTitle">Выберите филиал</div>
            </div>
            <button id="branchPickerBackBtn" class="iconBtn" type="button" aria-label="Назад">←</button>
          </div>

          <div class="cardHeader branchPickerHeader">
            <div id="nonTgBlock" class="noticeBlock" style="display:none;">
              <div class="noticeTitle">Открыто вне Telegram</div>
              <div class="noticeText">
                Можно пройти проверку и в браузере, но для корректной отправки результатов лучше открывать через бота @sc_control_bot.
              </div>
            </div>
            <div id="tgUserCard" class="userCard" style="display:none;">
              <div id="tgUserAvatar" class="userCardAvatar" aria-hidden="true"></div>
              <div class="userCardInfo">
                <div id="tgUserName" class="userCardName"></div>
                <div id="tgUserHandle" class="userCardHandle"></div>
              </div>
            </div>
            <div class="muted" id="userNameLine" style="margin-top:6px; display:none;"></div>
            ${versionLine}
          </div>

          <div class="formRow">
            <label class="label">Область</label>
            <select id="oblastSelect" class="select">
              <option value="">Выбери область</option>
              ${oblasts.map(o => `<option value="${h(o)}">${h(o)}</option>`).join("")}
            </select>
          </div>

          <div class="formRow">
            <label class="label">Город</label>
            <select id="citySelect" class="select" disabled>
              <option value="">Сначала выбери область</option>
            </select>
          </div>

          <div class="formRow">
            <label class="label">Адрес</label>
            <select id="addressSelect" class="select" disabled>
              <option value="">Сначала выбери город</option>
            </select>
            <div id="lastCheckHint" class="hint" style="margin-top:8px;"></div>
          </div>

          <div id="fioRow" class="formRow" style="display:none">
            <label class="label">ФИО</label>
            <input id="fioInput" class="input" placeholder="Введите ФИО" />
          </div>

          <div class="actions startActions">
            <button id="startBtn" class="btn primary" disabled>${h(startText)}</button>
            ${cabinetBtn}
          </div>

          <div id="startHint" class="hint"></div>
          <div id="cabinetHint" class="hint" style="display:none;"></div>
          <div id="draftActions" class="hint" style="display:none;"></div>
        </div>
      </div>
    `;
  };

  // ---------- sticky sections header ----------
  window.tplSectionTabs = function tplSectionTabs(opts) {
    opts = opts || {};
    const sections = opts.sections || [];
    const active = opts.active || "";
    const completed = new Set((opts.completed || []).map(String));
    return `
      <div class="stickyTabs">
        <div class="card tabsCard">
          <div class="tabs">
            ${sections.map(s => {
              const isA = String(s.id) === String(active);
              const isDone = completed.has(String(s.id));
              return `<button class="tab ${isA ? "active" : ""} ${isDone ? "completed" : ""}" data-section="${h(s.id)}">${h(s.title)}</button>`;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  };

  // ---------- question card ----------
  // question: { id, section_id, title, description, hint_photo_url, type, ... }
  // type: "single" | "checkbox"
  window.tplQuestionCard = function tplQuestionCard(q, opts) {
    opts = opts || {};
    // Защита от «шапки» таблицы, которая иногда прилетает как первая строка (ID вопроса / текст вопроса и т.п.)
    const maybeHeaderId = String((q && (q.id || q.question_id || q.questionId)) || "").trim();
    const maybeHeaderTitle = String((q && (q.title || q.question_text || q.question || q.name)) || "").trim().toLowerCase();
    if (
      !q ||
      maybeHeaderId === "" ||
      /^id\s*вопроса$/i.test(maybeHeaderId) ||
      maybeHeaderId === "question_id" ||
      maybeHeaderTitle === "текст вопроса" ||
      maybeHeaderTitle === "question_text"
    ) {
      return "";
    }
    const answerState = (opts.answerState === undefined) ? null : opts.answerState;
    const showRightToggle = (opts.showRightToggle === undefined) ? true : !!opts.showRightToggle;
    const showNotes = !!opts.showNotes;
    const sectionTitle = norm(getAny(q, [
      // EN
      "section_title", "section", "section_name", "block", "block_title", "group", "group_title",
      // RU
      "раздел", "раздел_название", "название_раздела", "секция", "секция_название", "блок", "блок_название"
    ], ""));

    const title = norm(getAny(q, [
      // EN
      "title", "question", "name", "question_text", "question_title",
      // RU
      "вопрос", "вопрос_текст", "текст_вопроса", "заголовок", "название"
    ], ""));

    const desc = norm(getAny(q, [
      // EN
      "description", "desc", "help", "hint",
      // RU
      "описание", "подсказка", "пояснение"
    ], ""));

    const hintPhoto = norm(getAny(q, [
      // EN
      "hint_photo", "photo", "hint_photo_url", "description_photo", "hint_image", "image",
      // RU
      "фото", "картинка", "фото_подсказки", "картинка_подсказки", "фото_описания", "картинка_описания"
    ], ""));

    const hasHint = !!hintPhoto;

    const headerRight = (showRightToggle && hasHint)
      ? `<button class="photoToggle" type="button" data-photo="${h(hintPhoto)}" aria-label="Открыть фото подсказку">+</button>`
      : `<span class="photoToggleSpacer"></span>`;

    const descHtml = desc ? `<div class="qDesc">${richTextHtml(desc)}</div>` : "";

    const rawType = String(getAny(q, [
      "question_type", // ключ из таблицы
      "type", "answer_type", "kind",
      "тип", "тип_ответа"
    ], "single"));
    const qType = rawType.toLowerCase();

    const isCheckboxType = (
      qType.indexOf("checkbox") >= 0 || qType.indexOf("check") >= 0 ||
      qType.indexOf("bool") >= 0 || qType.indexOf("boolean") >= 0 ||
      qType.indexOf("multi") >= 0 || qType.indexOf("multiple") >= 0 ||
      qType.indexOf("галоч") >= 0 || qType.indexOf("чек") >= 0
    );

    const isNumberType = (
      qType.indexOf("number") >= 0 || qType.indexOf("numeric") >= 0 ||
      qType.indexOf("числ") >= 0
    );

    const optionsHtml = isNumberType
      ? tplNumberOptions(q, answerState, opts)
      : isCheckboxType
        ? tplCheckboxOptions(q, answerState)
        : tplSingleOptions(q, answerState);

    const notesHtml = showNotes ? tplIssueNotesBlock(q) : "";

    return `
      <div class="card qCard" data-qid="${h(q.id)}">
        <div class="qHeader">
          <div class="qHeaderLeft">
            <div class="qTitle qTitleText">${h(title)}</div>
            ${descHtml}
          </div>
          <div class="qHeaderRight">
            ${headerRight}
          </div>
        </div>

        <div class="qBody">
          ${optionsHtml}
          ${notesHtml}
          <div class="qReqMsg" style="display:none"></div>
        </div>
      </div>
    `;
  };

  // ---------- single options (2–3 columns, labels from sheet) ----------
  function tplSingleOptions(q, answerState) {
    // Labels come from the sheet.
    // Supported:
    // 1) options_json: ["A","B","C"]
    // 2) options: "A;B;C" or "A|B|C" (also supports newlines)
    // 3) explicit columns: bad_answer / acceptable_answer / ideal_answer

    let labels = [];

    // 1) JSON
    try {
      const jsonStr = getAny(q, [
        "options_json", "answer_options_json", "variants_json", "choices_json",
        "варианты_json", "ответы_json", "вариантыответа_json"
      ], "");
      if (jsonStr) {
        const arr = JSON.parse(String(jsonStr));
        if (Array.isArray(arr)) labels = arr.map(x => norm(x)).filter(Boolean);
      }
    } catch (e) {}

    // 2) delimited list
    if (!labels.length) {
      const listStr = getAny(q, [
        "options", "answer_options", "variants", "choices",
        "варианты", "ответы", "вариантыответа"
      ], "");
      if (listStr) {
        labels = String(listStr)
          .split(/\s*[;|\n]+\s*/)
          .map(s => norm(s))
          .filter(Boolean);
      }
    }

    // 3) columns from your sheet (current payload uses these)
    if (!labels.length) {
      const goodText = norm(getAny(q, [
        "ideal_answer", "good", "good_text", "option_good",
        "идеал", "эталон", "хорошо"
      ], ""));

      const okText = norm(getAny(q, [
        "acceptable_answer", "ok", "ok_text", "option_ok",
        "норм", "норма", "средний"
      ], ""));

      const badText = norm(getAny(q, [
        "bad_answer", "bad", "bad_text", "option_bad",
        "плохо", "плохой", "стрем"
      ], ""));

      // ВАЖНО: порядок на экране: хороший (зелёный) → средний (жёлтый) → плохой (красный)
      // Но внутренняя логика значений сохраняется (good/ok/bad)
      labels = [goodText, okText, badText].map(norm).filter(Boolean);
    }

    // final fallback (ONLY if still empty)
    if (!labels.length) labels = ["Идеал", "Норм", "Стрем"];

    const cur = answerState ? norm(answerState) : "";

    // mapping по количеству вариантов
    // 2 варианта: good/bad
    // 3 варианта: good/ok/bad
    let vals, clss;
    if (labels.length === 2) {
      vals = ["good", "bad"]; clss = ["good", "bad"]; // good слева
    } else {
      vals = ["good", "ok", "bad"]; clss = ["good", "ok", "bad"]; // good → ok → bad
    }

    function btn(val, text, cls) {
      if (!text) return "";
      const active = (cur === val) ? "selected" : "";
      return `<button type="button" class="optBtn ${cls} ${active}" data-val="${val}">${h(text)}</button>`;
    }

    const rowCls = (labels.length === 2) ? "two" : "optRow3";

    return `
      <div class="optRow single ${rowCls}" data-kind="single">
        ${labels.map((t, i) => btn(vals[i] || "ok", t, clss[i] || "ok")).join("")}
      </div>
    `;
  }

  // ---------- number options (roll weight input) ----------
  function tplNumberOptions(q, answerState, opts) {
    const state = answerState && typeof answerState === "object" ? answerState : {};
    const rollValue = norm(state.roll_id || state.rollId || state.roll || state.roll_name || state.rollName || "");
    const actualValue = (state.actual_weight ?? state.actualWeight ?? "");
    const plannedWeight = (state.planned_weight ?? state.plannedWeight ?? "");
    const diff = (state.diff ?? "");
    const rollOptions = Array.isArray(opts?.rollOptions) ? opts.rollOptions : [];
    const tolerance = Number.isFinite(Number(opts?.tolerance)) ? Number(opts.tolerance) : 5;

    const planText = plannedWeight !== "" ? `${plannedWeight} г` : "—";
    const diffText = diff !== ""
      ? `${Number(diff) > 0 ? "+" : ""}${diff} г`
      : "—";

    return `
      <div class="optCol number" data-kind="number">
        <label class="numberField">
          <span class="numberLabel">Поиск ролла</span>
          <input class="numberSearch" data-role="roll-search" type="text" placeholder="Начните ввод" value="" />
        </label>
        <label class="numberField">
          <span class="numberLabel">Ролл</span>
          <select class="numberSelect" data-role="roll">
            <option value="">Выберите ролл</option>
            ${rollOptions.map(opt => {
              const value = norm(opt.id || opt.value || opt.name || "");
              const label = norm(opt.name || opt.label || opt.title || value);
              const weight = (opt.weight ?? opt.planned_weight ?? opt.plannedWeight ?? "");
              const active = value && value === rollValue ? "selected" : "";
              return `<option value="${h(value)}" data-name="${h(label)}" data-weight="${h(weight)}" ${active}>${h(label)}</option>`;
            }).join("")}
          </select>
        </label>
        <label class="numberField">
          <span class="numberLabel">Факт, г</span>
          <div class="numberInputRow">
            <input class="numberInput" data-role="actual" type="number" inputmode="decimal" min="0" step="1" placeholder="Введите вес" value="${h(actualValue)}" />
            <button type="button" class="btn btnSecondary numberHideBtn">Готово</button>
          </div>
        </label>
        <div class="numberMeta">
          <span class="numberMetaItem">План: <strong data-role="plan">${h(planText)}</strong></span>
          <span class="numberMetaItem">Отклонение: <strong data-role="diff">${h(diffText)}</strong></span>
          <span class="numberMetaItem">Допуск: ±${h(tolerance)} г</span>
        </div>
      </div>
    `;
  }

  // ---------- checkbox options ----------
  function tplCheckboxOptions(q, answerSet) {
    // For checkbox we render list items stored in sheet columns.
    // Supported: JSON array in items_json / checklist_items_json, OR semicolon list in items / checklist_items
    let items = [];
    try {
      const jsonStr = getAny(q, [
        "items_json", "checklist_items_json", "itemsJson",
        "checkbox_items_json", "check_items_json", "cb_items_json",
        "чекбоксы_json", "чекбокс_варианты_json", "галочки_json"
      ], "");
      if (jsonStr) items = JSON.parse(String(jsonStr));
    } catch (e) {}

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
          .map((t, i) => ({ id: `${q.id}_${i + 1}`, text: t }));
      }
    }

    let set;
    if (answerSet instanceof Set) {
      set = answerSet;
    } else if (Array.isArray(answerSet)) {
      set = new Set(answerSet);
    } else if (typeof answerSet === "string") {
      const parts = answerSet.split(/\s*[;|,]\s*/).map(s => norm(s)).filter(Boolean);
      set = new Set(parts);
    } else if (typeof answerSet === "boolean") {
      set = new Set(answerSet ? ["1"] : []);
    } else if (answerSet === 1 || answerSet === 0) {
      set = new Set(answerSet ? ["1"] : []);
    } else {
      set = new Set();
    }

    // If no explicit checkbox items are defined for this question, treat it as a single boolean checkbox.
    // UX: одна большая галка (есть/нет), НЕ 3-уровневая шкала.
    if (!items.length) {
      const checked = (set.has("1") || set.has("true") || set.has("yes") || set.has("да")) ? "checked" : "";

      // sheet mapping
      const ideal = norm(getAny(q, [
        "ideal_answer", "good", "good_text", "option_good",
        "идеал", "эталон", "хорошо"
      ], "Есть"));

      const bad = norm(getAny(q, [
        "bad_answer", "bad", "bad_text", "option_bad",
        "плохо", "плохой", "стрем"
      ], "Отсутствует"));

      return `
        <div class="optCol checkbox" data-kind="checkbox" data-mode="boolean">
          <div class="cbToggleWrap">
            <span class="cbToggleLabel cbToggleLabel--bad">${h(bad)}</span>
            <label class="cbToggle">
              <input type="checkbox" data-item="1" ${checked} />
              <span class="cbToggleTrack">
                <span class="cbToggleThumb"></span>
                <span class="cbToggleIcon cbToggleIcon--good">✓</span>
                <span class="cbToggleIcon cbToggleIcon--bad">×</span>
              </span>
            </label>
            <span class="cbToggleLabel cbToggleLabel--good">${h(ideal)}</span>
          </div>
        </div>
      `;
    }

    const rows = items.map(it => {
      const id = norm(it.id || it.key || it.value);
      const text = norm(it.text || it.label || it.name || id);
      const checked = set.has(id) ? "checked" : "";
      return `
        <label class="cbRow">
          <input type="checkbox" data-item="${h(id)}" ${checked} />
          <span>${h(text)}</span>
        </label>
      `;
    }).join("");

    return `<div class="optCol checkbox" data-kind="checkbox">${rows}</div>`;
  }

  // ---------- issue notes (comment + photos) ----------
  function tplIssueNotesBlock(q) {
    // This block is shown/hidden by logic depending on answer != good
    return `
      <div class="noteBlock" data-note-for="${h(q.id)}" style="display:none">
        <div class="noteRow noteRowTop">
          <textarea class="noteInput noteCompact" rows="1" placeholder="Комментарий (по желанию)"></textarea>
          <label class="fileBtn" aria-label="Добавить фото">
            <input class="noteFile" type="file" accept="image/*" multiple />
            <span class="fileBtnIcon" aria-hidden="true"></span>
          </label>
        </div>

        <div class="thumbRow"></div>
      </div>
    `;
  }

  // ---------- results header card ----------
  window.tplResultHeader = function tplResultHeader(opts) {
    opts = opts || {};
    const zone = (opts.zone || "gray");
    const percent = opts.percent;
    const lastTs = opts.lastTs;
    const meta = opts.meta || {};
    const metaLines = [];
    if (meta.fio) metaLines.push(`Кто проверял: ${h(meta.fio)}`);
    if (meta.address) metaLines.push(`Адрес: ${h(meta.address)}`);
    if (meta.date) metaLines.push(`Дата проверки: ${h(meta.date)}`);

    const pctNum = Number(String(percent ?? "").replace("%", "").replace(",", "."));
    const pct = Number.isFinite(pctNum) ? Math.round(pctNum) : null;

    return `
      <div class="card">
        <div class="zoneBanner ${h(zone)}">
          <div class="zoneTitle">${h(zoneLabel(zone))}</div>
          <div class="zonePct">${pct === null ? "—" : `${pct}%`}</div>
        </div>
        ${lastTs ? `<div class="zoneMeta">Последняя проверка: ${h(formatRuDateTime(lastTs))}</div>` : ``}
        ${metaLines.length ? `<div class="zoneMeta zoneMetaStack">${metaLines.map(line => `<div>${line}</div>`).join("")}</div>` : ``}
      </div>
    `;
  };

  // ---------- result buttons ----------
  window.tplResultActions = function tplResultActions(opts) {
    opts = opts || {};
    const showShare = (opts.showShare === undefined) ? true : !!opts.showShare;

    const shareEnabled = (typeof FEATURE_SHARE_LINK !== "undefined") ? !!FEATURE_SHARE_LINK : false;

    return `
      <div class="resultActions">
        ${showShare && shareEnabled ? `<button id="copyResultLinkBtn" class="btn ghost">Скопировать ссылку</button>` : ``}
        <button id="newCheckBtn" class="btn primary">Новая проверка</button>
      </div>
    `;
  };

  // ---------- error list item ----------
  window.tplIssueItem = function tplIssueItem(opts) {
    opts = opts || {};
    const title = opts.title;
    const sectionTitle = opts.sectionTitle;
    const severity = opts.severity;
    const photos = opts.photos || [];
    const comment = opts.comment || "";
    const score = (opts.score === undefined || opts.score === null) ? "" : String(opts.score);

    const sevLabel = severity === "critical" ? "Критическая" : "Некритическая";
    const thumbs = (photos || []).map((p, i) => {
      const src = driveToDirect(p);
      return `<img class="thumb" src="${h(src)}" data-photo-idx="${i}" />`;
    }).join("");

    return `
      <div class="issueItem">
        <div class="issueTop">
          <div class="issueTitle">${h(title)}</div>
          <div class="issueMeta">${h(sectionTitle)} • ${h(sevLabel)}${score ? ` • ${h(score)} б.` : ``}</div>
        </div>
        ${comment ? `<div class="issueComment">${richTextHtml(comment)}</div>` : ``}
        ${thumbs ? `<div class="thumbRow">${thumbs}</div>` : ``}
      </div>
    `;
  };

})();

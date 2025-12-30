/* ui/templates.js — генерация HTML для экранов и карточек */

(function () {
  // ---------- helpers ----------
  function h(s) { return escapeHtml(s ?? ""); }

  // Robust field getter: поддерживает разные названия колонок (ENG/RU), регистры, пробелы/дефисы
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

    // 1) direct hit
    for (const c of candidates) {
      if (obj[c] !== undefined && obj[c] !== null && String(obj[c]).trim() !== "") return obj[c];
    }

    // 2) normalized key hit
    const map = {};
    for (const k of Object.keys(obj)) map[keyNorm(k)] = k;

    for (const c of candidates) {
      const nk = keyNorm(c);
      const real = map[nk];
      if (real && obj[real] !== undefined && obj[real] !== null && String(obj[real]).trim() !== "") return obj[real];
    }

    return fallback;
  }

  // ---------- start screen ----------
  // 3 шага: область → город → адрес
  window.tplStartScreen = function tplStartScreen({ oblasts = [] } = {}) {
    return `
      <div class="container">
        <div class="card">
          <div class="cardHeader">
            <div class="title">Проверки филиалов СушиSELL</div>
            <div class="muted" id="userNameLine" style="margin-top:6px; display:none;"></div>
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

          <div class="actions">
            <button id="startBtn" class="btn primary" disabled>${h(UI_TEXT?.startButton || "Начать")}</button>
          </div>

          <div id="startHint" class="hint"></div>
        </div>
      </div>
    `;
  };

  // ---------- sticky sections header ----------
  window.tplSectionTabs = function tplSectionTabs({ sections = [], active = "" } = {}) {
    return `
      <div class="stickyTabs">
        <div class="tabs">
          ${sections.map(s => {
            const isA = String(s.id) === String(active);
            return `<button class="tab ${isA ? "active" : ""}" data-section="${h(s.id)}">${h(s.title)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  };

  // ---------- question card ----------
  // question: { id, section_id, title, description, hint_photo_url, type, ... }
  // type: "single" | "checkbox"
  window.tplQuestionCard = function tplQuestionCard(q, { answerState = null, showRightToggle = true, showNotes = false } = {}) {
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

    const qType = String(getAny(q, ["type", "answer_type", "kind", "тип", "тип_ответа"], "single")).toLowerCase();
    const optionsHtml = (qType === "checkbox")
      ? tplCheckboxOptions(q, answerState)
      : tplSingleOptions(q, answerState);

    const notesHtml = showNotes ? tplIssueNotesBlock(q) : "";

    return `
      <div class="qCard" data-qid="${h(q.id)}">
        <div class="qHeader">
          <div class="qHeaderLeft">
            <div class="qTitle">${h(title)}</div>
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

  // ---------- single options (3 columns, colored) ----------
  function tplSingleOptions(q, answerState) {
    // We expect 3 labels in the sheet (ideal/good, ok, bad). If any empty — hide it.
    const goodText = norm(getAny(q, [
      // EN
      "good_text", "ideal_text", "good", "ideal", "best_text", "excellent_text",
      // RU
      "идеальный_ответ", "эталон", "эталонный_ответ", "хороший_ответ", "правильно", "все_верно"
    ], "Эталон"));

    const okText = norm(getAny(q, [
      // EN
      "ok_text", "ok", "acceptable_text", "medium_text", "avg_text",
      // RU
      "подходящий_ответ", "средний_ответ", "почти", "частично", "не_идеально"
    ], "Норм"));

    const badText = norm(getAny(q, [
      // EN
      "bad_text", "bad", "worst_text", "poor_text",
      // RU
      "худший_ответ", "плохо", "ошибка", "неверно"
    ], "Плохо"));

    const cur = answerState ? norm(answerState) : "";

    const btn = (val, text, cls) => {
      if (!text) return "";
      const active = cur === val ? "selected" : "";
      return `<button type="button" class="optBtn ${cls} ${active}" data-val="${val}">${h(text)}</button>`;
    };

    return `
      <div class="optRow single" data-kind="single">
        ${btn("bad", badText, "bad")}
        ${btn("ok", okText, "ok")}
        ${btn("good", goodText, "good")}
      </div>
    `;
  }

  // ---------- checkbox options ----------
  function tplCheckboxOptions(q, answerSet) {
    // For checkbox we render list items stored in sheet columns.
    // Supported: JSON array in items_json / checklist_items_json, OR semicolon list in items / checklist_items
    let items = [];
    try {
      const jsonStr = getAny(q, ["items_json", "checklist_items_json", "itemsJson", "варианты_json", "чекбоксы_json"], "");
      if (jsonStr) items = JSON.parse(String(jsonStr));
    } catch {}

    if (!items.length) {
      const listStr = getAny(q, ["items", "checklist_items", "варианты", "чекбоксы"], "");
      if (listStr) {
        items = String(listStr)
          .split(";")
          .map(s => s.trim())
          .filter(Boolean)
          .map((t, i) => ({ id: `${q.id}_${i + 1}`, text: t }));
      }
    }

    const set = answerSet instanceof Set ? answerSet : new Set(answerSet || []);
    if (!items.length) {
      return `<div class="hint">Чекбоксы не заданы в таблице для этого вопроса</div>`;
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
        <div class="noteRow">
          <textarea class="noteInput" rows="1" placeholder="Комментарий (по желанию)"></textarea>
        </div>

        <div class="noteRow noteActions">
          <label class="fileBtn">
            <input class="noteFile" type="file" accept="image/*" multiple />
            <span class="fileBtnText">+ Фото</span>
          </label>
          <div class="noteHint">Можно добавить до ${typeof MAX_PHOTOS_PER_ISSUE !== "undefined" ? MAX_PHOTOS_PER_ISSUE : 5} фото</div>
        </div>

        <div class="thumbRow"></div>
      </div>
    `;
  }

  // ---------- results header card ----------
  window.tplResultHeader = function tplResultHeader({ zone, percent, lastTs } = {}) {
    const pct = Number.isFinite(Number(percent)) ? Math.round(Number(percent)) : null;

    return `
      <div class="resultHeader zone-${h(zone || "gray")}">
        <div class="resultLeft">
          <div class="resultZone">${h(zoneLabel(zone))}</div>
          ${lastTs ? `<div class="resultDate">Последняя проверка: ${h(formatRuDateTime(lastTs))}</div>` : ``}
        </div>
        <div class="resultRight">
          <div class="resultCircle">${pct === null ? "—" : `${pct}%`}</div>
        </div>
      </div>
    `;
  };

  // ---------- result buttons ----------
  window.tplResultActions = function tplResultActions({ showShare = true } = {}) {
    return `
      <div class="resultActions">
        ${showShare && FEATURE_SHARE_LINK ? `<button id="copyResultLinkBtn" class="btn ghost">Скопировать ссылку</button>` : ``}
        <button id="newCheckBtn" class="btn primary">Новая проверка</button>
      </div>
    `;
  };

  // ---------- error list item ----------
  window.tplIssueItem = function tplIssueItem({ title, sectionTitle, severity, photos = [], comment = "" } = {}) {
    const sevLabel = severity === "critical" ? "Критическая" : "Некритическая";
    const thumbs = (photos || []).map((p, i) => {
      const src = driveToDirect(p);
      return `<img class="thumb" src="${h(src)}" data-photo-idx="${i}" />`;
    }).join("");

    return `
      <div class="issueItem">
        <div class="issueTop">
          <div class="issueTitle">${h(title)}</div>
          <div class="issueMeta">${h(sectionTitle)} • ${h(sevLabel)}</div>
        </div>
        ${comment ? `<div class="issueComment">${richTextHtml(comment)}</div>` : ``}
        ${thumbs ? `<div class="thumbRow">${thumbs}</div>` : ``}
      </div>
    `;
  };

})();

/* ui/templates.js — генерация HTML для экранов и карточек */

(function () {
  // ---------- helpers ----------
  function h(s) { return escapeHtml(s ?? ""); }

  function zoneLabel(zone) {
    if (zone === "red") return "Красная зона";
    if (zone === "yellow") return "Жёлтая зона";
    if (zone === "green") return "Зелёная зона";
    return "Серая зона";
  }

  // ---------- start screen ----------
  window.tplStartScreen = function tplStartScreen({ cities = [], branches = [] } = {}) {
    return `
      <div class="container">
        <div class="card">
          <div class="cardHeader">
            <div class="title">${h(UI_TEXT?.startTitle || "Проверка филиала")}</div>
          </div>

          <div class="formRow">
            <label class="label">Город</label>
            <select id="citySelect" class="select">
              <option value="">Выбери город</option>
              ${cities.map(c => `<option value="${h(c)}">${h(c)}</option>`).join("")}
            </select>
          </div>

          <div class="formRow">
            <label class="label">Филиал</label>
            <select id="branchSelect" class="select" disabled>
              <option value="">Сначала выбери город</option>
            </select>
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
    const title = norm(q.title || q.question || q.name);
    const desc = norm(q.description || q.desc || "");
    const hintPhoto = norm(q.hint_photo || q.photo || q.hint_photo_url || q.description_photo || "");
    const hasHint = !!hintPhoto;

    const headerRight = (showRightToggle && hasHint)
      ? `<button class="photoToggle" type="button" data-photo="${h(hintPhoto)}" aria-label="Открыть фото подсказку">+</button>`
      : `<span class="photoToggleSpacer"></span>`;

    const descHtml = desc ? `<div class="qDesc">${richTextHtml(desc)}</div>` : "";

    const optionsHtml = (String(q.type || q.answer_type || "").toLowerCase() === "checkbox")
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
    const goodText = norm(q.good_text || q.ideal_text || q.good || "Эталон");
    const okText = norm(q.ok_text || q.ok || "Норм");
    const badText = norm(q.bad_text || q.bad || "Плохо");

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
    // For checkbox we render list items stored in q.items or similar:
    // Supported: q.items_json (JSON array) OR q.items (semicolon separated)
    let items = [];
    try {
      if (q.items_json) items = JSON.parse(q.items_json);
    } catch {}
    if (!items.length && q.items) {
      items = String(q.items).split(";").map(s => s.trim()).filter(Boolean).map((t, i) => ({ id: `${q.id}_${i+1}`, text: t }));
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

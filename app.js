/* app.js — вся логика чек-листа (без дизайна и без HTML-каркаса)
   Требует globals из config.js:
   DATA_JSONP_URL, SUBMIT_URL,
   ZONE_RED_MAX, ZONE_YELLOW_MAX,
   DRAFT_TTL_MS,
   MAX_PHOTOS_PER_ISSUE, MAX_PHOTO_SIZE_BYTES,
   JSONP_TIMEOUT_MS,
   APP_VERSION
*/

(() => {
  console.log("Checklist app loaded", typeof APP_VERSION !== "undefined" ? APP_VERSION : "no_version");

  // ====== UTILS ======
  const appEl = document.getElementById("app");

  const norm = (v) => (v ?? "").toString().trim();
  const toBool = (v) => v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  const uniq = (arr) => [...new Set(arr)];
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

  function render(html) {
    if (!appEl) return;
    appEl.innerHTML = html;
  }

  function renderError(title, err) {
    render(`
      <h1>${escapeHtml(title)}</h1>
      <div class="card">
        <div class="muted">Скинь мне этот текст — быстро разрулю.</div>
        <div class="hr"></div>
        <pre style="white-space:pre-wrap">${escapeHtml(String(err?.stack || err))}</pre>
      </div>
    `);
  }

  // ====== GLOBAL ERROR GUARDS (prevent white screen) ======
  window.addEventListener("error", (e) => {
    try {
      renderError("Ошибка в приложении", e?.error || e?.message || e);
    } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      renderError("Ошибка в приложении", e?.reason || e);
    } catch {}
  });

  // Convert plain text to HTML with safe clickable links.
  // Supports:
  //  - Markdown links: [text](https://example.com)
  //  - Bare URLs: https://example.com
  function richTextHtml(input) {
    const s0 = norm(input);
    if (!s0) return "";

    let s = escapeHtml(s0);
    s = s.replace(/\r\n|\r|\n/g, "<br>");

    // Markdown links
    s = s.replace(/\[([^\]]+)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/g, (m, text, url) => {
      const safeText = escapeHtml(String(text));
      const safeUrl = escapeHtml(String(url));
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
    });

    // Bare URLs
    s = s.replace(/(^|[^\w\">=])(https?:\/\/[^\s<]+)/g, (m, prefix, url) => {
      const safeUrl = escapeHtml(String(url));
      return `${prefix}<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
    });

    return s;
  }

  // Drive link -> direct-ish image
  const driveToDirect = (url) => {
    const u = norm(url);
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) return "";

    let id = "";
    const m1 = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) id = m1[1];

    if (!id) {
      const m2 = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m2 && m2[1]) id = m2[1];
    }

    if (id) return `https://lh3.googleusercontent.com/d/${id}=w1200`;
    return u;
  };

  const normPhoto = (r) => {
    const raw = norm(r.photo || r.photo_url || r.image || r.image_url);
    if (!raw) return "";
    return driveToDirect(raw);
  };

  // ====== JSONP loader (bypasses CORS for Apps Script) ======
  function buildUrlWithParams(baseUrl, params) {
    const u = new URL(baseUrl);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  }

  function loadJsonp(url, { timeoutMs = JSONP_TIMEOUT_MS || 20000 } = {}) {
    return new Promise((resolve, reject) => {
      const cbName = `__cb_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "no-referrer";
      let done = false;

      const cleanup = () => {
        if (script && script.parentNode) script.parentNode.removeChild(script);
        try {
          delete window[cbName];
        } catch {}
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("JSONP timeout"));
      }, timeoutMs);

      window[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error("JSONP load error"));
      };

      const finalUrl = buildUrlWithParams(url, { callback: cbName, _ts: Date.now() });
      script.src = finalUrl;
      document.body.appendChild(script);
    });
  }

  // ====== SUBMIT (form POST; bypasses CORS) ======
  function uuid4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function submitToSheet(payloadObj) {
    return new Promise((resolve, reject) => {
      try {
        let frame = document.getElementById("submitFrame");
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "submitFrame";
          frame.name = "submitFrame";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }

        let form = document.getElementById("submitForm");
        if (!form) {
          form = document.createElement("form");
          form.id = "submitForm";
          form.method = "POST";
          form.target = "submitFrame";
          form.style.display = "none";
          document.body.appendChild(form);
        } else {
          form.method = "POST";
          form.target = "submitFrame";
        }

        let payloadInput = document.getElementById("submitPayload");
        if (!payloadInput) {
          payloadInput = document.createElement("input");
          payloadInput.type = "hidden";
          payloadInput.id = "submitPayload";
          form.appendChild(payloadInput);
        }
        if (!payloadInput.getAttribute("name")) payloadInput.setAttribute("name", "payload");
        payloadInput.value = JSON.stringify(payloadObj);

        let actionInput = document.getElementById("submitAction");
        if (!actionInput) {
          actionInput = document.createElement("input");
          actionInput.type = "hidden";
          actionInput.id = "submitAction";
          actionInput.name = "action";
          form.appendChild(actionInput);
        }
        actionInput.value = "submit";

        const actionUrl = buildUrlWithParams(SUBMIT_URL, { action: "submit" });
        form.action = actionUrl;

        let finished = false;
        const cleanup = () => {
          try { frame.removeEventListener("load", onLoad); } catch {}
          try { clearTimeout(timer); } catch {}
        };

        const onLoad = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(true);
        };

        frame.addEventListener("load", onLoad);

        const timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(new Error("Submit timeout (iframe did not load)"));
        }, 20000);

        form.submit();
      } catch (e) {
        reject(e);
      }
    });
  }

  const IS_TG = !!(window.Telegram && Telegram.WebApp);

  const getTgName = () => {
    try {
      const u = Telegram.WebApp?.initDataUnsafe?.user;
      if (!u) return "";
      return norm([u.last_name, u.first_name].filter(Boolean).join(" ")) || norm(u.username) || "";
    } catch {
      return "";
    }
  };

  // ====== IMAGE MODAL ======
  const modalEl = document.getElementById("imgModal");
  const modalImg = document.getElementById("imgModalEl");
  const modalTitle = document.getElementById("imgModalTitle");
  const btnPrev = document.getElementById("imgPrev");
  const btnNext = document.getElementById("imgNext");
  const btnClose = document.getElementById("imgClose");

  // Hard-hide modal UI when it's not open (prevents stray arrows/close button on other screens)
  function syncModalVisibility() {
    if (!modalEl) return;
    const isOpen = modalEl.classList.contains("open");

    modalEl.style.display = isOpen ? "flex" : "none";
    modalEl.setAttribute("aria-hidden", isOpen ? "false" : "true");

    const d = isOpen ? "inline-flex" : "none";
    if (btnPrev) btnPrev.style.display = d;
    if (btnNext) btnNext.style.display = d;
    if (btnClose) btnClose.style.display = d;
  }
  try { syncModalVisibility(); } catch {}

  let MODAL_IMAGES = [];
  let MODAL_INDEX = 0;

  function modalRender() {
    if (!modalImg || !modalTitle) return;
    const src = MODAL_IMAGES[MODAL_INDEX] || "";
    modalImg.src = src;
    modalTitle.textContent = `Фото ${MODAL_INDEX + 1}/${MODAL_IMAGES.length}`;
    if (btnPrev) btnPrev.disabled = MODAL_IMAGES.length <= 1;
    if (btnNext) btnNext.disabled = MODAL_IMAGES.length <= 1;
  }

  function openImageModal(images, index = 0) {
    if (!modalEl) return;
    MODAL_IMAGES = (images || []).filter(Boolean);
    MODAL_INDEX = Math.max(0, Math.min(index, MODAL_IMAGES.length - 1));
    if (!MODAL_IMAGES.length) return;
    modalEl.classList.add("open");
    syncModalVisibility();
    modalRender();
  }

  function closeImageModal() {
    if (!modalEl) return;
    modalEl.classList.remove("open");
    syncModalVisibility();
    if (modalImg) modalImg.src = "";
    MODAL_IMAGES = [];
    MODAL_INDEX = 0;
  }

  if (btnClose) btnClose.addEventListener("click", closeImageModal);
  if (modalEl) modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeImageModal();
  });
  if (btnPrev)
    btnPrev.addEventListener("click", () => {
      if (MODAL_IMAGES.length <= 1) return;
      MODAL_INDEX = (MODAL_INDEX - 1 + MODAL_IMAGES.length) % MODAL_IMAGES.length;
      modalRender();
    });
  if (btnNext)
    btnNext.addEventListener("click", () => {
      if (MODAL_IMAGES.length <= 1) return;
      MODAL_INDEX = (MODAL_INDEX + 1) % MODAL_IMAGES.length;
      modalRender();
    });

  document.addEventListener("keydown", (e) => {
    if (!modalEl || !modalEl.classList.contains("open")) return;
    if (e.key === "Escape") closeImageModal();
    if (e.key === "ArrowLeft" && btnPrev) btnPrev.click();
    if (e.key === "ArrowRight" && btnNext) btnNext.click();
  });

  // ====== STATE ======
  let DATA = null;

  const STATE = {
    city: "",
    fio: "", // required outside Telegram
    branchId: "",
    enabledSections: [],
    activeSection: "",
    singleAnswers: {}, // key -> ideal/acceptable/bad
    checkboxAnswers: {}, // "_items" -> Set(keys)
    isFinished: false,
    lastResult: null,
    lastResultId: null, // share id (submission_id)
    issueNotes: {}, // key -> { text, photos[] (dataURL) }
    noteOpen: {}, // key -> bool
  };

  // ===== Notes migration (photo -> photos[]) =====
  function safeEnsureNote(key) {
    STATE.issueNotes[key] ??= { text: "", photos: [] };
    const n = STATE.issueNotes[key];

    if (n.photo && (!Array.isArray(n.photos) || n.photos.length === 0)) {
      n.photos = [n.photo];
      delete n.photo;
    }
    if (!Array.isArray(n.photos)) n.photos = [];
    if (typeof n.text !== "string") n.text = (n.text ?? "").toString();
    return n;
  }

  function migrateAllNotes() {
    try {
      for (const k of Object.keys(STATE.issueNotes || {})) safeEnsureNote(k);
    } catch {}
  }

  function notePhotos(key) {
    const n = safeEnsureNote(key);
    return Array.isArray(n.photos) ? n.photos.filter(Boolean) : [];
  }

  function draftKey() {
    return `draft_v2_${STATE.branchId || "no_branch"}`;
  }

  // ====== Last check meta (per branch) ======
  function lastCheckKey(branchId) {
    return `lastcheck_v2_${branchId || "no_branch"}`;
  }

  function setLastCheck(branchId, meta) {
    try {
      localStorage.setItem(
        lastCheckKey(branchId),
        JSON.stringify({ ts: new Date().toISOString(), ...(meta || {}) })
      );
    } catch {}
  }

  function getLastCheck(branchId) {
    try {
      const raw = localStorage.getItem(lastCheckKey(branchId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function formatRuDateTime(iso) {
    try {
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
    } catch {
      return "";
    }
  }

  function buildResultShareUrl(resultId) {
    const base = `${location.origin}${location.pathname}`;
    return `${base}?result=${encodeURIComponent(String(resultId || "").trim())}`;
  }

  function clearDraftStorageOnly(branchId) {
    try {
      if (!branchId) return;
      localStorage.removeItem(`draft_v2_${branchId}`);
    } catch {}
  }

  function saveDraft() {
    try {
      const serialCheckbox = {};
      for (const [k, set] of Object.entries(STATE.checkboxAnswers)) serialCheckbox[k] = [...set];

      localStorage.setItem(
        draftKey(),
        JSON.stringify({
          city: STATE.city,
          fio: STATE.fio,
          branchId: STATE.branchId,
          enabledSections: STATE.enabledSections,
          activeSection: STATE.activeSection,
          singleAnswers: STATE.singleAnswers,
          checkboxAnswers: serialCheckbox,
          savedAt: Date.now(),
          isFinished: STATE.isFinished,
          lastResult: STATE.lastResult,
          lastResultId: STATE.lastResultId,
          issueNotes: STATE.issueNotes,
          noteOpen: STATE.noteOpen,
        })
      );
    } catch {}
  }

  function loadDraft(branchId) {
    try {
      const raw = localStorage.getItem(`draft_v2_${branchId}`);
      if (!raw) return null;

      const d = JSON.parse(raw);
      const savedAt = Number(d.savedAt || 0);
      if (!savedAt || Date.now() - savedAt > (DRAFT_TTL_MS || 5 * 60 * 60 * 1000)) {
        localStorage.removeItem(`draft_v2_${branchId}`);
        return null;
      }

      const restored = {};
      for (const [k, arr] of Object.entries(d.checkboxAnswers || {})) restored[k] = new Set(arr);
      d.checkboxAnswers = restored;

      d.issueNotes = d.issueNotes || {};
      for (const k of Object.keys(d.issueNotes)) {
        const n = d.issueNotes[k] || {};
        if (n.photo && (!Array.isArray(n.photos) || n.photos.length === 0)) {
          n.photos = [n.photo];
          delete n.photo;
        }
        if (!Array.isArray(n.photos)) n.photos = [];
        d.issueNotes[k] = n;
      }

      return d;
    } catch {
      return null;
    }
  }

  function clearDraftForBranch(branchId) {
    try {
      if (!branchId) return;
      localStorage.removeItem(`draft_v2_${branchId}`);
    } catch {}

    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = "";
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.fio = "";
    STATE.issueNotes = {};
    STATE.noteOpen = {};
  }

  // Reset current check data but keep branch/city/fio (use for "Новая проверка")
  function resetCheckKeepMeta() {
    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = "";
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.issueNotes = {};
    STATE.noteOpen = {};
  }

  // ====== DATA ADAPTER ======
  function getActiveSections() {
    return (DATA.sections || [])
      .filter((s) => toBool(s.active) && norm(s.section_code))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function sectionsByCode() {
    const m = new Map();
    for (const s of getActiveSections()) m.set(norm(s.section_code), s);
    return m;
  }

  function getActiveBranches() {
    return (DATA.branches || []).filter((b) => toBool(b.active) && norm(b.city) && norm(b.branch_id) && norm(b.branch_name));
  }

  function getChecklistRows() {
    return (DATA.checklist || [])
      .filter((r) => toBool(r.active) && norm(r.section_code) && norm(r.question_id) && norm(r.question_type));
  }

  function buildSingles(rows, enabledSections) {
    const m = {};
    for (const r of rows) {
      const type = norm(r.question_type).toLowerCase();
      if (type !== "single" && type !== "radio") continue;
      const sec = norm(r.section_code);
      if (!enabledSections.includes(sec)) continue;

      const key = `${sec}|${norm(r.question_id)}`;
      m[sec] ??= [];
      m[sec].push({
        key,
        section_code: sec,
        question_id: norm(r.question_id),
        question_text: norm(r.question_text),
        question_description: norm(r.question_description),
        photo: normPhoto(r),
        ideal_answer: norm(r.ideal_answer),
        acceptable_answer: norm(r.acceptable_answer),
        bad_answer: norm(r.bad_answer),
        score: Number(r.score || 0),
        severity: norm(r.severity),
        exclude_from_max: toBool(r.exclude_from_max),
        sort_order: Number(r.sort_order || 0),
      });
    }
    for (const sec of Object.keys(m)) {
      m[sec].sort((a, b) => a.sort_order - b.sort_order || a.question_id.localeCompare(b.question_id));
    }
    return m;
  }

  function buildCheckboxGroups(rows, enabledSections) {
    const m = {};
    for (const r of rows) {
      const type = norm(r.question_type).toLowerCase();
      if (type !== "checkbox") continue;

      const sec = norm(r.section_code);
      if (!enabledSections.includes(sec)) continue;

      const key = `${sec}|${norm(r.question_id)}`;
      m[sec] ??= [];
      m[sec].push({
        key,
        section_code: sec,
        question_id: norm(r.question_id),
        title: norm(r.question_text) || norm(r.question_id),
        description: norm(r.question_description),
        photo: normPhoto(r),
        score: Number(r.score || 0),
        severity: norm(r.severity),
        exclude_from_max: toBool(r.exclude_from_max),
        sort_order: Number(r.sort_order || 0),
      });
    }
    for (const sec of Object.keys(m)) {
      m[sec].sort((a, b) => a.sort_order - b.sort_order || a.question_id.localeCompare(b.question_id));
    }
    return m;
  }

  function sortSectionCodesByOrder(codes) {
    const map = sectionsByCode();
    return (codes || [])
      .map((c) => norm(c))
      .filter(Boolean)
      .filter((c) => map.has(c))
      .sort((a, b) => Number(map.get(a)?.sort_order || 0) - Number(map.get(b)?.sort_order || 0));
  }

  // ====== VALIDATION ======
  function validateAll(singlesBySec, checkboxGroupsBySec, enabledSections) {
    const sectionMap = sectionsByCode();
    const missingSingles = new Set();
    const missingSections = new Set();

    for (const sec of enabledSections) {
      for (const q of singlesBySec[sec] || []) {
        if (!STATE.singleAnswers[q.key]) {
          missingSingles.add(q.key);
          missingSections.add(sec);
        }
      }
    }

    const missingSectionTitles = [...missingSections].map((code) => {
      const s = sectionMap.get(code);
      return s ? norm(s.title) : code;
    });

    return { ok: missingSingles.size === 0, missingSingles, missingSections, missingSectionTitles };
  }

  // ====== RESULTS ======
  function computeResult(rows, singlesBySec, checkboxGroupsBySec, enabledSections) {
    let earned = 0;
    let maxScore = 0;

    const issuesBySection = {};
    const addIssue = (sec, item) => {
      issuesBySection[sec] ??= [];
      issuesBySection[sec].push(item);
    };

    for (const sec of enabledSections) {
      for (const q of singlesBySec[sec] || []) {
        if (!q.exclude_from_max) maxScore += Number(q.score || 0);

        const sel = STATE.singleAnswers[q.key];
        if (!sel) continue;

        if (sel === "ideal") {
          earned += Number(q.score || 0);
        } else if (sel === "acceptable") {
          earned += Number(q.score || 0) / 2;
          addIssue(sec, { key: q.key, text: `${q.question_text}: ${q.acceptable_answer}` });
        } else if (sel === "bad") {
          addIssue(sec, { key: q.key, text: `${q.question_text}: ${q.bad_answer}` });
        }
      }
    }

    const checkedSet = STATE.checkboxAnswers["_items"] || new Set();
    for (const sec of enabledSections) {
      for (const it of checkboxGroupsBySec[sec] || []) {
        if (!it.exclude_from_max) maxScore += Number(it.score || 0);

        if (checkedSet.has(it.key)) {
          earned += Number(it.score || 0);
        } else {
          addIssue(sec, { key: it.key, text: `${it.title}` });
        }
      }
    }

    const percent = maxScore > 0 ? Math.round((earned / maxScore) * 1000) / 10 : 0;
    let zone = "green";
    if (maxScore <= 0) zone = "gray";
    else if (percent <= (ZONE_RED_MAX ?? 70)) zone = "red";
    else if (percent <= (ZONE_YELLOW_MAX ?? 85)) zone = "yellow";

    return { earned, maxScore, percent, zone, issuesBySection };
  }

  function zoneLabel(zone) {
    if (zone === "gray") return "СЕРАЯ ЗОНА";
    if (zone === "red") return "КРАСНАЯ ЗОНА";
    if (zone === "yellow") return "ЖЁЛТАЯ ЗОНА";
    return "ЗЕЛЁНАЯ ЗОНА";
  }

  // ====== SUBMIT PAYLOAD ======
  function buildSubmitPayload(result) {
    const nowIso = new Date().toISOString();

    function buildFlatAnswers() {
      const out = [];

      const sections = (DATA?.sections || []).filter((s) => toBool(s.active) && norm(s.section_code));
      const secTitleByCode = new Map(sections.map((s) => [norm(s.section_code), norm(s.title) || norm(s.section_code)]));

      const checklist = (DATA?.checklist || [])
        .filter((r) => toBool(r.active) && norm(r.section_code) && norm(r.question_id) && norm(r.question_type));

      const rowByKey = new Map();
      for (const r of checklist) {
        const key = `${norm(r.section_code)}|${norm(r.question_id)}`;
        if (!rowByKey.has(key)) rowByKey.set(key, r);
      }

      const checked = new Set(
        (() => {
          const x = STATE.checkboxAnswers && STATE.checkboxAnswers["_items"];
          if (!x) return [];
          return Array.isArray(x) ? x : [...x];
        })().map(String)
      );

      const allKeys = [];
      for (const r of checklist) {
        const key = `${norm(r.section_code)}|${norm(r.question_id)}`;
        allKeys.push(key);
      }

      for (const key of allKeys) {
        const r = rowByKey.get(key);
        if (!r) continue;

        const section_code = norm(r.section_code);
        const section_title = secTitleByCode.get(section_code) || section_code;
        const question_id = norm(r.question_id);
        const question_type = norm(r.question_type).toLowerCase();

        const question_text = norm(r.question_text) || question_id;
        const severity = norm(r.severity);
        const score_max = Number(r.score || 0);

        let answer_key = "";
        let answer_text = "";
        let score_earned = 0;
        let is_issue = false;

        if (question_type === "single" || question_type === "radio") {
          answer_key = norm(STATE.singleAnswers?.[key]);
          const ideal = norm(r.ideal_answer);
          const ok = norm(r.acceptable_answer);
          const bad = norm(r.bad_answer);

          if (answer_key === "ideal") {
            answer_text = ideal;
            score_earned = score_max;
            is_issue = false;
          } else if (answer_key === "acceptable") {
            answer_text = ok;
            score_earned = score_max / 2;
            is_issue = true;
          } else if (answer_key === "bad") {
            answer_text = bad;
            score_earned = 0;
            is_issue = true;
          } else {
            answer_text = "";
            score_earned = 0;
            is_issue = true;
          }
        } else if (question_type === "checkbox") {
          const isChecked = checked.has(key);
          answer_key = isChecked ? "checked" : "unchecked";
          answer_text = isChecked ? "Есть" : "Нет";
          score_earned = isChecked ? score_max : 0;
          is_issue = !isChecked;
        } else {
          continue;
        }

        const note = safeEnsureNote(key);
        const localPhotos = notePhotos(key);
        const photosCount = localPhotos.length;
        const photos = []; // IMPORTANT: do not send base64 photos to Apps Script
        const comment = norm(note.text);

        out.push({
          key,
          section_code,
          section_title,
          question_id,
          question_type,
          question_text,
          severity,
          answer_key,
          answer_text,
          is_issue,
          score_earned,
          score_max,
          comment,
          photos_count: photosCount,
          photos,
        });
      }

      return out;
    }

    const serialCheckbox = {};
    for (const [k, set] of Object.entries(STATE.checkboxAnswers || {})) {
      serialCheckbox[k] = Array.isArray(set) ? set : [...(set || [])];
    }

    const branch = (DATA?.branches || []).find((b) => norm(b.branch_id) === norm(STATE.branchId)) || null;

    let tg = null;
    try {
      if (IS_TG && Telegram?.WebApp) {
        const u = Telegram.WebApp?.initDataUnsafe?.user;
        tg = {
          is_tg: true,
          init_data: Telegram.WebApp?.initData || "",
          user_id: u?.id ?? null,
          username: u?.username ?? null,
          first_name: u?.first_name ?? null,
          last_name: u?.last_name ?? null,
        };
      }
    } catch {}

    const issueNotesLite = {};
    try {
      for (const [k, n] of Object.entries(STATE.issueNotes || {})) {
        const nn = n || {};
        const txt = typeof nn.text === "string" ? nn.text : (nn.text ?? "").toString();
        const cnt = Array.isArray(nn.photos) ? nn.photos.filter(Boolean).length : nn.photo ? 1 : 0;
        issueNotesLite[k] = { text: txt, photos_count: cnt };
      }
    } catch {}

    return {
      submission_id: uuid4(),
      submitted_at: nowIso,
      fio: norm(STATE.fio),
      city: norm(STATE.city),
      branch_id: norm(STATE.branchId),
      branch_name: norm(branch?.branch_name || ""),
      zone: result.zone,
      percent: result.percent,
      earned: result.earned,
      max_score: result.maxScore,
      enabled_sections: (STATE.enabledSections || []).slice(),
      active_section: norm(STATE.activeSection),
      single_answers: { ...(STATE.singleAnswers || {}) },
      checkbox_answers: serialCheckbox,
      issue_notes: issueNotesLite,
      issues_by_section: result.issuesBySection || {},
      answers_flat: buildFlatAnswers(),
      meta: {
        app_version: APP_VERSION || "v2",
        user_agent: navigator.userAgent,
        tz_offset_min: new Date().getTimezoneOffset(),
      },
      tg,
    };
  }

  // ====== UI: Result ======
  function renderResultScreen(result, branch) {
    const sectionMap = sectionsByCode();
    const secTitle = (code) => {
      const s = sectionMap.get(code);
      return s ? norm(s.title) : code;
    };

    const issuesSections = Object.keys(result.issuesBySection || {});

    render(`
      <h1>Итог</h1>
      <div class="muted">
        ${STATE.fio ? `<span class="pill">${escapeHtml(norm(STATE.fio))}</span>` : ""}
        <span class="pill">${escapeHtml(norm(branch?.city || STATE.city))}</span>
        <span class="pill">${escapeHtml(norm(branch?.branch_name || STATE.branchId))}</span>
      </div>

      <div class="card" style="border:none;padding:0">
        ${(() => {
          const pct = Number(result.percent);
          const pctText = Number.isFinite(pct) ? (Math.round(pct * 10) / 10).toFixed((Math.round(pct * 10) % 10 === 0) ? 0 : 1) : "0";
          return `
            <div class="zoneBanner ${escapeHtml(result.zone)}">
              <div class="zoneTitle">${escapeHtml(zoneLabel(result.zone))}</div>
              <div class="zonePct">${escapeHtml(pctText)}%</div>
            </div>
          `;
        })()}
        ${(() => {
          const lc = getLastCheck(STATE.branchId);
          return lc?.ts
            ? `<div class="zoneMeta">Последняя проверка: <b>${escapeHtml(formatRuDateTime(lc.ts))}</b></div>`
            : "";
        })()}
      </div>

      <div class="card">
        <h2 style="margin-top:0">Где есть ошибки</h2>
        ${
          issuesSections.length
            ? issuesSections
                .map(
                  (sec) => `
          <div style="margin-top:12px">
            <div style="font-weight:900">${escapeHtml(secTitle(sec))}</div>
            <div class="muted" style="font-size:12px;margin-top:6px">
              ${(result.issuesBySection[sec] || [])
                .map((it) => {
                  const key = typeof it === "object" && it ? it.key || "" : "";
                  const text = typeof it === "object" && it ? it.text || "" : String(it || "");
                  const note = key ? safeEnsureNote(key) : { text: "", photos: [] };
                  const photos = key ? notePhotos(key) : [];
                  const comment = norm(note.text);

                  return `
                    <div style="margin-top:8px">
                      • ${escapeHtml(text)}
                      ${comment ? `<div class="muted" style="margin-top:4px">Комментарий: ${escapeHtml(comment)}</div>` : ``}
                      ${
                        photos.length
                          ? `
                        <div class="thumbGrid">
                          ${photos
                            .map((src, idx) => `<img class="thumb" src="${escapeHtml(src)}" data-res-thumb="${escapeHtml(key)}" data-idx="${idx}" alt="" />`)
                            .join("")}
                        </div>
                      `
                          : ``
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `
                )
                .join("")
            : `<div class="muted">Ошибок нет ✅</div>`
        }
      </div>

      <div class="card">
        ${STATE.lastResultId ? `<button id="copyResultLink" class="btnSecondary">Скопировать ссылку на результат</button>` : ``}
        <button id="newCheck" class="btnSecondary" style="margin-top:${STATE.lastResultId ? "8px" : "0"}">Новая проверка</button>
      </div>
    `);

    const newBtn = document.getElementById("newCheck");
    if (newBtn)
      newBtn.onclick = () => {
        resetCheckKeepMeta();
        clearDraftStorageOnly(STATE.branchId);

        if (!STATE.activeSection || !STATE.enabledSections.includes(STATE.activeSection)) {
          STATE.activeSection = STATE.enabledSections[0];
        }

        saveDraft();
        renderSurvey();
      };

    const copyBtn = document.getElementById("copyResultLink");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        if (!STATE.lastResultId) return;
        const url = buildResultShareUrl(STATE.lastResultId);
        try {
          await navigator.clipboard.writeText(url);
          const old = copyBtn.textContent;
          copyBtn.textContent = "Ссылка скопирована ✅";
          setTimeout(() => (copyBtn.textContent = old), 1400);
        } catch {
          prompt("Скопируй ссылку:", url);
        }
      };
    }

    document.querySelectorAll('img.thumb[data-res-thumb]').forEach((img) => {
      img.addEventListener("click", () => {
        const key = img.getAttribute("data-res-thumb");
        const idx = Number(img.getAttribute("data-idx") || 0);
        if (!key) return;
        openImageModal(notePhotos(key), idx);
      });
    });
  }

  // ====== UI: START ======
  function renderStart(isLoading = false) {
    const branches = DATA ? getActiveBranches() : [];
    const cities = uniq(branches.map((b) => norm(b.city))).sort();

    if (IS_TG && !STATE.fio) STATE.fio = getTgName();

    render(`
      <h1>Проверка филиала</h1>
      <div class="card">
        <div class="row">
          ${
            !IS_TG
              ? `
          <div>
            <label>ФИО</label>
            <input id="fio" placeholder="Иванов Иван Иванович" style="width:100%;padding:12px;border-radius:12px;border:1px solid #ddd;font-size:16px" />
          </div>
          `
              : ""
          }
          <div>
            <label>Город</label>
            <select id="city">
              <option value="">${isLoading ? "Загружаю список…" : "Выбери город"}</option>
              ${cities.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>

          <div>
            <label>Филиал</label>
            <select id="branch" ${isLoading ? "disabled" : "disabled"}>
              <option value="">Сначала выбери город</option>
            </select>
          </div>

          <button id="go" disabled>${isLoading ? "Загружаю…" : "Начать"}</button>
        </div>
      </div>
      <div class="muted">${isLoading ? "Подгружаю вопросы и список филиалов…" : "Все вопросы обязательные ✅"}</div>
    `);

    const citySel = document.getElementById("city");
    const branchSel = document.getElementById("branch");
    const goBtn = document.getElementById("go");
    const fioInp = document.getElementById("fio");

    if (fioInp) {
      fioInp.value = STATE.fio || "";
      fioInp.addEventListener("input", () => {
        STATE.fio = fioInp.value;
        saveDraft();
        goBtn.disabled = !branchSel.value || !norm(STATE.fio);
      });
    }

    if (isLoading) return;

    citySel.addEventListener("change", () => {
      const city = citySel.value;
      const list = branches.filter((b) => norm(b.city) === norm(city));
      branchSel.innerHTML =
        `<option value="">Выбери филиал</option>` +
        list.map((b) => `<option value="${escapeHtml(norm(b.branch_id))}">${escapeHtml(norm(b.branch_name))}</option>`).join("");
      branchSel.disabled = false;
      goBtn.disabled = true;
    });

    branchSel.addEventListener("change", () => {
      goBtn.disabled = !branchSel.value || (!IS_TG && !norm(STATE.fio));
    });

    goBtn.addEventListener("click", () => {
      if (!IS_TG && !norm(STATE.fio)) {
        alert("Вне Telegram нужно указать ФИО");
        return;
      }
      STATE.city = citySel.value;
      STATE.branchId = branchSel.value;

      const branch = getActiveBranches().find((b) => norm(b.branch_id) === norm(STATE.branchId));
      const allSections = getActiveSections().map((s) => norm(s.section_code));
      STATE.enabledSections = sortSectionCodesByOrder(allSections);

      const d = loadDraft(STATE.branchId);
      if (d && d.isFinished && d.lastResult) {
        resetCheckKeepMeta();
        clearDraftStorageOnly(STATE.branchId);
        migrateAllNotes();
      } else if (d) {
        STATE.enabledSections = sortSectionCodesByOrder(STATE.enabledSections);
        STATE.activeSection = d.activeSection || "";
        STATE.singleAnswers = d.singleAnswers || {};
        STATE.checkboxAnswers = d.checkboxAnswers || {};
        STATE.isFinished = !!d.isFinished;
        STATE.lastResult = d.lastResult || null;
        STATE.lastResultId = d.lastResultId || null;
        STATE.fio = d.fio || STATE.fio;
        STATE.issueNotes = d.issueNotes || {};
        STATE.noteOpen = d.noteOpen || {};
        migrateAllNotes();
      } else {
        migrateAllNotes();
      }

      if (!STATE.activeSection || !STATE.enabledSections.includes(STATE.activeSection)) {
        STATE.activeSection = STATE.enabledSections[0];
      }

      saveDraft();
      if (STATE.isFinished && STATE.lastResult) {
        renderResultScreen(STATE.lastResult, branch);
        return;
      }
      renderSurvey();
    });
  }

  // ====== UI: SURVEY ======
  function renderSurvey() {
    if (STATE.isFinished && STATE.lastResult) {
      const branch = getActiveBranches().find((b) => norm(b.branch_id) === norm(STATE.branchId));
      renderResultScreen(STATE.lastResult, branch);
      return;
    }

    const branch = getActiveBranches().find((b) => norm(b.branch_id) === norm(STATE.branchId));
    const sectionMap = sectionsByCode();

    const rows = getChecklistRows();
    const singlesBySec = buildSingles(rows, STATE.enabledSections);
    const checkboxGroupsBySec = buildCheckboxGroups(rows, STATE.enabledSections);

    function sectionTitle(code) {
      const s = sectionMap.get(code);
      return s ? norm(s.title) : code;
    }

    function ensureNote(key) {
      return safeEnsureNote(key);
    }

    function noteBlockHtml(key, show) {
      const n = ensureNote(key);
      const hidden = show ? "" : "display:none";
      const photos = notePhotos(key);
      return `
      <div class="noteBlock" data-note-block="${escapeHtml(key)}" style="margin-top:10px;${hidden}">
        <div class="commentWrap">
          <div class="commentLabel"><span>Комментарий</span></div>
          <textarea class="comment" data-note-text="${escapeHtml(key)}" placeholder="Коротко: что не так?">${escapeHtml(n.text || "")}</textarea>
        </div>

        <div style="margin-top:10px">
          <div class="photoHint">Фото (можно несколько, до ${MAX_PHOTOS_PER_ISSUE || 5})</div>
          <input type="file" accept="image/*" multiple data-note-file="${escapeHtml(key)}" style="width:100%" />
        </div>

        ${
          photos.length
            ? `
          <div class="thumbGrid">
            ${photos
              .map(
                (src, idx) => `
              <div>
                <img class="thumb" src="${escapeHtml(src)}" data-note-thumb="${escapeHtml(key)}" data-idx="${idx}" alt="" />
                <div style="margin-top:6px">
                  <button type="button" class="btnSecondary thumbBtn" data-note-remove-one="${escapeHtml(key)}" data-idx="${idx}">Удалить</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    `;
    }

    function readImageAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function renderTabs() {
      return `
        <div class="tabs">
          ${STATE.enabledSections
            .map((code) => {
              const active = code === STATE.activeSection ? "active" : "";
              return `<div class="tab ${active}" data-sec="${escapeHtml(code)}">${escapeHtml(sectionTitle(code))}</div>`;
            })
            .join("")}
        </div>
      `;
    }

    function renderActiveSectionContent() {
      const sec = STATE.activeSection;
      const singles = singlesBySec[sec] || [];
      const items = checkboxGroupsBySec[sec] || [];
      let html = "";

      // SINGLE
      for (const q of singles) {
        const selected = STATE.singleAnswers[q.key] || "";
        html += `
          <div class="card question" data-single-key="${escapeHtml(q.key)}">
            <div class="qHead">
              <div class="qHeadMain">
                <div class="q-title">${escapeHtml(q.question_text || q.question_id)}</div>
                ${q.question_description ? `<div class="q-desc">${richTextHtml(q.question_description)}</div>` : ""}
              </div>
              <div class="qHeadAside">
                ${q.photo ? `<button type="button" class="photoToggle" data-photo-toggle="${escapeHtml(q.key)}">+</button>` : ""}
              </div>
            </div>
            ${q.photo ? `<div class="photoWrap" data-photo-wrap="${escapeHtml(q.key)}"><img src="${escapeHtml(q.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"/></div>` : ""}
            ${(() => {
              const opts = [
                { value: "ideal", text: norm(q.ideal_answer) },
                { value: "acceptable", text: norm(q.acceptable_answer) },
                { value: "bad", text: norm(q.bad_answer) },
              ].filter((o) => o.text);

              const allowed = new Set(opts.map((o) => o.value));
              if (selected && !allowed.has(selected)) {
                delete STATE.singleAnswers[q.key];
                saveDraft();
              }
              const selectedNow = STATE.singleAnswers[q.key] || "";

              const classByValue = {
                bad: "answer--bad",
                acceptable: "answer--ok",
                ideal: "answer--good",
              };

              return `
                <div class="segmented" data-seg="${escapeHtml(q.key)}">
                  ${opts.map((opt) => {
                    const safeKey = q.key.replace(/[^a-zA-Z0-9_|-]/g, "_");
                    const id = `r_${safeKey}_${opt.value}`;
                    const active = selectedNow === opt.value ? "is-active" : "";
                    const cls = classByValue[opt.value] || "";
                    return `
                      <input
                        class="segInput"
                        type="radio"
                        id="${escapeHtml(id)}"
                        name="s_${escapeHtml(q.key)}"
                        value="${escapeHtml(opt.value)}"
                        ${selectedNow === opt.value ? "checked" : ""}
                      />
                      <label class="segBtn ${cls} ${active}" for="${escapeHtml(id)}">${escapeHtml(opt.text)}</label>
                    `;
                  }).join("")}
                </div>
              `;
            })()}
            ${(() => {
              const selNow = STATE.singleAnswers[q.key] || "";
              const nonIdeal = selNow && selNow !== "ideal";
              return nonIdeal ? noteBlockHtml(q.key, true) : "";
            })()}
          </div>
        `;
      }

      // CHECKBOX
      const checkedSet = STATE.checkboxAnswers["_items"] || new Set();
      for (const it of items) {
        const checked = checkedSet.has(it.key) ? "checked" : "";
        html += `
          <div class="card question" data-checkbox-key="${escapeHtml(it.key)}">
            <div class="qHead">
              <div class="qHeadMain">
                <div class="q-title">${escapeHtml(it.title)}</div>
                ${it.description ? `<div class="q-desc">${richTextHtml(it.description)}</div>` : ""}
              </div>
              <div class="qHeadAside">
                ${it.photo ? `<button type="button" class="photoToggle" data-photo-toggle="${escapeHtml(it.key)}">+</button>` : ""}
              </div>
            </div>
            ${it.photo ? `<div class="photoWrap" data-photo-wrap="${escapeHtml(it.key)}"><img src="${escapeHtml(it.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"/></div>` : ""}

            <label class="opt">
              <input type="checkbox" data-checkbox-key="${escapeHtml(it.key)}" ${checked}/>
              <div style="flex:1"><div>Есть</div></div>
            </label>

            ${(() => {
              const isOk = checkedSet.has(it.key);
              if (isOk) return "";
              const open =
                !!STATE.noteOpen[it.key] ||
                !!STATE.issueNotes[it.key]?.text ||
                !!STATE.issueNotes[it.key]?.photos?.length ||
                !!STATE.issueNotes[it.key]?.photo;

              return `
                <button type="button" class="btnSecondary" data-note-toggle="${escapeHtml(it.key)}" style="margin-top:10px">Комментарий/фото</button>
                ${noteBlockHtml(it.key, open)}
              `;
            })()}
          </div>
        `;
      }

      if (!html) html = `<div class="card muted">В этом разделе пока нет вопросов.</div>`;
      return html;
    }

    render(`
      <div class="topbar">
        <div>
          <h1 style="margin:0">Проверка</h1>
          <div class="muted">
            ${STATE.fio ? `<span class="pill">${escapeHtml(norm(STATE.fio))}</span>` : ""}
            <span class="pill">${escapeHtml(norm(branch?.city || STATE.city))}</span>
            <span class="pill">${escapeHtml(norm(branch?.branch_name || STATE.branchId))}</span>
          </div>
        </div>
      </div>

      ${renderTabs()}

      <div id="content">${renderActiveSectionContent()}</div>

      <div class="card">
        <button id="finish" disabled>Завершить</button>
        <div id="submitStatus" class="muted" style="margin-top:8px;font-size:12px"></div>
        <button id="resetDraft" class="btnSecondary" style="margin-top:8px">Сбросить черновик этого филиала</button>
        <button id="back" class="btnSecondary" style="margin-top:8px">К выбору филиала</button>
        <div class="muted" style="margin-top:10px;font-size:12px">Автосейв ✅ (черновик хранится 5 часов)</div>
      </div>
    `);

    const contentEl = document.getElementById("content");
    const finishBtn = document.getElementById("finish");
    const submitStatusEl = document.getElementById("submitStatus");

    function setSubmitStatus(msg) {
      if (!submitStatusEl) return;
      submitStatusEl.textContent = msg || "";
    }

    function updateFinishState() {
      const v = validateAll(singlesBySec, checkboxGroupsBySec, STATE.enabledSections);
      finishBtn.disabled = !v.ok;
    }

    function clearErrors() {
      document.querySelectorAll(".card.question").forEach((el) => el.classList.remove("error"));
    }

    function paintErrors(v) {
      for (const key of v.missingSingles) {
        const el = document.querySelector(`[data-single-key="${CSS.escape(key)}"]`);
        if (el) el.classList.add("error");
      }
    }

    function centerIntoView(el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        const rect = el.getBoundingClientRect();
        const y =
          (window.pageYOffset || document.documentElement.scrollTop || 0) +
          rect.top -
          window.innerHeight / 2 +
          rect.height / 2;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    }

    function bindHandlers() {
      // tabs
      document.querySelectorAll(".tab").forEach((el) => {
        el.addEventListener("click", () => {
          const sec = el.getAttribute("data-sec");
          if (!sec) return;
          STATE.activeSection = sec;
          saveDraft();

          document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
          el.classList.add("active");

          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
          updateFinishState();
        });
      });

      // radios
      document.querySelectorAll('input[type="radio"]').forEach((inp) => {
        inp.addEventListener("change", () => {
          const key = inp.name.replace(/^s_/, "");
          STATE.singleAnswers[key] = inp.value;
          saveDraft();

          try {
            const wrap = document.querySelector(`.segmented[data-seg="${CSS.escape(key)}"]`);
            if (wrap) {
              wrap.querySelectorAll('.segBtn').forEach((b) => b.classList.remove('is-active'));
              const lbl = wrap.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
              if (lbl) lbl.classList.add('is-active');
            }
          } catch {}

          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
          updateFinishState();
        });
      });

      // checkboxes
      document.querySelectorAll('input[type="checkbox"][data-checkbox-key]').forEach((inp) => {
        inp.addEventListener("change", () => {
          const key = inp.getAttribute("data-checkbox-key");
          STATE.checkboxAnswers["_items"] ??= new Set();

          if (inp.checked) STATE.checkboxAnswers["_items"].add(key);
          else STATE.checkboxAnswers["_items"].delete(key);

          saveDraft();
          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
          updateFinishState();
        });
      });

      // hint photo toggle (+)
      document.querySelectorAll("[data-photo-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const k = btn.getAttribute("data-photo-toggle");
          const wrap = document.querySelector(`[data-photo-wrap="${CSS.escape(k)}"]`);
          if (!wrap) return;

          const willOpen = !wrap.classList.contains("open");
          if (willOpen) {
            wrap.classList.add("open");
            btn.textContent = "−";

            const img = wrap.querySelector("img");
            const target = img || wrap;

            const doCenter = () => {
              requestAnimationFrame(() => setTimeout(() => centerIntoView(target), 40));
            };

            if (img && !img.complete) {
              img.addEventListener("load", doCenter, { once: true });
              img.addEventListener("error", doCenter, { once: true });
            }
            doCenter();
          } else {
            wrap.classList.remove("open");
            btn.textContent = "+";
          }
        });
      });

      // note toggle
      document.querySelectorAll("[data-note-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-note-toggle");
          if (!key) return;
          STATE.noteOpen[key] = !STATE.noteOpen[key];
          saveDraft();
          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
        });
      });

      // note text autosize (2 lines -> grows -> scroll)
      document.querySelectorAll("textarea[data-note-text]").forEach((el) => {
        const autoSize = () => {
          try {
            el.style.height = "auto";
            const maxH = parseInt(getComputedStyle(el).maxHeight || "92", 10) || 92;
            const next = Math.min(el.scrollHeight, maxH);
            el.style.height = next + "px";
            el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
          } catch {}
        };

        autoSize();

        el.addEventListener("input", () => {
          const key = el.getAttribute("data-note-text");
          if (!key) return;
          ensureNote(key).text = el.value;
          saveDraft();
          autoSize();
        });
      });

      // note file upload (multiple)
      document.querySelectorAll('input[type="file"][data-note-file]').forEach((inp) => {
        inp.addEventListener("change", async () => {
          const key = inp.getAttribute("data-note-file");
          const files = inp.files ? Array.from(inp.files) : [];
          if (!key || !files.length) return;

          const MAX_FILES = MAX_PHOTOS_PER_ISSUE || 5;
          const MAX_SIZE = MAX_PHOTO_SIZE_BYTES || 4 * 1024 * 1024;

          const n = ensureNote(key);
          const remaining = Math.max(0, MAX_FILES - (n.photos?.length || 0));
          const take = files.slice(0, remaining);

          for (const file of take) {
            if (file.size > MAX_SIZE) {
              alert("Одно из фото слишком большое. Выбери файл до 4 МБ.");
              continue;
            }
            try {
              const dataUrl = await readImageAsDataURL(file);
              n.photos.push(dataUrl);
            } catch {
              alert("Не удалось прочитать одно из фото");
            }
          }

          inp.value = "";
          STATE.noteOpen[key] = true;
          saveDraft();
          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
          updateFinishState();
        });
      });

      // remove one photo
      document.querySelectorAll("[data-note-remove-one]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-note-remove-one");
          const idx = Number(btn.getAttribute("data-idx") || 0);
          if (!key) return;
          const n = ensureNote(key);
          if (Array.isArray(n.photos) && idx >= 0 && idx < n.photos.length) n.photos.splice(idx, 1);
          saveDraft();
          contentEl.innerHTML = renderActiveSectionContent();
          bindHandlers();
          updateFinishState();
        });
      });

      // open modal from note thumbs
      document.querySelectorAll('img.thumb[data-note-thumb]').forEach((img) => {
        img.addEventListener("click", () => {
          const key = img.getAttribute("data-note-thumb");
          const idx = Number(img.getAttribute("data-idx") || 0);
          if (!key) return;
          openImageModal(notePhotos(key), idx);
        });
      });

      // open modal from result thumbs
      document.querySelectorAll('img.thumb[data-res-thumb]').forEach((img) => {
        img.addEventListener("click", () => {
          const key = img.getAttribute("data-res-thumb");
          const idx = Number(img.getAttribute("data-idx") || 0);
          if (!key) return;
          openImageModal(notePhotos(key), idx);
        });
      });
    }

    bindHandlers();
    updateFinishState();

    document.getElementById("back").onclick = () => renderStart();
    document.getElementById("resetDraft").onclick = () => {
      clearDraftForBranch(STATE.branchId);
      renderStart();
    };

    finishBtn.onclick = async () => {
      clearErrors();
      const v = validateAll(singlesBySec, checkboxGroupsBySec, STATE.enabledSections);
      if (!v.ok) {
        paintErrors(v);
        alert("Не заполнены ответы в разделах: " + v.missingSectionTitles.join(", "));
        updateFinishState();
        return;
      }

      const result = computeResult(rows, singlesBySec, checkboxGroupsBySec, STATE.enabledSections);

      try {
        finishBtn.disabled = true;
        setSubmitStatus("Отправляю результаты…");

        const payload = buildSubmitPayload(result);
        // Use submission_id as stable share id for now
        STATE.lastResultId = payload?.submission_id || null;

        await submitToSheet(payload);

        setSubmitStatus("Готово ✅");

        STATE.isFinished = true;
        STATE.lastResult = result;

        setLastCheck(STATE.branchId, { zone: result.zone, percent: result.percent, result_id: STATE.lastResultId || null });
        clearDraftStorageOnly(STATE.branchId);

        renderResultScreen(result, branch);
      } catch (e) {
        finishBtn.disabled = false;
        setSubmitStatus("Не удалось отправить. Проверь интернет и попробуй ещё раз.");
        console.error(e);
        alert("Не удалось отправить результаты в таблицу. Попробуй ещё раз.");
      }
    };
  }

  // ====== BOOT ======
  (async function boot() {
    try {
      if (window.Telegram && Telegram.WebApp) Telegram.WebApp.ready();

      renderStart(true);

      try {
        const f = document.getElementById("submitForm");
        if (f) f.action = SUBMIT_URL;
        console.log("SUBMIT_URL (runtime)", SUBMIT_URL);
      } catch {}

      DATA = await loadJsonp(buildUrlWithParams(DATA_JSONP_URL, { action: "all" }));

      renderStart(false);
    } catch (e) {
      renderError("Не получилось загрузить данные из таблицы", e);
    }
  })();
})();

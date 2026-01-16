/* core/state.js — состояние приложения + черновики + lastCheck */

(function () {
  // ---------- GLOBAL STATE ----------
  window.STATE = {
    city: "",
    fio: "",

    branchId: "",

    enabledSections: [],
    activeSection: "",

    singleAnswers: {}, // key -> "ideal" | "acceptable" | "bad"
    checkboxAnswers: {}, // "_items" -> Set(keys)

    isFinished: false,
    lastResult: null,
    lastResultId: null, // submission_id for share link

    issueNotes: {}, // key -> { text: string, photos: string[] (dataURL) }
    noteOpen: {}, // key -> bool
  };

  // ---------- Telegram helpers ----------
  window.IS_TG = !!(window.Telegram && Telegram.WebApp);

  window.getTgName = function getTgName() {
    try {
      const u = Telegram.WebApp?.initDataUnsafe?.user;
      if (!u) return "";
      return norm([u.last_name, u.first_name].filter(Boolean).join(" ")) || norm(u.username) || "";
    } catch {
      return "";
    }
  };

  // ---------- Notes helpers (with migration) ----------
  window.safeEnsureNote = function safeEnsureNote(key) {
    STATE.issueNotes[key] ??= { text: "", photos: [] };
    const n = STATE.issueNotes[key];

    // migrate: old { photo } -> { photos[] }
    if (n.photo && (!Array.isArray(n.photos) || n.photos.length === 0)) {
      n.photos = [n.photo];
      delete n.photo;
    }
    if (!Array.isArray(n.photos)) n.photos = [];
    if (typeof n.text !== "string") n.text = (n.text ?? "").toString();
    return n;
  };

  window.migrateAllNotes = function migrateAllNotes() {
    try {
      for (const k of Object.keys(STATE.issueNotes || {})) safeEnsureNote(k);
    } catch {}
  };

  window.notePhotos = function notePhotos(key) {
    const n = safeEnsureNote(key);
    return Array.isArray(n.photos) ? n.photos.filter(Boolean) : [];
  };

  // ---------- Draft keys ----------
  window.draftKeyForBranch = function draftKeyForBranch(branchId) {
    return `draft_v3_${norm(branchId) || "no_branch"}`;
  };

  function lastCheckKey(branchId) {
    return `lastcheck_v3_${norm(branchId) || "no_branch"}`;
  }

  // ---------- Draft CRUD ----------
  window.saveDraft = function saveDraft() {
    try {
      const branchId = STATE.branchId;
      if (!branchId) return;

      const serialCheckbox = {};
      for (const [k, set] of Object.entries(STATE.checkboxAnswers || {})) {
        serialCheckbox[k] = Array.isArray(set) ? set : [...(set || [])];
      }

      localStorage.setItem(
        draftKeyForBranch(branchId),
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
  };

  window.loadDraft = function loadDraft(branchId) {
    try {
      const raw = localStorage.getItem(draftKeyForBranch(branchId));
      if (!raw) return null;

      const d = JSON.parse(raw);
      const savedAt = Number(d.savedAt || 0);

      const ttl = typeof DRAFT_TTL_MS !== "undefined" ? DRAFT_TTL_MS : 5 * 60 * 60 * 1000;
      if (!savedAt || Date.now() - savedAt > ttl) {
        localStorage.removeItem(draftKeyForBranch(branchId));
        return null;
      }

      // restore checkbox sets
      const restored = {};
      for (const [k, arr] of Object.entries(d.checkboxAnswers || {})) restored[k] = new Set(arr);
      d.checkboxAnswers = restored;

      // migrate notes
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
  };

  window.clearDraftStorageOnly = function clearDraftStorageOnly(branchId) {
    try {
      if (!branchId) return;
      localStorage.removeItem(draftKeyForBranch(branchId));
    } catch {}
  };

  window.clearDraftForBranch = function clearDraftForBranch(branchId) {
    try {
      if (!branchId) return;
      localStorage.removeItem(draftKeyForBranch(branchId));
    } catch {}

    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = "";
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.issueNotes = {};
    STATE.noteOpen = {};
    // city/fio/branchId/enabledSections пусть останутся — это “контекст”
  };

  // “Новая проверка” — очищаем только ответы, сохраняя мету филиала/города/ФИО
  window.resetCheckKeepMeta = function resetCheckKeepMeta() {
    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = STATE.enabledSections?.[0] || "";
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.issueNotes = {};
    STATE.noteOpen = {};
  };

  // ---------- lastCheck (per branch) ----------
  window.setLastCheck = function setLastCheck(branchId, meta) {
    try {
      if (!branchId) return;
      localStorage.setItem(
        lastCheckKey(branchId),
        JSON.stringify({ ts: new Date().toISOString(), ...(meta || {}) })
      );
    } catch {}
  };

  window.getLastCheck = function getLastCheck(branchId) {
    try {
      const raw = localStorage.getItem(lastCheckKey(branchId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
})();

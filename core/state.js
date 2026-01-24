/* core/state.js — состояние приложения + черновики + lastCheck */

(function () {
  // ---------- GLOBAL STATE ----------
  window.STATE = {
    oblast: "",
    city: "",
    fio: "",

    branchId: "",
    tgUser: null,

    enabledSections: [],
    activeSection: "",
    completedSections: [],

    singleAnswers: {}, // key -> "ideal" | "acceptable" | "bad"
    checkboxAnswers: {}, // "_items" -> Set(keys)

    isFinished: false,
    lastResult: null,
    lastResultId: null, // submission_id for share link
    lastSubmittedAt: "",
    lastBotSendStatus: "", // "sent" | "failed" | "skipped"
    lastBotSendError: "",
    cabinetCache: null, // { items, fetchedAt }

    issueNotes: {}, // key -> { text: string, photos: string[] (dataURL) }
    noteOpen: {}, // key -> bool
    singleAnswerLabels: {}, // key -> human-readable label
  };

  // ---------- Telegram helpers ----------
  window.IS_TG = !!(window.Telegram && Telegram.WebApp);

  try {
    if (window.Telegram?.WebApp?.ready) {
      window.Telegram.WebApp.ready();
    }
  } catch {}

  window.getTgUser = function getTgUser() {
    try {
      const u = Telegram.WebApp?.initDataUnsafe?.user;
      if (!u) return null;
      const name = norm([u.last_name, u.first_name].filter(Boolean).join(" ")) || norm(u.username) || "";
      return {
        id: u.id ?? "",
        username: u.username ?? "",
        first_name: u.first_name ?? "",
        last_name: u.last_name ?? "",
        name,
      };
    } catch {
      return null;
    }
  };

  window.getTgName = function getTgName() {
    const user = window.getTgUser ? window.getTgUser() : null;
    return user?.name || "";
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

  const LAST_DRAFT_BRANCH_KEY = "last_draft_branch_v3";

  window.setLastDraftBranchId = function setLastDraftBranchId(branchId) {
    try {
      const id = norm(branchId);
      if (!id) return;
      localStorage.setItem(LAST_DRAFT_BRANCH_KEY, id);
    } catch {}
  };

  window.getLastDraftBranchId = function getLastDraftBranchId() {
    try {
      return localStorage.getItem(LAST_DRAFT_BRANCH_KEY) || "";
    } catch {
      return "";
    }
  };

  window.clearLastDraftBranchId = function clearLastDraftBranchId(branchId) {
    try {
      const stored = localStorage.getItem(LAST_DRAFT_BRANCH_KEY);
      if (!stored) return;
      if (!branchId || norm(stored) === norm(branchId)) {
        localStorage.removeItem(LAST_DRAFT_BRANCH_KEY);
      }
    } catch {}
  };

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
          oblast: STATE.oblast,
          city: STATE.city,
          fio: STATE.fio,
          branchId: STATE.branchId,
          enabledSections: STATE.enabledSections,
          activeSection: STATE.activeSection,
          completedSections: STATE.completedSections,

          singleAnswers: STATE.singleAnswers,
          checkboxAnswers: serialCheckbox,
          singleAnswerLabels: STATE.singleAnswerLabels,

          savedAt: Date.now(),

          isFinished: STATE.isFinished,
          lastResult: STATE.lastResult,
          lastResultId: STATE.lastResultId,
          lastSubmittedAt: STATE.lastSubmittedAt,
          lastBotSendStatus: STATE.lastBotSendStatus,
          lastBotSendError: STATE.lastBotSendError,

          issueNotes: STATE.issueNotes,
          noteOpen: STATE.noteOpen,
        })
      );
      setLastDraftBranchId(branchId);
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
        clearLastDraftBranchId(branchId);
        return null;
      }

      // restore checkbox sets
      const restored = {};
      for (const [k, arr] of Object.entries(d.checkboxAnswers || {})) restored[k] = new Set(arr);
      d.checkboxAnswers = restored;
      d.singleAnswerLabels = d.singleAnswerLabels || {};
      d.lastSubmittedAt = d.lastSubmittedAt || "";
      d.lastBotSendStatus = d.lastBotSendStatus || "";
      d.lastBotSendError = d.lastBotSendError || "";
      d.completedSections = d.completedSections || [];

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
      clearLastDraftBranchId(branchId);
    } catch {}
  };

  window.clearDraftForBranch = function clearDraftForBranch(branchId) {
    try {
      if (!branchId) return;
      localStorage.removeItem(draftKeyForBranch(branchId));
      clearLastDraftBranchId(branchId);
    } catch {}

    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = "";
    STATE.completedSections = [];
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.lastSubmittedAt = "";
    STATE.lastBotSendStatus = "";
    STATE.lastBotSendError = "";
    STATE.issueNotes = {};
    STATE.noteOpen = {};
    // city/fio/branchId/enabledSections пусть останутся — это “контекст”
  };

  // “Новая проверка” — очищаем только ответы, сохраняя мету филиала/города/ФИО
  window.resetCheckKeepMeta = function resetCheckKeepMeta() {
    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.activeSection = STATE.enabledSections?.[0] || "";
    STATE.completedSections = [];
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.lastSubmittedAt = "";
    STATE.lastBotSendStatus = "";
    STATE.lastBotSendError = "";
    STATE.issueNotes = {};
    STATE.noteOpen = {};
  };

  // “Новая проверка (с нуля)” — очищаем всё, включая город/филиал/ФИО
  window.resetAllState = function resetAllState() {
    STATE.oblast = "";
    STATE.city = "";
    STATE.fio = "";
    STATE.branchId = "";
    STATE.tgUser = null;
    STATE.enabledSections = [];
    STATE.activeSection = "";
    STATE.completedSections = [];
    STATE.singleAnswers = {};
    STATE.checkboxAnswers = {};
    STATE.isFinished = false;
    STATE.lastResult = null;
    STATE.lastResultId = null;
    STATE.lastSubmittedAt = "";
    STATE.lastBotSendStatus = "";
    STATE.lastBotSendError = "";
    STATE.issueNotes = {};
    STATE.noteOpen = {};
    STATE.singleAnswerLabels = {};
    STATE.cabinetCache = null;
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

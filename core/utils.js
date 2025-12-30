/* core/utils.js — утилиты без состояния (safe helpers) */

(function () {
  // ---------- basic ----------
  window.norm = function norm(v) {
    return (v ?? "").toString().trim();
  };

  window.toBool = function toBool(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  };

  window.uniq = function uniq(arr) {
    return [...new Set(arr || [])];
  };

  window.escapeHtml = function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  };

  // ---------- dates ----------
  window.formatRuDateTime = function formatRuDateTime(iso) {
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
  };

  // ---------- urls ----------
  window.buildUrlWithParams = function buildUrlWithParams(baseUrl, params) {
    const u = new URL(baseUrl);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  };

  // ---------- settings from sheet ----------
  // DATA.settings is key/value from Apps Script
  window.getSettingNumber = function getSettingNumber(DATA, key, fallback) {
    const raw = DATA?.settings?.[key];
    const num = Number(String(raw ?? "").replace(",", "."));
    return Number.isFinite(num) ? num : fallback;
  };

  window.getSettingBool = function getSettingBool(DATA, key, fallback) {
    const raw = DATA?.settings?.[key];
    if (raw === undefined || raw === null || raw === "") return fallback;
    if (typeof raw === "boolean") return raw;
    return ["1", "true", "yes", "да"].includes(String(raw).toLowerCase());
  };

  // ---------- google drive link -> direct-ish image ----------
  window.driveToDirect = function driveToDirect(url) {
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

  // ---------- rich text (links + markdown [text](url)) ----------
  window.richTextHtml = function richTextHtml(input) {
    const s0 = norm(input);
    if (!s0) return "";

    let s = escapeHtml(s0);
    s = s.replace(/\r\n|\r|\n/g, "<br>");

    // Markdown links: [text](https://...)
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
  };
})();

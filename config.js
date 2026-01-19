/* config.js — глобальные настройки и fallback (реальные значения берём из листа «Настройки») */

// ====== BUILD / CACHE ======
const APP_VERSION = "2025-12-30-8"; // меняй, чтобы пробивать кэш GitHub Pages

// ====== API (Google Apps Script Web App) ======
// Используй PROD (/exec), не /dev
const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbzUa5g1O9bvZPIJteHK0KAOXwq0QZkHuvwoODZIN8BWBzSXu7hbRFoGRi2kh5Y6ukp0Pg/exec";

// Чтение данных (JSONP)
const DATA_JSONP_URL = API_BASE_URL;

// Отправка результатов (iframe POST)
const SUBMIT_URL = API_BASE_URL;

// ====== FEATURES ======
const FEATURE_SHARE_LINK = true;          // кнопка «Скопировать ссылку на результат»
const FEATURE_PUBLIC_RESULT_VIEW = true;  // открытие результата по ?result=...

// ====== ZONES (FALLBACK; реальные значения — в листе «Настройки») ======
// Ключи в таблице:
// - red_zone_max_percent
// - yellow_zone_max_percent
// - block_green_if_critical
const DEFAULT_RED_ZONE_MAX_PERCENT = 70;         // до какого % включительно зона красная
const DEFAULT_YELLOW_ZONE_MAX_PERCENT = 85;      // до какого % включительно зона жёлтая
const DEFAULT_BLOCK_GREEN_IF_CRITICAL = true;    // если есть крит.ошибки — зелёная зона запрещена

// Серая зона: правило по умолчанию — когда max_score <= 0
// (если захочешь управлять этим из таблицы — добавим ключ и fallback)

// ====== DRAFT ======
const DRAFT_TTL_MS = 5 * 60 * 60 * 1000; // 5 часов хранить черновик по филиалу

// ====== PHOTOS ======
const MAX_PHOTOS_PER_ISSUE = 5;                 // сколько фото можно на 1 ошибку
const MAX_PHOTO_SIZE_BYTES = 4 * 1024 * 1024;   // 4MB

// ====== NETWORK ======
const JSONP_TIMEOUT_MS = 20000; // 20 секунд на загрузку JSONP

// ====== OPTIONAL UI TEXTS ======
const UI_TEXT = {
  startTitle: "Проверка филиала СушиSELL",
  startButton: "Начать",
  loading: "Загружаю данные…",
  submitSending: "Отправляю результаты…",
  submitOk: "Готово ✅",
  submitFail: "Не удалось отправить результаты. Попробуй ещё раз",
};

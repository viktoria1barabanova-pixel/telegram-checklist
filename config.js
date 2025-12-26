// config.js — настройки приложения (URL + пороги + лимиты)

// ====== URLs ======
// Один и тот же деплой для чтения вопросов и записи ответов (как ты хотела)
const DATA_JSONP_URL =
  "https://script.google.com/macros/s/AKfycbzUa5g1O9bvZPIJteHK0KAOXwq0QZkHuvwoODZIN8BWBzSXu7hbRFoGRi2kh5Y6ukp0Pg/exec";

const SUBMIT_URL =
  "https://script.google.com/macros/s/AKfycbzUa5g1O9bvZPIJteHK0KAOXwq0QZkHuvwoODZIN8BWBzSXu7hbRFoGRi2kh5Y6ukp0Pg/exec";

// ====== ZONE THRESHOLDS (percent) ======
const ZONE_RED_MAX = 70;    // 0..70 => red
const ZONE_YELLOW_MAX = 85; // 70..85 => yellow, выше => green
// gray зона — если maxScore <= 0 (логика в app.js)

// ====== Draft / cache ======
const DRAFT_TTL_MS = 5 * 60 * 60 * 1000; // 5 часов

// ====== Upload limits (локально, т.к. фото в таблицу не отправляем) ======
const MAX_PHOTOS_PER_ISSUE = 5;
const MAX_PHOTO_SIZE_BYTES = 4 * 1024 * 1024; // 4 МБ

// ====== JSONP ======
const JSONP_TIMEOUT_MS = 20000;

// ====== Meta ======
const APP_VERSION = "v2";

// config.js — настройки приложения (URL + пороги + лимиты)

// ====== URLs ======
// Один и тот же деплой для чтения вопросов и записи ответов
const DATA_JSONP_URL =
  "https://script.google.com/macros/s/AKfycbzUa5g1O9bvZPIJteHK0KAOXwq0QZkHuvwoODZIN8BWBzSXu7hbRFoGRi2kh5Y6ukp0Pg/exec?action=all";

const SUBMIT_URL =
  "https://script.google.com/macros/s/AKfycbzUa5g1O9bvZPIJteHK0KAOXwq0QZkHuvwoODZIN8BWBzSXu7hbRFoGRi2kh5Y6ukp0Pg/exec";

// ====== ZONE THRESHOLDS (percent) ======
// 0..70  -> red
// 70..85 -> yellow
// >85    -> green
const ZONE_RED_MAX = 70;
const ZONE_YELLOW_MAX = 85;
// gray зона — если maxScore <= 0 (логика в app.js)

// ====== Draft / cache ======
const DRAFT_TTL_MS = 5 * 60 * 60 * 1000; // 5 часов

// ====== Upload limits (локально, фото в таблицу не отправляем) ======
const MAX_PHOTOS_PER_ISSUE = 5;
const MAX_PHOTO_SIZE_BYTES = 4 * 1024 * 1024; // 4 МБ

// ====== JSONP ======
const JSONP_TIMEOUT_MS = 20000;

// ====== Meta ======
// Используется для cache-busting (подставляй в index.html как ?v=APP_VERSION)
const APP_VERSION = "2025-12-29_01";

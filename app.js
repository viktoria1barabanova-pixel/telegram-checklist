/* app.js — bootstrap + routing (small & stable) */

(async function () {
  if (window.__APP_BOOTED__) return;
  window.__APP_BOOTED__ = true;

  function qs(name) {
    try {
      return new URLSearchParams(location.search).get(name);
    } catch {
      return null;
    }
  }

  function setLoading(text) {
    const root = document.getElementById("app") || document.body;
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <div class="hint">${richTextHtml(String(text || UI_TEXT?.loading || "Загружаю…").replace(/\n/g, "<br>"))}</div>
        </div>
      </div>
    `;
  }

  async function boot() {
    setLoading((UI_TEXT?.loading || "Загружаю данные…") + (typeof APP_VERSION !== "undefined" ? ` (v${APP_VERSION})` : ""));

    let data;
    try {
      data = await api.getAll();
    } catch (e) {
      console.error(e);
      setLoading("Не получилось загрузить данные из таблицы 😕\nОбнови страницу и попробуй ещё раз.");
      return;
    }

    // if opened by share link: ?result=SUBMISSION_ID
    const resultId = qs("result");
    if (FEATURE_PUBLIC_RESULT_VIEW && resultId) {
      try {
        setLoading("Открываю результат…");
        const res = await api.getSubmission(resultId);

        // Apps Script helper returns { ok:true, submission, answers, ... }
        if (res && res.ok) {
          renderReadonlyResult(data, res);
          return;
        }

        // fallback
        console.warn("Result not found:", res);
        setLoading("Результат не найден или ссылка устарела 😕");
        return;

      } catch (e) {
        console.error(e);
        setLoading("Не получилось открыть результат 😕");
        return;
      }
    }

    // normal flow
    renderStart(data);
  }

  // start
  try {
    await boot();
  } catch (e) {
    console.error(e);
    setLoading("Что-то пошло не так 😕");
  }
})();

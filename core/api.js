/* core/api.js — работа с Apps Script (JSONP GET + iframe POST) */

(function () {
  // ---------- JSONP loader ----------
  function loadJsonp(url, { timeoutMs } = {}) {
    const t = timeoutMs ?? (typeof JSONP_TIMEOUT_MS !== "undefined" ? JSONP_TIMEOUT_MS : 20000);

    return new Promise((resolve, reject) => {
      const cbName = `__cb_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "no-referrer";
      let done = false;

      // Some deployments ignore ?callback=... and always respond with cb(...)
      // We'll temporarily alias window.cb to our callback to be compatible.
      const prevCb = window.cb;
      const prevDyn = window[cbName];

      const cleanup = () => {
        try {
          if (script && script.parentNode) script.parentNode.removeChild(script);
        } catch {}

        // Restore/cleanup dynamic callback
        try {
          if (prevDyn === undefined) {
            delete window[cbName];
          } else {
            window[cbName] = prevDyn;
          }
        } catch {}

        // Restore/cleanup fixed callback alias
        try {
          if (prevCb === undefined) {
            if (window.cb === window[cbName]) delete window.cb;
          } else {
            window.cb = prevCb;
          }
        } catch {}
      };

      const finishOk = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      const finishErr = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(err);
      };

      const timer = setTimeout(() => finishErr(new Error("JSONP timeout")), t);

      // Define dynamic callback
      window[cbName] = (data) => finishOk(data);

      // Alias fixed callback name (cb) to our dynamic callback (compat)
      window.cb = window[cbName];

      script.onerror = () => finishErr(new Error("JSONP load error"));

      // Prefer server honoring callback=..., but also keep a legacy param name just in case
      const finalUrl = buildUrlWithParams(url, {
        callback: cbName,
        cb: cbName,
        _ts: Date.now(),
      });
      script.src = finalUrl;
      document.body.appendChild(script);
    });
  }

  // ---------- iframe POST (bypass CORS) ----------
  function ensureSubmitPlumbing() {
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
      payloadInput.name = "payload";
      form.appendChild(payloadInput);
    }
    if (!payloadInput.getAttribute("name")) payloadInput.setAttribute("name", "payload");

    let actionInput = document.getElementById("submitAction");
    if (!actionInput) {
      actionInput = document.createElement("input");
      actionInput.type = "hidden";
      actionInput.id = "submitAction";
      actionInput.name = "action";
      form.appendChild(actionInput);
    }
    if (!actionInput.getAttribute("name")) actionInput.setAttribute("name", "action");

    let returnInput = document.getElementById("submitReturn");
    if (!returnInput) {
      returnInput = document.createElement("input");
      returnInput.type = "hidden";
      returnInput.id = "submitReturn";
      returnInput.name = "return";
      form.appendChild(returnInput);
    }
    if (!returnInput.getAttribute("name")) returnInput.setAttribute("name", "return");

    return { frame, form, payloadInput, actionInput, returnInput };
  }

  function iframePostSubmit(payloadObj, { usePostMessage = false, timeoutMs = 20000, loadFallbackMs = 2500 } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const { frame, form, payloadInput, actionInput, returnInput } = ensureSubmitPlumbing();

        const actionUrl = buildUrlWithParams(SUBMIT_URL, { action: "submit" });
        form.action = actionUrl;

        actionInput.value = "submit";
        payloadInput.value = JSON.stringify(payloadObj);
        returnInput.value = usePostMessage ? "postMessage" : "";

        let finished = false;
        let loadFallbackTimer = null;
        let loadSeen = false;

        const cleanup = () => {
          try {
            frame.removeEventListener("load", onLoad);
          } catch {}
          try {
            window.removeEventListener("message", onMsg);
          } catch {}
          try {
            clearTimeout(timer);
            if (loadFallbackTimer) clearTimeout(loadFallbackTimer);
          } catch {}
        };

        const onLoad = () => {
          if (finished) return;
          if (usePostMessage) {
            // If we expected postMessage, allow a short fallback after load.
            if (!loadSeen) {
              loadSeen = true;
              loadFallbackTimer = setTimeout(() => {
                if (finished) return;
                finished = true;
                cleanup();
                resolve({ ok: true, via: "load" });
              }, loadFallbackMs);
            }
            return;
          }
          finished = true;
          cleanup();
          resolve({ ok: true });
        };

        const onMsg = (ev) => {
          if (finished) return;
          // Accept any origin (Apps Script iframe). If you want stricter later — add origin check.
          const data = ev?.data;
          if (!data || typeof data !== "object") return;
          if (data.ok !== true && data.result_id === undefined) return;
          finished = true;
          cleanup();
          resolve(data);
        };

        frame.addEventListener("load", onLoad);
        if (usePostMessage) window.addEventListener("message", onMsg);

        const timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(new Error("Submit timeout"));
        }, timeoutMs);

        form.submit();
      } catch (e) {
        reject(e);
      }
    });
  }

  // ---------- Public API ----------
  window.api = {
    // GET all app data (sections, checklist, branches, settings)
    async getAll() {
      const url = buildUrlWithParams(DATA_JSONP_URL, { action: "all" });
      return await loadJsonp(url);
    },

    // GET a single submission with answers (for share-link view)
    async getSubmission(submissionId) {
      const id = norm(submissionId);
      const url = buildUrlWithParams(DATA_JSONP_URL, { action: "submission", submission_id: id });
      return await loadJsonp(url);
    },

    // GET submissions list for current Telegram user
    async getMySubmissions(tgUserId, { limit } = {}) {
      const id = norm(tgUserId);
      const params = { action: "my_submissions", tg_user_id: id };
      if (limit !== undefined && limit !== null && limit !== "") params.limit = limit;
      const url = buildUrlWithParams(DATA_JSONP_URL, params);
      return await loadJsonp(url);
    },

    // POST submit
    async submit(payloadObj, { usePostMessage = false } = {}) {
      return await iframePostSubmit(payloadObj, { usePostMessage });
    },

    // Expose JSONP loader if needed
    _loadJsonp: loadJsonp,
  };
})();

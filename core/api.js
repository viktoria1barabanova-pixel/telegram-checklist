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
            // If we introduced it, remove it
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

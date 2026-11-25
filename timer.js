/* ============================================================
   STOPWATCH & TIMER (Teacher Tools)
   Timer (countdown with alarm), Stopwatch (with laps), Intervals (work / break rounds).
   Keeps running if you leave the page; full screen for the projector.
   Space = start / pause · R = reset · L = lap · F = full screen
   ============================================================ */
(function () {
  const STORE = "teacher_timer_v1";
  const now = () => Date.now();
  const D = () => ({
    mode: "timer",
    t: { dur: 300000, endAt: 0, left: 300000, running: false, label: "", done: false },
    sw: { startAt: 0, acc: 0, running: false, laps: [] },
    iv: { work: 45, rest: 15, rounds: 8, phase: "ready", round: 0, endAt: 0, left: 0, running: false },
    sound: "chime", volume: 0.7, ring: "until", flash: true, after: "stop"
  });
  let S = D();
  try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.t) S = Object.assign(D(), s, { t: Object.assign(D().t, s.t), sw: Object.assign(D().sw, s.sw), iv: Object.assign(D().iv, s.iv) }); } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} };

  /* ---------- sound ---------- */
  let ac = null;
  const audio = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } if (ac && ac.state === "suspended") ac.resume(); return ac; };
  function tone(freq, start, len, type, vol) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + start;
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol == null ? S.volume : vol) * 0.6), t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + len + 0.05);
  }
  const SOUNDS = {
    chime: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.16, 0.9)); },
    bell: () => { [0, 0.9].forEach(s => { tone(880, s, 1.6, "sine"); tone(1760, s, 1.0, "sine", S.volume * 0.4); tone(2640, s, 0.6, "sine", S.volume * 0.2); }); },
    beep: () => { [0, 0.25, 0.5, 0.75].forEach(s => tone(1000, s, 0.15, "square", S.volume * 0.5)); },
    gentle: () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.35, 1.4, "triangle")); },
    none: () => {}
  };
  const SOUND_NAMES = [["chime", "Chime"], ["bell", "Bell"], ["beep", "Beeps"], ["gentle", "Gentle"], ["none", "Silent"]];
  let ringing = null;
  let ringEnd = null;
  function startAlarm(onEnd) {
    stopAlarm();
    const play = () => (SOUNDS[S.sound] || SOUNDS.chime)();
    play();
    if (S.ring === "until") ringing = setInterval(play, 2600);
    else if (S.ring === "three") { let n = 1; ringing = setInterval(() => { play(); if (++n >= 3) { clearInterval(ringing); ringing = null; ringEnd = setTimeout(() => onEnd && onEnd(), 2800); } }, 2600); }
    else ringEnd = setTimeout(() => onEnd && onEnd(), 3000);
  }
  function stopAlarm() { if (ringing) clearInterval(ringing); ringing = null; clearTimeout(ringEnd); ringEnd = null; }
  const tick = () => tone(1200, 0, 0.08, "square", S.volume * 0.35);

  /* ---------- time formatting ---------- */
  function fmt(ms, cs) {
    const neg = ms < 0; ms = Math.abs(ms);
    const tot = cs ? Math.floor(ms / 10) : Math.ceil(ms / 1000) * 100;
    const h = Math.floor(tot / 360000), m = Math.floor(tot / 6000) % 60, s = Math.floor(tot / 100) % 60, c = tot % 100;
    const p = n => String(n).padStart(2, "0");
    return (neg ? "+" : "") + (h ? h + ":" + p(m) : (cs ? p(m) : m)) + ":" + p(s) + (cs ? "." + p(c) : "");
  }
  const swNow = () => S.sw.acc + (S.sw.running ? now() - S.sw.startAt : 0);
  const tLeft = () => S.t.running ? S.t.endAt - now() : S.t.left;

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }
  const ICO = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    lap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
  };
  let root, stage, digits, sub, ring, ringFg, controls, below, raf = null, wake = null;
  const R = 140, C = 2 * Math.PI * R;

  function open(container) {
    root = container; root.innerHTML = "";
    const modeBar = h("div", { class: "pl-seg tm-modes", role: "tablist" }, [["timer", "Timer"], ["stopwatch", "Stopwatch"], ["intervals", "Intervals"]].map(([k, l]) =>
      h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": S.mode === k ? "true" : "false", onclick: () => { S.mode = k; save(); stopAlarm(); open(root); } }, l)));
    ring = h("div", { class: "tm-ring", "aria-hidden": "true",
      html: `<svg viewBox="0 0 320 320"><circle cx="160" cy="160" r="${R}" class="tm-ring-bg"/><circle cx="160" cy="160" r="${R}" class="tm-ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 160 160)"/></svg>` });
    ringFg = ring.querySelector(".tm-ring-fg");
    digits = h("div", { class: "tm-digits", "aria-live": "off" });
    sub = h("div", { class: "tm-sub" });
    controls = h("div", { class: "tm-controls" });
    stage = h("div", { class: "cr-stage tm-stage tm-" + S.mode }, h("div", { class: "tm-face" }, ring, h("div", { class: "tm-center" }, sub, digits)), controls);
    below = h("div");
    root.append(
      h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Stopwatch & Timer"),
        h("p", { class: "help", style: "margin:0" }, "Space = start / pause · R = reset · L = lap · F = full screen. Keeps running if you leave this page.")),
      h("div", { class: "card tm-card" }, modeBar, stage, below),
      soundCard());
    ({ timer: buildTimer, stopwatch: buildStopwatch, intervals: buildIntervals })[S.mode]();
    loop();
  }

  /* ---------- shared bits ---------- */
  const btn = (cls, icon, label, fn, title) => h("button", { type: "button", class: "tm-btn " + cls, onclick: fn, title: title || label, "aria-label": label }, h("span", { html: icon }), h("span", null, label));
  function fsBtn() {
    return btn("ghost", ICO.full, "Full screen", toggleFs);
  }
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }
  document.addEventListener("fullscreenchange", async () => {
    if (document.fullscreenElement && navigator.wakeLock) { try { wake = await navigator.wakeLock.request("screen"); } catch {} }
    else if (wake) { try { wake.release(); } catch {} wake = null; }
  });
  function setRing(frac) { ringFg.style.strokeDashoffset = String(C * (1 - Math.max(0, Math.min(1, frac)))); }
  function title(text) { if (!document.body.dataset.baseTitle) document.body.dataset.baseTitle = document.title.replace(/^⏱.*?– |^⏰.*?– /, "");
    document.title = text ? text + " – " + document.body.dataset.baseTitle : document.body.dataset.baseTitle; }

  /* ---------- TIMER ---------- */
  function buildTimer() {
    const t = S.t;
    const presets = h("div", { class: "tm-presets" }, [1, 2, 3, 5, 10, 15, 20, 30, 45, 60].map(m =>
      h("button", { type: "button", class: "pl-seg-btn", onclick: () => setDur(m * 60000) }, m < 60 ? m + " min" : "1 hr")));
    const inp = (v, max, lab) => h("input", { type: "number", min: "0", max, value: v, class: "tm-in", "aria-label": lab, inputmode: "numeric" });
    const tot = Math.round(t.dur / 1000);
    const hh = inp(Math.floor(tot / 3600), 23, "Hours"), mm = inp(Math.floor(tot / 60) % 60, 59, "Minutes"), ss = inp(tot % 60, 59, "Seconds");
    [hh, mm, ss].forEach(i => i.addEventListener("change", () => setDur(((+hh.value || 0) * 3600 + (+mm.value || 0) * 60 + (+ss.value || 0)) * 1000)));
    const label = h("input", { type: "text", class: "tm-label-in", placeholder: "Label (optional) — e.g. Reading time", value: t.label, maxlength: "60" });
    label.addEventListener("input", () => { t.label = label.value; save(); });
    const after = h("div", { class: "tm-after" }, h("span", null, "When time's up:"),
      h("div", { class: "pl-seg" }, [["stop", "Stop at 0:00"], ["overtime", "Keep counting"], ["repeat", "Start again"]].map(([v, l]) =>
        h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": S.after === v ? "true" : "false", title: v === "stop" ? "The alarm rings, then the timer ends" : v === "overtime" ? "The alarm rings and the timer counts how long ago it ended" : "A short chime, then it runs again for the same time",
          onclick: e => { S.after = v; save(); e.currentTarget.parentNode.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === e.currentTarget ? "true" : "false")); drawTimerControls(); } }, l))));
    below.append(
      after,
      h("div", { class: "tm-set" },
        h("div", { class: "tm-hms" }, h("label", null, hh, h("span", null, "hr")), h("label", null, mm, h("span", null, "min")), h("label", null, ss, h("span", null, "sec"))),
        presets),
      label);
    function setDur(ms) { stopAlarm(); t.dur = Math.max(1000, Math.min(ms, 24 * 3600000 - 1000)); t.left = t.dur; t.running = false; t.done = false; t.finished = false; t.reps = 1; save(); open(root); }
    drawTimerControls();
  }
  function drawTimerControls() {
    const t = S.t; controls.innerHTML = "";
    if (t.done) controls.append(btn("main stop", ICO.stop, "Stop", S.after === "stop" ? finish : () => { stopAlarm(); t.done = false; t.running = false; t.left = t.dur; save(); drawTimerControls(); }));
    else controls.append(t.running ? btn("main", ICO.pause, "Pause", pauseTimer) : btn("main", ICO.play, t.finished ? "Start again" : t.left < t.dur ? "Resume" : "Start", startTimer));
    controls.append(
      btn("ghost", ICO.reset, "Reset", resetTimer),
      h("button", { type: "button", class: "tm-btn ghost small", onclick: () => addTime(-60000), title: "1 minute less" }, "−1 min"),
      h("button", { type: "button", class: "tm-btn ghost small", onclick: () => addTime(60000), title: "1 minute more" }, "+1 min"),
      fsBtn());
  }
  // time's up: stop at 0:00, keep counting (overtime), or start again
  function timeUp() {
    const t = S.t;
    if (S.after === "repeat") { t.reps = (t.reps || 1) + 1; while (t.endAt <= now()) t.endAt += t.dur; (SOUNDS[S.sound] || SOUNDS.chime)(); save(); return; }
    t.done = true; t.running = false; t.left = 0; t.doneAt = t.endAt; save();
    startAlarm(S.after === "stop" ? finish : null);
    if (controls) drawTimerControls();
  }
  function finish() { const t = S.t; stopAlarm(); t.done = false; t.finished = true; t.running = false; t.left = t.dur; save(); if (controls) drawTimerControls(); }
  function startTimer() { audio(); const t = S.t; if (t.left <= 0 || t.finished) t.left = t.dur; if (t.left === t.dur) t.reps = 1; t.endAt = now() + t.left; t.running = true; t.done = false; t.finished = false; save(); drawTimerControls(); }
  function pauseTimer() { const t = S.t; t.left = t.endAt - now(); t.running = false; save(); drawTimerControls(); }
  function resetTimer() { stopAlarm(); const t = S.t; t.running = false; t.done = false; t.finished = false; t.reps = 1; t.left = t.dur; save(); drawTimerControls(); }
  function addTime(ms) {
    const t = S.t;
    if (t.done || t.finished) { stopAlarm(); t.done = false; t.finished = false; t.endAt = now() + Math.max(ms, 0); t.running = ms > 0; t.left = Math.max(ms, 0); }
    else if (t.running) t.endAt = Math.max(now() + 1000, t.endAt + ms);
    else { t.left = Math.max(1000, t.left + ms); if (t.left > t.dur) t.dur = t.left; }
    save(); drawTimerControls();
  }

  /* ---------- STOPWATCH ---------- */
  function buildStopwatch() {
    setRing(0);
    const list = h("ol", { class: "tm-laps" });
    below.append(h("div", { class: "tm-laps-head" }, h("strong", null, "Laps"), h("span", { class: "pj-tools-btns" },
      h("button", { type: "button", class: "small-btn", onclick: () => { const txt = S.sw.laps.map((l, i) => `Lap ${i + 1}\t${fmt(l.split, true)}\t${fmt(l.total, true)}`).join("\n"); navigator.clipboard && navigator.clipboard.writeText(txt); } }, "Copy laps"))), list);
    drawLaps(list);
    drawSwControls();
  }
  function drawLaps(list) {
    list = list || root.querySelector(".tm-laps"); if (!list) return;
    list.innerHTML = "";
    const laps = S.sw.laps;
    if (!laps.length) { list.appendChild(h("li", { class: "th-none" }, "Press Lap (or L) while it's running.")); return; }
    const splits = laps.map(l => l.split), best = Math.min(...splits), worst = Math.max(...splits);
    laps.slice().reverse().forEach((l, ri) => { const i = laps.length - 1 - ri;
      list.appendChild(h("li", { class: laps.length > 2 && l.split === best ? "best" : laps.length > 2 && l.split === worst ? "worst" : "" },
        h("span", null, "Lap " + (i + 1)), h("strong", null, fmt(l.split, true)), h("small", null, fmt(l.total, true)))); });
  }
  function drawSwControls() {
    const sw = S.sw; controls.innerHTML = "";
    controls.append(
      sw.running ? btn("main", ICO.pause, "Pause", () => { sw.acc = swNow(); sw.running = false; save(); drawSwControls(); }) : btn("main", ICO.play, sw.acc ? "Resume" : "Start", () => { sw.startAt = now(); sw.running = true; save(); drawSwControls(); }),
      btn("ghost", ICO.lap, "Lap", lap),
      btn("ghost", ICO.reset, "Reset", () => { sw.running = false; sw.acc = 0; sw.laps = []; save(); drawSwControls(); drawLaps(); }),
      fsBtn());
  }
  function lap() { const sw = S.sw; if (!sw.running) return; const total = swNow(), prev = sw.laps.length ? sw.laps[sw.laps.length - 1].total : 0; sw.laps.push({ total, split: total - prev }); save(); drawLaps(); tick(); }

  /* ---------- INTERVALS ---------- */
  function buildIntervals() {
    const iv = S.iv;
    const num = (k, lab, unit, max) => { const i = h("input", { type: "number", min: "1", max, value: iv[k], class: "tm-in small", "aria-label": lab }); i.addEventListener("change", () => { iv[k] = Math.max(1, Math.min(+max, Math.round(+i.value || 1))); i.value = iv[k]; resetIv(); }); return h("label", { class: "tm-iv-f" }, h("span", null, lab), i, h("small", null, unit)); };
    below.append(h("div", { class: "tm-iv-set" }, num("work", "Work", "seconds", 3600), num("rest", "Break", "seconds", 3600), num("rounds", "Rounds", "", 99)),
      h("div", { class: "tm-presets" }, [["Quick 30/10 ×6", 30, 10, 6], ["45/15 ×8", 45, 15, 8], ["Focus 25 min / 5 ×4", 1500, 300, 4], ["Stations 5 min / 30s ×6", 300, 30, 6]].map(([l, w, r, n]) =>
        h("button", { type: "button", class: "pl-seg-btn", onclick: () => { Object.assign(iv, { work: w, rest: r, rounds: n }); resetIv(); open(root); } }, l))),
      h("p", { class: "help" }, "Short beeps count down the last 3 seconds of each part; the alarm sound plays at the very end."));
    drawIvControls();
  }
  function resetIv() { const iv = S.iv; iv.phase = "ready"; iv.round = 0; iv.running = false; iv.left = iv.work * 1000; save(); drawIvControls(); }
  function drawIvControls() {
    const iv = S.iv; controls.innerHTML = "";
    controls.append(
      iv.phase === "done" ? btn("main stop", ICO.stop, "Stop", () => { stopAlarm(); resetIv(); }) :
      iv.running ? btn("main", ICO.pause, "Pause", () => { iv.left = iv.endAt - now(); iv.running = false; save(); drawIvControls(); })
        : btn("main", ICO.play, iv.phase === "ready" ? "Start" : "Resume", () => { audio(); if (iv.phase === "ready") { iv.phase = "work"; iv.round = 1; iv.left = iv.work * 1000; tone(880, 0, 0.3); } iv.endAt = now() + iv.left; iv.running = true; save(); drawIvControls(); }),
      btn("ghost", ICO.reset, "Reset", () => { stopAlarm(); resetIv(); }),
      h("button", { type: "button", class: "tm-btn ghost small", onclick: () => { if (iv.phase === "ready" || iv.phase === "done") return; iv.endAt = now(); iv.left = 0; } }, "Skip ›"),
      fsBtn());
  }
  let lastBeep = -1;
  function ivStep() {
    const iv = S.iv;
    if (!iv.running) return iv.left;
    let left = iv.endAt - now();
    const sec = Math.ceil(left / 1000);
    if (sec <= 3 && sec >= 1 && sec !== lastBeep) { lastBeep = sec; tick(); }
    if (left <= 0) {
      lastBeep = -1;
      if (iv.phase === "work" && iv.round >= iv.rounds) { iv.phase = "done"; iv.running = false; iv.left = 0; save(); startAlarm(); drawIvControls(); return 0; }
      if (iv.phase === "work") { iv.phase = "rest"; left = iv.rest * 1000; tone(660, 0, 0.5, "triangle"); }
      else { iv.phase = "work"; iv.round++; left = iv.work * 1000; tone(880, 0, 0.3); tone(1175, 0.15, 0.4); }
      iv.endAt = now() + left; iv.left = left; save();
    }
    return left;
  }

  /* ---------- drawing loop ---------- */
  function loop() {
    cancelAnimationFrame(raf);
    const frame = () => {
      if (!root || !root.isConnected || root.offsetParent === null && !document.fullscreenElement) { raf = requestAnimationFrame(frame); return; }
      if (S.mode === "timer") {
        const t = S.t, left = tLeft();
        if (t.running && left <= 0 && !t.done) timeUp();
        const shown = t.done ? -(now() - (t.doneAt || now())) : left;
        const rep = S.after === "repeat" && (t.reps || 1) > 1 ? " · Round " + t.reps : "";
        digits.textContent = t.done || t.finished ? "0:00" : fmt(shown);
        sub.textContent = t.done ? (t.label || "Time's up!") + (S.after === "overtime" && shown < -1000 ? "  " + fmt(shown) : "")
          : t.finished ? (t.label ? t.label + " · " : "") + "Done"
          : (t.label || (t.running ? "Timer" : left < t.dur ? "Paused" : "Timer")) + rep;
        stage.classList.toggle("done", t.done); stage.classList.toggle("flash", t.done && S.flash);
        stage.classList.toggle("low", !t.done && t.running && left <= 10000);
        setRing(t.done || t.finished ? 0 : left / t.dur);
        title(t.running ? "⏱ " + fmt(left) : t.done ? "⏰ Time's up!" : "");
      } else if (S.mode === "stopwatch") {
        const v = swNow(); digits.textContent = fmt(v, true); sub.textContent = S.sw.running ? "Stopwatch" : v ? "Paused" : "Stopwatch";
        setRing((v % 60000) / 60000);
        title(S.sw.running ? "⏱ " + fmt(v, false) : "");
      } else {
        const iv = S.iv, left = ivStep(), dur = (iv.phase === "rest" ? iv.rest : iv.work) * 1000;
        digits.textContent = iv.phase === "done" ? "Done!" : fmt(iv.phase === "ready" ? iv.work * 1000 : left);
        sub.textContent = iv.phase === "ready" ? `${iv.rounds} rounds · ${iv.work}s work / ${iv.rest}s break` : iv.phase === "done" ? "All rounds finished" : `${iv.phase === "work" ? "Work" : "Break"} · Round ${iv.round} of ${iv.rounds}`;
        stage.classList.toggle("rest", iv.phase === "rest"); stage.classList.toggle("done", iv.phase === "done"); stage.classList.toggle("flash", iv.phase === "done" && S.flash);
        setRing(iv.phase === "ready" ? 1 : iv.phase === "done" ? 0 : left / dur);
        title(iv.running ? "⏱ " + fmt(left) + (iv.phase === "rest" ? " break" : "") : "");
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  // keep the alarm on time even when the tab is in the background
  setInterval(() => {
    if (S.mode === "timer" && S.t.running && tLeft() <= 0 && !S.t.done) timeUp();
    if (S.mode === "intervals" && S.iv.running) ivStep();
  }, 500);

  /* ---------- sound settings ---------- */
  function soundCard() {
    const sel = h("select", { class: "pl-select", "aria-label": "Alarm sound" }, SOUND_NAMES.map(([v, l]) => h("option", { value: v, selected: S.sound === v ? true : null }, l)));
    sel.addEventListener("change", () => { S.sound = sel.value; save(); (SOUNDS[S.sound] || SOUNDS.chime)(); });
    const vol = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: S.volume, "aria-label": "Volume" });
    vol.addEventListener("change", () => { S.volume = +vol.value; save(); (SOUNDS[S.sound] || SOUNDS.chime)(); });
    const ringSel = h("select", { class: "pl-select", "aria-label": "How long the alarm rings" }, [["once", "Once"], ["three", "3 times"], ["until", "Until I press Stop"]].map(([v, l]) => h("option", { value: v, selected: S.ring === v ? true : null }, l)));
    ringSel.addEventListener("change", () => { S.ring = ringSel.value; save(); });
    const flash = h("input", { type: "checkbox" }); flash.checked = S.flash; flash.addEventListener("change", () => { S.flash = flash.checked; save(); });
    return h("details", { class: "card tm-sound" }, h("summary", null, "Alarm sound & settings"),
      h("div", { class: "tm-sound-grid" },
        h("label", null, h("span", null, "Sound"), sel),
        h("label", null, h("span", null, "Volume"), vol),
        h("label", null, h("span", null, "Ring"), ringSel),
        h("label", { class: "check-line" }, flash, " Flash the screen when time is up")),
      h("button", { type: "button", class: "small-btn", onclick: () => { audio(); (SOUNDS[S.sound] || SOUNDS.chime)(); } }, "▶ Test sound"));
  }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", e => {
    if (!root || (root.offsetParent === null && !document.fullscreenElement) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || "")) || e.target.isContentEditable) return;
    const main = controls && controls.querySelector(".tm-btn.main");
    if (e.code === "Space" || e.key === "Enter") { if (main) { e.preventDefault(); main.click(); } }
    else if (e.key === "r" || e.key === "R") { const b = [...controls.querySelectorAll(".tm-btn")].find(x => /Reset/.test(x.textContent)); if (b) b.click(); }
    else if ((e.key === "l" || e.key === "L") && S.mode === "stopwatch") lap();
    else if (e.key === "f" || e.key === "F") toggleFs();
  });

  window.TeacherTimer = { open, _t: { fmt } };
})();

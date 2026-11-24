/* ============================================================
   PHONE LOG (Teacher Area → Teacher Tools)
   Saved ONLY in this browser on this device (family information
   never goes to GitHub). Use "Download backup" to keep a copy.
   ============================================================ */
(function () {
  const STORE = "teacher_phone_log_v1";
  const STUDENTS = "classroom_students_v1";          // shared with Classroom Tools

  /* Everything below can be changed in the Settings tab. */
  const DEFAULTS = () => ({
    cats: [
      { key: "nachas", label: "Nachas", color: "#2f8f57", subs: [] },
      { key: "social", label: "Social/emotional", color: "#7c3aed", subs: ["Friendships", "Confidence", "Worry/anxiety", "Upset/not himself", "Frustration", "Recess/lunch", "Changes at home"] },
      { key: "behavior", label: "Behavior", color: "#c0392b", subs: ["Disrupting class", "Not following directions", "Off task", "Respect", "Physical with others", "Unkind words", "Tired/lethargic"] },
      { key: "academics", label: "Academics", color: "#2563eb", subs: ["Kriah", "Chumash", "Homework", "Incomplete classwork", "Test/quiz", "Focus/participation"] }
    ],
    results: ["Spoke", "Left message", "No answer", "Email sent"],
    who: ["Mother", "Father", "Both"],
    when: [{ label: "1 week", n: 1, unit: "weeks" }, { label: "2 weeks", n: 2, unit: "weeks" }, { label: "1 month", n: 1, unit: "months" }],
    greenWeeks: 2,
    dueWeeks: 6
  });
  const tint = c => (/^#[0-9a-f]{6}$/i.test(c) ? c + "1f" : "#f3f1ec");
  const CATS = () => S.settings.cats.filter(c => !c.removed).map(c => Object.assign({ bg: tint(c.color) }, c));
  const CATX = k => { const c = S.settings.cats.find(x => x.key === k); return c ? Object.assign({ bg: tint(c.color) }, c) : { key: k, label: k, color: "#8a867d", bg: "#f3f1ec", subs: [] }; };
  const CAT = new Proxy({}, { get: (_, k) => CATX(k) });
  const SUBS = new Proxy({}, { get: (_, k) => () => CATX(k).subs || [] });
  const RESULTS_ = () => S.settings.results.length ? S.settings.results : ["Spoke"];
  const WHO_ = () => S.settings.who;
  const WHEN_ = () => S.settings.when;
  const wk = n => `${n} week${n === 1 ? "" : "s"}`;
  const GREEN = () => (S.settings.greenWeeks || 2) * 7;
  const DUE = () => (S.settings.dueWeeks || 6) * 7;

  /* ---------- data ---------- */
  let S = { calls: [], settings: DEFAULTS() };
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.calls)) S = Object.assign({ calls: [] }, s); } catch {}
    if (!S.settings) {                                    // first time: start from defaults, keep old subject list
      S.settings = DEFAULTS();
      if (Array.isArray(S.subjects) && S.subjects.length) {
        const ac = S.settings.cats.find(c => c.key === "academics");
        ac.subs = [...S.subjects, ...ac.subs.filter(x => !["Kriah", "Chumash"].includes(x))];
      }
    }
    delete S.subjects;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} }
  function students() {
    try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; }
  }
  function setStudents(names) {
    let absent = [];
    try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); if (s && Array.isArray(s.absent)) absent = s.absent.filter(n => names.includes(n)); } catch {}
    try { localStorage.setItem(STUDENTS, JSON.stringify({ names, absent })); } catch {}
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const todayStr = () => nowLocal().slice(0, 10);
  const parseDay = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const dayDiff = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);   // b - a in days
  const addDue = (ts, w) => {
    const d = parseDay(ts);
    if (w.unit === "months") d.setMonth(d.getMonth() + w.n); else d.setDate(d.getDate() + w.n * (w.unit === "weeks" ? 7 : 1));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtDay = s => parseDay(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const fmtShort = s => parseDay(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtTime = ts => { const [h, m] = ts.slice(11, 16).split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
  function ago(days) {
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    return `${Math.round(days / 30)} months ago`;
  }

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.entries(v).forEach(([sk, sv]) => sk.startsWith("--") ? e.style.setProperty(sk, sv) : (e.style[sk] = sv));
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(k => { if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); });
    return e;
  }
  const lastContact = name => {
    let best = null;
    S.calls.forEach(c => { if (c.student === name && (!best || c.ts > best.ts)) best = c; });
    return best;
  };
  const openFollowUps = () => S.calls.filter(c => c.followUp && !c.followUp.done)
    .sort((a, b) => (a.followUp.due || "9999") < (b.followUp.due || "9999") ? -1 : (a.followUp.due || "9999") > (b.followUp.due || "9999") ? 1 : a.ts < b.ts ? -1 : 1);
  function tags(call, small) {
    const box = h("div", { class: "pl-tags" + (small ? " small" : "") });
    (call.cats || []).forEach(k => {
      const c = CAT[k]; if (!c) return;
      box.appendChild(h("span", { class: "pl-tag", style: { background: c.color, borderColor: c.color, color: "#fff" } }, c.label));
      ((call.subs || {})[k] || []).forEach(s => box.appendChild(h("span", { class: "pl-tag", style: { background: c.bg, borderColor: c.color, color: c.color } }, s)));
    });
    return box;
  }
  function stripe(call) {
    const cols = (call.cats || []).map(k => CAT[k] && CAT[k].color).filter(Boolean);
    if (!cols.length) return "#c9c4b8";
    if (cols.length === 1) return cols[0];
    const step = 100 / cols.length;
    return `linear-gradient(180deg, ${cols.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`).join(", ")})`;
  }
  function describe(call) {
    return [fmtDay(call.ts) + " · " + fmtTime(call.ts), call.result, call.spoke ? "with " + call.spoke : ""].filter(Boolean).join(" · ");
  }

  /* ---------- toast with undo ---------- */
  let toastTimer = null;
  function toast(text, undo) {
    let t = document.getElementById("pl-toast");
    if (t) t.remove();
    clearTimeout(toastTimer);
    t = h("div", { id: "pl-toast", class: "pl-toast", role: "status" }, h("span", null, text));
    if (undo) t.appendChild(h("button", { type: "button", onclick: () => { undo(); t.remove(); } }, "Undo"));
    document.body.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), 6500);
  }
  function snapshotUndo(msg) {
    const before = JSON.stringify(S);
    return () => toast(msg, () => { S = JSON.parse(before); save(); refresh(); toast("Undone."); });
  }

  /* ---------- printing ---------- */
  function printSheet(title, sub, body) {
    const old = document.getElementById("print-area"); if (old) old.remove();
    const area = h("div", { id: "print-area" }, h("h1", null, title), h("p", { class: "print-sub" }, sub), body);
    document.body.appendChild(area);
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); area.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(() => { if (!matchMedia("print").matches) done(); }, 1000);
  }
  function printCalls(title, calls, extra) {
    const body = h("div", { class: "pl-print" });
    let day = "";
    calls.forEach(c => {
      if (c.ts.slice(0, 10) !== day) { day = c.ts.slice(0, 10); body.appendChild(h("h2", null, fmtDay(day))); }
      const cats = (c.cats || []).map(k => CAT[k].label + (((c.subs || {})[k] || []).length ? ` (${c.subs[k].join(", ")})` : "")).join("; ");
      body.appendChild(h("div", { class: "pl-print-row" },
        h("p", null, h("strong", null, c.student), ` — ${fmtTime(c.ts)} · ${c.result}${c.spoke ? " · with " + c.spoke : ""}`),
        cats ? h("p", null, cats) : null,
        c.note ? h("p", { class: "note" }, c.note) : null,
        c.followUp ? h("p", null, c.followUp.done ? "Follow-up: done" : "Follow-up: " + (c.followUp.due ? "due " + fmtShort(c.followUp.due) : "no date")) : null));
    });
    if (!calls.length) body.appendChild(h("p", null, "No calls to show."));
    printSheet(title, [new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), `${calls.length} entr${calls.length === 1 ? "y" : "ies"}`, extra].filter(Boolean).join(" · "), body);
  }

  /* ---------- the call form ---------- */
  function openForm(opts) {
    opts = opts || {};
    const base = opts.edit || {};
    const st = {
      student: opts.student || base.student || "",
      result: base.result || RESULTS_()[0],
      cats: new Set(base.cats || (opts.from ? opts.from.cats : [])),
      subs: JSON.parse(JSON.stringify(base.subs || (opts.from ? opts.from.subs : {}) || {})),
      spoke: base.spoke || "",
      note: base.note || "",
      follow: false, when: null,
      ts: nowLocal()
    };
    const overlay = h("div", { class: "pl-overlay", onclick: e => { if (e.target === overlay) close(); } });
    const form = h("form", { class: "pl-form", "aria-label": "Log a call" });
    overlay.appendChild(form);
    function close() { overlay.remove(); document.removeEventListener("keydown", esc); }
    const esc = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);

    const seg = (items, get, set, allowNone) => {
      const row = h("div", { class: "pl-seg" });
      items.forEach(v => row.appendChild(h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": get() === v ? "true" : "false",
        onclick: () => { set(allowNone && get() === v ? "" : v); draw(); } }, v)));
      return row;
    };
    function draw() {
      form.innerHTML = "";
      const head = h("div", { class: "pl-form-head" },
        h("div", null, h("small", null, opts.from ? "Follow-up call" : "Log a call"), h("h2", null, st.student || "Choose a student")),
        h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: close }, "×"));
      form.appendChild(head);
      if (!opts.student && !base.student) {
        const sel = h("select", { class: "pl-select", onchange: e => { st.student = e.target.value; draw(); } },
          h("option", { value: "" }, "Choose a student…"), students().map(n => h("option", { value: n, selected: n === st.student ? true : null }, n)));
        form.appendChild(sel);
      }
      form.appendChild(h("p", { class: "pl-label" }, "Result"));
      form.appendChild(seg(RESULTS_(), () => st.result, v => st.result = v || RESULTS_()[0]));

      form.appendChild(h("p", { class: "pl-label" }, "What was it about?"));
      const catsBox = h("div", { class: "pl-cats" });
      CATS().forEach(c => {
        const on = st.cats.has(c.key);
        const lab = h("label", { class: "pl-cat" + (on ? " on" : ""), style: { "--c": c.color, "--bg": c.bg } },
          h("input", { type: "checkbox", checked: on ? true : null, onchange: e => { e.target.checked ? st.cats.add(c.key) : (st.cats.delete(c.key), delete st.subs[c.key]); draw(); } }),
          h("span", null, c.label));
        catsBox.appendChild(lab);
      });
      form.appendChild(catsBox);
      CATS().forEach(c => {
        if (!st.cats.has(c.key)) return;
        const list = SUBS[c.key]();
        if (!list.length) return;
        const row = h("div", { class: "pl-subs", style: { "--c": c.color, "--bg": c.bg } }, h("span", { class: "pl-subs-label" }, c.label + ":"));
        list.forEach(sname => {
          const chosen = (st.subs[c.key] || []).includes(sname);
          row.appendChild(h("button", { type: "button", class: "pl-sub", "aria-pressed": chosen ? "true" : "false", onclick: () => {
            const arr = st.subs[c.key] || (st.subs[c.key] = []);
            const i = arr.indexOf(sname); i >= 0 ? arr.splice(i, 1) : arr.push(sname);
            draw();
          } }, sname));
        });
        form.appendChild(row);
      });

      if (WHO_().length) { form.appendChild(h("p", { class: "pl-label" }, "Spoke with ", h("span", { class: "pl-opt" }, "(optional)"))); form.appendChild(seg(WHO_(), () => st.spoke, v => st.spoke = v, true)); }

      form.appendChild(h("p", { class: "pl-label" }, "Note ", h("span", { class: "pl-opt" }, "(optional)")));
      const note = h("textarea", { class: "pl-note", rows: "3", oninput: e => st.note = e.target.value });
      note.value = st.note;
      form.appendChild(note);

      const fu = h("label", { class: "pl-check" }, h("input", { type: "checkbox", checked: st.follow ? true : null, onchange: e => { st.follow = e.target.checked; if (!st.follow) st.when = null; draw(); } }), " Needs follow-up");
      form.appendChild(fu);
      if (st.follow) form.appendChild(seg(WHEN_().map(w => w.label), () => st.when ? st.when.label : "", v => st.when = v ? WHEN_().find(w => w.label === v) : null, true));

      form.appendChild(h("p", { class: "pl-label" }, "Date and time"));
      form.appendChild(h("input", { type: "datetime-local", class: "pl-dt", value: st.ts, onchange: e => { if (e.target.value) st.ts = e.target.value; } }));

      const msg = h("p", { class: "pl-msg" });
      form.appendChild(msg);
      form.appendChild(h("div", { class: "pl-actions" },
        h("button", { type: "button", class: "button secondary", onclick: close }, "Cancel"),
        h("button", { type: "submit", class: "button" }, "Save")));
      form.onsubmit = e => {
        e.preventDefault();
        if (!st.student) { msg.textContent = "Choose a student."; return; }
        const done = snapshotUndo(`Saved call with ${st.student}.`);
        const call = {
          id: uid(), student: st.student, ts: st.ts, result: st.result,
          cats: CATS().map(c => c.key).filter(k => st.cats.has(k)),
          subs: Object.fromEntries(Object.entries(st.subs).filter(([k, v]) => st.cats.has(k) && v.length)),
          spoke: st.spoke, note: st.note.trim(),
          followUp: st.follow ? { due: st.when ? addDue(st.ts, st.when) : null, done: false } : null
        };
        if (opts.from && opts.from.followUp) { opts.from.followUp.done = true; opts.from.followUp.doneTs = nowLocal(); opts.from.followUp.by = call.id; }
        S.calls.push(call);
        save(); close(); refresh(); done();
      };
    }
    draw();
    document.body.appendChild(overlay);
    const first = overlay.querySelector("select, .pl-seg-btn");
    if (first) first.focus();
  }

  /* ---------- views ---------- */
  let root, tabsEl, panels = {}, current = "log";
  const histF = { student: "", type: "", followOnly: false };
  let fuType = "";

  function followCard(c, compact) {
    const due = c.followUp.due, diff = due ? dayDiff(todayStr(), due) : null;
    const when = due ? (diff < 0 ? `Due ${fmtShort(due)} · ${-diff} day${diff === -1 ? "" : "s"} overdue` : diff === 0 ? "Due today" : `Due ${fmtShort(due)}`) : "No date set";
    const card = h("div", { class: "pl-fu" + (due && diff <= 0 ? " due" : "") },
      h("div", { class: "pl-fu-stripe", style: { background: stripe(c) } }),
      h("div", { class: "pl-fu-main" },
        h("div", { class: "pl-fu-top" }, h("strong", null, c.student), h("span", { class: "pl-fu-when" }, when)),
        compact ? null : h("p", { class: "pl-fu-meta" }, "From: " + describe(c)),
        tags(c, compact),
        !compact && c.note ? h("p", { class: "pl-fu-note" }, c.note) : null),
      h("div", { class: "pl-fu-btns" },
        compact ? null : h("button", { type: "button", class: "button", onclick: () => openForm({ student: c.student, from: c }) }, "Log follow-up"),
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const u = snapshotUndo(`Follow-up for ${c.student} marked done.`);
          c.followUp.done = true; c.followUp.doneTs = nowLocal(); save(); refresh(); u();
        } }, "Done")));
    return card;
  }

  function drawLog() {
    const p = panels.log; p.innerHTML = "";
    const names = students();
    if (!names.length) {
      p.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list first."),
        h("button", { type: "button", class: "button", onclick: () => show("students") }, "Go to Students")));
      return;
    }
    const today = todayStr();
    const dueNames = names.filter(n => { const l = lastContact(n); return !l || dayDiff(l.ts, today) > DUE(); });
    const fus = openFollowUps();
    const top = h("div", { class: "pl-top" });
    const dueBox = h("div", { class: "card pl-box" }, h("h3", null, "Due for a call ", h("span", { class: "pl-count" }, String(dueNames.length))),
      h("p", { class: "help" }, `No contact in ${wk(S.settings.dueWeeks)}.`));
    if (!dueNames.length) dueBox.appendChild(h("p", { class: "pl-none" }, "Everyone has been contacted recently. 👏"));
    else dueBox.appendChild(h("div", { class: "pl-chips" }, dueNames.map(n => h("button", { type: "button", class: "pl-chip", onclick: () => openForm({ student: n }) }, n))));
    const fuBox = h("div", { class: "card pl-box" }, h("h3", null, "Follow-ups ", h("span", { class: "pl-count" }, String(fus.length))));
    if (!fus.length) fuBox.appendChild(h("p", { class: "pl-none" }, "No open follow-ups."));
    else fus.slice(0, 8).forEach(c => fuBox.appendChild(followCard(c, true)));
    if (fus.length > 8) fuBox.appendChild(h("button", { type: "button", class: "small-btn", onclick: () => show("follow") }, `See all ${fus.length}`));
    top.append(dueBox, fuBox);
    p.appendChild(top);

    const grid = h("div", { class: "pl-grid" });
    names.forEach(n => {
      const l = lastContact(n);
      const d = l ? dayDiff(l.ts, today) : null;
      const tone = d == null || d > DUE() ? "grey" : d <= GREEN() ? "green" : "gold";
      grid.appendChild(h("button", { type: "button", class: "pl-stu " + tone, onclick: () => openForm({ student: n }) },
        h("span", { class: "pl-stu-name" }, n),
        h("span", { class: "pl-stu-when" }, l ? `Called ${ago(d)}` : "No calls yet")));
    });
    p.appendChild(h("div", { class: "card" },
      h("div", { class: "cr-row" }, h("h3", { style: { margin: 0 } }, "Tap a student to log a call"),
        h("span", { class: "pl-legend" }, h("i", { class: "green" }), `last ${wk(S.settings.greenWeeks)}`, h("i", { class: "gold" }), `${S.settings.greenWeeks}–${S.settings.dueWeeks} weeks`, h("i", { class: "grey" }), `over ${wk(S.settings.dueWeeks)} / never`)),
      grid));
  }

  function drawFollow() {
    const p = panels.follow; p.innerHTML = "";
    const sel = h("select", { class: "pl-select", onchange: e => { fuType = e.target.value; drawFollow(); } },
      h("option", { value: "" }, "All types"), CATS().map(c => h("option", { value: c.key, selected: fuType === c.key ? true : null }, c.label)));
    let fus = openFollowUps();
    if (fuType) fus = fus.filter(c => (c.cats || []).includes(fuType));
    const today = todayStr();
    const groups = [
      ["Due now", fus.filter(c => c.followUp.due && c.followUp.due <= today), "red"],
      ["Coming up", fus.filter(c => c.followUp.due && c.followUp.due > today), ""],
      ["No date set", fus.filter(c => !c.followUp.due), ""]
    ];
    p.appendChild(h("div", { class: "card pl-bar" }, h("label", null, "Type ", sel),
      h("button", { type: "button", class: "button secondary", onclick: () =>
        printCalls("Open Follow-ups", fus.slice().sort((a, b) => a.ts < b.ts ? 1 : -1), fuType ? CAT[fuType].label : "") }, "Print follow-ups")));
    groups.forEach(([title, list, tone]) => {
      const card = h("div", { class: "card" }, h("h3", { class: "pl-group " + tone }, title, h("span", { class: "pl-count" }, String(list.length))));
      if (!list.length) card.appendChild(h("p", { class: "pl-none" }, "None."));
      list.forEach(c => card.appendChild(followCard(c, false)));
      p.appendChild(card);
    });
  }

  function filteredHistory() {
    return S.calls.filter(c =>
      (!histF.student || c.student === histF.student) &&
      (!histF.type || (c.cats || []).includes(histF.type)) &&
      (!histF.followOnly || c.followUp)).sort((a, b) => a.ts < b.ts ? 1 : -1);
  }
  function drawHistory() {
    const p = panels.history; p.innerHTML = "";
    const allNames = [...new Set([...students(), ...S.calls.map(c => c.student)])];
    const bar = h("div", { class: "card pl-bar" },
      h("label", null, "Student ", h("select", { class: "pl-select", onchange: e => { histF.student = e.target.value; drawHistory(); } },
        h("option", { value: "" }, "All students"), allNames.map(n => h("option", { value: n, selected: histF.student === n ? true : null }, n)))),
      h("label", null, "Type ", h("select", { class: "pl-select", onchange: e => { histF.type = e.target.value; drawHistory(); } },
        h("option", { value: "" }, "All types"), CATS().map(c => h("option", { value: c.key, selected: histF.type === c.key ? true : null }, c.label)))),
      h("label", { class: "pl-check" }, h("input", { type: "checkbox", checked: histF.followOnly ? true : null, onchange: e => { histF.followOnly = e.target.checked; drawHistory(); } }), " Follow-ups only"),
      h("span", { class: "pl-bar-btns" },
        h("button", { type: "button", class: "button secondary", onclick: downloadCSV }, "Download spreadsheet"),
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const parts = [histF.student, histF.type && CAT[histF.type].label, histF.followOnly && "follow-ups only"].filter(Boolean).join(" · ");
          printCalls(histF.student ? `Call Report — ${histF.student}` : "Call Report", filteredHistory(), parts);
        } }, "Print report")));
    p.appendChild(bar);
    const list = filteredHistory();
    if (!list.length) { p.appendChild(h("div", { class: "card pl-none" }, "No calls logged yet.")); return; }
    let day = "", card = null;
    list.forEach(c => {
      if (c.ts.slice(0, 10) !== day) {
        day = c.ts.slice(0, 10);
        card = h("div", { class: "card pl-day" }, h("h3", null, fmtDay(day)));
        p.appendChild(card);
      }
      const fu = c.followUp;
      card.appendChild(h("div", { class: "pl-entry" },
        h("div", { class: "pl-fu-stripe", style: { background: stripe(c) } }),
        h("div", { class: "pl-fu-main" },
          h("div", { class: "pl-fu-top" }, h("strong", null, c.student),
            h("span", { class: "pl-fu-when" }, [fmtTime(c.ts), c.result, c.spoke && "with " + c.spoke].filter(Boolean).join(" · "))),
          tags(c),
          c.note ? h("p", { class: "pl-fu-note" }, c.note) : null,
          fu ? h("p", { class: "pl-fu-flag" + (fu.done ? " done" : "") }, fu.done ? "✓ Followed up" : "Follow-up " + (fu.due ? "due " + fmtShort(fu.due) : "— no date set")) : null),
        h("div", { class: "pl-fu-btns" },
          fu && !fu.done ? h("button", { type: "button", class: "button secondary", onclick: () => {
            const u = snapshotUndo(`Marked followed up: ${c.student}.`); fu.done = true; fu.doneTs = nowLocal(); save(); refresh(); u();
          } }, "Mark followed up") : null,
          h("button", { type: "button", class: "small-btn danger", onclick: () => {
            if (!confirm(`Delete this call with ${c.student}?`)) return;
            const u = snapshotUndo(`Deleted call with ${c.student}.`); S.calls = S.calls.filter(x => x !== c); save(); refresh(); u();
          } }, "Delete"))));
    });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
  function downloadCSV() {
    const used = S.settings.cats.filter(c => !c.removed || S.calls.some(x => (x.cats || []).includes(c.key)));
    const rows = [["Date", "Time", "Student", "Result", "Spoke with", ...used.map(c => c.label), "All subcategories", "Note", "Follow-up needed", "Follow-up due", "Follow-up done"]];
    filteredHistory().slice().reverse().forEach(c => rows.push([
      c.ts.slice(0, 10), fmtTime(c.ts), c.student, c.result, c.spoke || "",
      ...used.map(k => (c.cats || []).includes(k.key) ? ((c.subs || {})[k.key] || []).join("; ") || "Yes" : ""),
      used.flatMap(k => ((c.subs || {})[k.key] || []).map(s => `${k.label}: ${s}`)).join("; "),
      c.note || "", c.followUp ? "Yes" : "", c.followUp && c.followUp.due || "", c.followUp && c.followUp.done ? "Yes" : ""]));
    const blob = new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `phone-log-${todayStr()}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function drawStudents() {
    const p = panels.students; p.innerHTML = "";
    const area = h("textarea", { class: "pl-names", rows: "14", placeholder: "One name per line" });
    area.value = students().join("\n");
    const msg = h("p", { class: "status" });
    const backupIn = h("input", { type: "file", accept: ".json", class: "hidden", onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.calls)) throw new Error();
        if (!confirm(`Replace the phone log on this device with the backup (${data.calls.length} calls)?`)) return;
        S = Object.assign({ calls: [], settings: S.settings }, data); if (Array.isArray(data.students)) setStudents(data.students); delete S.students; if (!S.settings) S.settings = DEFAULTS();
        save(); refresh(); msg.className = "status ok"; msg.textContent = "✓ Backup restored.";
      } catch { msg.className = "status err"; msg.textContent = "That file isn't a phone log backup."; }
      e.target.value = "";
    } });
    p.appendChild(h("div", { class: "card" },
      h("h3", null, "Class list"),
      h("p", { class: "help" }, "Paste or type your students, one name per line. This is the same list used in Classroom Tools."),
      area,
      h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => {
        const seen = new Set();
        const names = area.value.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
        setStudents(names);
        save(); msg.className = "status ok"; msg.textContent = `✓ Saved ${names.length} students.`; refresh(true);
      } }, "Save")),
      msg));
    p.appendChild(h("div", { class: "card" },
      h("h3", null, "Backup"),
      h("p", { class: "help" }, "The phone log is private: it's saved only in this browser on this device, never on the website. Download a backup now and then, and use Restore to move it to another computer."),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const blob = new Blob([JSON.stringify(Object.assign({ students: students() }, S), null, 2)], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `phone-log-backup-${todayStr()}.json` }); document.body.appendChild(a); a.click(); a.remove();
        } }, "Download backup"),
        h("button", { type: "button", class: "button secondary", onclick: () => backupIn.click() }, "Restore backup"), backupIn)));
  }


  /* ---------- Settings tab ---------- */
  function drawSettings() {
    const p = panels.settings; p.innerHTML = "";
    const d = JSON.parse(JSON.stringify(S.settings));       // edit a copy; Save applies it
    const msg = h("p", { class: "status" });
    const lines = t => t.split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const dirty = () => { msg.className = "status"; msg.textContent = "You have unsaved changes."; };

    const catsBox = h("div", { class: "pl-set-cats" });
    function drawCats() {
      catsBox.innerHTML = "";
      const vis = d.cats.filter(c => !c.removed);
      vis.forEach((c, i) => {
        let card;
        const name = h("input", { type: "text", class: "pl-set-name", value: c.label, "aria-label": "Category name", oninput: e => { c.label = e.target.value; dirty(); } });
        const color = h("input", { type: "color", value: c.color, "aria-label": "Category color", oninput: e => { c.color = e.target.value; card.style.setProperty("--c", c.color); card.style.setProperty("--bg", tint(c.color)); dirty(); } });
        const subs = h("textarea", { class: "pl-set-subs", rows: String(Math.max(3, c.subs.length + 1)), placeholder: "Subcategories, one per line (leave empty for none)", oninput: e => { c.subs = lines(e.target.value); dirty(); } });
        subs.value = c.subs.join("\n");
        const move = dir => () => {
          const others = d.cats.filter(x => !x.removed), j = others.indexOf(c) + dir;
          if (j < 0 || j >= others.length) return;
          const a = d.cats.indexOf(c), b = d.cats.indexOf(others[j]);
          [d.cats[a], d.cats[b]] = [d.cats[b], d.cats[a]]; dirty(); drawCats();
        };
        card = h("div", { class: "pl-set-cat", style: { "--c": c.color, "--bg": tint(c.color) } },
          h("div", { class: "pl-set-cat-head" }, color, name,
            h("span", { class: "pl-set-btns" },
              i > 0 ? h("button", { type: "button", class: "small-btn", "aria-label": "Move up", onclick: move(-1) }, "↑") : null,
              i < vis.length - 1 ? h("button", { type: "button", class: "small-btn", "aria-label": "Move down", onclick: move(1) }, "↓") : null,
              h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm(`Remove "${c.label}"? Past calls keep it.`)) { c.removed = true; dirty(); drawCats(); } } }, "Remove"))),
          subs);
        catsBox.appendChild(card);
      });
      const removed = d.cats.filter(c => c.removed);
      if (removed.length) catsBox.appendChild(h("p", { class: "help" }, "Removed (click to bring back): ",
        removed.map(c => h("button", { type: "button", class: "small-btn", style: { marginLeft: "6px" }, onclick: () => { delete c.removed; dirty(); drawCats(); } }, "↩ " + c.label))));
    }
    drawCats();
    const addCat = h("button", { type: "button", class: "button secondary", onclick: () => {
      const palette = ["#b25e00", "#0f766e", "#be185d", "#4d7c0f", "#6d28d9", "#0369a1"];
      d.cats.push({ key: "c" + Date.now().toString(36), label: "New category", color: palette[d.cats.length % palette.length], subs: [] });
      dirty(); drawCats();
      const n = catsBox.querySelectorAll(".pl-set-name"); n[n.length - 1].select();
    } }, "+ Add category");

    const results = h("textarea", { class: "pl-set-subs", rows: "5", oninput: e => { d.results = lines(e.target.value); dirty(); } });
    results.value = d.results.join("\n");
    const who = h("textarea", { class: "pl-set-subs", rows: "4", oninput: e => { d.who = lines(e.target.value); dirty(); } });
    who.value = d.who.join("\n");

    const whenBox = h("div", { class: "pl-set-when" });
    function drawWhen() {
      whenBox.innerHTML = "";
      d.when.forEach((w, i) => {
        const label = () => `${w.n} ${w.n === 1 ? w.unit.replace(/s$/, "") : w.unit}`;
        whenBox.appendChild(h("div", { class: "pl-set-row" },
          h("input", { type: "number", min: "1", max: "365", class: "cr-num", value: w.n, "aria-label": "How many", oninput: e => { w.n = Math.max(1, parseInt(e.target.value, 10) || 1); w.label = label(); dirty(); } }),
          h("select", { class: "pl-select", "aria-label": "Unit", onchange: e => { w.unit = e.target.value; w.label = label(); dirty(); } },
            ["days", "weeks", "months"].map(u => h("option", { value: u, selected: w.unit === u ? true : null }, u))),
          h("button", { type: "button", class: "small-btn danger", onclick: () => { d.when.splice(i, 1); dirty(); drawWhen(); } }, "Remove")));
      });
      whenBox.appendChild(h("button", { type: "button", class: "small-btn", onclick: () => { d.when.push({ label: "3 days", n: 3, unit: "days" }); dirty(); drawWhen(); } }, "+ Add choice"));
    }
    drawWhen();

    const green = h("input", { type: "number", min: "1", max: "52", class: "cr-num", value: d.greenWeeks, "aria-label": "Green weeks", oninput: e => { d.greenWeeks = Math.max(1, parseInt(e.target.value, 10) || 1); dirty(); } });
    const due = h("input", { type: "number", min: "1", max: "52", class: "cr-num", value: d.dueWeeks, "aria-label": "Due weeks", oninput: e => { d.dueWeeks = Math.max(1, parseInt(e.target.value, 10) || 1); dirty(); } });

    const saveBtn = h("button", { type: "button", class: "button", onclick: () => {
      d.cats.forEach(c => { c.label = c.label.trim() || "Untitled"; });
      if (!d.cats.some(c => !c.removed)) { msg.className = "status err"; msg.textContent = "Keep at least one category."; return; }
      if (!d.results.length) { msg.className = "status err"; msg.textContent = "Keep at least one result."; return; }
      if (d.dueWeeks <= d.greenWeeks) { msg.className = "status err"; msg.textContent = "\"Due for a call\" must be longer than the green time."; return; }
      S.settings = JSON.parse(JSON.stringify(d)); save(); refresh(true);
      msg.className = "status ok"; msg.textContent = "✓ Settings saved.";
    } }, "Save settings");

    p.append(
      h("div", { class: "card" }, h("h3", null, "Categories"),
        h("p", { class: "help" }, "What a call can be about. Change the name and color, and list the subcategories (put your subjects under Academics). Removing a category hides it for new calls; past calls keep it."),
        catsBox, h("div", { class: "actions" }, addCat)),
      h("div", { class: "pl-set-two" },
        h("div", { class: "card" }, h("h3", null, "Result buttons"), h("p", { class: "help" }, "One per line. The first one is selected by default."), results),
        h("div", { class: "card" }, h("h3", null, "\"Spoke with\" choices"), h("p", { class: "help" }, "One per line. Leave empty to hide this question."), who)),
      h("div", { class: "pl-set-two" },
        h("div", { class: "card" }, h("h3", null, "Follow-up choices"), h("p", { class: "help" }, "The \"when\" buttons under Needs follow-up."), whenBox),
        h("div", { class: "card" }, h("h3", null, "Timing"),
          h("p", { class: "pl-set-row" }, "Green bar if contacted within", green, "weeks"),
          h("p", { class: "pl-set-row" }, "Due for a call after", due, "weeks (grey bar)"),
          h("p", { class: "help" }, "In between is gold."))),
      h("div", { class: "card pl-set-save" }, saveBtn,
        h("button", { type: "button", class: "small-btn", onclick: () => {
          if (confirm("Put all phone log settings back to the original? (Your calls are not affected.)")) { S.settings = DEFAULTS(); save(); refresh(true); drawSettings(); }
        } }, "Reset to original"),
        msg));
  }

  /* ---------- shell ---------- */
  const TABS = [["log", "Log a Call"], ["follow", "Follow-ups"], ["history", "History"], ["students", "Students"], ["settings", "Settings"]];
  function show(key) {
    current = key;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === key ? "true" : "false"));
    Object.entries(panels).forEach(([k, el]) => el.classList.toggle("hidden", k !== key));
    refresh();
  }
  function refresh(keepStudents) {
    const n = openFollowUps().filter(c => c.followUp.due && c.followUp.due <= todayStr()).length;
    const badge = tabsEl.querySelector('[data-tab="follow"] .pl-tab-badge');
    badge.textContent = n ? String(n) : ""; badge.classList.toggle("hidden", !n);
    if (current === "log") drawLog();
    if (current === "follow") drawFollow();
    if (current === "history") drawHistory();
    if (current === "students" && !keepStudents) drawStudents();
    if (current === "settings" && !keepStudents) drawSettings();
  }
  function open(container) {
    root = container; load();
    root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Phone Log"),
      h("p", { class: "help", style: { margin: 0 } }, "Calls with families. Saved only on this device — never posted on the website.")));
    tabsEl = h("div", { class: "pl-tabs", role: "tablist" });
    TABS.forEach(([k, label]) => tabsEl.appendChild(h("button", { type: "button", role: "tab", "data-tab": k, onclick: () => show(k) },
      label, k === "follow" ? h("span", { class: "pl-tab-badge hidden" }) : null)));
    root.appendChild(tabsEl);
    TABS.forEach(([k]) => { panels[k] = h("div", { class: "pl-panel" }); root.appendChild(panels[k]); });
    show(students().length ? "log" : "students");
  }
  // numbers for the Teacher Area dashboard
  function summary() {
    load();
    const names = students(), today = todayStr();
    const fus = openFollowUps();
    return {
      students: names.length,
      dueCalls: names.filter(n => { const l = lastContact(n); return !l || dayDiff(l.ts, today) > DUE(); }).length,
      followDue: fus.filter(c => c.followUp.due && c.followUp.due <= today).length,
      followOpen: fus.length,
      callsThisWeek: S.calls.filter(c => dayDiff(c.ts, today) < 7).length,
      // lists for the Teacher Area home page
      dueList: names.map(n => { const l = lastContact(n); return { name: n, days: l ? dayDiff(l.ts, today) : null }; })
        .filter(x => x.days == null || x.days > DUE()).sort((a, b) => (b.days == null ? 1e9 : b.days) - (a.days == null ? 1e9 : a.days)),
      followList: fus.map(c => ({ name: c.student, due: c.followUp.due || "", overdue: !!(c.followUp.due && c.followUp.due < today), today: c.followUp.due === today })),
      recent: S.calls.slice().sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 6).map(c => ({ name: c.student, ts: c.ts, result: c.result || "" }))
    };
  }
  window.PhoneLog = { open, summary };
})();

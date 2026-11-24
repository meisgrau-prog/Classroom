/* ============================================================
   STUDENT SUPPORT (Teacher Tools): what you did / plan to do to help
   each student, and whether it worked.
   Saved ONLY in this browser — never posted on the website.
   ============================================================ */
(function () {
  const STORE = "teacher_support_v1";
  const STUDENTS = "classroom_students_v1";
  const OUTCOMES = [
    ["worked", "Worked", "✓"],
    ["partly", "Partly", "◐"],
    ["no", "Didn't work", "✗"],
    ["wait", "Too soon to tell", "…"]
  ];
  const DEFAULT_AREAS = ["Behavior", "Academics", "Reading", "Focus", "Social", "Motivation", "Home"];

  /* ---------- data ---------- */
  let S = { entries: [], areas: DEFAULT_AREAS.slice() };
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.entries)) S = s; } catch {}
    if (!Array.isArray(S.areas)) S.areas = DEFAULT_AREAS.slice();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { alert("Couldn't save — this browser's storage may be full. Download a backup."); } }
  function students() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; } }
  function setStudents(names) {
    try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null") || {}; localStorage.setItem(STUDENTS, JSON.stringify({ names, absent: (s.absent || []).filter(n => names.includes(n)) })); } catch {}
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmt = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); };
  const forStudent = n => S.entries.filter(e => e.student === n).sort((a, b) => (b.date + b.id) < (a.date + a.id) ? -1 : 1);
  const outcome = k => OUTCOMES.find(o => o[0] === k);

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }

  /* ================= the tool ================= */
  let root, side, main, current = "", filter = "all";

  function counts(n) {
    const list = S.entries.filter(e => e.student === n);
    return { all: list.length, plan: list.filter(e => e.kind === "plan").length, worked: list.filter(e => e.outcome === "worked").length, no: list.filter(e => e.outcome === "no").length };
  }

  function drawSide() {
    side.innerHTML = "";
    const names = students();
    names.forEach(n => {
      const c = counts(n);
      side.appendChild(h("button", { type: "button", role: "tab", class: "sp-tab" + (n === current ? " active" : ""), "aria-selected": n === current ? "true" : "false", onclick: () => { current = n; filter = "all"; try { localStorage.setItem("teacher_support_last", n); } catch {} drawSide(); drawMain(); } },
        h("span", { class: "sp-tab-name" }, n),
        h("span", { class: "sp-tab-meta" },
          c.plan ? h("span", { class: "sp-pill plan", title: "Planned" }, String(c.plan)) : null,
          c.all ? h("span", { class: "sp-pill" }, String(c.all)) : null)));
    });
  }

  // past things you tried, for quick re-use
  function suggestions() {
    const seen = new Map();
    S.entries.forEach(e => { const t = e.text.trim(); if (t && t.length < 120) seen.set(t.toLowerCase(), t); });
    return [...seen.values()].slice(-60);
  }

  function addForm() {
    const st = { kind: "did", areas: new Set(), date: today() };
    const text = h("textarea", { class: "sp-text", rows: "3", placeholder: "What did you do (or plan to do) to help? e.g. Moved his seat to the front · Daily check-in chart · Called home about reading", list: "sp-sugg" });
    const dl = h("datalist", { id: "sp-sugg" }, suggestions().map(t => h("option", { value: t })));
    const kindRow = h("div", { class: "pl-seg sp-kind" });
    const drawKind = () => { kindRow.innerHTML = ""; [["did", "I did this"], ["plan", "I plan to do this"]].forEach(([k, l]) => kindRow.appendChild(h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": st.kind === k ? "true" : "false", onclick: () => { st.kind = k; drawKind(); } }, l))); };
    drawKind();
    const areaRow = h("div", { class: "sp-areas" });
    const drawAreas = () => { areaRow.innerHTML = ""; S.areas.forEach(a => areaRow.appendChild(h("button", { type: "button", class: "pl-sub", "aria-pressed": st.areas.has(a) ? "true" : "false", onclick: () => { st.areas.has(a) ? st.areas.delete(a) : st.areas.add(a); drawAreas(); } }, a))); };
    drawAreas();
    const date = h("input", { type: "date", class: "pl-dt", value: st.date, onchange: e => { st.date = e.target.value || today(); } });
    const msg = h("p", { class: "status err" });
    const add = () => {
      const t = text.value.trim();
      if (!t) { msg.textContent = "Type what you did or plan to do."; text.focus(); return; }
      S.entries.push({ id: uid(), student: current, date: st.date, kind: st.kind, text: t, areas: [...st.areas], outcome: "", outcomeNote: "" });
      save(); drawSide(); drawMain();
      const first = main.querySelector(".sp-entry"); if (first) { first.classList.add("new"); }
    };
    text.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); });
    return h("div", { class: "card sp-add" },
      h("h3", null, "Add"),
      kindRow, text, dl,
      S.areas.length ? h("p", { class: "pl-label" }, "Area ", h("span", { class: "pl-opt" }, "(optional)")) : null, areaRow,
      h("div", { class: "sp-add-foot" }, h("label", null, "Date ", date), h("button", { type: "button", class: "button", onclick: add }, "Add to log")),
      msg);
  }

  function entryCard(e) {
    const o = outcome(e.outcome);
    const note = h("input", { type: "text", class: "sp-onote", placeholder: "How did it go? (optional)", value: e.outcomeNote || "" });
    note.addEventListener("change", () => { e.outcomeNote = note.value.trim(); save(); });
    const card = h("article", { class: "sp-entry " + (e.kind === "plan" ? "plan" : "did") + (o ? " o-" + o[0] : "") },
      h("div", { class: "sp-entry-head" },
        h("span", { class: "sp-badge " + e.kind }, e.kind === "plan" ? "Planned" : "Did"),
        h("span", { class: "sp-date" }, fmt(e.date)),
        (e.areas || []).map(a => h("span", { class: "sp-area" }, a)),
        h("span", { class: "sp-entry-btns" },
          e.kind === "plan" ? h("button", { type: "button", class: "small-btn", onclick: () => { e.kind = "did"; e.doneDate = today(); save(); drawSide(); drawMain(); } }, "✓ Mark as done") : null,
          h("button", { type: "button", class: "small-btn", onclick: () => editEntry(e) }, "Edit"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm("Delete this entry?")) { S.entries = S.entries.filter(x => x !== e); save(); drawSide(); drawMain(); } } }, "Delete"))),
      h("p", { class: "sp-entry-text" }, e.text),
      e.kind === "plan" && !e.outcome ? null : h("div", { class: "sp-outcome" },
        h("span", { class: "sp-outcome-q" }, "Did it work?"),
        h("div", { class: "sp-outcome-btns" }, OUTCOMES.map(([k, l, ico]) => h("button", { type: "button", class: "sp-o sp-o-" + k, "aria-pressed": e.outcome === k ? "true" : "false",
          onclick: () => { e.outcome = e.outcome === k ? "" : k; e.outcomeDate = e.outcome ? today() : ""; save(); drawSide(); drawMain(); } }, h("span", { "aria-hidden": "true" }, ico), " ", l))),
        e.outcome ? note : null));
    return card;
  }

  function editEntry(e) {
    const overlay = h("div", { class: "pl-overlay", onclick: ev => { if (ev.target === overlay) overlay.remove(); } });
    const text = h("textarea", { rows: "4" }); text.value = e.text;
    const date = h("input", { type: "date", class: "pl-dt", value: e.date });
    const kind = h("select", { class: "pl-select" }, [["did", "I did this"], ["plan", "I plan to do this"]].map(([v, l]) => h("option", { value: v, selected: e.kind === v ? true : null }, l)));
    const areas = new Set(e.areas || []);
    const areaRow = h("div", { class: "sp-areas" });
    const drawAreas = () => { areaRow.innerHTML = ""; S.areas.concat((e.areas || []).filter(a => !S.areas.includes(a))).forEach(a => areaRow.appendChild(h("button", { type: "button", class: "pl-sub", "aria-pressed": areas.has(a) ? "true" : "false", onclick: () => { areas.has(a) ? areas.delete(a) : areas.add(a); drawAreas(); } }, a))); };
    drawAreas();
    overlay.appendChild(h("div", { class: "pl-form" },
      h("div", { class: "pl-form-head" }, h("div", null, h("small", null, "Edit"), h("h2", null, e.student)), h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: () => overlay.remove() }, "×")),
      h("p", { class: "pl-label" }, "What"), text,
      h("p", { class: "pl-label" }, "Did or planned"), kind,
      h("p", { class: "pl-label" }, "Area"), areaRow,
      h("p", { class: "pl-label" }, "Date"), date,
      h("div", { class: "pl-actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => overlay.remove() }, "Cancel"),
        h("button", { type: "button", class: "button", onclick: () => {
          if (!text.value.trim()) return;
          e.text = text.value.trim(); e.date = date.value || e.date; e.kind = kind.value; e.areas = [...areas];
          save(); overlay.remove(); drawSide(); drawMain();
        } }, "Save"))));
    document.body.appendChild(overlay);
    text.focus();
  }

  function drawMain() {
    main.innerHTML = "";
    const names = students();
    if (!names.length) {
      main.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list first (Settings below, or in the Phone Log, Gradebook or Classroom Tools).")));
      return;
    }
    if (!names.includes(current)) current = names[0];
    const list = forStudent(current);
    const c = counts(current);
    const worked = list.filter(e => e.outcome === "worked");
    main.appendChild(h("div", { class: "card sp-head" },
      h("div", null, h("h2", null, current),
        h("p", { class: "help", style: "margin:4px 0 0" }, c.all ? `${c.all} entr${c.all === 1 ? "y" : "ies"} · ${c.plan} planned · ${c.worked} worked · ${c.no} didn't work` : "Nothing logged yet.")),
      h("button", { type: "button", class: "button secondary", onclick: () => printStudent(current) }, "Print")));
    if (worked.length) main.appendChild(h("div", { class: "card sp-worked" }, h("h3", null, "✓ What has worked for " + current.split(" ")[0]),
      h("ul", null, worked.map(e => h("li", null, e.text, e.outcomeNote ? h("small", null, " — " + e.outcomeNote) : null)))));
    main.appendChild(addForm());
    // filter + timeline
    const F = [["all", "All"], ["plan", "Planned"], ["worked", "Worked"], ["partly", "Partly"], ["no", "Didn't work"], ["open", "No result yet"]];
    const shown = list.filter(e => filter === "all" ? true : filter === "plan" ? e.kind === "plan" : filter === "open" ? e.kind === "did" && !e.outcome : e.outcome === filter);
    main.appendChild(h("div", { class: "sp-filter pl-seg" }, F.map(([k, l]) => h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": filter === k ? "true" : "false", onclick: () => { filter = k; drawMain(); } }, l))));
    const tl = h("div", { class: "sp-timeline" });
    shown.forEach(e => tl.appendChild(entryCard(e)));
    if (!shown.length) tl.appendChild(h("p", { class: "th-none" }, list.length ? "Nothing matches this filter." : "Nothing logged yet. Add what you did or plan to do above."));
    main.appendChild(tl);
  }

  function printStudent(n) {
    const list = forStudent(n);
    const area = document.getElementById("print-area") || document.body.appendChild(h("div", { id: "print-area" }));
    area.innerHTML = "";
    area.append(h("h1", null, n), h("p", { class: "print-sub" }, "Student support log · " + new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })),
      h("div", { class: "pl-print" }, list.map(e => { const o = outcome(e.outcome); return h("div", { class: "pl-print-row" },
        h("p", null, h("strong", null, fmt(e.date)), ` · ${e.kind === "plan" ? "Planned" : "Did"}${(e.areas || []).length ? " · " + e.areas.join(", ") : ""}${o ? " · " + o[1] : ""}`),
        h("p", null, e.text), e.outcomeNote ? h("p", { class: "note" }, e.outcomeNote) : null); }),
        list.length ? null : h("p", null, "Nothing logged yet.")));
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1500);
  }

  function settingsCard() {
    const stu = h("textarea", { class: "pl-names", rows: "8", placeholder: "One name per line (First Last)" }); stu.value = students().join("\n");
    const areas = h("textarea", { class: "pl-set-subs", rows: "6" }); areas.value = S.areas.join("\n");
    const msg = h("p", { class: "status" });
    const restore = h("input", { type: "file", accept: ".json", class: "hidden" });
    restore.addEventListener("change", async () => {
      const f = restore.files[0]; restore.value = ""; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (!d || !Array.isArray(d.entries)) throw 0; if (!confirm("Replace the support log on this device with this backup?")) return; S = d; save(); open(root); }
      catch { alert("That isn't a Student Support backup."); }
    });
    return h("details", { class: "card sp-settings" }, h("summary", null, "Settings & backup"),
      h("div", { class: "pl-set-two" },
        h("div", null, h("h3", null, "Students"), h("p", { class: "help" }, "One per line. The same list is used by every tool."), stu),
        h("div", null, h("h3", null, "Areas"), h("p", { class: "help" }, "The quick tags on each entry (one per line). Leave empty to hide."), areas)),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button", onclick: () => {
          const seen = new Set();
          setStudents(stu.value.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())));
          S.areas = areas.value.split("\n").map(s => s.trim()).filter(Boolean); save();
          drawSide(); drawMain(); msg.className = "status ok"; msg.textContent = "✓ Saved.";
        } }, "Save"),
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })), download: `Student Support backup ${today()}.json` });
          document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
        } }, "Download backup"),
        h("button", { type: "button", class: "button secondary", onclick: () => restore.click() }, "Restore backup"), restore),
      msg);
  }

  function open(container) {
    root = container; load();
    root.innerHTML = "";
    try { current = current || localStorage.getItem("teacher_support_last") || ""; } catch {}
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Student Support"),
      h("p", { class: "help", style: "margin:0" }, "What you did — or plan to do — to help each student, and whether it worked. Saved only on this device — never posted on the website.")));
    side = h("div", { class: "sp-side", role: "tablist", "aria-label": "Students" });
    main = h("div", { class: "sp-main" });
    root.appendChild(h("div", { class: "sp-layout" }, side, main));
    root.appendChild(settingsCard());
    drawMain(); drawSide();
  }

  // for the Teacher Area home page
  function summary() {
    load();
    return { plans: S.entries.filter(e => e.kind === "plan").sort((a, b) => a.date < b.date ? -1 : 1).map(e => ({ name: e.student, text: e.text, date: e.date })) };
  }

  window.StudentSupport = { open, summary };
})();

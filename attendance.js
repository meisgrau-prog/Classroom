/* ============================================================
   ATTENDANCE (Teacher Tools)
   Take attendance for any day (Present / Absent / Late / Excused + note),
   see a month at a glance, and totals per student.
   Linked with Classroom Tools → Students ("Who's here today").
   Saved only on this device: localStorage "teacher_attendance_v1".
   ============================================================ */
(function () {
  const STORE = "teacher_attendance_v1", STUDENTS = "classroom_students_v1";
  const STATUS = [["P", "Present", "#2f8f57"], ["A", "Absent", "#c0392b"], ["L", "Late", "#c9a96a"], ["E", "Excused", "#5b7db8"]];
  const label = k => (STATUS.find(s => s[0] === k) || [k, k])[1];
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (s, o) => parseDay(s).toLocaleDateString("en-US", o || { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  /* ---------- data ---------- */
  function read() { try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.days) return s; } catch {} return { days: {}, notes: {} }; }
  function write(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} }
  function classList() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; } }
  // keep Classroom Tools' "who's here today" in step with today's attendance
  function syncClassroomAbsent(dayRec) {
    try {
      const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); if (!s) return;
      const absent = Object.entries(dayRec || {}).filter(([, v]) => v === "A" || v === "E").map(([n]) => n).filter(n => s.names.includes(n));
      if (JSON.stringify([...absent].sort()) === JSON.stringify([...(s.absent || [])].sort())) return;
      s.absent = absent; localStorage.setItem(STUDENTS, JSON.stringify(s));
    } catch {}
  }
  // called by Classroom Tools when someone is marked here / absent today
  function markToday(name, absent) {
    const S = read(), d = today(), day = S.days[d] || (S.days[d] = {});
    if (absent) day[name] = day[name] === "E" ? "E" : "A";
    else if (day[name] === "A" || day[name] === "E") day[name] = "P";
    else if (!day[name]) day[name] = "P";
    write(S);
  }
  function stats(name, from, to) {
    const S = read(), c = { P: 0, A: 0, L: 0, E: 0 }, list = [];
    Object.keys(S.days).sort().forEach(d => { if (d < from || d > to) return; const v = S.days[d][name]; if (!v) return; c[v]++; if (v !== "P") list.push({ date: d, status: v, note: ((S.notes || {})[d] || {})[name] || "" }); });
    const taken = c.P + c.A + c.L + c.E;
    return { c, taken, list, pct: taken - c.E > 0 ? Math.round((c.P + c.L) / (taken - c.E) * 1000) / 10 : null };
  }

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.entries(v).forEach(([p, x]) => p.startsWith("--") ? e.style.setProperty(p, x) : (e.style[p] = x));
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  let root, tabsEl, panels = {}, view = "take", day = today(), month = today().slice(0, 7), from = "", to = "";
  const TABS = [["take", "Take Attendance"], ["month", "Month View"], ["totals", "Totals"]];
  function show(k) {
    view = k;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k ? "true" : "false"));
    Object.entries(panels).forEach(([key, el]) => el.classList.toggle("hidden", key !== k));
    ({ take: drawTake, month: drawMonth, totals: drawTotals })[k]();
  }

  /* ----- take attendance ----- */
  function drawTake() {
    const p = panels.take; p.innerHTML = "";
    const names = classList();
    if (!names.length) { p.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list first (Classroom Tools → Students, or Student Info)."))); return; }
    const S = read();
    // today with nothing taken yet: start from Classroom Tools' absent list
    if (day === today() && !S.days[day]) { try { const cs = JSON.parse(localStorage.getItem(STUDENTS) || "null"); if (cs && (cs.absent || []).length) { S.days[day] = {}; cs.absent.forEach(n => S.days[day][n] = "A"); } } catch {} }
    const rec = S.days[day] || {};
    const set = (n, v) => {
      const s = read(), d = s.days[day] || (s.days[day] = {});
      if (v) d[n] = v; else delete d[n];
      if (!Object.keys(d).length) delete s.days[day];
      write(s); if (day === today()) syncClassroomAbsent(s.days[day]); drawTake();
    };
    const setNote = (n, txt) => { const s = read(); s.notes = s.notes || {}; const d = s.notes[day] || (s.notes[day] = {}); if (txt) d[n] = txt; else delete d[n]; if (!Object.keys(d).length) delete s.notes[day]; write(s); };
    const counts = { P: 0, A: 0, L: 0, E: 0 }; names.forEach(n => { if (rec[n]) counts[rec[n]]++; });
    const unmarked = names.filter(n => !rec[n]).length;
    const dateIn = h("input", { type: "date", class: "pl-dt", value: day, max: today(), onchange: e => { day = e.target.value || today(); drawTake(); } });
    const step = d => { const x = parseDay(day); x.setDate(x.getDate() + d); const v = iso(x); if (v <= today()) { day = v; drawTake(); } };
    p.append(
      h("div", { class: "card at-bar" },
        h("div", { class: "at-day" },
          h("button", { type: "button", class: "small-btn", "aria-label": "Day before", onclick: () => step(-1) }, "‹"),
          h("div", null, h("strong", null, fmt(day)), day === today() ? h("small", null, "Today") : h("small", null, h("a", { href: "#", onclick: e => { e.preventDefault(); day = today(); drawTake(); } }, "Back to today"))),
          h("button", { type: "button", class: "small-btn", "aria-label": "Next day", disabled: day >= today() ? true : null, onclick: () => step(1) }, "›"),
          dateIn),
        h("div", { class: "at-counts" }, STATUS.map(([k, l, c]) => h("span", { class: "at-count", style: { "--c": c } }, h("b", null, String(counts[k])), " " + l)),
          unmarked ? h("span", { class: "at-count none" }, h("b", null, String(unmarked)), " not marked") : null),
        h("div", { class: "at-bulk" },
          h("button", { type: "button", class: "button", onclick: () => { const s = read(), d = s.days[day] || (s.days[day] = {}); names.forEach(n => { if (!d[n]) d[n] = "P"; }); write(s); if (day === today()) syncClassroomAbsent(d); drawTake(); } }, unmarked === names.length ? "Mark everyone present" : "Mark the rest present"),
          Object.keys(rec).length ? h("button", { type: "button", class: "small-btn danger", onclick: () => { if (!confirm(`Clear attendance for ${fmt(day)}?`)) return; const s = read(); delete s.days[day]; if (s.notes) delete s.notes[day]; write(s); if (day === today()) syncClassroomAbsent({}); drawTake(); } }, "Clear this day") : null)),
      h("div", { class: "card" }, h("ol", { class: "at-list" }, names.map((n, i) => {
        const v = rec[n] || "", note = (((S.notes || {})[day]) || {})[n] || "";
        const noteIn = h("input", { type: "text", class: "at-note", placeholder: "Note (optional)", value: note, "aria-label": "Note for " + n });
        noteIn.addEventListener("change", () => setNote(n, noteIn.value.trim()));
        return h("li", { class: "at-row s-" + (v || "none") },
          h("span", { class: "att-num" }, String(i + 1)),
          h("span", { class: "stu-av " + (v === "A" ? "grey" : v === "L" ? "gold" : "green") }, initials(n)),
          h("span", { class: "at-name" }, n),
          h("span", { class: "at-seg", role: "group", "aria-label": n }, STATUS.map(([k, l, c]) => h("button", { type: "button", class: "at-" + k, style: { "--c": c }, "aria-pressed": v === k ? "true" : "false", title: l, onclick: () => set(n, v === k ? "" : k) }, l))),
          (v && v !== "P") || note ? noteIn : null);
      }))));
  }

  /* ----- month view ----- */
  function drawMonth() {
    const p = panels.month; p.innerHTML = "";
    const names = classList(), S = read();
    const [y, m] = month.split("-").map(Number), days = new Date(y, m, 0).getDate();
    const dates = Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`).filter(d => Object.values(S.days[d] || {}).length || (parseDay(d).getDay() !== 6 && d <= today()));
    const mIn = h("input", { type: "month", class: "pl-dt", value: month, onchange: e => { month = e.target.value || today().slice(0, 7); drawMonth(); } });
    const go = d => { const x = new Date(y, m - 1 + d, 1); month = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; drawMonth(); };
    p.append(h("div", { class: "card at-bar" },
      h("div", { class: "at-day" }, h("button", { type: "button", class: "small-btn", onclick: () => go(-1) }, "‹"), h("strong", null, new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })), h("button", { type: "button", class: "small-btn", onclick: () => go(1) }, "›"), mIn),
      h("div", { class: "at-counts" }, STATUS.map(([k, l, c]) => h("span", { class: "at-count", style: { "--c": c } }, h("i", { class: "at-key", style: { background: c } }, k), " " + l)))),
      h("div", { class: "card" }, h("div", { class: "stu-scroll" }, h("table", { class: "at-grid" },
        h("thead", null, h("tr", null, h("th", { class: "at-g-name" }, "Student"), dates.map(d => h("th", { class: parseDay(d).getDay() === 0 ? "sun" : "" }, h("small", null, parseDay(d).toLocaleDateString("en-US", { weekday: "narrow" })), String(+d.slice(8)))), h("th", null, "A"), h("th", null, "L"))),
        h("tbody", null, names.map(n => { let a = 0, l = 0;
          return h("tr", null, h("td", { class: "at-g-name" }, n), dates.map(d => { const v = (S.days[d] || {})[n] || ""; if (v === "A") a++; if (v === "L") l++;
            return h("td", { class: "at-cell", title: v ? `${n} — ${fmt(d, { month: "short", day: "numeric" })}: ${label(v)}` : "", onclick: () => { day = d; show("take"); } }, v ? h("i", { class: "at-key", style: { background: (STATUS.find(s => s[0] === v) || [])[2] } }, v) : ""); }),
            h("td", { class: "num strong" }, String(a)), h("td", { class: "num" }, String(l))); })))),
        h("p", { class: "help", style: { margin: "8px 0 0" } }, "Click a day to change it. Saturdays are hidden unless something was marked.")));
  }

  /* ----- totals ----- */
  function drawTotals() {
    const p = panels.totals; p.innerHTML = "";
    const names = classList();
    from = from || (window.TeacherPrint ? TeacherPrint.schoolYearStart() : today().slice(0, 4) + "-01-01"); to = to || today();
    const f = h("input", { type: "date", class: "pl-dt", value: from, onchange: e => { from = e.target.value; drawTotals(); } }), t = h("input", { type: "date", class: "pl-dt", value: to, onchange: e => { to = e.target.value; drawTotals(); } });
    const rows = names.map(n => ({ n, ...stats(n, from, to) })).sort((a, b) => (a.pct == null ? 101 : a.pct) - (b.pct == null ? 101 : b.pct));
    p.append(h("div", { class: "card at-bar" }, h("div", { class: "spf-range" }, h("span", null, "From"), f, h("span", null, "to"), t)),
      h("div", { class: "card" }, h("div", { class: "stu-scroll" }, h("table", { class: "stu-table" },
        h("thead", null, h("tr", null, h("th", null, "Student"), STATUS.map(([, l]) => h("th", { class: "stu-num" }, l)), h("th", { class: "stu-num" }, "Days"), h("th", null, "Attendance"))),
        h("tbody", null, rows.map(r => h("tr", null,
          h("td", null, h("div", { class: "stu-cell" }, h("span", { class: "stu-av " + (r.pct == null ? "grey" : r.pct >= 95 ? "green" : r.pct >= 85 ? "gold" : "grey") }, initials(r.n)), h("strong", null, r.n))),
          STATUS.map(([k]) => h("td", { class: "stu-num" }, String(r.c[k]))),
          h("td", { class: "stu-num" }, String(r.taken)),
          h("td", null, r.pct == null ? h("span", { class: "stu-none" }, "—") : h("span", { class: "stu-pill " + (r.pct >= 95 ? "green" : r.pct >= 85 ? "gold" : "grey") }, r.pct + "%"))))))),
        h("p", { class: "help", style: { margin: "8px 0 0" } }, "Attendance % counts Present and Late as attending; excused days don't count against it. Lowest first.")));
  }

  function open(container) {
    root = container; root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Attendance"),
      h("p", { class: "help", style: { margin: 0 } }, "Present, absent, late or excused — for any day. Linked with Classroom Tools → Students. Saved only on this device.")));
    tabsEl = h("div", { class: "pl-tabs", role: "tablist" }, TABS.map(([k, l]) => h("button", { type: "button", role: "tab", "data-tab": k, onclick: () => show(k) }, l)));
    root.appendChild(tabsEl);
    TABS.forEach(([k]) => { panels[k] = h("div", { class: "pl-panel" }); root.appendChild(panels[k]); });
    show(view);
  }

  window.Attendance = { open, stats, markToday, read, STATUS, label };
})();

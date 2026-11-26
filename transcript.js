/* ============================================================
   PROFESSIONAL REPORTS (transcripts) for the Teacher Tools
   One look for every printout: letterhead, student, date range,
   then sections — Student information, Grades, Phone log, Student support.
   Used by Student Profile and by the "Print report" button in each tool.
   Reads the tools' data straight from this browser (nothing is sent anywhere).
   ============================================================ */
(function () {
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const students = () => { const s = read("classroom_students_v1"); return s && Array.isArray(s.names) ? s.names : []; };
  const absentToday = () => { const s = read("classroom_students_v1"); return s && Array.isArray(s.absent) ? s.absent : []; };
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parseDay = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, long) => parseDay(s).toLocaleDateString("en-US", long ? { month: "long", day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = s => s.length > 10 ? new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  // the school year: from Sept 1 (or Aug 15) to today
  function schoolYearStart() { const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-08-15`; }
  const teacher = () => { const b = document.querySelector(".ts-brand strong, [data-teacher]"); return (b && b.textContent.trim()) || (window.SITE && SITE.teacherName) || ""; };
  const grade = () => { const g = document.querySelector("[data-grade]"); return (g && g.textContent.trim()) || (window.SITE && SITE.grade) || ""; };

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
  const table = (cols, rows, cls) => h("table", { class: "tp-table " + (cls || "") },
    h("thead", null, h("tr", null, cols.map(c => h("th", typeof c === "object" ? { class: c.cls } : null, typeof c === "object" ? c.t : c)))),
    h("tbody", null, rows.length ? rows : h("tr", null, h("td", { colspan: String(cols.length), class: "tp-empty" }, "Nothing recorded for these dates."))));
  const section = (title, sub, ...kids) => h("section", { class: "tp-sec" }, h("h3", { class: "tp-h" }, title, sub ? h("span", null, sub) : null), ...kids);

  /* ---------- Student information (Student Info tool) ---------- */
  function infoData(name) {
    const S = read("teacher_student_info_v1") || {}; const row = (S.rows || {})[name] || {};
    const fields = (S.fields || []).filter(f => row[f.key]);
    return { row, fields };
  }
  function pretty(f, v) {
    if (f.type !== "date" || !/\d{2}-\d{2}$/.test(v)) return v;
    const [m, d] = v.slice(-5).split("-").map(Number), y = /^\d{4}/.test(v) ? +v.slice(0, 4) : null;
    let s = new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + (y ? ", " + y : "");
    if (y && f.key === "birthday") { const n = new Date(); s += ` (age ${n.getFullYear() - y - ((n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d)) ? 1 : 0)})`; }
    return s;
  }
  function infoSection(name) {
    const { row, fields } = infoData(name);
    if (!fields.length) return section("Student Information", null, h("p", { class: "tp-empty" }, "No information has been entered for this student (Teacher Tools → Student Info)."));
    const half = Math.ceil(fields.length / 2);
    const dl = list => h("dl", { class: "tp-dl" }, list.map(f => [h("dt", null, f.label), h("dd", null, pretty(f, row[f.key]))]));
    return section("Student Information", null, h("div", { class: "tp-two" }, dl(fields.slice(0, half)), dl(fields.slice(half))));
  }

  /* ---------- Grades (Gradebook) ---------- */
  function num(v) { if (v == null || v === "") return null; if (typeof v === "number") return v; const m = String(v).replace(/\([^)]*\)/g, " ").match(/-?\d+(\.\d+)?/g); return m ? parseFloat(m[m.length - 1]) : null; }
  function gradeData(name, from, to) {
    const G = read("teacher_gradebook_v1"); if (!G || !G.settings) return null;
    const dec = G.settings.decimals == null ? 1 : G.settings.decimals, round = v => v == null ? "" : String(Math.round(v * 10 ** dec) / 10 ** dec);
    const cats = (G.settings.cats || []).map(c => {
      const subj = c.subjects && c.subjects.length ? c.subjects : ["_"];
      const entries = [];
      subj.forEach(sk => Object.entries(((G.grades || {})[c.id] || {})[sk] || {}).forEach(([d, row]) => { if (d >= from && d <= to && row[name] != null && row[name] !== "") entries.push({ date: d, subj: sk === "_" ? "" : sk, v: row[name] }); }));
      entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.subj.localeCompare(b.subj));
      const nums = entries.map(e => num(e.v)).filter(v => v != null);
      let avg = null, pct = null;
      if (c.better !== "text" && nums.length) {
        avg = c.better === "low" ? nums.reduce((a, b) => a + b, 0) : nums.reduce((a, b) => a + b, 0) / nums.length;
        if (c.max) pct = c.better === "low" ? null : Math.min(100, avg / c.max * 100);
      }
      const bySubj = {}; if (c.better !== "text" && subj[0] !== "_") subj.forEach(s => { const v = entries.filter(e => e.subj === s).map(e => num(e.v)).filter(x => x != null); if (v.length) bySubj[s] = v.reduce((a, b) => a + b, 0) / v.length; });
      return { c, entries, n: nums.length, avg, pct, bySubj, round };
    });
    const pcts = cats.map(x => x.pct).filter(v => v != null);
    return { cats, overall: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null, good: G.settings.good || 80, ok: G.settings.ok || 70, round };
  }
  const tone = (p, D) => p == null ? "" : p >= D.good ? "g" : p >= D.ok ? "y" : "r";
  function gradesSection(name, from, to, detail) {
    const D = gradeData(name, from, to);
    if (!D) return section("Grades", null, h("p", { class: "tp-empty" }, "The gradebook hasn't been set up on this device."));
    const used = D.cats.filter(x => x.entries.length);
    const sum = table(["Category", { t: "Grades", cls: "num" }, { t: "Average", cls: "num" }, { t: "Out of", cls: "num" }, { t: "Percent", cls: "num" }, "By subject"],
      used.map(x => h("tr", null,
        h("td", null, h("span", { class: "tp-dot", style: { background: x.c.color } }), x.c.name, x.c.better === "low" ? h("small", null, " (total — lower is better)") : x.c.better === "text" ? h("small", null, " (notes)") : null),
        h("td", { class: "num" }, String(x.c.better === "text" ? x.entries.length : x.n)),
        h("td", { class: "num strong" }, x.c.better === "text" ? "—" : x.round(x.avg)),
        h("td", { class: "num" }, x.c.better === "low" || x.c.better === "text" || !x.c.max ? "—" : String(x.c.max)),
        h("td", { class: "num" }, x.pct == null ? "—" : h("span", { class: "tp-pct " + tone(x.pct, D) }, Math.round(x.pct) + "%")),
        h("td", { class: "tp-subj" }, Object.entries(x.bySubj).map(([s, v]) => h("span", { dir: "auto" }, `${s}: ${x.round(v)}`))))));
    const kids = [sum];
    if (D.overall != null) kids.push(h("p", { class: "tp-overall" }, "Overall average across scored categories: ", h("b", { class: "tp-pct " + tone(D.overall, D) }, Math.round(D.overall) + "%")));
    if (detail) used.forEach(x => {
      const subjects = [...new Set(x.entries.map(e => e.subj))];
      const dates = [...new Set(x.entries.map(e => e.date))];
      const val = (d, s) => { const e = x.entries.find(e => e.date === d && e.subj === s); return e ? String(e.v) : ""; };
      kids.push(h("div", { class: "tp-sub" }, h("h4", null, h("span", { class: "tp-dot", style: { background: x.c.color } }), x.c.name),
        x.c.better === "text"
          ? table(["Date", "Note"], x.entries.map(e => h("tr", null, h("td", { class: "tp-date" }, fmtDate(e.date)), h("td", null, String(e.v)))))
          : table(["Date", ...subjects.map(s => ({ t: s || "Grade", cls: "num" }))], dates.map(d => h("tr", null, h("td", { class: "tp-date" }, fmtDate(d)), subjects.map(s => h("td", { class: "num", dir: "auto" }, val(d, s))))), "tp-compact")));
    });
    return section("Grades", used.length ? `${used.reduce((a, x) => a + x.entries.length, 0)} entries` : null, used.length ? kids : h("p", { class: "tp-empty" }, "No grades recorded for these dates."));
  }

  /* ---------- Phone log ---------- */
  function callsData(name, from, to) {
    const S = read("teacher_phone_log_v1") || {}; const cats = (S.settings && S.settings.cats) || [];
    const DEF = { nachas: "Nachas", social: "Social/emotional", behavior: "Behavior", academics: "Academics" };
    const label = k => (cats.find(c => c.key === k) || { label: DEF[k] || k }).label;
    const calls = (S.calls || []).filter(c => c.student === name && c.ts.slice(0, 10) >= from && c.ts.slice(0, 10) <= to).sort((a, b) => a.ts < b.ts ? -1 : 1);
    return { calls, label };
  }
  function callsSection(name, from, to, notes) {
    const { calls, label } = callsData(name, from, to);
    const rows = calls.map(c => h("tr", { "data-call": c.id },
      h("td", { class: "tp-date" }, fmtDate(c.ts), h("small", null, fmtTime(c.ts))),
      h("td", null, c.method || "—", h("small", null, c.result || "")),
      h("td", null, c.spoke || "—"),
      h("td", null, (c.cats || []).map(k => h("div", null, h("b", null, label(k)), ((c.subs || {})[k] || []).length ? ": " + c.subs[k].join(", ") : ""))),
      notes ? h("td", { class: "tp-note" }, c.note || "") : null,
      h("td", null, c.followUp ? (c.followUp.done ? "Done" : c.followUp.due ? "Due " + fmtDate(c.followUp.due) : "Open") : "—")));
    const last = calls[calls.length - 1];
    return section("Parent Contact Log", calls.length ? `${calls.length} contact${calls.length === 1 ? "" : "s"} · last ${fmtDate(last.ts)}` : null,
      table(["Date", "How / result", "Spoke with", "About", notes ? "Notes" : null, "Follow-up"].filter(Boolean), rows));
  }

  /* ---------- Student support ---------- */
  const OUT = { worked: "Worked", partly: "Partly worked", no: "Didn't work", wait: "Too soon to tell" };
  function supportData(name, from, to) { const S = read("teacher_support_v1") || {}; return (S.entries || []).filter(e => e.student === name && e.date >= from && e.date <= to).sort((a, b) => a.date < b.date ? -1 : 1); }
  function supportSection(name, from, to, notes) {
    const list = supportData(name, from, to);
    const worked = list.filter(e => e.outcome === "worked");
    const kids = [];
    if (worked.length) kids.push(h("div", { class: "tp-callout" }, h("b", null, "What has worked: "), worked.map(e => e.text).join(" · ")));
    kids.push(table(["Date", "Status", "What was done", "Area", "Result", notes ? "Notes" : null].filter(Boolean), list.map(e => h("tr", { "data-support": e.id },
      h("td", { class: "tp-date" }, fmtDate(e.date)),
      h("td", null, e.kind === "plan" ? "Planned" : "Done"),
      h("td", null, e.text),
      h("td", null, (e.areas || []).join(", ") || "—"),
      h("td", null, e.outcome ? h("span", { class: "tp-out " + e.outcome }, OUT[e.outcome] || e.outcome) : "—"),
      notes ? h("td", { class: "tp-note" }, e.outcomeNote || "") : null))));
    return section("Student Support", list.length ? `${list.length} entr${list.length === 1 ? "y" : "ies"} · ${worked.length} worked` : null, kids);
  }

  /* ---------- class summary (one page, every student) ---------- */
  function classSummary(names, from, to) {
    const G = read("teacher_gradebook_v1");
    const cats = G && G.settings ? G.settings.cats.filter(c => c.better !== "text" && c.show !== false) : [];
    const phone = read("teacher_phone_log_v1") || {}, sup = read("teacher_support_v1") || {};
    const rows = names.map(n => { const D = gradeData(n, from, to);
      return h("tr", null, h("td", { class: "tp-nowrap" }, h("b", null, n)),
        cats.map(c => { const x = D && D.cats.find(y => y.c.id === c.id); return h("td", { class: "num" }, x && x.n ? (x.pct != null ? h("span", { class: "tp-pct " + tone(x.pct, D) }, x.round(x.avg)) : x.round(x.avg)) : "—"); }),
        h("td", { class: "num strong" }, D && D.overall != null ? Math.round(D.overall) + "%" : "—"),
        h("td", { class: "num" }, String((phone.calls || []).filter(c => c.student === n && c.ts.slice(0, 10) >= from && c.ts.slice(0, 10) <= to).length)),
        h("td", { class: "num" }, String((sup.entries || []).filter(e => e.student === n && e.date >= from && e.date <= to).length))); });
    return section("Class Summary", `${names.length} students`, table(["Student", ...cats.map(c => ({ t: c.name, cls: "num" })), { t: "Overall", cls: "num" }, { t: "Contacts", cls: "num" }, { t: "Support", cls: "num" }], rows, "tp-compact"));
  }

  /* ---------- one student's report ---------- */
  const SECTIONS = [["info", "Student information"], ["grades", "Grades"], ["gradesDetail", "Every grade (detail)"], ["calls", "Parent contact log"], ["support", "Student support"]];
  function report(name, o) {
    const page = h("article", { class: "tp-page" });
    const tch = teacher(), gr = grade();
    const { row } = infoData(name);
    page.append(
      h("header", { class: "tp-letterhead" },
        h("div", null, h("div", { class: "tp-org" }, tch || "Class Report"), gr ? h("div", { class: "tp-org-sub" }, gr) : null),
        h("div", { class: "tp-doc" }, h("div", { class: "tp-doc-title" }, o.title || "Student Report"), h("div", null, "Prepared " + fmtDate(today(), true)))),
      h("div", { class: "tp-student" },
        h("div", null, h("div", { class: "tp-label" }, "Student"), h("div", { class: "tp-name" }, name)),
        h("div", null, h("div", { class: "tp-label" }, "Period"), h("div", null, `${fmtDate(o.from, true)} – ${fmtDate(o.to, true)}`)),
        row.birthday ? h("div", null, h("div", { class: "tp-label" }, "Birthday"), h("div", null, pretty({ type: "date", key: "birthday" }, row.birthday))) : null));
    if (o.info) page.appendChild(infoSection(name));
    if (o.grades || o.gradesDetail) page.appendChild(gradesSection(name, o.from, o.to, !!o.gradesDetail));
    if (o.calls) page.appendChild(callsSection(name, o.from, o.to, o.notes));
    if (o.support) page.appendChild(supportSection(name, o.from, o.to, o.notes));
    page.appendChild(h("footer", { class: "tp-foot" }, h("span", null, o.notes ? "Confidential — for school use" : "Prepared for the family"), h("span", null, tch ? "Prepared by " + tch : "")));
    return page;
  }

  /* ---------- printing ---------- */
  function printPages(pages) {
    let area = document.getElementById("tp-print");
    if (!area) { area = h("div", { id: "tp-print" }); document.body.appendChild(area); }
    area.innerHTML = ""; pages.forEach(p => area.appendChild(p));
    document.body.classList.add("tp-printing");
    const done = () => { document.body.classList.remove("tp-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 50);
  }

  // the "Print report" window: who, which dates, which sections
  function dialog(opts) {
    opts = opts || {};
    const names = students();
    const overlay = h("div", { class: "pl-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
    const who = h("select", { class: "pl-select", "aria-label": "Student" },
      opts.allowAll !== false ? h("option", { value: "__all" }, `All students (${names.length}) — one page each`) : null,
      names.map(n => h("option", { value: n, selected: n === opts.student ? true : null }, n)));
    if (opts.student) who.value = opts.student;
    const from = h("input", { type: "date", class: "pl-dt", value: opts.from || schoolYearStart() }), to = h("input", { type: "date", class: "pl-dt", value: opts.to || today() });
    const preset = (f, t) => { from.value = f; to.value = t; };
    const chosen = new Set(opts.sections || ["info", "grades", "calls", "support"]);
    const checks = SECTIONS.map(([k, l]) => { const c = h("input", { type: "checkbox", "data-k": k }); c.checked = chosen.has(k); return h("label", { class: "check-line tp-opt" }, c, " " + l); });
    const notes = h("input", { type: "checkbox" }); notes.checked = opts.notes !== false;
    const summary = h("input", { type: "checkbox" }); summary.checked = !!opts.summary;
    const sumLine = h("label", { class: "check-line tp-opt" }, summary, " Start with a one-page class summary (when printing all students)");
    const msg = h("p", { class: "status err" });
    overlay.appendChild(h("div", { class: "pl-form tp-dialog" },
      h("div", { class: "pl-form-head" }, h("div", null, h("small", null, "Print"), h("h2", null, opts.title || "Student Report")), h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: () => overlay.remove() }, "×")),
      h("p", { class: "pl-label" }, "Student"), who,
      h("p", { class: "pl-label" }, "Dates"),
      h("div", { class: "tp-dates" }, from, h("span", null, "to"), to,
        h("span", { class: "pl-seg" },
          h("button", { type: "button", class: "pl-seg-btn", onclick: () => preset(schoolYearStart(), today()) }, "School year"),
          h("button", { type: "button", class: "pl-seg-btn", onclick: () => { const d = new Date(); preset(iso(new Date(d.getFullYear(), d.getMonth(), 1)), today()); } }, "This month"),
          h("button", { type: "button", class: "pl-seg-btn", onclick: () => preset("2000-01-01", today()) }, "Everything"))),
      h("p", { class: "pl-label" }, "Include"), h("div", { class: "tp-opts" }, checks),
      h("label", { class: "check-line tp-opt" }, notes, " Include private notes (call notes, support notes)"),
      sumLine, msg,
      h("div", { class: "pl-actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => overlay.remove() }, "Cancel"),
        h("button", { type: "button", class: "button", onclick: () => {
          const o = { from: from.value || "2000-01-01", to: to.value || today(), notes: notes.checked, title: opts.title };
          checks.forEach(l => { const c = l.querySelector("input"); o[c.dataset.k] = c.checked; });
          if (!SECTIONS.some(([k]) => o[k])) { msg.textContent = "Choose at least one thing to include."; return; }
          if (o.from > o.to) { msg.textContent = "The first date is after the second."; return; }
          const list = who.value === "__all" ? names : [who.value];
          if (!list.length) { msg.textContent = "Add your class list first."; return; }
          const pages = [];
          if (who.value === "__all" && summary.checked) { const p = h("article", { class: "tp-page" }, h("header", { class: "tp-letterhead" }, h("div", null, h("div", { class: "tp-org" }, teacher() || "Class Report"), grade() ? h("div", { class: "tp-org-sub" }, grade()) : null), h("div", { class: "tp-doc" }, h("div", { class: "tp-doc-title" }, "Class Summary"), h("div", null, `${fmtDate(o.from)} – ${fmtDate(o.to)}`))), classSummary(names, o.from, o.to)); pages.push(p); }
          list.forEach(n => pages.push(report(n, o)));
          overlay.remove(); printPages(pages);
        } }, "Print"))));
    const syncSum = () => sumLine.classList.toggle("hidden", who.value !== "__all");
    who.addEventListener("change", syncSum); syncSum();
    document.body.appendChild(overlay);
  }

  /* ---------- "Print report" button in each tool's heading ---------- */
  const TOOL_PRINT = {
    phonelog: { title: "Parent Contact Report", sections: ["calls"] },
    gradebook: { title: "Grade Report", sections: ["grades", "gradesDetail"], summary: true },
    support: { title: "Student Support Report", sections: ["support"] },
    info: { title: "Student Information", sections: ["info"], notes: false }
  };
  function addPrintButtons() {
    Object.entries(TOOL_PRINT).forEach(([id, o]) => {
      const head = document.querySelector(`#${id} .cr-head`); if (!head || head.querySelector(".tp-print-btn")) return;
      const btn = h("button", { type: "button", class: "ud-btn ghost tp-print-btn", onclick: () => dialog(o) }, "🖨 Print transcript");
      const bar = head.querySelector(".ud-bar");
      if (bar) bar.insertBefore(btn, bar.firstChild); else head.appendChild(h("div", { class: "ud-bar" }, btn));
    });
  }
  document.addEventListener("DOMContentLoaded", () => { addPrintButtons(); new MutationObserver(addPrintButtons).observe(document.body, { childList: true, subtree: true }); });

  window.TeacherPrint = { dialog, report, printPages, infoSection, gradesSection, callsSection, supportSection, gradeData, callsData, supportData, infoData, students, absentToday, schoolYearStart, today, fmtDate, pretty, tone };
})();

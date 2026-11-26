/* ============================================================
   STUDENT PROFILE (Teacher Tools)
   Everything about one student in one place: information, grades,
   parent contacts, student support — and a professional printout.
   ============================================================ */
(function () {
  let root, current = "", from = "", to = "";
  const P = () => window.TeacherPrint;
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.entries(v).forEach(([p, x]) => e.style[p] = x);
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const goTool = t => { const b = document.querySelector(`.tt-switch [data-tool="${t}"], .sec-choice[data-key="${t}"]`); if (b) b.click(); window.scrollTo({ top: 0 }); };

  function open(container) {
    root = container;
    const names = P().students();
    try { current = current || localStorage.getItem("teacher_profile_last") || ""; } catch {}
    if (!names.includes(current)) current = names[0] || "";
    from = from || P().schoolYearStart(); to = to || P().today();
    draw();
  }
  function pick(n) { current = n; try { localStorage.setItem("teacher_profile_last", n); } catch {} draw(); }

  function draw() {
    root.innerHTML = "";
    const names = P().students();
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Student Profile"),
      h("p", { class: "help", style: { margin: 0 } }, "Everything about one student — information, grades, parent contacts and support — in one place.")));
    if (!names.length) { root.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list first (Teacher Tools → Student Info, or Classroom Tools → Students)."))); return; }
    const i = names.indexOf(current);
    const sel = h("select", { class: "pl-select spf-select", "aria-label": "Student", onchange: e => pick(e.target.value) }, names.map(n => h("option", { value: n, selected: n === current ? true : null }, n)));
    const fromIn = h("input", { type: "date", class: "pl-dt", value: from, onchange: e => { from = e.target.value || "2000-01-01"; draw(); } });
    const toIn = h("input", { type: "date", class: "pl-dt", value: to, onchange: e => { to = e.target.value || P().today(); draw(); } });
    root.appendChild(h("div", { class: "card spf-bar" },
      h("div", { class: "spf-pick" },
        h("button", { type: "button", class: "small-btn", "aria-label": "Previous student", disabled: i <= 0 ? true : null, onclick: () => pick(names[i - 1]) }, "‹"),
        sel,
        h("button", { type: "button", class: "small-btn", "aria-label": "Next student", disabled: i >= names.length - 1 ? true : null, onclick: () => pick(names[i + 1]) }, "›")),
      h("div", { class: "spf-range" }, h("span", null, "From"), fromIn, h("span", null, "to"), toIn,
        h("button", { type: "button", class: "small-btn", onclick: () => { from = P().schoolYearStart(); to = P().today(); draw(); } }, "School year"),
        h("button", { type: "button", class: "small-btn", onclick: () => { from = "2000-01-01"; to = P().today(); draw(); } }, "All")),
      h("button", { type: "button", class: "button spf-print", onclick: () => P().dialog({ student: current, allowAll: true, from, to, title: "Student Report", sections: ["info", "grades", "calls", "support"] }) }, "🖨 Print transcript")));

    const name = current;
    const { row, fields } = P().infoData(name);
    const G = P().gradeData(name, from, to);
    const { calls } = P().callsData(name, from, to);
    const sup = P().supportData(name, from, to);
    const absent = P().absentToday().includes(name);
    const fus = calls.filter(c => c.followUp && !c.followUp.done);
    const last = calls[calls.length - 1];

    // header card
    const fieldsTop = fields.filter(f => f.key !== "birthday").slice(0, 6);
    root.appendChild(h("div", { class: "card spf-hero" },
      h("div", { class: "spf-id" }, h("span", { class: "spf-av" }, initials(name)),
        h("div", null, h("h2", null, name),
          h("div", { class: "spf-tags" },
            row.birthday ? h("span", { class: "spf-tag" }, "🎂 " + P().pretty({ type: "date", key: "birthday" }, row.birthday)) : null,
            h("span", { class: "spf-tag " + (absent ? "red" : "green") }, absent ? "Absent today" : "Here today")))),
      fieldsTop.length ? h("dl", { class: "spf-contact" }, fieldsTop.map(f => [h("dt", null, f.label), h("dd", null,
        f.type === "tel" ? h("a", { href: "tel:" + row[f.key].replace(/[^0-9+]/g, "") }, row[f.key]) : f.type === "email" ? h("a", { href: "mailto:" + row[f.key] }, row[f.key]) : P().pretty(f, row[f.key]))]))
        : h("p", { class: "help" }, "No contact information yet — add it in ", h("a", { href: "#", onclick: e => { e.preventDefault(); goTool("info"); } }, "Student Info"), ".")));

    // tiles
    const tile = (label, big, sub, cls, tool) => h("button", { type: "button", class: "spf-tile " + (cls || ""), onclick: () => goTool(tool) }, h("span", { class: "spf-tile-l" }, label), h("strong", null, big), h("small", null, sub));
    root.appendChild(h("div", { class: "spf-tiles" },
      tile("Overall grade", G && G.overall != null ? Math.round(G.overall) + "%" : "—", G ? `${G.cats.reduce((a, x) => a + x.entries.length, 0)} grades entered` : "Gradebook not set up", G && G.overall != null ? "t-" + P().tone(G.overall, G) : "", "gradebook"),
      tile("Parent contacts", String(calls.length), last ? "Last: " + P().fmtDate(last.ts) : "None in these dates", calls.length ? "" : "t-r", "phonelog"),
      tile("Open follow-ups", String(fus.length), fus.length ? fus.map(c => c.followUp.due ? "due " + P().fmtDate(c.followUp.due) : "no date").slice(0, 2).join(", ") : "All caught up", fus.length ? "t-y" : "t-g", "phonelog"),
      tile("Support", String(sup.length), `${sup.filter(e => e.outcome === "worked").length} worked · ${sup.filter(e => e.kind === "plan").length} planned`, "", "support")));

    // sections (same as the printout)
    const card = (tool, label, el) => h("div", { class: "card spf-card" }, h("div", { class: "spf-card-tools" }, h("button", { type: "button", class: "small-btn", onclick: () => goTool(tool) }, "Open " + label + " ›")), el);
    root.appendChild(card("gradebook", "Gradebook", P().gradesSection(name, from, to, true)));
    root.appendChild(card("phonelog", "Phone Log", P().callsSection(name, from, to, true)));
    root.appendChild(card("support", "Student Support", P().supportSection(name, from, to, true)));
    root.appendChild(card("info", "Student Info", P().infoSection(name)));
    // every call and support entry can be edited or deleted right here
    const actions = (sel, edit, del, what) => root.querySelectorAll(sel).forEach(tr => {
      const id = tr.getAttribute(sel.slice(3, -1)); const tbl = tr.closest("table");
      if (!tbl.querySelector("th.tp-act")) tbl.querySelector("thead tr").appendChild(h("th", { class: "tp-act" }, ""));
      tr.appendChild(h("td", { class: "tp-act" },
        edit ? h("button", { type: "button", class: "small-btn", onclick: () => edit(id) }, "Edit") : null,
        h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm(`Delete this ${what}? It will be removed as if it never happened.`)) { del(id); draw(); } } }, "Delete")));
    });
    const rawDel = (key, list, id) => { try { const d = JSON.parse(localStorage.getItem(key) || "{}"); d[list] = (d[list] || []).filter(x => x.id !== id); localStorage.setItem(key, JSON.stringify(d)); } catch {} };
    actions("tr[data-call]", window.PhoneLog && PhoneLog.editCall, id => window.PhoneLog ? PhoneLog.deleteCall(id) : rawDel("teacher_phone_log_v1", "calls", id), "call");
    actions("tr[data-support]", window.StudentSupport && StudentSupport.editEntry, id => window.StudentSupport ? StudentSupport.deleteEntry(id) : rawDel("teacher_support_v1", "entries", id), "entry");
  }
  // redraw after a change made in an edit window
  let redrawT = null;
  window.addEventListener("teacher-undo-changed", () => { if (root && root.offsetParent !== null) { clearTimeout(redrawT); redrawT = setTimeout(draw, 150); } });

  window.StudentProfile = { open, refresh: () => root && draw() };
})();

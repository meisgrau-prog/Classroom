/* ============================================================
   Student Info (Teacher Tools): birthdays, parents, phones, emails…
   Load it from Excel / paste, or type it in. Fully changeable fields.
   Saved ONLY in this browser — never posted on the website.
   ============================================================ */
(function () {
  const STORE = "teacher_student_info_v1";
  const OLD_BDAYS = "teacher_birthdays_v1";
  const STUDENTS = "classroom_students_v1";
  const TYPES = [["text", "Text"], ["tel", "Phone"], ["email", "Email"], ["date", "Birthday / date"], ["long", "Long text"]];
  const DEFAULT_FIELDS = () => [
    { key: "birthday", label: "Birthday", type: "date" },
    { key: "mother", label: "Mother's name", type: "text" },
    { key: "motherPhone", label: "Mother's cell", type: "tel" },
    { key: "motherEmail", label: "Mother's email", type: "email" },
    { key: "father", label: "Father's name", type: "text" },
    { key: "fatherPhone", label: "Father's cell", type: "tel" },
    { key: "fatherEmail", label: "Father's email", type: "email" },
    { key: "homePhone", label: "Home phone", type: "tel" },
    { key: "address", label: "Address", type: "text" },
    { key: "medical", label: "Allergies / medical", type: "long" },
    { key: "notes", label: "Notes", type: "long" }
  ];

  /* ---------- data ---------- */
  let S = { fields: DEFAULT_FIELDS(), rows: {} };
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.fields)) S = s; } catch {}
    S.rows = S.rows || {};
    if (!S.fields.some(f => f.key === "birthday")) S.fields.unshift({ key: "birthday", label: "Birthday", type: "date" });
    // bring over birthdays saved by the earlier birthday box
    try {
      const old = JSON.parse(localStorage.getItem(OLD_BDAYS) || "null");
      if (old && Object.keys(old).length) {
        Object.entries(old).forEach(([n, b]) => { const r = S.rows[n] || (S.rows[n] = {}); if (!r.birthday) r.birthday = b; });
        save(); localStorage.removeItem(OLD_BDAYS);
      }
    } catch {}
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { alert("Couldn't save — this browser's storage may be full."); } }
  function classList() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; } }
  function addToClass(names) {
    try {
      const s = JSON.parse(localStorage.getItem(STUDENTS) || "null") || { names: [], absent: [] };
      names.forEach(n => { if (!s.names.some(x => x.toLowerCase() === n.toLowerCase())) s.names.push(n); });
      localStorage.setItem(STUDENTS, JSON.stringify(s));
    } catch {}
  }
  const allNames = () => { const c = classList(); return c.concat(Object.keys(S.rows).filter(n => !c.includes(n) && Object.values(S.rows[n]).some(Boolean)).sort()); };
  const field = k => S.fields.find(f => f.key === k);

  /* ---------- values ---------- */
  const pad = n => String(n).padStart(2, "0");
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // 2015-03-14, 3/14/2015, 3/14, March 14 2015, Excel date numbers → "YYYY-MM-DD" (or "--MM-DD" with no year)
  function parseBirthday(v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return null;
    let y = "", m, d, r;
    if (/^\d{4,5}(\.\d+)?$/.test(v) && +v > 1000 && +v < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 86400000);
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    }
    if ((r = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = r[1]; m = +r[2]; d = +r[3]; }
    else if ((r = v.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/))) { m = +r[1]; d = +r[2]; if (r[3]) y = r[3].length === 2 ? (+r[3] > 40 ? "19" : "20") + r[3] : r[3]; }
    else {
      const mi = MONTHS.findIndex(x => v.toLowerCase().includes(x));
      const nums = v.match(/\d+/g) || [];
      if (mi < 0 || !nums.length) return null;
      m = mi + 1;
      const day = nums.find(n => +n >= 1 && +n <= 31 && n.length <= 2), year = nums.find(n => n.length === 4);
      if (!day) return null; d = +day; if (year) y = year;
    }
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return (y ? y : "-") + `-${pad(m)}-${pad(d)}`;
  }
  const hasYear = b => /^\d{4}/.test(b || "");
  function prettyDate(b) {
    if (!b || !/\d{2}-\d{2}$/.test(b)) return b || "";
    const [m, d] = b.slice(-5).split("-").map(Number);
    return new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + (hasYear(b) ? ", " + b.slice(0, 4) : "");
  }
  function age(b) {
    if (!hasYear(b)) return null;
    const [y, m, d] = b.split("-").map(Number), now = new Date();
    return now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
  }
  function cleanPhone(v) {
    v = String(v || "").trim();
    const digits = v.replace(/\D/g, "");
    if (/^\d+(\.0+)?$/.test(v) && digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (/^1?\d{10}$/.test(v.replace(/[\s().\-]/g, "")) && digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return v;
  }
  function cleanValue(f, v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return "";
    if (f.type === "date") return parseBirthday(v) || v;
    if (f.type === "tel") return cleanPhone(v);
    return v;
  }
  const showValue = (f, v) => f.type === "date" ? prettyDate(v) : v;

  /* ---------- reading a sheet with all the info ---------- */
  // which field a column heading belongs to (null = make a new field)
  function fieldForHeading(head) {
    const x = head.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
    if (!x) return "";
    const exact = S.fields.find(f => f.label.toLowerCase() === x);
    if (exact) return exact.key;
    const email = /e-?mail/.test(x), phone = /phone|cell|tel\b|mobile|number|#/.test(x) && !email;
    if (/birth|dob|b-?day/.test(x)) return "birthday";
    let who = /mother|\bmom|mommy|\bima\b/.test(x) ? "mother" : /father|\bdad|\babba\b|tatty|totty/.test(x) ? "father" : "";
    if (who && email) return who + "Email";
    if (who && phone) return who + "Phone";
    if (who) return who;
    if (/home|house/.test(x) && phone) return "homePhone";
    if (/address|street/.test(x)) return "address";
    if (/allerg|medical|health|medicine/.test(x)) return "medical";
    if (/^(notes?|comments?)$/.test(x)) return "notes";
    return null;
  }
  // rows from Excel/CSV/paste → info. Returns a report.
  function importRows(rows, addNew) {
    rows = rows.map(r => Array.from(r, c => String(c == null ? "" : c).replace(/\s+/g, " ").trim())).filter(r => r.some(Boolean));
    if (!rows.length) throw new Error("That sheet is empty.");
    const det = window.Classroom && Classroom.detectColumns ? Classroom.detectColumns(rows) : { start: 1, first: 0, last: -1 };
    if (!det.start) throw new Error("The first row needs headings, like “First Name”, “Last Name”, “Birthday”, “Mother's cell”.");
    const head = rows[det.start - 1];
    const used = new Set([det.first, det.last]);
    const map = [];      // [colIndex, fieldKey]
    const created = [];
    head.forEach((hd, i) => {
      if (used.has(i) || !hd || /^\d+$/.test(hd)) return;
      let k = fieldForHeading(hd);
      if (k === "") return;
      if (k && !field(k)) { const d = DEFAULT_FIELDS().find(f => f.key === k); if (d) S.fields.push(d); else k = null; }
      if (!k) {
        k = "f_" + hd.toLowerCase().replace(/[^a-z0-9א-ת]+/g, "_").slice(0, 30) + "_" + i;
        if (!field(k)) { S.fields.push({ key: k, label: hd, type: /e-?mail/i.test(hd) ? "email" : /phone|cell|mobile/i.test(hd) ? "tel" : /date/i.test(hd) ? "date" : "text" }); created.push(hd); }
      }
      map.push([i, k]);
    });
    if (!map.length) throw new Error("No info columns found next to the names. Check that the first row has headings.");
    const cls = classList();
    const match = n => cls.find(x => x.toLowerCase() === n.toLowerCase())
      || cls.find(x => { const a = x.toLowerCase().split(" "), c = n.toLowerCase().split(" "); return a.length > 1 && c.length > 1 && a[0] === c[c.length - 1] && a[a.length - 1] === c[0]; });
    let people = 0; const fresh = [];
    rows.slice(det.start).forEach(r => {
      const n = [det.first >= 0 ? r[det.first] : "", det.last >= 0 ? r[det.last] : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!n) return;
      const m = match(n), name = m || n;
      if (!m) fresh.push(name);
      const row = S.rows[name] || (S.rows[name] = {});
      map.forEach(([i, k]) => { const v = cleanValue(field(k), r[i]); if (v) row[k] = v; });
      people++;
    });
    if (!people) throw new Error("No student names found under the headings.");
    if (addNew && fresh.length) addToClass(fresh);
    save();
    return { people, fields: map.map(([, k]) => field(k).label), created, fresh: fresh.length, added: addNew };
  }

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
  function download(name, text) {
    const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================= the tool ================= */
  let root, tabsEl, panels = {}, current = "all", search = "";
  const TABS = [["all", "All Students"], ["load", "Load Info"], ["fields", "Settings"]];
  function show(k) {
    current = k;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k ? "true" : "false"));
    Object.entries(panels).forEach(([key, el]) => el.classList.toggle("hidden", key !== k));
    ({ all: drawAll, load: drawLoad, fields: drawFields })[k]();
  }

  function valueNode(f, v) {
    if (f.type === "tel") return h("a", { href: "tel:" + v.replace(/[^0-9+]/g, ""), class: "si-link" }, v);
    if (f.type === "email") return h("a", { href: "mailto:" + v, class: "si-link" }, v);
    return h("span", null, showValue(f, v));
  }

  function drawAll() {
    const p = panels.all; p.innerHTML = "";
    const names = allNames();
    if (!names.length) {
      p.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "No students yet. Load an Excel sheet with your class's info, or add students one at a time."),
        h("div", { class: "actions", style: "justify-content:center" }, h("button", { type: "button", class: "button", onclick: () => show("load") }, "Load Info"),
          h("button", { type: "button", class: "button secondary", onclick: () => edit("") }, "+ Add a student"))));
      return;
    }
    const q = h("input", { type: "search", class: "si-search", placeholder: "Search names, parents, phones…", value: search });
    const grid = h("div", { class: "si-grid" });
    const count = h("span", { class: "help" });
    function fill() {
      grid.innerHTML = "";
      const term = search.toLowerCase();
      const list = names.filter(n => !term || n.toLowerCase().includes(term) || Object.values(S.rows[n] || {}).some(v => String(v).toLowerCase().includes(term)));
      count.textContent = `${list.length} of ${names.length} students`;
      list.forEach(n => {
        const r = S.rows[n] || {};
        const a = age(r.birthday);
        const dl = h("dl", { class: "si-dl" });
        S.fields.filter(f => !f.hidden && f.key !== "birthday" && r[f.key]).forEach(f => dl.append(h("dt", null, f.label), h("dd", null, valueNode(f, r[f.key]))));
        const filled = S.fields.filter(f => r[f.key]).length;
        grid.appendChild(h("article", { class: "si-card" },
          h("header", null, h("div", null, h("h3", null, n),
            r.birthday ? h("small", null, "🎂 " + prettyDate(r.birthday) + (a != null ? ` · age ${a}` : "")) : h("small", { class: "si-missing" }, "No birthday yet")),
            h("button", { type: "button", class: "small-btn", onclick: () => edit(n) }, "Edit")),
          filled ? dl : h("p", { class: "th-none" }, "No info yet — click Edit to add.")));
      });
      if (!list.length) grid.appendChild(h("p", { class: "th-none" }, "No matches."));
    }
    q.addEventListener("input", () => { search = q.value; fill(); });
    p.appendChild(h("div", { class: "card pl-bar" }, q, count,
      h("span", { class: "pl-bar-btns" },
        h("button", { type: "button", class: "button secondary", onclick: () => edit("") }, "+ Add a student"),
        h("button", { type: "button", class: "button secondary", onclick: exportCsv }, "Download Excel (CSV)"),
        h("button", { type: "button", class: "button secondary", onclick: () => window.print() }, "Print"))));
    p.appendChild(h("h2", { class: "gb-print-title" }, "Student Info"));
    p.appendChild(grid);
    fill();
  }

  function edit(name) {
    const isNew = !name;
    const r = Object.assign({}, S.rows[name] || {});
    const overlay = h("div", { class: "pl-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
    const nameIn = h("input", { type: "text", value: name, placeholder: "First Last" });
    const inputs = {};
    const msg = h("p", { class: "status err" });
    const body = h("div", { class: "si-form" },
      h("label", { class: "si-full" }, "Student name", nameIn),
      S.fields.map(f => {
        const inp = f.type === "long" ? h("textarea", { rows: "2" }) : h("input", { type: f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text", placeholder: f.type === "date" ? "e.g. 3/14/2015" : "" });
        inp.value = f.type === "date" ? prettyDate(r[f.key] || "") : (r[f.key] || "");
        inputs[f.key] = inp;
        return h("label", { class: f.type === "long" ? "si-full" : "" }, f.label, inp);
      }));
    const doSave = () => {
      const n = nameIn.value.replace(/\s+/g, " ").trim();
      if (!n) { msg.textContent = "Type the student's name."; return; }
      const row = {};
      for (const f of S.fields) {
        const v = inputs[f.key].value.trim();
        if (!v) continue;
        if (f.type === "date" && !parseBirthday(v)) { msg.textContent = `Couldn't read “${v}” as a date. Try 3/14/2015 or March 14.`; inputs[f.key].focus(); return; }
        row[f.key] = cleanValue(f, v);
      }
      if (!isNew && n !== name) delete S.rows[name];
      S.rows[n] = row;
      if (isNew || n !== name) addToClass([n]);
      save(); overlay.remove(); drawAll();
    };
    overlay.appendChild(h("div", { class: "pl-form si-edit" },
      h("div", { class: "pl-form-head" }, h("div", null, h("small", null, "Student Info"), h("h2", null, isNew ? "Add a student" : name)),
        h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: () => overlay.remove() }, "×")),
      body, msg,
      h("div", { class: "pl-actions" },
        h("button", { type: "button", class: "button", onclick: doSave }, "Save"),
        !isNew ? h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm(`Clear all info for ${name}? (They stay in your class list.)`)) { delete S.rows[name]; save(); overlay.remove(); drawAll(); } } }, "Clear this student's info") : null)));
    document.body.appendChild(overlay);
    (isNew ? nameIn : (inputs[S.fields[0].key] || nameIn)).focus();
  }

  function exportCsv() {
    const names = allNames();
    const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const lines = [["Student"].concat(S.fields.map(f => f.label)).map(q).join(",")];
    names.forEach(n => { const r = S.rows[n] || {}; lines.push([n].concat(S.fields.map(f => f.type === "date" ? (r[f.key] || "").replace(/^-/, "") : (r[f.key] || ""))).map(q).join(",")); });
    download("Student Info.csv", lines.join("\r\n"));
  }

  function drawLoad() {
    const p = panels.load; p.innerHTML = "";
    const msg = h("div", { class: "status" });
    const addChk = h("input", { type: "checkbox" }); addChk.checked = true;
    const report = r => {
      msg.className = "status ok"; msg.innerHTML = "";
      msg.append(`✓ Loaded info for ${r.people} student${r.people === 1 ? "" : "s"}. Columns used: ${r.fields.join(", ")}.`);
      if (r.created.length) msg.append(h("br"), `New fields made for: ${r.created.join(", ")} (rename or remove them in Settings).`);
      if (r.fresh) msg.append(h("br"), r.added ? `${r.fresh} new name${r.fresh === 1 ? " was" : "s were"} added to your class list.` : `${r.fresh} name${r.fresh === 1 ? " isn't" : "s aren't"} in your class list.`);
    };
    const file = h("input", { type: "file", accept: ".xlsx,.xlsm,.csv,.txt,.tsv", class: "hidden" });
    file.addEventListener("change", async () => {
      const f = file.files[0]; file.value = ""; if (!f) return;
      msg.className = "status"; msg.textContent = "Reading " + f.name + "…";
      try {
        if (!window.Classroom || !Classroom.readSheetRows) throw new Error("The file reader didn't load. Refresh the page and try again.");
        report(importRows(await Classroom.readSheetRows(f), addChk.checked));
      } catch (e) { msg.className = "status err"; msg.textContent = e.message; }
    });
    const paste = h("textarea", { rows: "6", placeholder: "Copy rows from Excel or Google Sheets (with the heading row) and paste here.\nFirst Name\tLast Name\tBirthday\tMother's cell\nAvi\tCohen\t3/14/2015\t848-555-1234" });
    p.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Load Student Info"),
      h("p", { class: "help" }, "Upload an Excel sheet (or CSV) with one row per student. The first row should have headings. The names can be one column (“Student”) or two (“First Name”, “Last Name”). Any other columns are loaded too: birthday, mother's / father's name, cell, email, home phone, address, allergies… Columns that don't match a field get a new field of their own."),
      h("button", { type: "button", class: "cr-upload", onclick: () => file.click() },
        h("span", { class: "cr-upload-icon", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>' }),
        h("span", null, h("strong", null, "Upload Excel sheet"), h("small", null, ".xlsx or .csv — loads every column"))), file,
      h("details", { class: "pz-more" }, h("summary", null, "Or paste rows from a spreadsheet"), paste,
        h("div", { class: "actions", style: "margin-top:8px" }, h("button", { type: "button", class: "small-btn", onclick: () => {
          try { if (!paste.value.trim()) throw new Error("Paste some rows first."); const rows = window.Classroom ? Classroom._test.parseDelimited(paste.value) : paste.value.split("\n").map(l => l.split("\t")); report(importRows(rows, addChk.checked)); paste.value = ""; }
          catch (e) { msg.className = "status err"; msg.textContent = e.message; }
        } }, "Load pasted rows"))),
      h("label", { class: "check-line", style: "margin-top:12px" }, addChk, " Add new names to my class list (used by every tool)"),
      msg,
      h("p", { class: "help", style: "margin-top:14px" }, "Loading again adds to what's there: filled-in cells replace the old value, empty cells leave it alone. To type info for one student, use All Students → Edit.")));
    p.appendChild(h("div", { class: "card" }, h("h2", { class: "section-title" }, "Private"),
      h("p", { class: "help", style: "margin:0" }, "Student info is saved only in this browser on this device — never posted on the website. Use Settings → Backup to copy it to another computer.")));
  }

  function drawFields() {
    const p = panels.fields; p.innerHTML = "";
    const list = h("div", { class: "si-fields" });
    function fill() {
      list.innerHTML = "";
      S.fields.forEach((f, i) => {
        const label = h("input", { type: "text", value: f.label, "aria-label": "Field name" });
        label.addEventListener("change", () => { f.label = label.value.trim() || f.label; label.value = f.label; save(); });
        const type = h("select", { "aria-label": "Kind" }, TYPES.map(([v, t]) => h("option", { value: v }, t)));
        type.value = f.type || "text";
        type.addEventListener("change", () => { f.type = type.value; save(); });
        const showChk = h("input", { type: "checkbox" }); showChk.checked = !f.hidden;
        showChk.addEventListener("change", () => { f.hidden = !showChk.checked; save(); });
        const mv = d => () => { const j = i + d; if (j < 0 || j >= S.fields.length) return; [S.fields[i], S.fields[j]] = [S.fields[j], S.fields[i]]; save(); fill(); };
        list.appendChild(h("div", { class: "si-field" }, label, type,
          h("label", { class: "check-line", style: "margin:0" }, showChk, " On cards"),
          h("span", { class: "th-move" },
            h("button", { type: "button", class: "small-btn", disabled: i === 0 ? true : null, "aria-label": "Move up", onclick: mv(-1) }, "↑"),
            h("button", { type: "button", class: "small-btn", disabled: i === S.fields.length - 1 ? true : null, "aria-label": "Move down", onclick: mv(1) }, "↓"),
            f.key === "birthday" ? null : h("button", { type: "button", class: "small-btn danger", onclick: () => {
              const used = Object.values(S.rows).filter(r => r[f.key]).length;
              if (!confirm(used ? `Delete “${f.label}”? It has info for ${used} student${used === 1 ? "" : "s"}, which will be removed.` : `Delete “${f.label}”?`)) return;
              S.fields.splice(i, 1); Object.values(S.rows).forEach(r => delete r[f.key]); save(); fill();
            } }, "Delete"))));
      });
    }
    fill();
    const restore = h("input", { type: "file", accept: ".json", class: "hidden" });
    restore.addEventListener("change", async () => {
      const f = restore.files[0]; restore.value = ""; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (!d || !Array.isArray(d.fields) || typeof d.rows !== "object") throw 0;
        if (!confirm("Replace all student info on this device with the backup?")) return; S = d; save(); drawFields(); alert("✓ Restored."); }
      catch { alert("That isn't a Student Info backup file."); }
    });
    p.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Fields"),
      h("p", { class: "help" }, "The info you keep for each student. Rename, reorder, change the kind (phones become tap-to-call, emails tap-to-email, birthdays show on your home page), or hide a field from the cards."),
      list,
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => { S.fields.push({ key: "f_" + Date.now().toString(36), label: "New field", type: "text" }); save(); fill(); const ins = list.querySelectorAll("input[type=text]"); ins[ins.length - 1].select(); } }, "+ Add field"),
        h("button", { type: "button", class: "small-btn", onclick: () => { if (!confirm("Put the fields back to the original list? Info in fields you added is kept only if you add the field again.")) return; S.fields = DEFAULT_FIELDS(); save(); fill(); } }, "Reset fields"))));
    p.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Backup"),
      h("p", { class: "help" }, "Student info is private: saved only in this browser. Download a backup now and then, and use Restore to move it to another computer."),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })), download: `Student Info backup ${new Date().toISOString().slice(0, 10)}.json` });
          document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
        } }, "Download backup"),
        h("button", { type: "button", class: "button secondary", onclick: () => restore.click() }, "Restore backup"), restore,
        h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm("Delete ALL student info on this device? (Your class list stays.)")) { S.rows = {}; save(); alert("Student info cleared."); } } }, "Delete all student info"))));
  }

  function open(container) {
    root = container; load();
    root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Student Info"),
      h("p", { class: "help", style: "margin:0" }, "Birthdays, parents, phone numbers and more. Saved only on this device — never posted on the website.")));
    tabsEl = h("div", { class: "pl-tabs", role: "tablist" });
    TABS.forEach(([k, label]) => tabsEl.appendChild(h("button", { type: "button", role: "tab", "data-tab": k, onclick: () => show(k) }, label)));
    root.appendChild(tabsEl);
    TABS.forEach(([k]) => { panels[k] = h("div", { class: "pl-panel" }); root.appendChild(panels[k]); });
    show(allNames().length ? "all" : "load");
  }

  window.StudentInfo = { open, _t: { parseBirthday, importRows, fieldForHeading, cleanPhone, load, get: () => S } };
})();

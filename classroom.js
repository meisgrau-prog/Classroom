/* ============================================================
   CLASSROOM TOOLS (Teacher Portal → Classroom)
   - Student list: upload a sheet (Excel .xlsx, .csv, .txt) or type names.
     The list is saved ONLY in this browser on this device. It is never
     uploaded to GitHub or shown on the website.
   - Tools: Group Maker, Random Number, Random Student.
   ============================================================ */
(function () {
  const STORE = "classroom_students_v1";
  let root = null;
  let state = { names: [], absent: [] };

  /* ---------- storage (this device only) ---------- */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && Array.isArray(s.names)) state = { names: s.names, absent: Array.isArray(s.absent) ? s.absent : [] };
    } catch {}
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  }
  const present = () => state.names.filter(n => !state.absent.includes(n));

  /* ---------- fair randomness ---------- */
  function randInt(n) {                 // 0 … n-1, without bias
    const buf = new Uint32Array(1), limit = Math.floor(0x100000000 / n) * n;
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(k => { if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); });
    return e;
  }
  const ICON = {
    students: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.7 5.5 5.8"/></svg>',
    groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
    number: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>',
    student: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  };

  /* ---------- reading a sheet of names ---------- */
  function parseDelimited(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const sample = lines.slice(0, 5).join("\n");
    const delim = (sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length ? "\t"
      : (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }

  // Minimal .xlsx reader: unzip with the browser's DecompressionStream, read the first sheet.
  async function readXlsx(buffer) {
    const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("This doesn't look like an Excel file.");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      files[name] = { method, csize, local };
      p += 46 + nameLen + extraLen + commLen;
    }
    async function text(name) {
      const f = files[name];
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      if (f.method !== 8) throw new Error("Unsupported Excel compression.");
      if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open Excel files. Please save the sheet as CSV.");
      const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
      return dec.decode(out);
    }
    const xml = s => new DOMParser().parseFromString(s, "application/xml");
    const tags = (doc, t) => Array.from(doc.getElementsByTagNameNS("*", t));

    // first sheet's file
    let sheetPath = "xl/worksheets/sheet1.xml";
    const wb = await text("xl/workbook.xml"), rels = await text("xl/_rels/workbook.xml.rels");
    if (wb && rels) {
      const first = tags(xml(wb), "sheet")[0];
      const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
      const rel = tags(xml(rels), "Relationship").find(r => r.getAttribute("Id") === rid);
      if (rel) {
        const t = rel.getAttribute("Target").replace(/^\//, "");
        sheetPath = t.startsWith("xl/") ? t : "xl/" + t;
      }
    }
    const ssText = await text("xl/sharedStrings.xml");
    const shared = ssText ? tags(xml(ssText), "si").map(si => tags(si, "t").map(t => t.textContent).join("")) : [];
    const sheetText = await text(sheetPath);
    if (!sheetText) throw new Error("Couldn't find a sheet in this file.");
    const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    return tags(xml(sheetText), "row").map(r => {
      const out = [];
      tags(r, "c").forEach((c, i) => {
        const ref = c.getAttribute("r"), type = c.getAttribute("t");
        const v = tags(c, "v")[0];
        let val = "";
        if (type === "s") val = shared[parseInt(v && v.textContent, 10)] || "";
        else if (type === "inlineStr") val = tags(c, "t").map(t => t.textContent).join("");
        else val = v ? v.textContent : "";
        out[ref ? colIndex(ref) : i] = val;
      });
      return Array.from(out, x => x || "");
    });
  }

  // Clean the rows from a sheet (trim, drop empty rows).
  function cleanRows(rows) {
    return rows.map(r => Array.from(r, c => String(c == null ? "" : c).replace(/\s+/g, " ").trim()))
               .filter(r => r.some(Boolean));
  }
  const colLetter = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const isWordy = v => !!v && /[A-Za-zÀ-ɏ֐-׿]/.test(v) && !/\d/.test(v);

  // Guess which row the names start on and which columns hold the first and last names.
  function detectColumns(rows) {
    for (let hi = 0; hi < Math.min(6, rows.length); hi++) {
      const head = rows[hi].map(c => c.toLowerCase());
      const find = re => head.findIndex(c => re.test(c));
      const first = find(/first|given|fname|f\.\s*name/);
      const last = find(/last|surname|family|lname|l\.\s*name/);
      const name = find(/^(student|name|full\s*name|student\s*name|students|names)$/);
      if (first >= 0) return { start: hi + 1, first, last };
      if (name >= 0) return { start: hi + 1, first: name, last: last >= 0 && last !== name ? last : -1 };
      if (last >= 0) return { start: hi + 1, first: last, last: -1 };
    }
    // No headings: if the first two columns are mostly single words, treat them as First | Last.
    const body = rows.slice(0, 40);
    const twoWords = body.filter(r => isWordy(r[0]) && isWordy(r[1]) && !/\s/.test(r[0]) && !/\s/.test(r[1])).length;
    if (body.length && twoWords / body.length >= 0.6) return { start: 0, first: 0, last: 1 };
    const col = Math.max(0, (rows[0] || []).findIndex(isWordy));
    return { start: 0, first: col, last: -1 };
  }

  function namesFromColumns(rows, opt) {
    const seen = new Set();
    return rows.slice(Math.max(0, opt.start || 0)).map(r => {
      const f = opt.first >= 0 ? (r[opt.first] || "") : "", l = opt.last >= 0 ? (r[opt.last] || "") : "";
      return [f, l].filter(Boolean).join(" ").trim();
    }).filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  }
  // Kept for simple uses (and tests): rows → names using the automatic guess.
  function rowsToNames(rows) { rows = cleanRows(rows); return namesFromColumns(rows, detectColumns(rows)); }

  async function readSheetRows(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "xls") throw new Error("Old Excel (.xls) files can't be read. In Excel, use File → Save As → Excel Workbook (.xlsx) or CSV.");
    const rows = (ext === "xlsx" || ext === "xlsm") ? await readXlsx(await file.arrayBuffer()) : parseDelimited(await file.text());
    return cleanRows(rows);
  }

  /* ---------- page ---------- */
  let current = "students";
  const views = {};

  function open(container) {
    if (!root) {
      root = container;
      load();
      build();
    }
    refreshAll();
  }

  function build() {
    root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" },
      h("h1", { class: "page-title" }, "Classroom"),
      h("p", { class: "help", style: "margin:0" }, "Teacher tools for class. Nothing here is posted on the website.")
    ));
    const tools = [
      ["students", "Students", ICON.students],
      ["groups", "Group Maker", ICON.groups],
      ["number", "Random Number", ICON.number],
      ["picker", "Random Student", ICON.student]
    ];
    const menu = h("nav", { class: "cr-menu", "aria-label": "Classroom tools" });
    tools.forEach(([key, label, icon]) => {
      menu.appendChild(h("button", { type: "button", class: "cr-tool", "data-tool": key, onclick: () => show(key) },
        h("span", { class: "cr-tool-icon", html: icon }), h("span", null, label)));
    });
    root.appendChild(menu);
    views.students = studentsView();
    views.groups = groupsView();
    views.number = numberView();
    views.picker = pickerView();
    Object.values(views).forEach(v => root.appendChild(v.el));
    show(current);
  }
  function show(key) {
    current = key;
    root.querySelectorAll(".cr-tool").forEach(b => b.setAttribute("aria-current", b.dataset.tool === key ? "true" : "false"));
    Object.entries(views).forEach(([k, v]) => v.el.classList.toggle("hidden", k !== key));
    if (views[key].refresh) views[key].refresh();
  }
  function refreshAll() { Object.values(views).forEach(v => v.refresh && v.refresh()); }

  function needStudents(box) {
    box.innerHTML = "";
    box.appendChild(h("div", { class: "cr-empty" },
      h("p", null, present().length === 0 && state.names.length ? "Everyone is marked absent." : "Add your students first."),
      h("button", { type: "button", class: "button", onclick: () => show("students") }, "Go to Students")));
  }
  function fullscreenBtn(target) {
    if (!document.documentElement.requestFullscreen) return null;
    return h("button", { type: "button", class: "button secondary", onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen(); else target.requestFullscreen().catch(() => {});
    } }, h("span", { class: "cr-ico", html: ICON.full }), "Full screen");
  }
  function copyBtn(getText) {
    const b = h("button", { type: "button", class: "button secondary" }, "Copy");
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(getText()); b.textContent = "Copied ✓"; }
      catch { b.textContent = "Couldn't copy"; }
      setTimeout(() => (b.textContent = "Copy"), 1500);
    });
    return b;
  }

  /* ---------- printing (one clean sheet, nothing else from the portal) ---------- */
  const PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';
  function printBtn(label, onclick) {
    return h("button", { type: "button", class: "button secondary", onclick }, h("span", { class: "cr-ico", html: PRINT_ICON }), label);
  }
  function printSheet(title, sub, body) {
    const old = document.getElementById("print-area");
    if (old) old.remove();
    const when = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const area = h("div", { id: "print-area" },
      h("h1", null, title),
      h("p", { class: "print-sub" }, [when, sub].filter(Boolean).join(" · ")),
      body);
    document.body.appendChild(area);
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); area.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(() => { if (!matchMedia("print").matches) done(); }, 1000);
  }
  const printList = items => h("ol", { class: "print-list cols-" + (items.length <= 12 ? 1 : items.length <= 40 ? 2 : 3) },
    items.map(x => h("li", null, String(x))));

  /* ---------- Students ---------- */
  function studentsView() {
    const msg = h("p", { class: "status" });
    const input = h("input", { type: "file", accept: ".xlsx,.xlsm,.csv,.txt,.tsv,.xls" });
    const bigBtn = h("label", { class: "cr-upload" },
      h("span", { class: "cr-upload-icon", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M12 10v0"/></svg>' }),
      h("span", null, h("strong", null, "Upload Excel sheet"), h("small", null, "Excel (.xlsx), CSV, or text — or drag the file here")),
      input);
    const chooser = h("div", { class: "cr-chooser hidden" });

    function showChooser(rows, fileName) {
      const guess = detectColumns(rows);
      const width = Math.max(...rows.slice(0, 50).map(r => r.length));
      const label = i => {
        const st = start();
        const top = st > 0 ? ((rows[st - 1] || [])[i] || "") : "";
        const sample = (rows[st] || [])[i] || "";
        return `Column ${colLetter(i)}` + (top ? ` — “${top}”` : sample ? ` (e.g. ${sample})` : "");
      };
      const firstSel = h("select"), lastSel = h("select");
      const startInp = h("input", { type: "number", min: "1", class: "cr-num" });
      startInp.value = guess.start + 1;
      const start = () => Math.max(0, Math.min(rows.length - 1, (parseInt(startInp.value, 10) || 1) - 1));
      let pickFirst = guess.first, pickLast = guess.last;
      function fillSelects() {
        firstSel.innerHTML = ""; lastSel.innerHTML = "";
        lastSel.appendChild(h("option", { value: "-1" }, "— None (full name is in one column) —"));
        for (let i = 0; i < width; i++) {
          firstSel.appendChild(h("option", { value: i }, label(i)));
          lastSel.appendChild(h("option", { value: i }, label(i)));
        }
        firstSel.value = pickFirst; lastSel.value = pickLast;
      }
      fillSelects();
      firstSel.addEventListener("change", () => { pickFirst = +firstSel.value; });
      lastSel.addEventListener("change", () => { pickLast = +lastSel.value; });
      const preview = h("ol", { class: "cr-preview" });
      const useBtn = h("button", { type: "button", class: "button" });
      let names = [];
      function update() {
        names = namesFromColumns(rows, { start: start(), first: +firstSel.value, last: +lastSel.value });
        preview.innerHTML = "";
        names.slice(0, 8).forEach(n => preview.appendChild(h("li", null, n)));
        if (names.length > 8) preview.appendChild(h("li", { class: "help", style: "list-style:none" }, `…and ${names.length - 8} more`));
        useBtn.textContent = `Use these ${names.length} names`;
        useBtn.disabled = !names.length;
      }
      [firstSel, lastSel].forEach(x => x.addEventListener("change", update));
      startInp.addEventListener("input", () => { fillSelects(); update(); });
      useBtn.addEventListener("click", () => {
        if (state.names.length && !confirm(`Replace your current list (${state.names.length} students) with these ${names.length}?`)) return;
        state = { names, absent: [] }; save();
        chooser.classList.add("hidden");
        msg.className = "status ok"; msg.textContent = `✓ Loaded ${names.length} students from ${fileName}.`;
        refreshAll();
      });
      chooser.innerHTML = "";
      chooser.append(
        h("h3", { class: "section-title", style: "font-size:1.35rem" }, "Check the names from " + fileName),
        h("p", { class: "help" }, "We guessed which columns hold the names. Change them if needed — first and last names in different columns are joined together."),
        h("div", { class: "two" },
          h("div", { class: "field" }, h("label", null, "First name column"), firstSel),
          h("div", { class: "field" }, h("label", null, "Last name column"), lastSel)),
        h("div", { class: "cr-row", style: "justify-content:flex-start" },
          h("label", { style: "margin:0;font-weight:600" }, "Names start on row"), startInp,
          h("span", { class: "help", style: "margin:0" }, "(the row number in Excel — skips titles and headings above it)")),
        h("p", { class: "label-text", style: "margin:12px 0 4px" }, "Preview"),
        preview,
        h("div", { class: "actions" }, useBtn,
          h("button", { type: "button", class: "button secondary", onclick: () => { chooser.classList.add("hidden"); msg.textContent = ""; } }, "Cancel")));
      chooser.classList.remove("hidden");
      update();
      chooser.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function useFile(file) {
      msg.className = "status"; msg.textContent = "Reading " + file.name + "…";
      chooser.classList.add("hidden");
      try {
        const rows = await readSheetRows(file);
        if (!rows.length) throw new Error("That sheet is empty.");
        msg.textContent = "";
        showChooser(rows, file.name);
      } catch (e) {
        msg.className = "status err"; msg.textContent = e.message || "Couldn't read that file.";
      }
    }
    input.addEventListener("change", () => { if (input.files[0]) useFile(input.files[0]); input.value = ""; });
    bigBtn.addEventListener("dragover", e => { e.preventDefault(); bigBtn.classList.add("drag"); });
    bigBtn.addEventListener("dragleave", () => bigBtn.classList.remove("drag"));
    bigBtn.addEventListener("drop", e => { e.preventDefault(); bigBtn.classList.remove("drag"); if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]); });

    const area = h("textarea", { class: "cr-names", placeholder: "Or type or paste names here, one per line", rows: "10" });
    let t = null;
    area.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const seen = new Set();
        state.names = area.value.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
        state.absent = state.absent.filter(n => state.names.includes(n));
        save(); drawChips();
      }, 400);
    });
    const count = h("span", { class: "cr-count" });
    const chips = h("div", { class: "cr-chips" });
    function drawChips() {
      chips.innerHTML = "";
      const here = present().length;
      count.textContent = state.names.length ? `${here} here · ${state.names.length - here} absent · ${state.names.length} total` : "No students yet";
      state.names.forEach(n => {
        const away = state.absent.includes(n);
        chips.appendChild(h("button", { type: "button", class: "cr-chip" + (away ? " away" : ""), "aria-pressed": away ? "true" : "false",
          title: away ? "Absent — click to mark here" : "Here — click to mark absent",
          onclick: () => {
            state.absent = away ? state.absent.filter(x => x !== n) : state.absent.concat(n);
            save(); drawChips();
          } }, n));
      });
    }
    const el = h("div", { class: "cr-view" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Student List"),
        h("p", { class: "help" }, "Saved only on this device, in this browser — not on GitHub or the website. If you use another computer, upload the sheet there too."),
        bigBtn, msg, chooser,
        h("div", { class: "field", style: "margin-top:16px" }, h("label", null, "Names (one per line) — you can also type or fix names here"), area)),
      h("div", { class: "card" },
        h("div", { class: "cr-row" },
          h("h2", { class: "section-title", style: "margin:0" }, "Who's Here Today"), count),
        h("p", { class: "help" }, "Click a name to mark them absent. Absent students are left out of groups and picks."),
        chips,
        h("div", { class: "actions" },
          h("button", { type: "button", class: "button secondary", onclick: () => { state.absent = []; save(); drawChips(); } }, "Mark everyone here"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => {
            if (state.names.length && confirm("Remove all students from this device?")) { state = { names: [], absent: [] }; save(); refreshAll(); }
          } }, "Clear list")))
    );
    return { el, refresh: () => { if (document.activeElement !== area) area.value = state.names.join("\n"); drawChips(); } };
  }

  /* ---------- Group Maker ---------- */
  function groupsView() {
    const num = h("input", { type: "number", min: "2", value: "4", class: "cr-num" });
    const summary = h("p", { class: "help" });
    const out = h("div", { class: "cr-groups" });
    const stage = h("div", { class: "cr-stage" }, out);
    let last = [];
    function make() {
      const kids = present();
      if (kids.length < 2) return needStudents(out);
      let n = Math.max(2, Math.min(kids.length, parseInt(num.value, 10) || 2));
      num.value = n;
      const mixed = shuffle(kids);
      const groups = Array.from({ length: n }, () => []);
      mixed.forEach((name, i) => groups[i % n].push(name));   // leftovers go one each to the first groups
      last = groups;
      const sizes = groups.map(g => g.length);
      const big = sizes.filter(s => s > sizes[sizes.length - 1]).length;
      summary.textContent = `${kids.length} students in ${n} groups: ` + (big
        ? `${big} group${big > 1 ? "s" : ""} of ${sizes[0]} and ${n - big} of ${sizes[sizes.length - 1]}.`
        : `${n} groups of ${sizes[0]}.`);
      out.innerHTML = "";
      groups.forEach((g, i) => out.appendChild(h("div", { class: "cr-group" },
        h("h3", null, `Group ${i + 1}`, h("span", null, `${g.length}`)),
        h("ol", null, g.map(n => h("li", null, n))))));
    }
    function printGroups() {
      if (!last.length) make();
      if (!last.length) return;
      printSheet("Groups", summary.textContent,
        h("div", { class: "print-groups" }, last.map((g, i) =>
          h("div", { class: "print-group" }, h("h2", null, `Group ${i + 1}`), h("ol", null, g.map(n => h("li", null, n)))))));
    }
    const el = h("div", { class: "cr-view hidden" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Group Maker"),
        h("p", { class: "help" }, "Mixes the students who are here into random groups. If they don't divide evenly, some groups get one extra student."),
        h("div", { class: "cr-row", style: "justify-content:flex-start;margin-top:12px" },
          h("label", { style: "margin:0;font-weight:600" }, "Number of groups"), num,
          h("button", { type: "button", class: "button", onclick: make }, "Make groups"),
          h("button", { type: "button", class: "button secondary", onclick: make }, "Shuffle again"),
          copyBtn(() => last.map((g, i) => `Group ${i + 1}: ${g.join(", ")}`).join("\n")),
          printBtn("Print groups", printGroups),
          fullscreenBtn(stage)),
        summary),
      stage);
    return { el, refresh: () => { num.max = Math.max(2, present().length); if (!last.length) out.innerHTML = ""; if (present().length < 2) needStudents(out); } };
  }

  /* ---------- Random Number ---------- */
  function numberView() {
    const MAXN = 10000;
    const ranges = [["1–6 (dice)", 1, 6], ["1–10", 1, 10], ["1–20", 1, 20], ["1–50", 1, 50], ["1–100", 1, 100], ["1–1,000", 1, 1000], ["1–10,000", 1, 10000]];
    const min = h("input", { type: "number", value: "1", min: "0", max: String(MAXN), class: "cr-num" });
    const max = h("input", { type: "number", value: "10", min: "0", max: String(MAXN), class: "cr-num" });
    const noRepeat = h("input", { type: "checkbox" });
    const pickNo = h("div", { class: "cr-pickno" });
    const big = h("div", { class: "cr-big" }, "?");
    const note = h("p", { class: "help", style: "text-align:center" });
    const hist = h("div", { class: "cr-picks" });
    const stage = h("div", { class: "cr-stage cr-center" }, pickNo, big, note, hist);
    let used = [], history = [], rolling = false, lastRange = "";
    function drawHistory() {
      hist.innerHTML = "";
      pickNo.textContent = history.length ? "Pick #" + history.length : "";
      const earlier = history.slice(0, -1);
      if (!earlier.length) return;
      hist.appendChild(h("div", { class: "cr-picks-title" }, "Earlier picks"));
      const list = h("ol", { class: "cr-picks-list" });
      earlier.forEach((v, i) => list.appendChild(h("li", null, h("span", { class: "n" }, (i + 1) + "."), " ", h("strong", null, String(v)))));
      hist.appendChild(list);
    }
    const chips = h("div", { class: "cr-chips" });
    function mark() { chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", (+b.dataset.lo === +min.value && +b.dataset.hi === +max.value) ? "true" : "false")); }
    ranges.forEach(([label, lo, hi]) => chips.appendChild(h("button", { type: "button", class: "cr-chip", "data-lo": lo, "data-hi": hi,
      onclick: () => { min.value = lo; max.value = hi; used = []; note.textContent = ""; mark(); } }, label)));
    [min, max].forEach(i => i.addEventListener("input", () => { used = []; mark(); }));
    function pick() {
      if (rolling) return;
      let lo = Math.ceil(+min.value), hi = Math.floor(+max.value);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) { note.textContent = "Type a lowest and highest number."; return; }
      if (lo > hi) [lo, hi] = [hi, lo];
      if (lo < 0 || hi > MAXN) { note.textContent = "Please choose numbers from 0 up to 10,000."; return; }
      const size = hi - lo + 1;
      lastRange = `${lo}–${hi}` + (noRepeat.checked ? ", no repeats" : "");
      let value;
      if (noRepeat.checked) {
        if (used.length >= size) used = [];
        const left = [];
        for (let v = lo; v <= hi; v++) if (!used.includes(v)) left.push(v);
        value = left[randInt(left.length)];
        used.push(value);
      } else value = lo + randInt(size);
      rolling = true;
      let ticks = 0;
      const timer = setInterval(() => {
        big.textContent = lo + randInt(size);
        if (++ticks >= 12) {
          clearInterval(timer);
          big.textContent = value; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
          rolling = false;
          history.push(value);
          drawHistory();
          note.textContent = noRepeat.checked ? `${size - used.length} number${size - used.length === 1 ? "" : "s"} left before repeats start again.` : `Between ${lo} and ${hi}`;
        }
      }, 50);
    }
    const el = h("div", { class: "cr-view hidden" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Random Number"),
        h("p", { class: "help" }, "Pick a quick range or type your own (any numbers up to 10,000), then press Pick."),
        chips,
        h("div", { class: "cr-row", style: "justify-content:flex-start;margin-top:12px" },
          h("label", { style: "margin:0;font-weight:600" }, "From"), min,
          h("label", { style: "margin:0;font-weight:600" }, "to"), max,
          h("label", { class: "check-line", style: "margin:0" }, noRepeat, " No repeats"))),
      h("div", { class: "card" }, stage,
        h("div", { class: "actions", style: "justify-content:center" },
          h("button", { type: "button", class: "button cr-go", onclick: pick }, "Pick a number"),
          h("button", { type: "button", class: "button secondary", onclick: () => { used = []; history = []; drawHistory(); big.textContent = "?"; note.textContent = ""; } }, "Reset"),
          printBtn("Print picks", () => {
            if (!history.length) { note.textContent = "Pick a number first, then print."; return; }
            printSheet("Random Numbers", `${history.length} pick${history.length === 1 ? "" : "s"} · range ${lastRange}`, printList(history));
          }),
          fullscreenBtn(stage))));
    mark();
    return { el };
  }

  /* ---------- Random Student ---------- */
  function pickerView() {
    const pickNo = h("div", { class: "cr-pickno" });
    const big = h("div", { class: "cr-big cr-name" }, "?");
    const note = h("p", { class: "help", style: "text-align:center" });
    const hist = h("div", { class: "cr-picks" });
    const stage = h("div", { class: "cr-stage cr-center" }, pickNo, big, note, hist);
    const fair = h("input", { type: "checkbox", checked: true });
    const orderOut = h("ol", { class: "cr-order" });
    let picked = [], log = [], rolling = false, order = [];
    function drawLog() {
      hist.innerHTML = "";
      pickNo.textContent = log.length ? "Pick #" + log.length : "";
      const earlier = log.slice(0, -1);
      if (!earlier.length) return;
      hist.appendChild(h("div", { class: "cr-picks-title" }, "Earlier picks"));
      const list = h("ol", { class: "cr-picks-list" });
      earlier.forEach((n, i) => list.appendChild(h("li", null, h("span", { class: "n" }, (i + 1) + "."), " ", h("strong", null, n))));
      hist.appendChild(list);
    }
    function pick() {
      const kids = present();
      if (!kids.length) return needStudents(stage), null;
      if (rolling) return;
      if (!stage.contains(big)) { stage.innerHTML = ""; stage.append(pickNo, big, note, hist); }
      let pool = fair.checked ? kids.filter(n => !picked.includes(n)) : kids;
      if (!pool.length) { picked = []; pool = kids; }
      const name = pool[randInt(pool.length)];
      if (fair.checked) picked.push(name);
      rolling = true;
      let ticks = 0;
      const timer = setInterval(() => {
        big.textContent = kids[randInt(kids.length)];
        if (++ticks >= 14) {
          clearInterval(timer);
          big.textContent = name; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
          rolling = false;
          log.push(name);
          drawLog();
          const left = kids.filter(n => !picked.includes(n)).length;
          note.textContent = fair.checked ? (left ? `${left} student${left === 1 ? "" : "s"} still to be picked.` : "Everyone has had a turn — the next pick starts a new round.") : "";
        }
      }, 60);
    }
    function shuffleOrder() {
      const kids = present();
      orderOut.innerHTML = "";
      if (!kids.length) { orderOut.appendChild(h("li", { class: "help" }, "Add your students first (Students button above).")); return; }
      order = shuffle(kids);
      order.forEach(n => orderOut.appendChild(h("li", null, n)));
    }
    const orderStage = h("div", { class: "cr-stage" }, orderOut);
    const el = h("div", { class: "cr-view hidden" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Pick a Random Student"),
        h("label", { class: "check-line" }, fair, " Don't pick the same student again until everyone has had a turn"),
        stage,
        h("div", { class: "actions", style: "justify-content:center" },
          h("button", { type: "button", class: "button cr-go", onclick: pick }, "Pick a student"),
          h("button", { type: "button", class: "button secondary", onclick: () => { picked = []; log = []; drawLog(); big.textContent = "?"; note.textContent = "Starting fresh — everyone can be picked."; } }, "Start over"),
          printBtn("Print picks", () => {
            if (!log.length) { note.textContent = "Pick a student first, then print."; return; }
            printSheet("Students Picked", `${log.length} pick${log.length === 1 ? "" : "s"}, in the order they were picked`, printList(log));
          }),
          fullscreenBtn(stage))),
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Randomize the Order"),
        h("p", { class: "help" }, "Puts every student who is here in a random order — for turns, presentations, or lining up."),
        h("div", { class: "actions" },
          h("button", { type: "button", class: "button", onclick: shuffleOrder }, "Shuffle the order"),
          copyBtn(() => order.map((n, i) => `${i + 1}. ${n}`).join("\n")),
          printBtn("Print order", () => {
            if (!order.length) shuffleOrder();
            if (!order.length) return;
            printSheet("Student Order", `${order.length} students in random order`, printList(order));
          }),
          fullscreenBtn(orderStage)),
        orderStage));
    return { el, refresh: () => { picked = picked.filter(n => present().includes(n)); } };
  }

  window.Classroom = { open, _test: { rowsToNames, detectColumns, namesFromColumns, cleanRows, parseDelimited, readXlsx, shuffle, randInt } };
})();

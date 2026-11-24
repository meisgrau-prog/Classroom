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
    prizes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M2 6h20v3H2zM12 6v15"/><path d="M12 6c-1.5-3.5-6-3.5-5.5-1 .3 1.5 3 1 5.5 1zM12 6c1.5-3.5 6-3.5 5.5-1-.3 1.5-3 1-5.5 1z"/></svg>',
    raffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M15 6v12" stroke-dasharray="1.5 2"/><path d="M7.5 10.5h4M7.5 13.5h3"/></svg>',
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

  let OPTS = {};
  function open(container, options) {
    if (!root) {
      root = container;
      OPTS = options || {};
      load();
      build();
    }
    refreshAll();
  }

  function build() {
    root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" },
      h("h1", { class: "page-title" }, OPTS.heading || "Classroom"),
      h("p", { class: "help", style: "margin:0" }, OPTS.sub || "Teacher tools for class. Nothing here is posted on the website.")
    ));
    const all = {
      students: ["Students", ICON.students, studentsView],
      groups: ["Group Maker", ICON.groups, groupsView],
      number: ["Random Number", ICON.number, numberView],
      picker: ["Random Student", ICON.student, pickerView],
      raffle: ["Raffle", ICON.raffle, raffleView],
      prizes: ["Prize Boxes", ICON.prizes, prizesView]
    };
    const keys = OPTS.tools || ["students", "groups", "number", "picker", "raffle", "prizes"];
    const menu = h("nav", { class: "cr-menu", "aria-label": "Tools" });
    menu.style.gridTemplateColumns = `repeat(${keys.length === 6 ? 3 : Math.min(5, Math.max(keys.length, 2))}, minmax(0, 1fr))`;
    keys.forEach(key => {
      const [label, icon] = all[key];
      menu.appendChild(h("button", { type: "button", class: "cr-tool", "data-tool": key, onclick: () => show(key) },
        h("span", { class: "cr-tool-icon", html: icon }), h("span", null, label)));
    });
    root.appendChild(menu);
    keys.forEach(key => { views[key] = all[key][2](); root.appendChild(views[key].el); });
    if (!keys.includes(current)) current = keys[0];
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
  // Full screen for the projector. `actions` = [[label, fn, isMain], …] are shown inside full screen too,
  // and Space / Enter does the main action, so the next move never needs leaving full screen.
  function fullscreenBtn(target, actions) {
    if (!document.documentElement.requestFullscreen) return null;
    actions = actions || [];
    if (!target.querySelector(":scope > .fs-bar")) {
      const bar = h("div", { class: "fs-bar" });
      actions.forEach(([label, fn, main]) =>
        bar.appendChild(h("button", { type: "button", class: "button" + (main ? " cr-go" : " secondary"), onclick: fn }, label)));
      bar.appendChild(h("button", { type: "button", class: "button secondary fs-exit", onclick: () => document.exitFullscreen() },
        h("span", { class: "cr-ico", html: ICON.full }), "Exit full screen"));
      target.appendChild(bar);
      const main = actions.find(a => a[2]);
      if (main) document.addEventListener("keydown", e => {
        if (document.fullscreenElement !== target || e.repeat) return;
        if (e.key === " " || e.key === "Enter") {
          if (e.target.closest && e.target.closest("button, input, select, textarea")) return;
          e.preventDefault(); main[1]();
        }
      });
    }
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
          fullscreenBtn(stage, [["Shuffle again", make, true]])),
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
          fullscreenBtn(stage, [["Pick a number", pick, true]]))));
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
      if (!kids.length) { big.textContent = "?"; note.textContent = "Add your students first (Students button above)."; return; }
      if (rolling) return;
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
          fullscreenBtn(stage, [["Pick a student", pick, true]]))),
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
          fullscreenBtn(orderStage, [["Shuffle the order", shuffleOrder, true]])),
        orderStage));
    return { el, refresh: () => { picked = picked.filter(n => present().includes(n)); } };
  }


  /* ---------- Prize Boxes ---------- */
  const PRIZE_STORE = "teacher_prizes_v1";
  function parsePrizeLine(line) {           // "Pencil", "3 x Pencil", "Pencil x3", "Pencil × 3", "Pencil, 3"
    let t = String(line || "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    let m;
    if ((m = /^(\d{1,4})\s*[x×*]\s*(.+)$/i.exec(t))) return { name: m[2].trim(), qty: +m[1] };
    if ((m = /^(.+?)\s*[x×*]\s*(\d{1,4})$/i.exec(t))) return { name: m[1].trim(), qty: +m[2] };
    if ((m = /^(.+?)\s*[,;\t]\s*(\d{1,4})$/.exec(t))) return { name: m[1].trim(), qty: +m[2] };
    return { name: t, qty: 1 };
  }
  function prizesView() {
    let P = { prizes: [], given: [], boxes: [], opened: -1, peek: false, sound: true, count: 4, showEmpty: true };
    try { const s = JSON.parse(localStorage.getItem(PRIZE_STORE) || "null"); if (s && Array.isArray(s.prizes)) P = Object.assign(P, s); } catch {}
    const saveP = () => { try { localStorage.setItem(PRIZE_STORE, JSON.stringify(P)); } catch {} };
    const left = () => P.prizes.reduce((n, p) => n + p.qty, 0);
    function addPrize(name, qty) {
      name = String(name || "").replace(/\s+/g, " ").trim();
      qty = Math.max(1, Math.min(999, parseInt(qty, 10) || 1));
      if (!name) return false;
      const f = P.prizes.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (f) f.qty += qty; else P.prizes.push({ name, qty });
      return true;
    }

    /* add by hand */
    const nameIn = h("input", { type: "text", placeholder: "Prize (e.g. Pencil)", class: "rf-name" });
    const qtyIn = h("input", { type: "number", min: "1", max: "999", value: "1", class: "cr-num", "aria-label": "How many" });
    const formMsg = h("p", { class: "status" });
    const quick = h("span", { class: "pz-quick" });
    [1, 5, 10, 20].forEach(n => quick.appendChild(h("button", { type: "button", class: "small-btn", onclick: () => { qtyIn.value = n; } }, "×" + n)));
    function addFromForm() {
      if (!addPrize(nameIn.value, qtyIn.value)) { formMsg.className = "status err"; formMsg.textContent = "Type a prize first."; return; }
      formMsg.className = "status"; formMsg.textContent = ""; nameIn.value = ""; qtyIn.value = "1"; nameIn.focus();
      saveP(); drawList(); fillIfEmpty();
    }
    [nameIn, qtyIn].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") addFromForm(); }));

    /* paste a list */
    const paste = h("textarea", { class: "pz-paste", rows: "4", placeholder: "Paste a list, one prize per line. Add how many like:\n3 x Stickers\nBookmark, 5\nHomework pass x2" });
    const pasteBtn = h("button", { type: "button", class: "button secondary", onclick: () => {
      const items = paste.value.split("\n").map(parsePrizeLine).filter(Boolean);
      if (!items.length) { formMsg.className = "status err"; formMsg.textContent = "Paste at least one prize."; return; }
      items.forEach(i => addPrize(i.name, i.qty));
      formMsg.className = "status ok"; formMsg.textContent = `✓ Added ${items.reduce((a, i) => a + i.qty, 0)} prizes (${items.length} kinds).`;
      paste.value = ""; saveP(); drawList(); fillIfEmpty();
    } }, "Add pasted list");

    /* upload a sheet: prize column + optional how-many column */
    const sheetInput = h("input", { type: "file", accept: ".xlsx,.xlsm,.csv,.txt,.tsv,.xls" });
    const sheetBtn = h("label", { class: "cr-upload rf-upload" },
      h("span", { class: "cr-upload-icon", html: ICON.prizes }),
      h("span", null, h("strong", null, "Upload Excel sheet of prizes"), h("small", null, "A prize column and (optional) how-many column — Excel, CSV or text")),
      sheetInput);
    async function useSheet(file) {
      try {
        const rows = await readSheetRows(file);
        if (!rows.length) throw new Error("That sheet is empty.");
        const head = rows[0].map(c => c.toLowerCase());
        const nameCol = Math.max(0, head.findIndex(c => /prize|item|gift|reward|name/.test(c)));
        let qtyCol = head.findIndex(c => /qty|quantity|how many|count|amount|number|#|total/.test(c));
        const hasHead = head.some(c => /prize|item|gift|reward|name|qty|quantity|how many|count|amount/.test(c));
        const body = hasHead ? rows.slice(1) : rows;
        if (qtyCol < 0) { const w = Math.max(...body.map(r => r.length)); for (let k = 0; k < w; k++) if (k !== nameCol && body.filter(r => /^\d{1,4}$/.test(r[k] || "")).length >= body.length * 0.6) { qtyCol = k; break; } }
        let kinds = 0, total = 0;
        body.forEach(r => {
          const name = r[nameCol]; if (!name) return;
          const q = qtyCol >= 0 ? parseInt(r[qtyCol], 10) : 1;
          if (!Number.isFinite(q) || q < 1) return;
          if (addPrize(name, q)) { kinds++; total += Math.min(q, 999); }
        });
        if (!kinds) throw new Error("No prizes found in that sheet.");
        saveP(); drawList(); fillIfEmpty();
        formMsg.className = "status ok"; formMsg.textContent = `✓ Added ${total} prizes (${kinds} kinds) from ${file.name}.`;
      } catch (e) { formMsg.className = "status err"; formMsg.textContent = e.message || "Couldn't read that file."; }
    }
    sheetInput.addEventListener("change", () => { if (sheetInput.files[0]) useSheet(sheetInput.files[0]); sheetInput.value = ""; });
    sheetBtn.addEventListener("dragover", e => { e.preventDefault(); sheetBtn.classList.add("drag"); });
    sheetBtn.addEventListener("dragleave", () => sheetBtn.classList.remove("drag"));
    sheetBtn.addEventListener("drop", e => { e.preventDefault(); sheetBtn.classList.remove("drag"); if (e.dataTransfer.files[0]) useSheet(e.dataTransfer.files[0]); });

    /* prize list */
    const list = h("div", { class: "rf-list" });
    const totalEl = h("span", { class: "cr-count" });
    function drawList() {
      list.innerHTML = "";
      const t = left();
      totalEl.textContent = `${t} prize${t === 1 ? "" : "s"} left · ${P.prizes.length} kind${P.prizes.length === 1 ? "" : "s"}`;
      if (!P.prizes.length) { list.appendChild(h("p", { class: "help", style: "margin:6px 0" }, "No prizes yet. Add some above.")); return; }
      P.prizes.forEach((p, i) => {
        const step = d => () => { p.qty += d; if (p.qty < 1) P.prizes.splice(i, 1); saveP(); drawList(); };
        list.appendChild(h("div", { class: "rf-row pz-row" },
          h("span", { class: "rf-row-name" }, p.name),
          h("span", { class: "rf-stepper" },
            h("button", { type: "button", "aria-label": "One less " + p.name, onclick: step(-1) }, "−"),
            h("strong", null, String(p.qty)),
            h("button", { type: "button", "aria-label": "One more " + p.name, onclick: step(1) }, "+")),
          h("button", { type: "button", class: "rf-x", "aria-label": "Remove " + p.name, onclick: () => { P.prizes.splice(i, 1); saveP(); drawList(); } }, "×")));
      });
    }

    /* the four boxes */
    const boxesEl = h("div", { class: "pz-boxes" });
    const canvas = h("canvas", { class: "rf-confetti" });
    const stageMsg = h("p", { class: "pz-msg" });
    const stage = h("div", { class: "cr-stage pz-stage" }, canvas, boxesEl, stageMsg);
    const soundChk = h("input", { type: "checkbox" }); soundChk.checked = P.sound !== false;
    soundChk.addEventListener("change", () => { P.sound = soundChk.checked; saveP(); });
    const countSel = h("select", { class: "pz-count", "aria-label": "Number of boxes" },
      Array.from({ length: 12 }, (_, k) => h("option", { value: String(k + 1) }, String(k + 1))));
    countSel.value = String(boxCount());
    countSel.addEventListener("change", () => { P.count = +countSel.value; saveP(); if (left() || P.showEmpty !== false) newRound(); else drawBoxes(); });
    const emptyChk = h("input", { type: "checkbox" }); emptyChk.checked = P.showEmpty !== false;
    emptyChk.addEventListener("change", () => { P.showEmpty = emptyChk.checked; saveP(); if (P.opened < 0 && P.boxes.length) newRound(); });
    function newRound() {
      const units = [];
      P.prizes.forEach(p => { for (let k = 0; k < p.qty; k++) units.push(p.name); });
      const n = boxCount();
      const picks = shuffle(units).slice(0, n);
      // Not enough prizes left? Fill the rest with empty boxes (if turned on), in random spots.
      P.boxes = P.showEmpty !== false ? shuffle(picks.concat(Array(n - picks.length).fill(null))) : picks;
      P.opened = -1; P.peek = false;
      saveP(); drawBoxes();
    }
    function boxCount() { return Math.min(12, Math.max(1, parseInt(P.count, 10) || 4)); }
    function fillIfEmpty() { if (!P.boxes.length || (P.opened >= 0 && false)) newRound(); }
    function drawBoxes() {
      boxesEl.innerHTML = "";
      stage.classList.toggle("revealed", P.opened >= 0);
      if (!P.boxes.length) {
        stageMsg.textContent = left() ? "Press “New round” to fill the boxes." : "Add prizes to fill the boxes.";
        return;
      }
      const n = P.boxes.length, cols = n <= 5 ? n : Math.ceil(n / 2);
      boxesEl.style.setProperty("--pz-cols", cols);
      boxesEl.classList.toggle("many", cols > 4);
      const real = P.boxes.filter(Boolean).length;
      stageMsg.textContent = P.opened >= 0 ? "" : real ? "Pick a box!" : "No prizes left — add more above.";
      P.boxes.forEach((name, i) => {
        const isOpen = P.opened === i, show = isOpen || (P.opened >= 0 && P.peek);
        const box = h("button", { type: "button", class: "pz-box" + (isOpen ? " open" : "") + (P.opened >= 0 && !isOpen ? " other" : "") + (show && !isOpen ? " peek" : ""),
          "aria-label": show ? `Box ${i + 1}: ${name || "empty"}` : `Open box ${i + 1}`, disabled: P.opened >= 0 ? true : null,
          onclick: () => openBox(i) },
          h("span", { class: "pz-lid" }, h("span", { class: "pz-bow" })),
          h("span", { class: "pz-body" }, h("span", { class: "pz-num" }, String(i + 1))),
          h("span", { class: "pz-prize" + (name ? "" : " empty") }, h("small", null, isOpen ? (name ? "You won" : "Sorry") : "Box " + (i + 1)), h("strong", null, show ? (name || "Empty") : "")));
        boxesEl.appendChild(box);
      });
    }
    function openBox(i) {
      if (P.opened >= 0 || i >= P.boxes.length) return;
      const name = P.boxes[i];
      P.opened = i;
      if (!name) { saveP(); drawBoxes(); stageMsg.textContent = "Empty box — better luck next time!"; return; }
      const p = P.prizes.find(x => x.name === name);
      if (p) { p.qty -= 1; if (p.qty < 1) P.prizes.splice(P.prizes.indexOf(p), 1); }
      P.given.push({ name, box: i + 1 });
      saveP(); drawBoxes(); drawList(); drawGiven();
      Confetti.burst(canvas);
      if (soundChk.checked) Sound.chime();
    }

    const givenList = h("ol", { class: "rf-winners" });
    function drawGiven() {
      givenList.innerHTML = "";
      if (!P.given.length) { givenList.appendChild(h("li", { class: "help", style: "list-style:none" }, "No prizes given out yet.")); return; }
      P.given.forEach(g => givenList.appendChild(h("li", null, h("strong", null, g.name), h("span", null, ` — box ${g.box}`))));
    }
    const nextRound = () => { if (!left() && P.showEmpty === false) { stageMsg.textContent = "No prizes left. Add more prizes above."; P.boxes = []; P.opened = -1; saveP(); drawBoxes(); return; } newRound(); };
    const peekBtn = () => { if (P.opened < 0) return; P.peek = true; saveP(); drawBoxes(); };

    const el = h("div", { class: "cr-view hidden" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Prizes"),
        h("p", { class: "help" }, "Add each prize and how many you have. Every time a box is opened, that prize is taken off the list."),
        h("div", { class: "rf-form" }, nameIn, h("span", { class: "rf-times" }, "×"), qtyIn, quick,
          h("button", { type: "button", class: "button", onclick: addFromForm }, "Add prize")),
        formMsg,
        h("details", { class: "pz-more" }, h("summary", null, "Paste a list or upload an Excel sheet"),
          paste, h("div", { class: "actions", style: "margin-top:8px" }, pasteBtn), sheetBtn),
        h("div", { class: "cr-row", style: "margin-top:14px" }, h("span", { class: "label-text", style: "margin:0" }, "Prize list"), totalEl),
        list,
        h("div", { class: "actions" },
          h("button", { type: "button", class: "small-btn danger", onclick: () => { if (P.prizes.length && confirm("Remove all prizes from the list?")) { P.prizes = []; P.boxes = []; P.opened = -1; saveP(); drawList(); drawBoxes(); } } }, "Clear all prizes"))),
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Pick a Box"),
        stage,
        h("div", { class: "actions", style: "justify-content:center" },
          h("button", { type: "button", class: "button cr-go", onclick: nextRound }, "New round"),
          h("button", { type: "button", class: "button secondary", onclick: peekBtn }, "Show the other boxes"),
          fullscreenBtn(stage, [["New round", nextRound, true], ["Show the other boxes", peekBtn]])),
        h("div", { class: "rf-options pz-settings" },
          h("label", { class: "check-line", style: "margin:0" }, "Number of boxes ", countSel),
          h("label", { class: "check-line", style: "margin:0" }, emptyChk, " Show empty boxes when prizes run out"),
          h("label", { class: "check-line", style: "margin:0" }, soundChk, " Sound"))),
      h("div", { class: "card" },
        h("div", { class: "cr-row" }, h("h2", { class: "section-title", style: "margin:0" }, "Prizes Given Out"),
          h("span", { class: "actions", style: "margin:0" },
            printBtn("Print list", () => {
              if (!P.given.length) return;
              printSheet("Prizes Given Out", `${P.given.length} prize${P.given.length === 1 ? "" : "s"}, in order`, printList(P.given.map(g => `${g.name} (box ${g.box})`)));
            }),
            h("button", { type: "button", class: "small-btn danger", onclick: () => { if (P.given.length && confirm("Clear the list of prizes given out?")) { P.given = []; saveP(); drawGiven(); } } }, "Clear list"))),
        givenList));
    drawList(); drawGiven();
    if (!P.boxes.length && left()) newRound(); else drawBoxes();
    return { el };
  }

  /* ---------- Raffle ---------- */
  const RAFFLE_STORE = "classroom_raffle_v1";
  function raffleView() {
    let R = { entries: [], winners: [], after: "ticket", sound: true };
    try { const s = JSON.parse(localStorage.getItem(RAFFLE_STORE) || "null"); if (s && Array.isArray(s.entries)) R = Object.assign(R, s); } catch {}
    const saveR = () => { try { localStorage.setItem(RAFFLE_STORE, JSON.stringify(R)); } catch {} };
    const total = () => R.entries.reduce((n, e) => n + e.tickets, 0);

    /* entry form */
    const nameIn = h("input", { type: "text", placeholder: "Name", class: "rf-name" });
    const countIn = h("input", { type: "number", min: "1", max: "500", value: "1", class: "cr-num", "aria-label": "Number of tickets" });
    const formMsg = h("p", { class: "status" });
    function addTickets(name, count) {
      name = String(name || "").replace(/\s+/g, " ").trim();
      count = Math.max(1, Math.min(500, parseInt(count, 10) || 1));
      if (!name) return false;
      const found = R.entries.find(e => e.name.toLowerCase() === name.toLowerCase());
      if (found) found.tickets += count; else R.entries.push({ name, tickets: count });
      return true;
    }
    function addFromForm() {
      if (!addTickets(nameIn.value, countIn.value)) { formMsg.className = "status err"; formMsg.textContent = "Type a name first."; return; }
      formMsg.textContent = ""; nameIn.value = ""; countIn.value = "1"; nameIn.focus();
      saveR(); drawEntries();
    }
    nameIn.addEventListener("keydown", e => { if (e.key === "Enter") addFromForm(); });
    countIn.addEventListener("keydown", e => { if (e.key === "Enter") addFromForm(); });

    const list = h("div", { class: "rf-list" });
    const totalEl = h("span", { class: "cr-count" });
    function drawEntries() {
      list.innerHTML = "";
      const t = total();
      totalEl.textContent = `${t} ticket${t === 1 ? "" : "s"} · ${R.entries.length} name${R.entries.length === 1 ? "" : "s"}`;
      if (!R.entries.length) { list.appendChild(h("p", { class: "help", style: "margin:6px 0" }, "No tickets yet. Add names above.")); return; }
      let n = 1;
      R.entries.forEach((e, i) => {
        const first = n, last = n + e.tickets - 1; n += e.tickets;
        const step = d => () => { e.tickets += d; if (e.tickets < 1) R.entries.splice(i, 1); saveR(); drawEntries(); };
        list.appendChild(h("div", { class: "rf-row" },
          h("span", { class: "rf-row-name" }, e.name),
          h("span", { class: "rf-row-nums" }, e.tickets === 1 ? `#${first}` : `#${first}–${last}`),
          h("span", { class: "rf-stepper" },
            h("button", { type: "button", "aria-label": "One less ticket for " + e.name, onclick: step(-1) }, "−"),
            h("strong", null, String(e.tickets)),
            h("button", { type: "button", "aria-label": "One more ticket for " + e.name, onclick: step(1) }, "+")),
          h("button", { type: "button", class: "rf-x", "aria-label": "Remove " + e.name, onclick: () => { R.entries.splice(i, 1); saveR(); drawEntries(); } }, "×")));
      });
    }

    /* load names + ticket counts from a sheet */
    const sheetInput = h("input", { type: "file", accept: ".xlsx,.xlsm,.csv,.txt,.tsv,.xls" });
    const sheetBtn = h("label", { class: "cr-upload rf-upload" },
      h("span", { class: "cr-upload-icon", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h8M12 11v8"/></svg>' }),
      h("span", null, h("strong", null, "Upload Excel sheet of tickets"), h("small", null, "Names and how many tickets each — Excel (.xlsx), CSV, or text")),
      sheetInput);
    const sheetMsg = h("p", { class: "status" });
    const sheetBox = h("div", { class: "cr-chooser hidden" });
    const isCount = v => /^\s*\d{1,4}\s*$/.test(v || "") && +v >= 0;
    function detectTicketCol(rows, start, used) {
      if (start > 0) {
        const head = (rows[start - 1] || []).map(c => c.toLowerCase());
        const i = head.findIndex((c, k) => !used.includes(k) && /ticket|count|qty|quantity|amount|entries|entry|chances|number|#|total/.test(c));
        if (i >= 0) return i;
      }
      const body = rows.slice(start, start + 60), width = Math.max(0, ...body.map(r => r.length));
      let best = -1, bestScore = 0;
      for (let k = 0; k < width; k++) {
        if (used.includes(k)) continue;
        const score = body.filter(r => isCount(r[k])).length / (body.length || 1);
        if (score > bestScore) { best = k; bestScore = score; }
      }
      return bestScore >= 0.6 ? best : -1;
    }
    function showSheet(rows, fileName) {
      const guess = detectColumns(rows);
      // a numbers-only "last name" guess is really the ticket column
      if (guess.last >= 0 && rows.slice(guess.start, guess.start + 30).every(r => !r[guess.last] || isCount(r[guess.last]))) guess.last = -1;
      let pick = { first: guess.first, last: guess.last, tickets: detectTicketCol(rows, guess.start, [guess.first, guess.last]) };
      const width = Math.max(...rows.slice(0, 60).map(r => r.length));
      const startInp = h("input", { type: "number", min: "1", class: "cr-num" }); startInp.value = guess.start + 1;
      const start = () => Math.max(0, Math.min(rows.length - 1, (parseInt(startInp.value, 10) || 1) - 1));
      const label = i => {
        const st = start(), top = st > 0 ? ((rows[st - 1] || [])[i] || "") : "", sample = (rows[st] || [])[i] || "";
        return `Column ${colLetter(i)}` + (top ? ` — “${top}”` : sample ? ` (e.g. ${sample})` : "");
      };
      const firstSel = h("select"), lastSel = h("select"), tixSel = h("select");
      function fill() {
        [firstSel, lastSel, tixSel].forEach(x => x.innerHTML = "");
        lastSel.appendChild(h("option", { value: "-1" }, "— None (full name in one column) —"));
        tixSel.appendChild(h("option", { value: "-1" }, "— None (1 ticket each) —"));
        for (let i = 0; i < width; i++) [firstSel, lastSel, tixSel].forEach(x => x.appendChild(h("option", { value: i }, label(i))));
        firstSel.value = pick.first; lastSel.value = pick.last; tixSel.value = pick.tickets;
      }
      fill();
      const preview = h("ol", { class: "cr-preview" }), sum = h("p", { class: "help" });
      const addBtn = h("button", { type: "button", class: "button" }), replBtn = h("button", { type: "button", class: "button secondary" }, "Replace all tickets");
      let found = [];
      function update() {
        const merged = new Map();
        rows.slice(start()).forEach(r => {
          const name = [pick.first >= 0 ? r[pick.first] : "", pick.last >= 0 ? r[pick.last] : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          if (!name) return;
          let n = pick.tickets >= 0 ? parseInt(String(r[pick.tickets] || "").trim(), 10) : 1;
          if (!Number.isFinite(n) || n < 1) return;            // 0 or blank tickets = not in the raffle
          n = Math.min(n, 500);
          const key = name.toLowerCase();
          if (merged.has(key)) merged.get(key).tickets += n; else merged.set(key, { name, tickets: n });
        });
        found = [...merged.values()];
        preview.innerHTML = "";
        found.slice(0, 10).forEach(e => preview.appendChild(h("li", null, `${e.name} × ${e.tickets}`)));
        if (found.length > 10) preview.appendChild(h("li", { class: "help", style: "list-style:none" }, `…and ${found.length - 10} more`));
        const t = found.reduce((a, e) => a + e.tickets, 0);
        sum.textContent = found.length ? `${found.length} names · ${t} tickets in total` : "No names with tickets found — check the columns above.";
        addBtn.textContent = `Add these ${t} tickets`;
        addBtn.disabled = replBtn.disabled = !found.length;
      }
      firstSel.addEventListener("change", () => { pick.first = +firstSel.value; update(); });
      lastSel.addEventListener("change", () => { pick.last = +lastSel.value; update(); });
      tixSel.addEventListener("change", () => { pick.tickets = +tixSel.value; update(); });
      startInp.addEventListener("input", () => { fill(); update(); });
      const finish = replace => {
        if (replace && R.entries.length && !confirm(`Replace the ${total()} tickets in the drum with these?`)) return;
        if (replace) R.entries = [];
        found.forEach(e => addTickets(e.name, e.tickets));
        saveR(); drawEntries();
        sheetBox.classList.add("hidden");
        sheetMsg.className = "status ok";
        sheetMsg.textContent = `✓ ${replace ? "Replaced with" : "Added"} ${found.reduce((a, e) => a + e.tickets, 0)} tickets for ${found.length} names from ${fileName}.`;
      };
      addBtn.addEventListener("click", () => finish(false));
      replBtn.addEventListener("click", () => finish(true));
      sheetBox.innerHTML = "";
      sheetBox.append(
        h("h3", { class: "section-title", style: "font-size:1.35rem" }, "Check the tickets from " + fileName),
        h("p", { class: "help" }, "We guessed the columns. Change them if needed. Names that appear more than once are added together; 0 or blank tickets are skipped."),
        h("div", { class: "rf-three" },
          h("div", { class: "field" }, h("label", null, "First name column"), firstSel),
          h("div", { class: "field" }, h("label", null, "Last name column"), lastSel),
          h("div", { class: "field" }, h("label", null, "Number of tickets column"), tixSel)),
        h("div", { class: "cr-row", style: "justify-content:flex-start" },
          h("label", { style: "margin:0;font-weight:600" }, "Names start on row"), startInp,
          h("span", { class: "help", style: "margin:0" }, "(the row number in Excel)")),
        h("p", { class: "label-text", style: "margin:12px 0 4px" }, "Preview"), preview, sum,
        h("div", { class: "actions" }, addBtn, replBtn,
          h("button", { type: "button", class: "small-btn", onclick: () => { sheetBox.classList.add("hidden"); sheetMsg.textContent = ""; } }, "Cancel")));
      sheetBox.classList.remove("hidden");
      update();
    }
    async function useSheet(file) {
      sheetMsg.className = "status"; sheetMsg.textContent = "Reading " + file.name + "…"; sheetBox.classList.add("hidden");
      try {
        const rows = await readSheetRows(file);
        if (!rows.length) throw new Error("That sheet is empty.");
        sheetMsg.textContent = ""; showSheet(rows, file.name);
      } catch (e) { sheetMsg.className = "status err"; sheetMsg.textContent = e.message || "Couldn't read that file."; }
    }
    sheetInput.addEventListener("change", () => { if (sheetInput.files[0]) useSheet(sheetInput.files[0]); sheetInput.value = ""; });
    sheetBtn.addEventListener("dragover", e => { e.preventDefault(); sheetBtn.classList.add("drag"); });
    sheetBtn.addEventListener("dragleave", () => sheetBtn.classList.remove("drag"));
    sheetBtn.addEventListener("drop", e => { e.preventDefault(); sheetBtn.classList.remove("drag"); if (e.dataTransfer.files[0]) useSheet(e.dataTransfer.files[0]); });

    /* stage: drum + ticket window + winner ticket + confetti */
    const drum = h("div", { class: "rf-drum", html: DRUM_SVG });
    const flicker = h("div", { class: "rf-flicker" });
    const winner = h("div", { class: "rf-winner hidden" });
    const canvas = h("canvas", { class: "rf-confetti" });
    const stage = h("div", { class: "cr-stage rf-stage" }, canvas, drum, flicker, winner);
    const stageMsg = h("p", { class: "help", style: "text-align:center;margin:10px 0 0" });

    const afterSel = h("select", { class: "rf-select" },
      h("option", { value: "ticket" }, "Remove only the winning ticket"),
      h("option", { value: "all" }, "Remove all of the winner's tickets"),
      h("option", { value: "none" }, "Keep all tickets in the drum"));
    afterSel.value = R.after;
    afterSel.addEventListener("change", () => { R.after = afterSel.value; saveR(); });
    const soundChk = h("input", { type: "checkbox" }); soundChk.checked = R.sound !== false;
    soundChk.addEventListener("change", () => { R.sound = soundChk.checked; saveR(); });

    const winList = h("ol", { class: "rf-winners" });
    function drawWinners() {
      winList.innerHTML = "";
      if (!R.winners.length) { winList.appendChild(h("li", { class: "help", style: "list-style:none" }, "No winners drawn yet.")); return; }
      R.winners.forEach(w => winList.appendChild(h("li", null, h("strong", null, w.name), h("span", null, ` — ticket #${w.ticket} (entry ${w.entry} of ${w.of})`))));
    }

    let drawing = false, lastRemoval = null;
    function draw(isRedraw) {
      if (drawing) return;
      const tickets = [];
      let num = 1;
      R.entries.forEach(e => { for (let k = 1; k <= e.tickets; k++) tickets.push({ name: e.name, entry: k, of: e.tickets, ticket: num++ }); });
      if (!tickets.length) { stageMsg.textContent = "Add some tickets first."; return; }
      stageMsg.textContent = "";
      drawing = true;
      const mixed = shuffle(tickets);              // shuffle the whole drum…
      const win = mixed[randInt(mixed.length)];    // …and pull one ticket out
      winner.classList.add("hidden");
      stage.classList.remove("won");
      stage.classList.add("spinning");
      if (soundChk.checked) Sound.drumroll(2.2);
      let i = 0;
      const t = setInterval(() => { flicker.textContent = mixed[i++ % mixed.length].name; }, 70);
      setTimeout(() => {
        clearInterval(t);
        flicker.textContent = "";
        stage.classList.remove("spinning");
        stage.classList.add("won");
        winner.innerHTML = "";
        winner.append(
          h("div", { class: "rf-ticket" },
            h("div", { class: "rf-ticket-main" },
              h("div", { class: "rf-ticket-label" }, "Winner"),
              h("div", { class: "rf-ticket-name" }, win.name),
              h("div", { class: "rf-ticket-meta" }, `Ticket #${win.ticket}` + (win.of > 1 ? ` · entry ${win.entry} of ${win.of}` : ""))),
            h("div", { class: "rf-ticket-stub" }, h("span", null, "No."), h("strong", null, String(win.ticket)))));
        winner.classList.remove("hidden");
        Confetti.burst(canvas);
        if (soundChk.checked) Sound.applause(4.5);
        R.winners.push({ name: win.name, ticket: win.ticket, entry: win.entry, of: win.of });
        // take tickets out of the drum as chosen
        const e = R.entries.find(x => x.name === win.name);
        lastRemoval = { name: win.name, removed: 0 };
        if (e && R.after === "ticket") { e.tickets -= 1; lastRemoval.removed = 1; }
        if (e && R.after === "all") { lastRemoval.removed = e.tickets; e.tickets = 0; }
        R.entries = R.entries.filter(x => x.tickets > 0);
        saveR(); drawEntries(); drawWinners();
        drawing = false;
      }, 2300);
    }
    function redraw() {
      if (drawing || !R.winners.length || !lastRemoval) { draw(); return; }
      R.winners.pop();                              // undo the last win, put its tickets back
      if (lastRemoval.removed) addTickets(lastRemoval.name, lastRemoval.removed);
      lastRemoval = null;
      saveR(); drawEntries(); drawWinners();
      draw(true);
    }

    const el = h("div", { class: "cr-view hidden" },
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "Raffle Tickets"),
        h("p", { class: "help" }, "Add a name and how many tickets they get. The same name can have many tickets — each ticket is one more chance to win."),
        sheetBtn, sheetMsg, sheetBox,
        h("p", { class: "rf-or" }, "or add by hand"),
        h("div", { class: "rf-form" }, nameIn, h("span", { class: "rf-times" }, "×"), countIn,
          h("button", { type: "button", class: "button", onclick: addFromForm }, "Add tickets")),
        formMsg,
        h("div", { class: "actions", style: "margin-top:4px" },
          h("button", { type: "button", class: "small-btn", onclick: () => {
            const kids = present();
            if (!kids.length) { formMsg.className = "status err"; formMsg.textContent = "Add students on the Students page first."; return; }
            kids.forEach(k => addTickets(k, 1)); saveR(); drawEntries();
            formMsg.className = "status ok"; formMsg.textContent = `✓ Added 1 ticket for each of ${kids.length} students.`;
          } }, "+ 1 ticket for every student here"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => { if (R.entries.length && confirm("Take all tickets out of the drum?")) { R.entries = []; saveR(); drawEntries(); } } }, "Clear all tickets")),
        h("div", { class: "cr-row", style: "margin-top:14px" }, h("span", { class: "label-text", style: "margin:0" }, "In the drum"), totalEl),
        list),
      h("div", { class: "card" },
        h("h2", { class: "section-title" }, "The Draw"),
        stage, stageMsg,
        h("div", { class: "actions", style: "justify-content:center" },
          h("button", { type: "button", class: "button cr-go", onclick: () => draw() }, "Shuffle & draw a winner"),
          h("button", { type: "button", class: "button secondary", onclick: redraw, title: "Put the last winner's ticket back and draw again" }, "Redraw"),
          fullscreenBtn(stage, [["Shuffle & draw a winner", () => draw(), true], ["Redraw", redraw]])),
        h("div", { class: "rf-options" },
          h("label", { class: "rf-opt" }, "After a win: ", afterSel),
          h("label", { class: "check-line", style: "margin:0" }, soundChk, " Sound (drumroll & applause)"))),
      h("div", { class: "card" },
        h("div", { class: "cr-row" }, h("h2", { class: "section-title", style: "margin:0" }, "Winners"),
          h("span", { class: "actions", style: "margin:0" },
            printBtn("Print winners", () => {
              if (!R.winners.length) { stageMsg.textContent = "Draw a winner first, then print."; return; }
              printSheet("Raffle Winners", `${R.winners.length} winner${R.winners.length === 1 ? "" : "s"}, in the order drawn`,
                printList(R.winners.map(w => `${w.name} — ticket #${w.ticket}`)));
            }),
            h("button", { type: "button", class: "small-btn danger", onclick: () => { if (R.winners.length && confirm("Clear the winners list?")) { R.winners = []; lastRemoval = null; saveR(); drawWinners(); } } }, "Clear winners"))),
        winList));
    drawEntries(); drawWinners();
    return { el };
  }

  /* raffle drum: navy cage with gold rim, tickets inside, crank and stand */
  const DRUM_SVG = `<svg viewBox="0 0 260 210" aria-hidden="true">
    <defs><radialGradient id="rfShine" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#2b4470"/><stop offset="1" stop-color="#14213d"/></radialGradient></defs>
    <path d="M70 196l26-60M190 196l-26-60" stroke="#b8955a" stroke-width="6" stroke-linecap="round"/>
    <rect x="52" y="192" width="156" height="10" rx="5" fill="#b8955a"/>
    <g class="rf-wheel">
      <circle cx="130" cy="104" r="78" fill="url(#rfShine)" stroke="#c9a96a" stroke-width="6"/>
      <circle cx="130" cy="104" r="64" fill="none" stroke="#c9a96a" stroke-opacity=".35" stroke-width="1.5"/>
      <g stroke="#c9a96a" stroke-width="2" stroke-opacity=".55">
        <path d="M130 26v156M52 104h156M75 49l110 110M185 49L75 159"/>
      </g>
      <g stroke="#14213d" stroke-width="1">
        <rect x="96" y="76" width="34" height="16" rx="2" fill="#e3c88f" transform="rotate(-18 113 84)"/>
        <rect x="132" y="88" width="34" height="16" rx="2" fill="#d4b375" transform="rotate(24 149 96)"/>
        <rect x="104" y="112" width="34" height="16" rx="2" fill="#f3e6c4" transform="rotate(8 121 120)"/>
        <rect x="140" y="122" width="34" height="16" rx="2" fill="#e3c88f" transform="rotate(-30 157 130)"/>
        <rect x="88" y="98" width="30" height="14" rx="2" fill="#d4b375" transform="rotate(40 103 105)"/>
        <rect x="124" y="58" width="30" height="14" rx="2" fill="#f3e6c4" transform="rotate(-6 139 65)"/>
      </g>
      <circle cx="130" cy="104" r="9" fill="#c9a96a"/>
    </g>
    <path d="M208 104h22v-26" fill="none" stroke="#c9a96a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="230" cy="74" r="7" fill="#e3c88f"/>
  </svg>`;

  /* gold confetti burst (classy: gold, cream, navy) */
  const Confetti = {
    burst(canvas) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const box = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = box.width * dpr; canvas.height = box.height * dpr;
      const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
      const colors = ["#c9a96a", "#e3c88f", "#f3e6c4", "#b8955a", "#14213d", "#ffffff"];
      const parts = Array.from({ length: 140 }, () => ({
        x: box.width / 2 + (Math.random() - .5) * 60, y: box.height * .45,
        vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 4,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
        c: colors[(Math.random() * colors.length) | 0]
      }));
      const start = performance.now();
      (function frame(now) {
        const t = now - start;
        ctx.clearRect(0, 0, box.width, box.height);
        parts.forEach(p => {
          p.vy += .28; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
          ctx.globalAlpha = Math.max(0, 1 - t / 3200);
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.cos(p.r * 3) * p.h);
          ctx.restore();
        });
        if (t < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, box.width, box.height);
      })(start);
    }
  };

  /* sounds made by the browser (no files, works offline): drumroll and applause */
  const Sound = {
    ctx: null,
    get() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    noise(ac) {
      const len = ac.sampleRate * 0.2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },
    hit(ac, buf, when, freq, q, gain, decay) {
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start(when); src.stop(when + decay + 0.02);
    },
    drumroll(sec) {
      const ac = this.get(); if (!ac) return;
      const buf = this.noise(ac), t0 = ac.currentTime + 0.02;
      for (let t = 0; t < sec; t += 0.045) this.hit(ac, buf, t0 + t, 180 + Math.random() * 60, 1.2, 0.12 + 0.18 * (t / sec), 0.06);
    },
    chime() {                                        // a short, bright "ta-da"
      const ac = this.get(); if (!ac) return;
      const t0 = ac.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o.frequency.value = f;
        const t = t0 + i * 0.09;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1);
      });
    },
    applause(sec) {                                  // many people clapping, swelling then fading
      const ac = this.get(); if (!ac) return;
      const buf = this.noise(ac), t0 = ac.currentTime + 0.05;
      const people = 24;
      for (let p = 0; p < people; p++) {
        const rate = 3.2 + Math.random() * 2.2;       // claps per second for this person
        const tone = 900 + Math.random() * 1700;      // each pair of hands sounds a bit different
        let t = Math.random() * 0.3;
        while (t < sec) {
          const env = Math.min(1, t / 0.5) * Math.max(0, 1 - Math.max(0, t - sec * 0.55) / (sec * 0.45));
          if (env > 0.02) this.hit(ac, buf, t0 + t, tone, 1.4, 0.09 * env, 0.05 + Math.random() * 0.03);
          t += 1 / rate + (Math.random() - 0.5) * 0.06;
        }
      }
    }
  };

  window.Classroom = { open, readSheetRows, cleanRows, detectColumns, _test: { parsePrizeLine, rowsToNames, detectColumns, namesFromColumns, cleanRows, parseDelimited, readXlsx, shuffle, randInt } };
})();

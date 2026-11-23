/* ============================================================
   GRADEBOOK (Teacher Area → Teacher Tools)
   Saved ONLY in this browser on this device (never on GitHub).
   Tabs: Dashboard · Enter Grades · Excel Export · Settings
   ============================================================ */
(function () {
  const STORE = "teacher_gradebook_v1";
  const STUDENTS = "classroom_students_v1";             // shared class list
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SUBJ = ["גמרא", "חומש", "משניות", "הלכה"];

  const DEFAULT_CATS = () => [
    { id: "tests", name: "Tests", freq: "weekly", max: 100, better: "high", subjects: SUBJ.slice(), color: "#2563eb", show: true },
    { id: "classwork", name: "Classwork", freq: "daily", max: 1, better: "high", subjects: SUBJ.slice(), color: "#0f766e", show: true },
    { id: "homework", name: "Homework", freq: "daily", max: 1, better: "high", subjects: [], color: "#7c3aed", show: true },
    { id: "participation", name: "Class Participation", freq: "daily", max: 10, better: "high", subjects: [], color: "#b25e00", show: true },
    { id: "peer", name: "Peer Interaction", freq: "daily", max: 10, better: "high", subjects: [], color: "#2f8f57", show: true },
    { id: "behavior", name: "Behavior", freq: "daily", max: 3, better: "low", subjects: [], color: "#c0392b", show: true },
    { id: "kriah", name: "Kriah", freq: "weekly", max: 4, better: "high", subjects: [], color: "#be185d", show: true },
    { id: "timestudy", name: "Time Study", freq: "weekly", max: 60, better: "high", subjects: [], color: "#0369a1", show: false },
    { id: "chevras", name: "Chevras Kosvim", freq: "daily", max: 2, better: "high", subjects: [], color: "#4d7c0f", show: true },
    { id: "notes", name: "Notes", freq: "daily", max: 0, better: "text", subjects: [], color: "#6b7180", show: false }
  ];
  const DEFAULTS = () => ({
    cats: DEFAULT_CATS(),
    days: [0, 1, 2, 3, 4, 5],          // school days (Sun–Fri)
    weekStart: 0,                       // weeks start on Sunday
    good: 80, ok: 60,                   // % thresholds for green / gold (below = red)
    attention: 60,                      // flag a student below this % in any category
    defaultFill: "",
    decimals: 1
  });

  /* ---------- data ---------- */
  let G = { settings: DEFAULTS(), grades: {} };      // grades[catId][subject|"_"][date][student] = value
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.settings) G = s; } catch {}
    G.grades = G.grades || {};
    G.settings = Object.assign(DEFAULTS(), G.settings || {});
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(G)); } catch (e) { alert("Couldn't save — this browser's storage may be full. Download a backup in Settings."); } }
  function students() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; } }
  function setStudents(names) { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null") || {}; localStorage.setItem(STUDENTS, JSON.stringify({ names, absent: (s.absent || []).filter(n => names.includes(n)) })); } catch {} }
  const cats = () => G.settings.cats;
  const cat = id => cats().find(c => c.id === id);
  const subjKeys = c => (c.subjects && c.subjects.length) ? c.subjects : ["_"];
  function getV(cid, subj, date, stu) { const a = G.grades[cid]; return a && a[subj] && a[subj][date] ? a[subj][date][stu] : undefined; }
  function setV(cid, subj, date, stu, v) {
    v = v == null ? "" : String(v).trim();
    const a = G.grades[cid] || (G.grades[cid] = {}), b = a[subj] || (a[subj] = {}), d = b[date] || (b[date] = {});
    if (v === "") { delete d[stu]; if (!Object.keys(d).length) delete b[date]; } else d[stu] = v;
  }
  // a cell's number: "104" → 104, "(45) 90**" → 90 (last number), "Absent"/"-" → null
  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = String(v).replace(/\([^)]*\)/g, " ");
    const m = s.match(/-?\d+(\.\d+)?/g);
    return m ? parseFloat(m[m.length - 1]) : null;
  }

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());
  function weekStartOf(s) { const d = parse(s); const diff = (d.getDay() - G.settings.weekStart + 7) % 7; d.setDate(d.getDate() - diff); return iso(d); }
  function schoolDays(from, to) { const out = []; for (let s = from; s <= to; s = addDays(s, 1)) if (G.settings.days.includes(parse(s).getDay())) out.push(s); return out; }
  const weekDays = ws => schoolDays(ws, addDays(ws, 6));
  // dates that have data (or are school days) for a category within a range
  function catDates(c, from, to) {
    const set = new Set();
    subjKeys(c).forEach(sk => Object.keys(((G.grades[c.id] || {})[sk]) || {}).forEach(d => { if (d >= from && d <= to) set.add(d); }));
    if (c.freq === "daily") schoolDays(from, to).forEach(d => set.add(d));
    else { for (let w = weekStartOf(from); w <= to; w = addDays(w, 7)) { const days = weekDays(w); const d = days[0] || w; if (d >= from && d <= to) set.add(d); } }
    return [...set].sort();
  }
  const fmt = (s, opt) => parse(s).toLocaleDateString("en-US", opt || { weekday: "short", month: "numeric", day: "numeric" });

  /* ---------- stats ---------- */
  function studentAvg(c, stu, from, to) {
    if (c.better === "text") return null;
    const vals = [];
    subjKeys(c).forEach(sk => Object.entries(((G.grades[c.id] || {})[sk]) || {}).forEach(([d, row]) => {
      if (d < from || d > to) return; const n = num(row[stu]); if (n != null) vals.push(n);
    }));
    if (!vals.length) return null;
    return c.better === "low" ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;   // low = total incidents
  }
  function pct(c, v, from, to) {
    if (v == null || !c.max) return null;
    if (c.better === "low") { const days = Math.max(1, schoolDays(from, to).length); return Math.max(0, 100 - (v / (c.max * days)) * 100 * 3); }
    return Math.min(100, (v / c.max) * 100);
  }
  function tone(p) { if (p == null) return ""; return p >= G.settings.good ? "g" : p >= G.settings.ok ? "y" : "r"; }
  const round = v => v == null ? "" : (Math.round(v * 10 ** G.settings.decimals) / 10 ** G.settings.decimals).toString();

  /* ---------- tiny DOM helper ---------- */
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
  function download(name, blob) { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove(); }

  /* ============================================================
     EXCEL (.xlsx) WRITER — real formulas, styles, frozen headers
     ============================================================ */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {                                    // [{name, data: string}] → Blob (stored, no compression)
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(lh, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(ch, name);
      off += 30 + name.length + data.length;
    });
    const csize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const excelDate = s => Math.round((parse(s) - new Date(1899, 11, 30)) / 86400000);
  // styles: 0 normal · 1 bold header · 2 bold date header · 3 number 0.0 · 4 bold label · 5 green · 6 gold · 7 red · 8 bold number 0.0
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="ddd m/d/yy"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
</cellXfs></styleSheet>`;
  // a sheet: rows = [[cell]], cell = {v, f, s} | string | number | null
  function sheetXML(sh) {
    let out = "";
    sh.rows.forEach((row, r) => {
      if (!row) return;
      let cells = "";
      row.forEach((c, ci) => {
        if (c == null || c === "") return;
        if (typeof c !== "object") c = { v: c };
        const ref = colName(ci) + (r + 1), s = c.s ? ` s="${c.s}"` : "";
        if (c.f) cells += `<c r="${ref}"${s}><f>${esc(c.f)}</f></c>`;
        else if (typeof c.v === "number" && isFinite(c.v)) cells += `<c r="${ref}"${s}><v>${c.v}</v></c>`;
        else cells += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
      });
      out += `<row r="${r + 1}">${cells}</row>`;
    });
    const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"${sh.rtl ? ' rightToLeft="0"' : ""}><pane xSplit="${sh.freeze[0]}" ySplit="${sh.freeze[1]}" topLeftCell="${colName(sh.freeze[0])}${sh.freeze[1] + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : "";
    const cf = (sh.cond || []).map((c, i) => `<conditionalFormatting sqref="${c.ref}">${c.rules.map((ru, j) => `<cfRule type="cellIs" dxfId="${ru.dxf}" priority="${i * 5 + j + 1}" operator="${ru.op}"><formula>${ru.f}</formula></cfRule>`).join("")}</conditionalFormatting>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${out}</sheetData>${cf}</worksheet>`;
  }
  function buildXlsx(sheets) {
    const dxfs = `<dxfs count="3"><dxf><fill><patternFill><bgColor rgb="FFDCFCE7"/></patternFill></fill></dxf><dxf><fill><patternFill><bgColor rgb="FFFEF3C7"/></patternFill></fill></dxf><dxf><fill><patternFill><bgColor rgb="FFFEE2E2"/></patternFill></fill></dxf></dxfs>`;
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: STYLES.replace("</cellXfs>", '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' + dxfs) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s) }))
    ];
    return zip(files);
  }
  const sheetName = (n, used) => { let s = String(n).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31).trim() || "Sheet"; let k = s, i = 2; while (used.has(k)) k = s.slice(0, 28) + " " + i++; used.add(k); return k; };
  const qs = n => `'${n.replace(/'/g, "''")}'`;

  function exportWorkbook(from, to) {
    const names = students();
    const splitName = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? [p.slice(0, -1).join(" "), p[p.length - 1]] : [n, ""]; };
    const used = new Set(["Summary"]);
    const sheets = [], summaryRefs = [];
    const thr = c => {               // conditional-format rules in the category's own units
      if (!c.max || c.better === "text") return null;
      if (c.better === "low") return null;
      const g = c.max * G.settings.good / 100, o = c.max * G.settings.ok / 100;
      return [{ op: "greaterThanOrEqual", f: g, dxf: 0 }, { op: "between", f: `${o}</formula><formula>${g - 1e-9}`, dxf: 1 }, { op: "lessThan", f: o, dxf: 2 }];
    };
    cats().forEach(c => {
      const dates = catDates(c, from, to);
      const nm = sheetName(c.name, used);
      const rows = [];
      const n = dates.length, avgCol = 2 + n, lastDateCol = colName(1 + n);
      const header = [{ v: "First", s: 1 }, { v: "Last", s: 1 }, ...dates.map(d => ({ v: excelDate(d), s: 2 })), c.better === "text" ? null : { v: c.better === "low" ? "Total" : "Average", s: 1 }];
      rows.push(header);
      const fn = c.better === "low" ? "SUM" : "AVERAGE";
      const rowFormula = r => n ? { f: `IFERROR(${fn}(C${r}:${lastDateCol}${r}),"")`, s: 3 } : null;
      const subs = subjKeys(c);
      let totalRowOf = {};
      if (subs[0] !== "_") {
        // Total block first (like your Classwork sheet): averages the subject blocks
        rows.push([{ v: "Total " + c.name, s: 4 }]);
        const totalStart = rows.length + 1;
        names.forEach((s, i) => totalRowOf[s] = totalStart + i);
        const blockStart = {};
        let r = totalStart + names.length + 1;           // blank row after totals
        subs.forEach(sk => { blockStart[sk] = r + 1; r += names.length + 2; });
        names.forEach((s, i) => {
          const [first, last] = splitName(s);
          const row = [first, last];
          dates.forEach((d, j) => { const col = colName(2 + j); row.push({ f: `IFERROR(AVERAGE(${subs.map(sk => col + (blockStart[sk] + i)).join(",")}),"")`, s: 3 }); });
          if (c.better !== "text") row.push(rowFormula(totalStart + i));
          rows.push(row);
        });
        subs.forEach(sk => {
          rows.push(null);
          rows.push([{ v: sk, s: 4 }]);
          names.forEach(s => {
            const [first, last] = splitName(s);
            const r2 = rows.length + 1;
            const row = [first, last, ...dates.map(d => { const v = getV(c.id, sk, d, s); const nv = Number(v); return v === undefined ? null : (v !== "" && isFinite(nv) ? nv : v); })];
            if (c.better !== "text") row.push(rowFormula(r2));
            rows.push(row);
          });
        });
      } else {
        names.forEach((s, i) => {
          const [first, last] = splitName(s);
          const r2 = rows.length + 1;
          totalRowOf[s] = r2;
          const row = [first, last, ...dates.map(d => { const v = getV(c.id, "_", d, s); const nv = Number(v); return v === undefined ? null : (v !== "" && isFinite(nv) ? nv : v); })];
          if (c.better !== "text") row.push(rowFormula(r2));
          rows.push(row);
        });
      }
      // class average row under the (total) block
      if (c.better !== "text" && names.length) {
        const first = totalRowOf[names[0]], last = totalRowOf[names[names.length - 1]];
        const avgRow = [{ v: "Class average", s: 4 }, null];
        for (let j = 0; j <= n; j++) { const col = colName(2 + j); avgRow.push({ f: `IFERROR(AVERAGE(${col}${first}:${col}${last}),"")`, s: 8 }); }
        rows.push(null, avgRow);                         // class average at the bottom of the sheet
      }
      const rules = thr(c);
      sheets.push({ name: nm, rows, widths: [14, 14, ...dates.map(() => 13), 11], freeze: [2, 1],
        cond: rules && names.length ? [{ ref: `C2:${colName(2 + n)}${rows.length}`, rules }] : [] });
      if (c.better !== "text" && c.show) summaryRefs.push({ c, nm, avgColL: colName(avgCol), totalRowOf });
    });
    // Summary sheet first
    const sum = [[{ v: "First", s: 1 }, { v: "Last", s: 1 }, ...summaryRefs.map(x => ({ v: x.c.name + (x.c.better === "low" ? " (total)" : ""), s: 1 }))]];
    names.forEach(s => {
      const [first, last] = splitName(s);
      sum.push([first, last, ...summaryRefs.map(x => ({ f: `IFERROR(${qs(x.nm)}!${x.avgColL}${x.totalRowOf[s]},"")`, s: 3 }))]);
    });
    if (names.length) {
      const avg = [{ v: "Class average", s: 4 }, null];
      summaryRefs.forEach((x, j) => { const col = colName(2 + j); avg.push({ f: `IFERROR(AVERAGE(${col}2:${col}${names.length + 1}),"")`, s: 8 }); });
      sum.push(null, avg);
    }
    sum.push(null, [{ v: `Dates: ${fmt(from, { month: "long", day: "numeric", year: "numeric" })} – ${fmt(to, { month: "long", day: "numeric", year: "numeric" })}`, s: 4 }]);
    const summary = { name: "Summary", rows: sum, widths: [14, 14, ...summaryRefs.map(() => 16)], freeze: [2, 1],
      cond: summaryRefs.map((x, j) => { const r = thr(x.c); return r ? { ref: `${colName(2 + j)}2:${colName(2 + j)}${names.length + 1}`, rules: r } : null; }).filter(Boolean) };
    return buildXlsx([summary, ...sheets]);
  }

  /* ============================================================
     IMPORT your existing workbook (all sheets)
     ============================================================ */
  async function readWorkbook(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
    let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("This doesn't look like an Excel (.xlsx) file.");
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const files = {};
    for (let n = 0; n < count; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, local }; p += 46 + nl + el + cl;
    }
    async function text(name) {
      const f = files[name]; if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      return dec.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    const xml = s => new DOMParser().parseFromString(s, "application/xml");
    const tags = (doc, t) => Array.from(doc.getElementsByTagNameNS("*", t));
    const ss = await text("xl/sharedStrings.xml");
    const shared = ss ? tags(xml(ss), "si").map(si => tags(si, "t").map(t => t.textContent).join("")) : [];
    const wb = xml(await text("xl/workbook.xml")), rels = xml(await text("xl/_rels/workbook.xml.rels"));
    const relMap = {}; tags(rels, "Relationship").forEach(r => relMap[r.getAttribute("Id")] = r.getAttribute("Target").replace(/^\//, ""));
    const out = [];
    for (const sh of tags(wb, "sheet")) {
      const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      let path = relMap[rid]; if (!path) continue; if (!path.startsWith("xl/")) path = "xl/" + path;
      const doc = xml(await text(path) || "<x/>");
      const grid = [];
      const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
      tags(doc, "row").forEach(r => {
        const ri = +r.getAttribute("r") - 1, row = grid[ri] = [];
        tags(r, "c").forEach(c => {
          const t = c.getAttribute("t"), v = tags(c, "v")[0], f = tags(c, "f")[0];
          let val = t === "s" ? shared[+v.textContent] : t === "inlineStr" ? tags(c, "t").map(x => x.textContent).join("") : v ? v.textContent : "";
          row[colIdx(c.getAttribute("r"))] = { v: val, f: !!f, num: !t || t === "n" };
        });
      });
      out.push({ name: sh.getAttribute("name"), grid });
    }
    return out;
  }
  const serialToIso = n => { const d = new Date(1899, 11, 30); d.setDate(d.getDate() + Math.round(n)); return iso(d); };
  const looksDate = c => c && c.num && !c.f && +c.v > 40000 && +c.v < 60000;
  function guessCat(sheetName) {
    const s = sheetName.toLowerCase();
    const map = [["test", "tests"], ["time study", "timestudy"], ["kria", "kriah"], ["classwork", "classwork"], ["peer", "peer"], ["homework", "homework"], ["particip", "participation"], ["behavior", "behavior"], ["chevra", "chevras"], ["notes", "notes"]];
    if (/seating|for test grading/i.test(sheetName)) return null;
    for (const [k, id] of map) if (s.includes(k)) return cats().find(c => c.id === id) || cats().find(c => c.name.toLowerCase().includes(k));
    return cats().find(c => s.includes(c.name.toLowerCase())) || null;
  }
  async function importWorkbook(file, log) {
    const book = await readWorkbook(await file.arrayBuffer());
    let roster = students();
    // class list from a sheet with First/Last headings (your Seating sheet)
    const seating = book.find(b => /seating/i.test(b.name)) || book[0];
    const head = (seating.grid[0] || []).map(c => String(c && c.v || "").toLowerCase());
    if (head[0] === "first" && head[1] === "last") {
      const names = []; for (let r = 1; r < seating.grid.length; r++) { const row = seating.grid[r] || []; const f = row[0] && row[0].v, l = row[1] && row[1].v; if (f && l && !row[2]) names.push(`${String(f).trim()} ${String(l).trim()}`); else if (!f && names.length) break; }
      if (names.length && (!roster.length || confirm(`Use the ${names.length} students from "${seating.name}" as your class list?`))) { roster = names; setStudents(names); log.push(`Class list: ${names.length} students from “${seating.name}”.`); }
    }
    const byKey = {}; roster.forEach(n => { const p = n.split(/\s+/); byKey[n.toLowerCase()] = n; byKey[(p.slice(-1)[0] + " " + p.slice(0, -1).join(" ")).toLowerCase()] = n; });
    const who = (a, b) => byKey[`${String(b || "").trim()} ${String(a || "").trim()}`.toLowerCase()] || byKey[`${String(a || "").trim()} ${String(b || "").trim()}`.toLowerCase()];
    let total = 0;
    book.forEach(sh => {
      const c = guessCat(sh.name); if (!c) return;
      let dates = null, subj = "_", n = 0;
      sh.grid.forEach((row, r) => {
        if (!row) return;
        const a = row[0] && String(row[0].v || "").trim(), b = row[1] && String(row[1].v || "").trim();
        const rowDates = row.map((cell, i) => i >= 2 && looksDate(cell) ? serialToIso(+cell.v) : null);
        if (rowDates.filter(Boolean).length >= 1 && !who(a, b)) dates = rowDates;      // a date header row
        if (a && !b && !who(a, b)) {                                                     // a block label (subject / Total)
          if (/total/i.test(a)) subj = "__skip"; else if (c.subjects && c.subjects.length) { subj = c.subjects.includes(a) ? a : null; if (!subj) { c.subjects.push(a); subj = a; } } else subj = "_";
          return;
        }
        const stu = who(a, b); if (!stu || subj === "__skip" || subj == null) return;
        const key = c.subjects && c.subjects.length ? (subj === "_" ? c.subjects[0] : subj) : "_";
        if (c.id === "notes") {
          row.forEach((cell, i) => { if (i < 2 || !cell || !cell.v) return; const m = String(cell.v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/s); const d = m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : null; if (d) { const prev = getV(c.id, "_", d, stu); setV(c.id, "_", d, stu, prev ? prev + " · " + m[4] : m[4]); n++; } });
          return;
        }
        if (!dates) return;
        row.forEach((cell, i) => {
          if (i < 2 || !cell || cell.f || cell.v === "" || cell.v == null || !dates[i]) return;
          let v = cell.v; if (cell.num && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v)) v = String(Math.round(+v * 1000) / 1000);
          setV(c.id, key, dates[i], stu, v); n++;
        });
      });
      if (n) { log.push(`${c.name}: ${n} grades from “${sh.name}”.`); total += n; }
    });
    save();
    return total;
  }

  /* ============================================================
     UI
     ============================================================ */
  let root, tabsEl, panels = {}, current = "dash", lastImport = null;
  const view = { cat: null, subj: null, week: null, dashFrom: null, dashTo: null, dashPreset: "week", expFrom: null, expTo: null };

  /* ----- Dashboard ----- */
  function rangeFromPreset(p) {
    const t = today(), ws = weekStartOf(t);
    if (p === "week") return [ws, addDays(ws, 6)];
    if (p === "last") return [addDays(ws, -7), addDays(ws, -1)];
    if (p === "month") { const d = parse(t); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
    if (p === "all") { let min = t; Object.values(G.grades).forEach(a => Object.values(a).forEach(b => Object.keys(b).forEach(d => { if (d < min) min = d; }))); return [min, t]; }
    return [view.dashFrom || ws, view.dashTo || addDays(ws, 6)];
  }
  function drawDash() {
    const p = panels.dash; p.innerHTML = "";
    const names = students();
    if (!names.length) { p.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list (Settings → Students) or import your Excel workbook."), h("button", { type: "button", class: "button", onclick: () => show("settings") }, "Go to Settings"))); return; }
    const [from, to] = rangeFromPreset(view.dashPreset); view.dashFrom = from; view.dashTo = to;
    const fromIn = h("input", { type: "date", class: "pl-dt", value: from, onchange: e => { view.dashPreset = "custom"; view.dashFrom = e.target.value; drawDash(); } });
    const toIn = h("input", { type: "date", class: "pl-dt", value: to, onchange: e => { view.dashPreset = "custom"; view.dashTo = e.target.value; drawDash(); } });
    const presets = h("div", { class: "pl-seg" }, [["week", "This week"], ["last", "Last week"], ["month", "This month"], ["all", "All"]].map(([k, l]) =>
      h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": view.dashPreset === k ? "true" : "false", onclick: () => { view.dashPreset = k; drawDash(); } }, l)));
    p.appendChild(h("div", { class: "card pl-bar" }, presets, h("label", null, "From ", fromIn), h("label", null, "to ", toIn),
      h("span", { class: "pl-bar-btns" },
        h("button", { type: "button", class: "button secondary", onclick: () => download(`Gradebook ${from} to ${to}.xlsx`, exportWorkbook(from, to)) }, "Download Excel"),
        h("button", { type: "button", class: "button secondary", onclick: () => window.print() }, "Print"))));
    const shown = cats().filter(c => c.show && c.better !== "text");
    // class averages
    const stats = shown.map(c => {
      const vals = names.map(s => studentAvg(c, s, from, to)).filter(v => v != null);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { c, avg, p: pct(c, avg, from, to), n: vals.length };
    });
    p.appendChild(h("div", { class: "gb-tiles" }, stats.map(s => h("div", { class: "gb-tile " + tone(s.p), style: { "--c": s.c.color } },
      h("span", { class: "gb-tile-name" }, s.c.name),
      h("span", { class: "gb-tile-num" }, s.avg == null ? "—" : round(s.avg) + (s.c.better === "low" ? "" : s.c.max ? ` / ${s.c.max}` : "")),
      h("small", null, s.c.better === "low" ? "avg incidents per student" : s.n ? `class average · ${s.n} students` : "no grades yet")))));
    // attention list
    const flags = [];
    names.forEach(s => shown.forEach(c => { const v = studentAvg(c, s, from, to); const pc = pct(c, v, from, to); if (pc != null && pc < G.settings.attention) flags.push({ s, c, v }); }));
    const att = h("div", { class: "card" }, h("h3", null, "Needs attention ", h("span", { class: "pl-count" }, String(new Set(flags.map(f => f.s)).size))),
      h("p", { class: "help" }, `Below ${G.settings.attention}% in a category for these dates.`));
    if (!flags.length) att.appendChild(h("p", { class: "pl-none" }, "Nobody is below the line. 👏"));
    else {
      const by = {}; flags.forEach(f => (by[f.s] = by[f.s] || []).push(f));
      att.appendChild(h("div", { class: "gb-flags" }, Object.entries(by).map(([s, fs]) => h("button", { type: "button", class: "gb-flag", onclick: () => studentDetail(s, from, to) },
        h("strong", null, s), fs.map(f => h("span", { class: "pl-tag", style: { background: f.c.color, borderColor: f.c.color, color: "#fff" } }, `${f.c.name}: ${round(f.v)}`))))));
    }
    p.appendChild(att);
    // student table
    const table = h("table", { class: "gb-table" },
      h("thead", null, h("tr", null, h("th", null, "Student"), shown.map(c => h("th", { style: { borderTopColor: c.color } }, c.name, h("small", null, c.better === "low" ? "total" : c.max ? `of ${c.max}` : ""))))),
      h("tbody", null, names.map(s => h("tr", null,
        h("th", null, h("button", { type: "button", class: "gb-link", onclick: () => studentDetail(s, from, to) }, s)),
        shown.map(c => { const v = studentAvg(c, s, from, to); return h("td", { class: "gb-c " + tone(pct(c, v, from, to)) }, v == null ? "" : round(v)); })))));
    p.appendChild(h("div", { class: "card gb-scroll" }, h("h3", null, "Students ", h("small", { class: "help" }, `${fmt(from, { month: "short", day: "numeric" })} – ${fmt(to, { month: "short", day: "numeric", year: "numeric" })}`)), table,
      h("p", { class: "help" }, `Green ≥ ${G.settings.good}% · gold ≥ ${G.settings.ok}% · red below. Click a name for details.`)));
  }
  function studentDetail(s, from, to) {
    const overlay = h("div", { class: "pl-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
    const box = h("div", { class: "pl-form gb-detail" }, h("div", { class: "pl-form-head" }, h("div", null, h("small", null, `${fmt(from, { month: "short", day: "numeric" })} – ${fmt(to, { month: "short", day: "numeric" })}`), h("h2", null, s)),
      h("button", { type: "button", class: "pl-x", onclick: () => overlay.remove() }, "×")));
    cats().forEach(c => {
      const dates = catDates(c, from, to).filter(d => subjKeys(c).some(sk => getV(c.id, sk, d, s) !== undefined));
      if (!dates.length) return;
      const avg = studentAvg(c, s, from, to);
      box.appendChild(h("h3", { class: "gb-dh", style: { borderLeftColor: c.color } }, c.name, avg != null ? h("span", { class: "gb-c " + tone(pct(c, avg, from, to)) }, (c.better === "low" ? "total " : "avg ") + round(avg)) : null));
      const t = h("table", { class: "gb-table small" }, h("tr", null, h("th", null, ""), dates.map(d => h("th", null, fmt(d)))),
        subjKeys(c).map(sk => h("tr", null, h("th", null, sk === "_" ? "" : sk), dates.map(d => h("td", { class: c.better === "text" ? "gb-text" : "" }, getV(c.id, sk, d, s) || "")))));
      box.appendChild(h("div", { class: "gb-scroll" }, t));
    });
    box.appendChild(h("div", { class: "pl-actions" }, h("button", { type: "button", class: "button secondary", onclick: () => window.print() }, "Print")));
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  /* ----- Enter grades: spreadsheet grid ----- */
  function drawGrid() {
    const p = panels.grid; p.innerHTML = "";
    const names = students();
    if (!names.length) { p.appendChild(h("div", { class: "card pl-empty" }, h("p", null, "Add your class list first."), h("button", { type: "button", class: "button", onclick: () => show("settings") }, "Go to Settings"))); return; }
    if (!view.cat || !cat(view.cat)) view.cat = cats()[0].id;
    const c = cat(view.cat);
    const subs = subjKeys(c);
    if (!subs.includes(view.subj)) view.subj = subs[0];
    if (!view.week) view.week = weekStartOf(today());
    const dates = c.freq === "weekly" ? [weekDays(view.week)[0] || view.week] : weekDays(view.week);

    const catSel = h("select", { class: "pl-select", onchange: e => { view.cat = e.target.value; view.subj = null; drawGrid(); } },
      cats().map(x => h("option", { value: x.id, selected: x.id === view.cat ? true : null }, x.name)));
    const subjSel = subs[0] === "_" ? null : h("select", { class: "pl-select", onchange: e => { view.subj = e.target.value; drawGrid(); } },
      subs.map(x => h("option", { value: x, selected: x === view.subj ? true : null }, x)));
    const wk = h("input", { type: "date", class: "pl-dt", value: view.week, onchange: e => { if (e.target.value) { view.week = weekStartOf(e.target.value); drawGrid(); } } });
    const fillIn = h("input", { type: "text", class: "cr-num", value: G.settings.defaultFill, placeholder: "e.g. 10", "aria-label": "Fill value" });
    p.appendChild(h("div", { class: "card pl-bar gb-toolbar" },
      h("label", null, "Category ", catSel), subjSel ? h("label", null, "Subject ", subjSel) : null,
      h("span", { class: "gb-week" },
        h("button", { type: "button", class: "small-btn", onclick: () => { view.week = addDays(view.week, -7); drawGrid(); } }, "‹ Prev"),
        h("label", null, "Week of ", wk),
        h("button", { type: "button", class: "small-btn", onclick: () => { view.week = addDays(view.week, 7); drawGrid(); } }, "Next ›"),
        h("button", { type: "button", class: "small-btn", onclick: () => { view.week = weekStartOf(today()); drawGrid(); } }, "This week")),
      h("span", { class: "gb-fill" }, h("label", null, "Fill blanks with ", fillIn),
        h("button", { type: "button", class: "small-btn", onclick: () => fillBlanks(fillIn.value, true) }, "selected column"),
        h("button", { type: "button", class: "small-btn", onclick: () => fillBlanks(fillIn.value, false) }, "whole week"))));

    const sk = view.subj;
    const grid = h("table", { class: "gb-grid", style: { "--c": c.color } });
    grid.appendChild(h("thead", null, h("tr", null, h("th", { class: "gb-name" }, c.name + (sk !== "_" ? " · " + sk : "")),
      dates.map(d => h("th", { class: d === today() ? "today" : "" }, fmt(d))), c.better === "text" ? null : h("th", { class: "gb-avg" }, c.better === "low" ? "Total" : "Avg"))));
    const body = h("tbody");
    names.forEach((s, r) => {
      const tr = h("tr", null, h("th", { class: "gb-name" }, s));
      dates.forEach((d, ci) => {
        const td = h("td", { "data-r": r, "data-c": ci, class: "gb-cell" + (c.better === "text" ? " text" : "") });
        td.textContent = getV(c.id, sk, d, s) || "";
        tr.appendChild(td);
      });
      if (c.better !== "text") tr.appendChild(h("td", { class: "gb-avg", "data-avg": r }));
      body.appendChild(tr);
    });
    if (c.better !== "text") body.appendChild(h("tr", { class: "gb-foot" }, h("th", { class: "gb-name" }, "Class average"), dates.map((d, ci) => h("td", { "data-cavg": ci })), h("td")));
    grid.appendChild(body);
    p.appendChild(h("div", { class: "card gb-scroll gb-gridcard" }, grid,
      h("p", { class: "help" }, "Click a cell and type. Arrow keys / Enter / Tab move. Drag the gold square at a cell's corner to copy it down or across (double-click it to fill down). Shift-click or drag to select; Ctrl+C / Ctrl+V copy and paste with Excel; Delete clears.")));
    Grid.mount(grid, { names, dates, c, sk });
  }
  function fillBlanks(v, colOnly) {
    v = String(v || "").trim(); if (!v) { alert("Type a value to fill in first."); return; }
    const c = cat(view.cat), sk = view.subj, names = students();
    const dates = c.freq === "weekly" ? [weekDays(view.week)[0] || view.week] : weekDays(view.week);
    const cols = colOnly && Grid.sel ? [...new Set(Grid.selCells().map(x => x[1]))] : dates.map((_, i) => i);
    let n = 0; cols.forEach(ci => names.forEach(s => { if (getV(c.id, sk, dates[ci], s) === undefined) { setV(c.id, sk, dates[ci], s, v); n++; } }));
    G.settings.defaultFill = v; save(); drawGrid(); toast(`Filled ${n} empty cell${n === 1 ? "" : "s"} with “${v}”.`);
  }

  const Grid = {
    sel: null, active: null, ctx: null, table: null,
    mount(table, ctx) {
      this.table = table; this.ctx = ctx; this.active = [0, 0]; this.sel = { r1: 0, c1: 0, r2: 0, c2: 0 };
      const R = ctx.names.length, C = ctx.dates.length;
      const cell = (r, c) => table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
      this.cell = cell;
      const handle = h("div", { class: "gb-handle", title: "Drag to fill" });
      table.parentElement.style.position = "relative";
      table.parentElement.appendChild(handle);
      const editor = h("input", { class: "gb-editor", type: "text", "aria-label": "Edit cell" });
      table.parentElement.appendChild(editor);
      let editing = false;
      const recompute = () => {
        const c = ctx.c; if (c.better === "text") return;
        ctx.names.forEach((s, r) => {
          const vals = ctx.dates.map(d => num(getV(c.id, ctx.sk, d, s))).filter(v => v != null);
          const v = vals.length ? (c.better === "low" ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          const td = table.querySelector(`[data-avg="${r}"]`); td.textContent = round(v);
          td.className = "gb-avg " + (c.better === "low" ? "" : tone(v == null ? null : (v / c.max) * 100));
        });
        ctx.dates.forEach((d, ci) => {
          const vals = ctx.names.map(s => num(getV(c.id, ctx.sk, d, s))).filter(v => v != null);
          table.querySelector(`[data-cavg="${ci}"]`).textContent = vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : "";
        });
        ctx.names.forEach((s, r) => ctx.dates.forEach((d, ci) => {
          const td = cell(r, ci), n = num(td.textContent);
          td.classList.remove("g", "y", "r");
          if (n != null && c.max && c.better === "high") { const t = tone((n / c.max) * 100); if (t) td.classList.add(t); }
          if (n != null && c.better === "low" && n > 0) td.classList.add(n >= c.max ? "r" : "y");
        }));
      };
      const write = (r, ci, v) => { setV(ctx.c.id, ctx.sk, ctx.dates[ci], ctx.names[r], v); cell(r, ci).textContent = (v == null ? "" : String(v).trim()); };
      const commit = () => { save(); recompute(); };
      const paint = () => {
        table.querySelectorAll(".gb-cell.sel, .gb-cell.act").forEach(x => x.classList.remove("sel", "act"));
        const s = this.sel, [ar, ac] = this.active;
        for (let r = Math.min(s.r1, s.r2); r <= Math.max(s.r1, s.r2); r++) for (let c = Math.min(s.c1, s.c2); c <= Math.max(s.c1, s.c2); c++) cell(r, c).classList.add("sel");
        cell(ar, ac).classList.add("act");
        const br = cell(Math.max(s.r1, s.r2), Math.max(s.c1, s.c2)), host = table.parentElement.getBoundingClientRect(), b = br.getBoundingClientRect();
        handle.style.left = (b.right - host.left + table.parentElement.scrollLeft - 5) + "px";
        handle.style.top = (b.bottom - host.top + table.parentElement.scrollTop - 5) + "px";
        handle.style.display = "block";
      };
      this.paint = paint;
      const go = (r, c, extend) => {
        r = Math.max(0, Math.min(R - 1, r)); c = Math.max(0, Math.min(C - 1, c));
        if (extend) { this.sel.r2 = r; this.sel.c2 = c; } else { this.active = [r, c]; this.sel = { r1: r, c1: c, r2: r, c2: c }; }
        if (!extend) this.active = [r, c];
        paint(); cell(r, c).scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      const startEdit = (initial) => {
        const [r, c] = this.active, td = cell(r, c), host = table.parentElement.getBoundingClientRect(), b = td.getBoundingClientRect();
        Object.assign(editor.style, { display: "block", left: (b.left - host.left + table.parentElement.scrollLeft) + "px", top: (b.top - host.top + table.parentElement.scrollTop) + "px", width: b.width + "px", height: b.height + "px" });
        editor.value = initial != null ? initial : td.textContent; editing = true; editor.focus();
        if (initial == null) editor.select();
      };
      const endEdit = (save_) => { if (!editing) return; editing = false; editor.style.display = "none"; if (save_) { const [r, c] = this.active; write(r, c, editor.value); commit(); } table.focus(); };
      editor.addEventListener("keydown", e => {
        const [r, c] = this.active;
        if (e.key === "Enter") { e.preventDefault(); endEdit(true); go(r + (e.shiftKey ? -1 : 1), c); }
        else if (e.key === "Tab") { e.preventDefault(); endEdit(true); go(r, c + (e.shiftKey ? -1 : 1)); }
        else if (e.key === "Escape") { endEdit(false); }
        else if ((e.key === "ArrowDown" || e.key === "ArrowUp") ) { e.preventDefault(); endEdit(true); go(r + (e.key === "ArrowDown" ? 1 : -1), c); }
      });
      editor.addEventListener("blur", () => endEdit(true));
      table.tabIndex = 0;
      table.addEventListener("keydown", e => {
        if (editing) return;
        const [r, c] = this.active, ext = e.shiftKey;
        const er = ext ? this.sel.r2 : r, ec = ext ? this.sel.c2 : c;
        const k = e.key;
        if (k === "ArrowDown") { e.preventDefault(); go(er + 1, ec, ext); }
        else if (k === "ArrowUp") { e.preventDefault(); go(er - 1, ec, ext); }
        else if (k === "ArrowRight") { e.preventDefault(); go(er, ec + 1, ext); }
        else if (k === "ArrowLeft") { e.preventDefault(); go(er, ec - 1, ext); }
        else if (k === "Enter") { e.preventDefault(); go(r + 1, c); }
        else if (k === "Tab") { e.preventDefault(); go(r, c + (e.shiftKey ? -1 : 1)); }
        else if (k === "F2") { e.preventDefault(); startEdit(); }
        else if (k === "Delete" || k === "Backspace") { e.preventDefault(); this.selCells().forEach(([rr, cc]) => write(rr, cc, "")); commit(); }
        else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "d") { e.preventDefault(); fillRange("down"); }
        else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "r") { e.preventDefault(); fillRange("right"); }
        else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { startEdit(""); }
      });
      // copy / paste (works with Excel and Google Sheets)
      table.addEventListener("copy", e => {
        const s = this.sel, rows = [];
        for (let r = Math.min(s.r1, s.r2); r <= Math.max(s.r1, s.r2); r++) { const row = []; for (let c = Math.min(s.c1, s.c2); c <= Math.max(s.c1, s.c2); c++) row.push(cell(r, c).textContent); rows.push(row.join("\t")); }
        e.clipboardData.setData("text/plain", rows.join("\n")); e.preventDefault();
      });
      table.addEventListener("paste", e => {
        if (editing) return;
        const txt = e.clipboardData.getData("text/plain"); if (!txt) return; e.preventDefault();
        const rows = txt.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(l => l.split("\t"));
        const [r0, c0] = this.active;
        const single = rows.length === 1 && rows[0].length === 1;
        if (single) this.selCells().forEach(([r, c]) => write(r, c, rows[0][0]));             // one value → fill the selection
        else rows.forEach((row, i) => row.forEach((v, j) => { if (r0 + i < R && c0 + j < C) write(r0 + i, c0 + j, v); }));
        commit(); toast("Pasted.");
      });
      const fillRange = dir => {
        const s = this.sel, rA = Math.min(s.r1, s.r2), rB = Math.max(s.r1, s.r2), cA = Math.min(s.c1, s.c2), cB = Math.max(s.c1, s.c2);
        if (dir === "down") for (let c = cA; c <= cB; c++) { const v = cell(rA, c).textContent; for (let r = rA + 1; r <= rB; r++) write(r, c, v); }
        else for (let r = rA; r <= rB; r++) { const v = cell(r, cA).textContent; for (let c = cA + 1; c <= cB; c++) write(r, c, v); }
        commit();
      };
      // mouse: select, drag-select, double-click to edit
      let dragging = false;
      table.addEventListener("mousedown", e => {
        const td = e.target.closest(".gb-cell"); if (!td) return;
        e.preventDefault(); table.focus();
        const r = +td.dataset.r, c = +td.dataset.c;
        if (e.shiftKey) go(r, c, true); else go(r, c);
        dragging = true;
      });
      table.addEventListener("mouseover", e => { if (!dragging) return; const td = e.target.closest(".gb-cell"); if (td) go(+td.dataset.r, +td.dataset.c, true); });
      document.addEventListener("mouseup", () => { dragging = false; });
      table.addEventListener("dblclick", e => { if (e.target.closest(".gb-cell")) startEdit(); });
      // touch: tap to edit
      table.addEventListener("touchend", e => { const td = e.target.closest(".gb-cell"); if (td) { go(+td.dataset.r, +td.dataset.c); startEdit(); e.preventDefault(); } });
      // FILL HANDLE: drag the gold square to copy the selection down/across (like Excel)
      let filling = null;
      handle.addEventListener("pointerdown", e => {
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const s = this.sel; filling = { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2), toR: null, toC: null };
      });
      handle.addEventListener("pointermove", e => {
        if (!filling) return;
        const el = document.elementFromPoint(e.clientX, e.clientY), td = el && el.closest && el.closest(".gb-cell"); if (!td) return;
        const r = +td.dataset.r, c = +td.dataset.c;
        table.querySelectorAll(".gb-cell.fill").forEach(x => x.classList.remove("fill"));
        const down = Math.abs(r - filling.r2) >= Math.abs(c - filling.c2);
        filling.toR = down ? Math.max(r, filling.r2) : filling.r2; filling.toC = down ? filling.c2 : Math.max(c, filling.c2);
        for (let rr = filling.r1; rr <= filling.toR; rr++) for (let cc = filling.c1; cc <= filling.toC; cc++) if (rr > filling.r2 || cc > filling.c2) cell(rr, cc).classList.add("fill");
      });
      handle.addEventListener("pointerup", () => {
        if (!filling) return;
        const f = filling; filling = null;
        table.querySelectorAll(".gb-cell.fill").forEach(x => x.classList.remove("fill"));
        if (f.toR == null) return;
        const h_ = f.r2 - f.r1 + 1, w = f.c2 - f.c1 + 1;
        for (let r = f.r1; r <= f.toR; r++) for (let c = f.c1; c <= f.toC; c++) {
          if (r <= f.r2 && c <= f.c2) continue;
          write(r, c, cell(f.r1 + ((r - f.r1) % h_), f.c1 + ((c - f.c1) % w)).textContent);    // repeats the pattern, like Excel's copy-fill
        }
        this.sel = { r1: f.r1, c1: f.c1, r2: f.toR, c2: f.toC }; commit(); paint();
      });
      handle.addEventListener("dblclick", () => {                         // double-click: fill down to the last student
        const s = this.sel, cA = Math.min(s.c1, s.c2), cB = Math.max(s.c1, s.c2), rA = Math.min(s.r1, s.r2);
        for (let c = cA; c <= cB; c++) { const v = cell(rA, c).textContent; for (let r = rA + 1; r < R; r++) write(r, c, v); }
        this.sel = { r1: rA, c1: cA, r2: R - 1, c2: cB }; commit(); paint();
      });
      table.parentElement.addEventListener("scroll", () => paint());
      recompute(); paint();
    },
    selCells() { const s = this.sel, out = []; for (let r = Math.min(s.r1, s.r2); r <= Math.max(s.r1, s.r2); r++) for (let c = Math.min(s.c1, s.c2); c <= Math.max(s.c1, s.c2); c++) out.push([r, c]); return out; }
  };

  /* ----- Excel export ----- */
  function drawExport() {
    const p = panels.export; p.innerHTML = "";
    const ws = weekStartOf(today());
    if (!view.expFrom) { view.expFrom = ws; view.expTo = addDays(ws, 6); }
    const from = h("input", { type: "date", class: "pl-dt", value: view.expFrom, onchange: e => { view.expFrom = e.target.value; } });
    const to = h("input", { type: "date", class: "pl-dt", value: view.expTo, onchange: e => { view.expTo = e.target.value; } });
    const weekPick = h("input", { type: "date", class: "pl-dt", value: ws, onchange: e => { if (!e.target.value) return; view.expFrom = weekStartOf(e.target.value); view.expTo = addDays(view.expFrom, 6); from.value = view.expFrom; to.value = view.expTo; } });
    const msg = h("p", { class: "status" });
    p.appendChild(h("div", { class: "card" },
      h("h3", null, "Download an Excel workbook"),
      h("p", { class: "help" }, "Pick a week (or any dates). You get a Summary sheet plus one sheet per category, laid out like your own workbook. Averages and totals are real Excel formulas, so they calculate by themselves, and you can drag them to copy or fill more rows and columns."),
      h("div", { class: "pl-set-row" }, h("strong", null, "One week: "), weekPick),
      h("div", { class: "pl-set-row" }, h("strong", null, "Or dates: "), "from", from, "to", to),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button", onclick: () => {
          if (!view.expFrom || !view.expTo || view.expFrom > view.expTo) { msg.className = "status err"; msg.textContent = "Choose a start date before the end date."; return; }
          download(`Gradebook ${view.expFrom} to ${view.expTo}.xlsx`, exportWorkbook(view.expFrom, view.expTo));
          msg.className = "status ok"; msg.textContent = "✓ Downloaded.";
        } }, "Download Excel"),
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const w0 = weekStartOf(today()); view.expFrom = w0; view.expTo = addDays(w0, 6); download(`Gradebook week of ${w0}.xlsx`, exportWorkbook(w0, view.expTo));
        } }, "This week"),
        h("button", { type: "button", class: "button secondary", onclick: () => {
          const w0 = addDays(weekStartOf(today()), -7); download(`Gradebook week of ${w0}.xlsx`, exportWorkbook(w0, addDays(w0, 6)));
        } }, "Last week")),
      msg));
  }

  /* ----- Settings (fully customizable) ----- */
  function drawSettings() {
    const p = panels.settings; p.innerHTML = "";
    const d = JSON.parse(JSON.stringify(G.settings));
    const msg = h("p", { class: "status" });
    const dirty = () => { msg.className = "status"; msg.textContent = "You have unsaved changes."; };
    const lines = t => t.split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);

    // categories
    const box = h("div", { class: "pl-set-cats" });
    function drawCats() {
      box.innerHTML = "";
      d.cats.forEach((c, i) => {
        let card;
        const subs = h("textarea", { class: "pl-set-subs", rows: String(Math.max(2, (c.subjects || []).length + 1)), placeholder: "Subjects, one per line (leave empty for one column per day)", oninput: e => { c.subjects = lines(e.target.value); dirty(); } });
        subs.value = (c.subjects || []).join("\n");
        const field = (label, input) => h("label", { class: "gb-set-f" }, h("span", null, label), input);
        card = h("div", { class: "pl-set-cat", style: { "--c": c.color, "--bg": c.color + "14" } },
          h("div", { class: "pl-set-cat-head" },
            h("input", { type: "color", value: c.color, "aria-label": "Color", oninput: e => { c.color = e.target.value; card.style.setProperty("--c", c.color); card.style.setProperty("--bg", c.color + "14"); dirty(); } }),
            h("input", { type: "text", class: "pl-set-name", value: c.name, "aria-label": "Category name", oninput: e => { c.name = e.target.value; dirty(); } }),
            h("span", { class: "pl-set-btns" },
              i > 0 ? h("button", { type: "button", class: "small-btn", "aria-label": "Move up", onclick: () => { [d.cats[i - 1], d.cats[i]] = [d.cats[i], d.cats[i - 1]]; dirty(); drawCats(); } }, "↑") : null,
              i < d.cats.length - 1 ? h("button", { type: "button", class: "small-btn", "aria-label": "Move down", onclick: () => { [d.cats[i + 1], d.cats[i]] = [d.cats[i], d.cats[i + 1]]; dirty(); drawCats(); } }, "↓") : null,
              h("button", { type: "button", class: "small-btn danger", onclick: () => { if (confirm(`Delete the category "${c.name}" and all its grades?`)) { d.cats.splice(i, 1); d._deleted = (d._deleted || []).concat(c.id); dirty(); drawCats(); } } }, "Delete"))),
          h("div", { class: "gb-set-grid" },
            field("Graded", h("select", { class: "pl-select", onchange: e => { c.freq = e.target.value; dirty(); } },
              [["daily", "Every school day"], ["weekly", "Once a week"]].map(([v, l]) => h("option", { value: v, selected: c.freq === v ? true : null }, l)))),
            field("Kind", h("select", { class: "pl-select", onchange: e => { c.better = e.target.value; dirty(); } },
              [["high", "Score (higher is better)"], ["low", "Count (lower is better, e.g. incidents)"], ["text", "Notes (text only)"]].map(([v, l]) => h("option", { value: v, selected: c.better === v ? true : null }, l)))),
            field("Top score / warning count", h("input", { type: "number", min: "0", step: "any", class: "cr-num", value: c.max, oninput: e => { c.max = parseFloat(e.target.value) || 0; dirty(); } })),
            field("On dashboard", h("input", { type: "checkbox", checked: c.show ? true : null, onchange: e => { c.show = e.target.checked; dirty(); } }))),
          subs);
        box.appendChild(card);
      });
    }
    drawCats();
    // students
    const stu = h("textarea", { class: "pl-names", rows: "12", placeholder: "One name per line (First Last)" });
    stu.value = students().join("\n");
    // days
    const dayBox = h("div", { class: "pl-seg" }, DAYS.map((n, i) => h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": d.days.includes(i) ? "true" : "false",
      onclick: e => { d.days = d.days.includes(i) ? d.days.filter(x => x !== i) : d.days.concat(i).sort(); e.target.setAttribute("aria-pressed", d.days.includes(i) ? "true" : "false"); dirty(); } }, n)));
    const startSel = h("select", { class: "pl-select", onchange: e => { d.weekStart = +e.target.value; dirty(); } }, DAYS.map((n, i) => h("option", { value: i, selected: d.weekStart === i ? true : null }, n)));
    const numIn = (k, min, max) => h("input", { type: "number", min, max, class: "cr-num", value: d[k], oninput: e => { d[k] = parseFloat(e.target.value) || 0; dirty(); } });
    // import / backup
    const impMsg = h("p", { class: "status" + (lastImport ? " ok" : "") }, lastImport || "");
    const impIn = h("input", { type: "file", accept: ".xlsx,.xlsm", class: "hidden", onchange: async e => {
      const f = e.target.files[0]; if (!f) return; impMsg.className = "status"; impMsg.textContent = "Reading " + f.name + "…";
      try { const log = []; const n = await importWorkbook(f, log); lastImport = `✓ Imported ${n} grades. ` + log.join(" · "); drawSettings(); }
      catch (err) { impMsg.className = "status err"; impMsg.textContent = err.message || "Couldn't read that file."; }
      e.target.value = "";
    } });
    const restoreIn = h("input", { type: "file", accept: ".json", class: "hidden", onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (!data.settings || !data.grades) throw 0; if (!confirm("Replace the gradebook on this device with this backup?")) return; G = { settings: data.settings, grades: data.grades }; if (data.students) setStudents(data.students); save(); refreshAll(); show("settings"); }
      catch { alert("That file isn't a gradebook backup."); }
      e.target.value = "";
    } });

    p.append(
      h("div", { class: "card" }, h("h3", null, "Students"), h("p", { class: "help" }, "One per line, first name then last name. The same list is used by the Phone Log and Classroom Tools."), stu),
      h("div", { class: "card" }, h("h3", null, "Categories"),
        h("p", { class: "help" }, "Everything you grade. Add subjects to a category (like Tests: גמרא, חומש) to grade each subject separately; they're averaged together. “Count” categories (like Behavior) are added up, and lower is better."),
        box, h("div", { class: "actions" }, h("button", { type: "button", class: "button secondary", onclick: () => { d.cats.push({ id: "c" + Date.now().toString(36), name: "New category", freq: "daily", max: 10, better: "high", subjects: [], color: "#0f766e", show: true }); dirty(); drawCats(); } }, "+ Add category"))),
      h("div", { class: "pl-set-two" },
        h("div", { class: "card" }, h("h3", null, "School days"), h("p", { class: "help" }, "Which days get a column for daily categories."), dayBox,
          h("p", { class: "pl-set-row" }, "Weeks start on", startSel)),
        h("div", { class: "card" }, h("h3", null, "Colors & warnings"),
          h("p", { class: "pl-set-row" }, "Green at", numIn("good", 1, 100), "% or more"),
          h("p", { class: "pl-set-row" }, "Gold at", numIn("ok", 1, 100), "% or more (red below)"),
          h("p", { class: "pl-set-row" }, "“Needs attention” below", numIn("attention", 1, 100), "%"),
          h("p", { class: "pl-set-row" }, "Decimal places", numIn("decimals", 0, 3)))),
      h("div", { class: "card pl-set-save" },
        h("button", { type: "button", class: "button", onclick: () => {
          const seen = new Set();
          const names = stu.value.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
          if (!d.cats.length) { msg.className = "status err"; msg.textContent = "Keep at least one category."; return; }
          if (!d.days.length) { msg.className = "status err"; msg.textContent = "Choose at least one school day."; return; }
          d.cats.forEach(c => { c.name = c.name.trim() || "Untitled"; });
          (d._deleted || []).forEach(id => delete G.grades[id]); delete d._deleted;
          setStudents(names); G.settings = d; save(); refreshAll();
          msg.className = "status ok"; msg.textContent = "✓ Settings saved.";
        } }, "Save settings"),
        h("button", { type: "button", class: "small-btn", onclick: () => { if (confirm("Put the gradebook settings back to the original? (Grades are kept.)")) { G.settings = DEFAULTS(); save(); drawSettings(); } } }, "Reset to original"),
        msg),
      h("div", { class: "card" }, h("h3", null, "Import your Excel workbook"),
        h("p", { class: "help" }, "Brings in the class list (from a sheet with First / Last headings, like “Seating”) and grades from sheets named like your categories — Tests, Classwork (with subject blocks), Homework, Kriah, Behavior, Notes and so on. Formula cells (totals) are skipped; they're recalculated here."),
        h("div", { class: "actions" }, h("button", { type: "button", class: "button secondary", onclick: () => impIn.click() }, "Import .xlsx"), impIn), impMsg),
      h("div", { class: "card" }, h("h3", null, "Backup"),
        h("p", { class: "help" }, "Grades are private: saved only in this browser on this device, never on the website. Download a backup regularly, and use Restore to move to another computer."),
        h("div", { class: "actions" },
          h("button", { type: "button", class: "button secondary", onclick: () => download(`gradebook-backup-${today()}.json`, new Blob([JSON.stringify(Object.assign({ students: students() }, G))], { type: "application/json" })) }, "Download backup"),
          h("button", { type: "button", class: "button secondary", onclick: () => restoreIn.click() }, "Restore backup"), restoreIn)));
  }

  /* ----- toast ----- */
  let tt = null;
  function toast(text) { let t = document.getElementById("pl-toast"); if (t) t.remove(); clearTimeout(tt); t = h("div", { id: "pl-toast", class: "pl-toast", role: "status" }, h("span", null, text)); document.body.appendChild(t); tt = setTimeout(() => t.remove(), 3000); }

  /* ----- shell ----- */
  const TABS = [["dash", "Dashboard"], ["grid", "Enter Grades"], ["export", "Excel Export"], ["settings", "Settings"]];
  function show(k) {
    current = k;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k ? "true" : "false"));
    Object.entries(panels).forEach(([key, el]) => el.classList.toggle("hidden", key !== k));
    refreshAll();
  }
  function refreshAll() {
    document.querySelectorAll(".gb-handle, .gb-editor").forEach(x => x.remove());
    if (current === "dash") drawDash(); if (current === "grid") drawGrid(); if (current === "export") drawExport(); if (current === "settings") drawSettings();
  }
  function open(container) {
    root = container; load(); root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Gradebook"),
      h("p", { class: "help", style: { margin: 0 } }, "Grades are saved only on this device — never posted on the website.")));
    tabsEl = h("div", { class: "pl-tabs", role: "tablist" }, TABS.map(([k, l]) => h("button", { type: "button", role: "tab", "data-tab": k, onclick: () => show(k) }, l)));
    root.appendChild(tabsEl);
    TABS.forEach(([k]) => { panels[k] = h("div", { class: "pl-panel" }); root.appendChild(panels[k]); });
    show(students().length ? "dash" : "settings");
  }
  window.Gradebook = { open, _t: { num, exportWorkbook, importWorkbook, weekStartOf, catDates, setV, getV, G: () => G } };
})();

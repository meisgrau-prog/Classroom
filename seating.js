/* ============================================================
   SEATING CHART (Teacher Tools)
   Build the room (rows, pairs, groups, U-shape…), drag desks around,
   then drag students into desks. Several charts can be saved.
   Saved only on this device: localStorage "teacher_seating_v1".
   ============================================================ */
(function () {
  const STORE = "teacher_seating_v1", STUDENTS = "classroom_students_v1";
  const RW = 1000, RH = 640, DW = 104, DH = 62, SNAP = 8;     // room and desk size (room units)
  const uid = () => Math.random().toString(36).slice(2, 9);
  const read = () => { try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.charts)) return s; } catch {} return null; };
  let S = null;
  function load() { S = read() || { charts: [], current: null }; if (!S.charts.length) { const c = newChart("My classroom"); preset(c, "rows"); S.charts.push(c); S.current = c.id; } }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} };
  const chart = () => S.charts.find(c => c.id === S.current) || S.charts[0];
  function newChart(name) { return { id: uid(), name, desks: [], seats: {}, teacherDesk: { x: 440, y: 18 } }; }
  function students() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.names) ? s.names : []; } catch { return []; } }
  function absent() { try { const s = JSON.parse(localStorage.getItem(STUDENTS) || "null"); return s && Array.isArray(s.absent) ? s.absent : []; } catch { return []; } }
  const snap = v => Math.round(v / SNAP) * SNAP;
  const clampX = x => Math.max(0, Math.min(RW - DW, x)), clampY = y => Math.max(84, Math.min(RH - DH, y));

  /* ---------- layouts ---------- */
  const PRESETS = [["rows", "Rows"], ["pairs", "Pairs"], ["groups", "Groups of 4"], ["u", "U-shape"], ["horseshoe", "Two U's"]];
  function preset(c, kind, n) {
    n = n || Math.max(students().length, 12);
    const desks = [], add = (x, y, rot) => desks.push({ id: uid(), x: snap(clampX(x)), y: snap(clampY(y)), rot: rot || 0 });
    const top = 110;
    if (kind === "rows") {
      const cols = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(n * 1.6)))), rows = Math.ceil(n / cols);
      const gx = (RW - cols * DW) / (cols + 1), gy = Math.min(40, (RH - top - rows * DH) / (rows + 0.5));
      for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), k = i % cols; add(gx + k * (DW + gx), top + r * (DH + gy)); }
    } else if (kind === "pairs") {
      const pairs = Math.ceil(n / 2), cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(pairs * 1.4)))), rows = Math.ceil(pairs / cols);
      const pw = DW * 2, gx = (RW - cols * pw) / (cols + 1), gy = Math.min(44, (RH - top - rows * DH) / (rows + 0.5));
      for (let i = 0; i < n; i++) { const p = Math.floor(i / 2), r = Math.floor(p / cols), k = p % cols; add(gx + k * (pw + gx) + (i % 2) * DW, top + r * (DH + gy)); }
    } else if (kind === "groups") {
      const groups = Math.ceil(n / 4), cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(groups * 1.5)))), rows = Math.ceil(groups / cols);
      const gw = DW * 2, gh = DH * 2, gx = (RW - cols * gw) / (cols + 1), gy = Math.max(20, (RH - top - rows * gh) / (rows + 0.5));
      for (let i = 0; i < n; i++) { const g = Math.floor(i / 4), r = Math.floor(g / cols), k = g % cols, s = i % 4; add(gx + k * (gw + gx) + (s % 2) * DW, top + r * (gh + gy) + Math.floor(s / 2) * DH); }
    } else if (kind === "u" || kind === "horseshoe") {
      const shape = (x0, w, y0, h, count) => {      // left side, back, right side
        const side = Math.max(1, Math.round(count * h / (2 * h + w))), back = Math.max(1, count - side * 2);
        for (let i = 0; i < side; i++) add(x0, y0 + i * (h - DH) / Math.max(1, side - 1), 0);
        for (let i = 0; i < back; i++) add(x0 + DW + 6 + i * ((w - DW * 2 - 12 - DW) / Math.max(1, back - 1)), y0 + h - DH, 0);
        for (let i = 0; i < count - side - back; i++) add(x0 + w - DW, y0 + i * (h - DH) / Math.max(1, count - side - back - 1), 0);
      };
      if (kind === "u") shape(40, RW - 80, top, RH - top - 20, n);
      else { const outer = Math.ceil(n * 0.62); shape(30, RW - 60, top, RH - top - 16, outer); shape(250, RW - 500, top + 20, RH - top - 140, n - outer); }
    }
    c.desks = desks;
    const names = Object.values(c.seats); c.seats = {};
    names.forEach((nm, i) => { if (desks[i]) c.seats[desks[i].id] = nm; });
  }

  /* ---------- DOM ---------- */
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
  const short = n => { const p = n.split(/\s+/); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : n; };

  let root, mode = "seat", selDesk = null, pickName = null, roomEl, sideEl, msgEl;

  function open(container) { root = container; load(); draw(); }

  function draw() {
    const c = chart(); root.innerHTML = "";
    root.appendChild(h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "Seating Chart"),
      h("p", { class: "help", style: { margin: 0 } }, "Set up the room, then drag students into desks. Saved only on this device.")));
    // chart picker
    const pick = h("select", { class: "pl-select", "aria-label": "Seating chart", onchange: e => { S.current = e.target.value; save(); selDesk = null; draw(); } }, S.charts.map(x => h("option", { value: x.id, selected: x.id === c.id ? true : null }, x.name)));
    root.appendChild(h("div", { class: "card sc-bar" },
      h("div", { class: "sc-charts" }, h("span", { class: "sc-l" }, "Chart"), pick,
        h("button", { type: "button", class: "small-btn", onclick: () => { const n = prompt("Name for the new chart:", "New chart"); if (!n) return; const x = newChart(n.trim()); preset(x, "rows"); S.charts.push(x); S.current = x.id; save(); draw(); } }, "+ New"),
        h("button", { type: "button", class: "small-btn", onclick: () => { const x = JSON.parse(JSON.stringify(c)); x.id = uid(); x.name = c.name + " (copy)"; const map = {}; x.desks.forEach(d => { const o = d.id; d.id = uid(); map[o] = d.id; }); x.seats = Object.fromEntries(Object.entries(c.seats).map(([k, v]) => [map[k], v])); S.charts.push(x); S.current = x.id; save(); draw(); } }, "Copy"),
        h("button", { type: "button", class: "small-btn", onclick: () => { const n = prompt("Rename this chart:", c.name); if (n) { c.name = n.trim() || c.name; save(); draw(); } } }, "Rename"),
        S.charts.length > 1 ? h("button", { type: "button", class: "small-btn danger", onclick: () => { if (!confirm(`Delete the chart “${c.name}”?`)) return; S.charts = S.charts.filter(x => x !== c); S.current = S.charts[0].id; save(); draw(); } }, "Delete") : null),
      h("div", { class: "pl-seg sc-mode" },
        h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": mode === "seat" ? "true" : "false", onclick: () => { mode = "seat"; selDesk = null; draw(); } }, "👤 Seat students"),
        h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": mode === "layout" ? "true" : "false", onclick: () => { mode = "layout"; pickName = null; draw(); } }, "🪑 Arrange desks"))));
    // tools for the mode
    const tools = h("div", { class: "card sc-tools" });
    if (mode === "layout") {
      const count = h("input", { type: "number", class: "cr-num", min: "1", max: "60", value: String(Math.max(students().length, c.desks.length || 12)), "aria-label": "Number of desks" });
      tools.append(...[h("span", { class: "sc-l" }, "Start from"), PRESETS.map(([k, l]) => h("button", { type: "button", class: "small-btn", onclick: () => { if (c.desks.length && !confirm("Replace the desks with this layout? Seated students are kept in order.")) return; preset(c, k, +count.value || 12); save(); draw(); } }, l)),
        h("label", { class: "sc-count" }, count, " desks"),
        h("span", { class: "sc-sep" }),
        h("button", { type: "button", class: "small-btn", onclick: () => { const d = { id: uid(), x: snap(RW / 2 - DW / 2), y: snap(RH - DH - 30), rot: 0 }; c.desks.push(d); selDesk = d.id; save(); draw(); } }, "+ Add desk"),
        selDesk ? [h("button", { type: "button", class: "small-btn", onclick: () => rotate(c, 90) }, "↻ Turn"),
          h("button", { type: "button", class: "small-btn", onclick: () => { const d = c.desks.find(x => x.id === selDesk); if (!d) return; const n = { id: uid(), x: snap(clampX(d.x + DW + 8)), y: d.y, rot: d.rot }; c.desks.push(n); selDesk = n.id; save(); draw(); } }, "⧉ Copy desk"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => removeDesk(c) }, "Delete desk")] : h("span", { class: "help" }, "Drag desks to move them. Click a desk to turn, copy or delete it.")].flat(2).filter(Boolean));
    } else {
      tools.append(
        h("button", { type: "button", class: "small-btn", onclick: () => { fill(c, true); } }, "🔀 Shuffle everyone"),
        h("button", { type: "button", class: "small-btn", onclick: () => { fill(c, false); } }, "A–Z in order"),
        h("button", { type: "button", class: "small-btn", onclick: () => { fill(c, true, true); } }, "Fill empty desks"),
        h("button", { type: "button", class: "small-btn danger", onclick: () => { if (Object.keys(c.seats).length && confirm("Take everyone out of their seats?")) { c.seats = {}; save(); draw(); } } }, "Clear seats"),
        h("span", { class: "sc-sep" }),
        h("button", { type: "button", class: "small-btn", onclick: () => fullscreen() }, "⛶ Full screen"),
        h("button", { type: "button", class: "small-btn", onclick: () => print(c) }, "🖨 Print"),
        h("button", { type: "button", class: "small-btn", onclick: () => excel(c) }, "⬇ Excel"));
    }
    root.appendChild(tools);
    // room + student list
    roomEl = h("div", { class: "sc-room" + (mode === "layout" ? " layout" : ""), role: "application", "aria-label": "Classroom" });
    roomEl.appendChild(h("div", { class: "sc-front" }, "Front of the room · Board"));
    const td = c.teacherDesk || (c.teacherDesk = { x: 440, y: 18 });
    const tdEl = h("div", { class: "sc-tdesk", style: { left: pctX(td.x), top: pctY(td.y + 40) } }, "Teacher's desk");
    if (mode === "layout") dragThing(tdEl, (x, y) => { td.x = snap(Math.max(0, Math.min(RW - 120, x))); td.y = snap(Math.max(0, Math.min(RH - 40, y - 40))); tdEl.style.left = pctX(td.x); tdEl.style.top = pctY(td.y + 40); }, () => save());
    roomEl.appendChild(tdEl);
    const away = absent();
    c.desks.forEach((d, i) => {
      const who = c.seats[d.id];
      const el = h("div", { class: "sc-desk" + (d.id === selDesk ? " sel" : "") + (who ? " full" : "") + (who && away.includes(who) ? " away" : "") + (pickName ? " target" : ""), "data-desk": d.id,
        style: { left: pctX(d.x), top: pctY(d.y), transform: `rotate(${d.rot || 0}deg)` }, title: who || "Empty desk" },
        h("span", { class: "sc-num" }, String(i + 1)),
        who ? h("span", { class: "sc-name", "data-name": who, style: { transform: `rotate(${-(d.rot || 0)}deg)` } }, short(who)) : h("span", { class: "sc-empty" }, mode === "seat" ? "empty" : ""));
      if (mode === "layout") {
        dragThing(el, (x, y) => { d.x = snap(clampX(x)); d.y = snap(clampY(y)); el.style.left = pctX(d.x); el.style.top = pctY(d.y); }, moved => { if (!moved) { selDesk = d.id === selDesk ? null : d.id; } save(); draw(); }, d);
      } else {
        el.addEventListener("click", () => { if (pickName) { seat(c, pickName, d.id); pickName = null; save(); draw(); } });
        const nm = el.querySelector(".sc-name");
        if (nm) dragName(nm, who, d.id);
      }
      roomEl.appendChild(el);
    });
    // unseated students
    const seated = new Set(Object.values(c.seats));
    const left = students().filter(n => !seated.has(n));
    sideEl = h("div", { class: "sc-side", "data-drop": "side" },
      h("h3", null, mode === "seat" ? `Not seated (${left.length})` : "Students"),
      mode === "seat" ? h("p", { class: "help" }, "Drag a name onto a desk — or click a name, then click a desk. Drag a seated name here to take it out.") : h("p", { class: "help" }, "Switch to “Seat students” to place them."),
      h("div", { class: "sc-list" }, left.map(n => {
        const chip = h("span", { class: "sc-chip" + (pickName === n ? " picked" : "") + (away.includes(n) ? " away" : ""), tabindex: "0", "data-name": n }, n);
        if (mode === "seat") { dragName(chip, n, null); chip.addEventListener("keydown", e => { if (e.key === "Enter") { pickName = pickName === n ? null : n; draw(); } }); }
        return chip;
      }), !left.length && students().length ? h("p", { class: "th-none" }, "Everyone has a seat. ✓") : null, !students().length ? h("p", { class: "th-none" }, "Add your class list first (Classroom Tools → Students).") : null));
    msgEl = h("p", { class: "help sc-msg" }, `${c.desks.length} desks · ${Object.keys(c.seats).length} seated` + (c.desks.length < students().length ? ` · ${students().length - c.desks.length} more desk${students().length - c.desks.length === 1 ? "" : "s"} needed` : ""));
    root.appendChild(h("div", { class: "sc-wrap" }, h("div", { class: "sc-room-col" }, roomEl, msgEl), sideEl));
    if (mode === "layout") document.onkeydown = e => {
      if (!selDesk || !root.isConnected || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const d = c.desks.find(x => x.id === selDesk); if (!d) return;
      const step = e.shiftKey ? 40 : SNAP;
      if (e.key === "ArrowLeft") d.x = clampX(d.x - step); else if (e.key === "ArrowRight") d.x = clampX(d.x + step);
      else if (e.key === "ArrowUp") d.y = clampY(d.y - step); else if (e.key === "ArrowDown") d.y = clampY(d.y + step);
      else if (e.key === "Delete" || e.key === "Backspace") { removeDesk(c); return; } else if (e.key === "r" || e.key === "R") { rotate(c, 90); return; } else return;
      e.preventDefault(); save(); draw();
    }; else document.onkeydown = null;
  }
  const pctX = x => (x / RW * 100) + "%", pctY = y => (y / RH * 100) + "%";
  function rotate(c, by) { const d = c.desks.find(x => x.id === selDesk); if (!d) return; d.rot = ((d.rot || 0) + by) % 360; save(); draw(); }
  function removeDesk(c) { const d = c.desks.find(x => x.id === selDesk); if (!d) return; if (c.seats[d.id] && !confirm(`${c.seats[d.id]} sits here. Delete the desk anyway?`)) return; c.desks = c.desks.filter(x => x !== d); delete c.seats[d.id]; selDesk = null; save(); draw(); }
  function seat(c, name, deskId) {
    const from = Object.keys(c.seats).find(k => c.seats[k] === name);
    const there = deskId ? c.seats[deskId] : null;
    if (from) delete c.seats[from];
    if (deskId) { c.seats[deskId] = name; if (there && there !== name) { if (from) c.seats[from] = there; } }   // swap when moving desk to desk
  }
  function fill(c, shuffle, emptyOnly) {
    const names = students(), seated = new Set(Object.values(c.seats));
    let list = emptyOnly ? names.filter(n => !seated.has(n)) : names.slice();
    if (shuffle) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    else list.sort((a, b) => a.localeCompare(b));
    if (!emptyOnly) c.seats = {};
    const free = c.desks.filter(d => !c.seats[d.id]);
    list.forEach((n, i) => { if (free[i]) c.seats[free[i].id] = n; });
    save(); draw();
  }

  /* ---------- dragging (mouse, pen and touch) ---------- */
  function toRoom(e) { const r = roomEl.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * RW, (e.clientY - r.top) / r.height * RH]; }
  function dragThing(el, onMove, onEnd, d) {
    el.addEventListener("pointerdown", e => {
      if (e.button > 0) return; e.preventDefault();
      const [sx, sy] = toRoom(e), ox = d ? d.x : parseFloat(el.style.left) / 100 * RW, oy = d ? d.y : parseFloat(el.style.top) / 100 * RH;
      let moved = false; el.setPointerCapture(e.pointerId); el.classList.add("dragging");
      const mv = ev => { const [x, y] = toRoom(ev); if (Math.abs(x - sx) + Math.abs(y - sy) > 4) moved = true; if (moved) onMove(ox + x - sx, oy + y - sy); };
      const up = () => { el.classList.remove("dragging"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); onEnd && onEnd(moved); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
  }
  function dragName(el, name, fromDesk) {
    el.addEventListener("pointerdown", e => {
      if (e.button > 0) return; e.preventDefault(); e.stopPropagation();
      const ghost = h("div", { class: "sc-ghost" }, short(name)); document.body.appendChild(ghost);
      const place = ev => { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; };
      place(e); let moved = false, sx = e.clientX, sy = e.clientY, over = null;
      const mv = ev => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) moved = true; place(ev);
        ghost.style.display = "none"; const t = document.elementFromPoint(ev.clientX, ev.clientY); ghost.style.display = "";
        const target = t && (t.closest("[data-desk]") || t.closest("[data-drop=side]"));
        if (over !== target) { if (over) over.classList.remove("over"); over = target; if (over) over.classList.add("over"); }
      };
      const up = ev => {
        document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); ghost.remove(); if (over) over.classList.remove("over");
        const c = chart();
        if (!moved) { pickName = pickName === name ? null : name; draw(); return; }          // a click: pick, then click a desk
        if (over && over.dataset.desk) { seat(c, name, over.dataset.desk); save(); draw(); }
        else if (over && over.dataset.drop === "side" && fromDesk) { delete c.seats[fromDesk]; save(); draw(); }
      };
      document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
    });
  }

  function fullscreen() { const el = roomEl; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
  function print(c) {
    let area = document.getElementById("tp-print"); if (!area) { area = h("div", { id: "tp-print" }); document.body.appendChild(area); }
    const room = roomEl.cloneNode(true); room.classList.add("sc-print-room"); room.classList.remove("layout");
    area.innerHTML = ""; area.appendChild(h("article", { class: "tp-page sc-print" }, h("h1", { class: "sc-print-title" }, c.name), h("p", { class: "sc-print-sub" }, new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })), room));
    document.body.classList.add("tp-printing", "sc-printing");
    const done = () => { document.body.classList.remove("tp-printing", "sc-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
  }

  // download the chart as an Excel sheet: the room laid out in cells + a list
  function excel(c) {
    if (!window.Gradebook || !Gradebook.excel) { alert("The Excel maker isn't loaded on this page."); return; }
    const COLW = 116, ROWH = 74, away = absent();
    const grid = [];   // grid[row][col] = text
    const put = (r, col, v) => { (grid[r] = grid[r] || []); while (grid[r][col] != null) col++; grid[r][col] = v; return col; };
    const order = c.desks.map((d, i) => ({ d, i })).sort((a, b) => a.d.y - b.d.y || a.d.x - b.d.x);
    order.forEach(({ d, i }) => { const who = c.seats[d.id]; put(Math.max(0, Math.round((d.y - 84) / ROWH)), Math.max(0, Math.round(d.x / COLW)), { v: who ? who + (away.includes(who) ? " (absent)" : "") : `Desk ${i + 1} (empty)`, s: who ? 1 : 0 }); });
    let width = 4; for (let r = 0; r < grid.length; r++) if (grid[r]) width = Math.max(width, grid[r].length);
    const td = c.teacherDesk || { x: 440 };
    const rows = [[{ v: c.name, s: 4 }], [{ v: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }], []];
    const front = []; front[Math.floor(width / 2) - 1] = { v: "FRONT OF THE ROOM · BOARD", s: 4 }; rows.push(front);
    const tdr = []; tdr[Math.max(0, Math.min(width - 1, Math.round(td.x / COLW)))] = { v: "Teacher's desk", s: 4 }; rows.push(tdr, []);
    for (let r = 0; r < grid.length; r++) { rows.push(grid[r] || []); rows.push([]); }
    const list = [[{ v: "Desk", s: 1 }, { v: "Student", s: 1 }, { v: "Absent today", s: 1 }]];
    c.desks.forEach((d, i) => { const who = c.seats[d.id] || ""; list.push([i + 1, who || "(empty)", who && away.includes(who) ? "Absent" : ""]); });
    const seated = new Set(Object.values(c.seats)), left = students().filter(n => !seated.has(n));
    if (left.length) { list.push([], [{ v: "Not seated", s: 4 }]); left.forEach(n => list.push(["", n, away.includes(n) ? "Absent" : ""])); }
    Gradebook.excel([{ name: "Seating chart", rows, widths: Array(width).fill(20) }, { name: "List", rows: list, widths: [8, 26, 14], freeze: [0, 1] }],
      `Seating chart - ${c.name.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`);
  }
  // which seat a student has (for Student Profile)
  function seatOf(name) { const s = read(); if (!s) return null; for (const c of s.charts) { const i = c.desks.findIndex(d => c.seats[d.id] === name); if (i >= 0) return { chart: c.name, desk: i + 1 }; } return null; }
  window.SeatingChart = { open, seatOf };
})();

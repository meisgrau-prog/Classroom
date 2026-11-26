/* ============================================================
   UNDO HISTORY for the logs (Phone Log, Gradebook, Student Info, Student Support)
   Every saved change keeps a copy of what was there before, so any recent
   change can be undone later — even after leaving the page or the next day.
   Undoing is itself a change, so it can be undone too.
   Saved only on this device: localStorage "teacher_undo_v1".
   ============================================================ */
(function () {
  const STORE = "teacher_undo_v1";
  const TOOLS = {
    teacher_phone_log_v1: { section: "phonelog", name: "Phone Log", describe: descPhone },
    teacher_gradebook_v1: { section: "gradebook", name: "Gradebook", describe: descGrades },
    teacher_student_info_v1: { section: "info", name: "Student Info", describe: descInfo },
    teacher_support_v1: { section: "support", name: "Student Support", describe: descSupport },
    teacher_attendance_v1: { section: "attendance", name: "Attendance", describe: descAttendance }
  };
  const KEEP = 30, MAX_BYTES = 1500000, MERGE_MS = 4000;
  const ls = window.localStorage;
  const baseSet = Storage.prototype.setItem;
  const read = () => { try { return JSON.parse(ls.getItem(STORE) || "{}") || {}; } catch { return {}; } };
  function write(all) {
    for (let tries = 0; tries < 6; tries++) {
      try { baseSet.call(ls, STORE, JSON.stringify(all)); return; }
      catch { Object.values(all).forEach(list => { if (list.length > 3) list.splice(Math.ceil(list.length / 2)); }); }   // storage full: keep fewer
    }
  }
  const parse = v => { try { return JSON.parse(v || "null"); } catch { return null; } };

  /* ---------- descriptions ---------- */
  function diffBy(a, b, idf) {
    const A = new Map((a || []).map(x => [idf(x), x])), B = new Map((b || []).map(x => [idf(x), x]));
    return { added: [...B.keys()].filter(k => !A.has(k)).map(k => B.get(k)), removed: [...A.keys()].filter(k => !B.has(k)).map(k => A.get(k)),
      changed: [...B.keys()].filter(k => A.has(k) && JSON.stringify(A.get(k)) !== JSON.stringify(B.get(k))).map(k => [A.get(k), B.get(k)]) };
  }
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  function descPhone(prev, next) {
    const a = parse(prev) || {}, b = parse(next) || {};
    const d = diffBy(a.calls, b.calls, c => c.id);
    if (d.added.length === 1 && !d.removed.length) return `Logged a call with ${d.added[0].student}`;
    if (d.removed.length === 1 && !d.added.length) return `Deleted the call with ${d.removed[0].student}`;
    if (d.changed.length === 1 && !d.added.length && !d.removed.length) { const [o, n] = d.changed[0]; return o.followUp && n.followUp && !o.followUp.done && n.followUp.done ? `Marked follow-up done for ${n.student}` : `Changed the call with ${n.student}`; }
    if (d.added.length || d.removed.length || d.changed.length) return [d.added.length && `added ${plural(d.added.length, "call")}`, d.removed.length && `deleted ${plural(d.removed.length, "call")}`, d.changed.length && `changed ${plural(d.changed.length, "call")}`].filter(Boolean).join(", ").replace(/^./, c => c.toUpperCase());
    if (JSON.stringify(a.settings) !== JSON.stringify(b.settings)) return "Changed Phone Log settings";
    return "Changed the Phone Log";
  }
  function descSupport(prev, next) {
    const a = parse(prev) || {}, b = parse(next) || {};
    const d = diffBy(a.entries, b.entries, e => e.id);
    const short = t => (t || "").length > 40 ? t.slice(0, 40) + "…" : t;
    if (d.added.length === 1 && !d.removed.length) return `Added for ${d.added[0].student}: “${short(d.added[0].text)}”`;
    if (d.removed.length === 1 && !d.added.length) return `Deleted for ${d.removed[0].student}: “${short(d.removed[0].text)}”`;
    if (d.changed.length === 1) { const [o, n] = d.changed[0];
      if (o.outcome !== n.outcome) return n.outcome ? `Marked “${{ worked: "Worked", partly: "Partly", no: "Didn't work", wait: "Too soon to tell" }[n.outcome] || n.outcome}” for ${n.student}` : `Cleared the result for ${n.student}`;
      if (o.kind !== n.kind) return `Marked as done for ${n.student}`;
      return `Changed an entry for ${n.student}`; }
    if (d.added.length || d.removed.length || d.changed.length) return "Changed " + plural(d.added.length + d.removed.length + d.changed.length, "entry").replace("entrys", "entries");
    return "Changed Student Support settings";
  }
  function descInfo(prev, next) {
    const a = parse(prev) || {}, b = parse(next) || {};
    const ra = a.rows || {}, rb = b.rows || {};
    const names = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    const ch = [...names].filter(n => JSON.stringify(ra[n]) !== JSON.stringify(rb[n]));
    if (JSON.stringify(a.fields) !== JSON.stringify(b.fields) && !ch.length) return "Changed Student Info fields";
    if (ch.length === 1) return !rb[ch[0]] ? `Cleared info for ${ch[0]}` : !ra[ch[0]] ? `Added info for ${ch[0]}` : `Edited ${ch[0]}`;
    if (ch.length > 1) return `Changed info for ${plural(ch.length, "student")}`;
    return "Changed Student Info";
  }
  function descAttendance(prev, next) {
    const a = (parse(prev) || {}).days || {}, b = (parse(next) || {}).days || {};
    const ch = []; new Set([...Object.keys(a), ...Object.keys(b)]).forEach(d => { const x = a[d] || {}, y = b[d] || {}; new Set([...Object.keys(x), ...Object.keys(y)]).forEach(n => { if (x[n] !== y[n]) ch.push([d, n, y[n]]); }); });
    const L = { P: "present", A: "absent", L: "late", E: "excused" };
    const day = d => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (ch.length === 1) return ch[0][2] ? `Marked ${ch[0][1]} ${L[ch[0][2]]} on ${day(ch[0][0])}` : `Cleared ${ch[0][1]} on ${day(ch[0][0])}`;
    const nDays = new Set(ch.map(c => c[0])).size;
    if (ch.length) return nDays === 1 ? `Changed attendance for ${ch.length} students on ${day(ch[0][0])}` : `Changed ${ch.length} attendance marks over ${nDays} days`;
    return "Changed attendance notes";
  }
  function descGrades(prev, next) {
    const a = parse(prev) || {}, b = parse(next) || {};
    if (a.settings && JSON.stringify(a.settings) !== JSON.stringify(b.settings)) return "Changed Gradebook settings";
    let n = 0; const ga = a.grades || {}, gb = b.grades || {};
    const walk = (x, y) => { const ks = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]); ks.forEach(k => { const u = (x || {})[k], v = (y || {})[k]; if (typeof u === "object" || typeof v === "object") walk(u, v); else if (u !== v) n++; }); };
    walk(ga, gb);
    return n ? `Changed ${plural(n, "grade")}` : "Changed the Gradebook";
  }

  /* ---------- record every saved change ---------- */
  let restoring = false;
  Storage.prototype.setItem = function (k, v) {
    if (this === ls && TOOLS[k] && !restoring) {
      const prev = ls.getItem(k);
      if (prev !== v) {
        const all = read(), list = all[k] || (all[k] = []), last = list[0], now = Date.now();
        if (last && !last.undo && now - last.at < MERGE_MS) { last.at = now; last.n = (last.n || 1) + 1; last.desc = TOOLS[k].describe(last.prev, v); }   // quick typing = one change
        else list.unshift({ at: now, prev, desc: TOOLS[k].describe(prev, v) });
        while (list.length > KEEP || (list.length > 3 && JSON.stringify(list).length > MAX_BYTES)) list.pop();
        write(all);
      }
    }
    return baseSet.call(this, k, v);
  };

  /* ---------- undo ---------- */
  function undoTo(key, index) {
    const all = read(), list = all[key] || []; const e = list[index]; if (!e) return;
    const current = ls.getItem(key);
    const labels = list.slice(0, index + 1).map(x => x.desc);
    // the undo itself is a change you can undo
    list.splice(0, index + 1);
    list.unshift({ at: Date.now(), prev: current, desc: "Undid: " + (labels.length === 1 ? labels[0] : plural(labels.length, "change")), undo: true });
    write(all);
    restoring = true;
    try { e.prev == null ? ls.removeItem(key) : ls.setItem(key, e.prev); } finally { restoring = false; }
    try { sessionStorage.setItem("teacher_undo_flash", "↶ Undone: " + (labels.length === 1 ? labels[0] : plural(labels.length, "change"))); } catch {}
    const sec = TOOLS[key].section;
    location.hash = sec; location.reload();
  }

  /* ---------- the Undo button in each log's heading ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); });
    kids.flat().forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  const when = t => { const d = new Date(t), today = new Date(); const same = d.toDateString() === today.toDateString(); return (same ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
  function attach(head, key) {
    if (head.querySelector(".ud-undo-box")) return;
    const bar = h("span", { class: "ud-undo-box" });
    const draw = () => {
      bar.innerHTML = "";
      const list = (read()[key] || []);
      const undoBtn = h("button", { type: "button", class: "ud-btn ud-undo", disabled: list.length ? null : true, title: list.length ? "Undo: " + list[0].desc : "Nothing to undo",
        onclick: () => { if (confirm(`Undo this change?\n\n${list[0].desc}\n(${when(list[0].at)})`)) undoTo(key, 0); } }, h("span", { class: "ud-ico" }, "↶"), " Undo");
      const menu = h("div", { class: "ud-menu hidden", role: "menu" });
      const histBtn = h("button", { type: "button", class: "ud-btn ghost ud-hist", disabled: list.length ? null : true, "aria-haspopup": "true",
        onclick: e => { e.stopPropagation(); menu.classList.toggle("hidden"); } }, "Recent changes ▾");
      menu.appendChild(h("p", { class: "ud-menu-head" }, "Undo back to any point. Newest first."));
      list.forEach((x, i) => menu.appendChild(h("div", { class: "ud-item" + (x.undo ? " is-undo" : "") },
        h("div", null, h("strong", null, x.desc + (x.n > 1 ? ` (${x.n} edits)` : "")), h("small", null, when(x.at))),
        h("button", { type: "button", class: "small-btn", onclick: () => { if (confirm(i === 0 ? `Undo this change?\n\n${x.desc}` : `Undo the last ${i + 1} changes, back to before:\n\n${x.desc}?`)) undoTo(key, i); } }, i === 0 ? "Undo" : "Undo to here"))));
      if (!list.length) menu.appendChild(h("p", { class: "th-none" }, "No changes yet."));
      bar.append(undoBtn, h("div", { class: "ud-wrap" }, histBtn, menu));
      document.addEventListener("click", e => { if (!bar.contains(e.target)) menu.classList.add("hidden"); });
    };
    draw();
    let holder = head.querySelector(".ud-bar"); if (!holder) { holder = h("div", { class: "ud-bar" }); head.appendChild(holder); }
    holder.appendChild(bar);
    window.addEventListener("teacher-undo-changed", draw);
  }
  // keep the button up to date after each save
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { const r = origSet.call(this, k, v); if (this === ls && TOOLS[k]) setTimeout(() => window.dispatchEvent(new Event("teacher-undo-changed")), 0); return r; };

  function scan() {
    Object.entries(TOOLS).forEach(([key, t]) => { const sec = document.getElementById(t.section); const head = sec && sec.querySelector(".cr-head"); if (head) attach(head, key); });
  }
  document.addEventListener("DOMContentLoaded", () => {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    let flash = null; try { flash = sessionStorage.getItem("teacher_undo_flash"); sessionStorage.removeItem("teacher_undo_flash"); } catch {}
    if (flash) { const t = h("div", { class: "pl-toast", role: "status" }, flash); document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
  });

  window.TeacherUndo = { undoTo, history: key => read()[key] || [] };
})();

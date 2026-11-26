/* ============================================================
   DOWNLOAD TOOLS FOR OFFLINE USE (Settings)
   Builds one .html file with everything inside it (code, styles),
   so a tool works with no internet — Teacher Tools and Classroom Tools.
   ============================================================ */
(function () {
  const TEACHER = [
    ["profile", "Student Profile", "StudentProfile", ["transcript.js", "profile.js"]],
    ["phonelog", "Phone Log", "PhoneLog", ["phonelog.js"]],
    ["gradebook", "Gradebook", "Gradebook", ["gradebook.js"]],
    ["info", "Student Info", "StudentInfo", ["studentinfo.js"]],
    ["support", "Student Support", "StudentSupport", ["support.js"]],
    ["pdfjoin", "PDF Tools", "PdfJoiner", ["pdfjoin.js"]],
    ["attendance", "Attendance", "Attendance", ["attendance.js"]]
  ];
  const CLASSROOM = [["students", "Students"], ["groups", "Group Maker"], ["number", "Random Number"], ["picker", "Random Student"], ["raffle", "Raffle"], ["prizes", "Prize Boxes"], ["timer", "Timer"]];
  const CLASS_LIST = ["classroom_students_v1"];
  const RECORDS = ["teacher_attendance_v1", "teacher_phone_log_v1", "teacher_gradebook_v1", "teacher_student_info_v1", "teacher_support_v1", "classroom_raffle_v1", "teacher_prizes_v1"];

  const cache = {};
  async function get(path) {
    if (cache[path]) return cache[path];
    const r = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("Couldn't load " + path);
    return (cache[path] = await r.text());
  }
  const safe = js => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function build(kind, key, withList, withRecords) {
    const css = (await get("style.css")).replace(/@import url\([^)]*\);?/g, "");
    const teacherName = (document.querySelector("[data-teacher]") || {}).textContent || (window.SITE && SITE.teacherName) || "";
    const gradeEl = document.querySelector("[data-grade]");
    const gradeTxt = (typeof content !== "undefined" && content && content.settings && content.settings.grade) || (gradeEl && gradeEl.textContent.trim()) || "";
    let tools, scripts = [], title;
    if (kind === "everything") { kind = "teacher"; key = "everything"; }
    if (kind === "teacher") {
      tools = key === "all" || key === "everything" ? TEACHER.slice() : TEACHER.filter(t => t[0] === key);
      title = key === "everything" ? "Teacher & Classroom Tools" : key === "all" ? "Teacher Tools" : tools[0][1];
      if (key === "everything") tools.push(["classroom", "Classroom Tools", "Classroom", []]);
      scripts = key === "everything" ? ["timer.js", "classroom.js", "undo.js", "transcript.js"] : ["classroom.js", "undo.js", "transcript.js"];
      tools.forEach(t => t[3].forEach(f => { if (!scripts.includes(f)) scripts.push(f); }));
    } else {
      tools = key === "all" ? CLASSROOM : CLASSROOM.filter(t => t[0] === key);
      title = key === "all" ? "Classroom Tools" : tools[0][1];
      scripts = ["timer.js", "classroom.js"];
    }
    const needPdf = kind === "teacher" && tools.some(t => t[0] === "pdfjoin");
    const parts = [];
    for (const f of scripts) parts.push(`<script>/* ${f} */\n${safe(await get(f))}\n</script>`);
    let pdf = "";
    if (needPdf) {
      pdf = `<script>/* pdf-lib */\n${safe(await get("pdf-lib.min.js"))}\n</script>\n<script>/* pdf.js */\n${safe(await get("pdf.min.js"))}\n</script>\n<script type="text/plain" id="pdf-worker">${safe(await get("pdf.worker.min.js"))}</script>\n<script>pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([document.getElementById("pdf-worker").textContent], { type: "text/javascript" }));</script>`;
    }
    // data to start with (only if chosen) — saved into this browser the first time the file opens
    const seed = {};
    (withList ? CLASS_LIST : []).concat(withRecords ? RECORDS : []).forEach(k => { const v = localStorage.getItem(k); if (v != null) seed[k] = v; });
    const tabs = kind === "teacher" ? tools.map(t => [t[0], t[1]]) : [];
    const sections = kind === "teacher" ? tools.map(t => `<section id="${t[0]}" class="hidden"></section>`).join("\n    ") : `<section id="classroom"></section>`;
    const opener = kind === "teacher"
      ? `const OPEN = { ${tools.map(t => `${t[0]}: el => ${t[2]}.open(el)`).join(", ")} };
    const opened = {};
    function show(k) {
      document.querySelectorAll(".ol-tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.k === k ? "true" : "false"));
      Object.keys(OPEN).forEach(x => document.getElementById(x).classList.toggle("hidden", x !== k));
      if (!opened[k] || k === "profile" || k === "info" || k === "support" || k === "attendance") { OPEN[k](document.getElementById(k)); opened[k] = true; }
      try { localStorage.setItem("offline_last_tool", k); } catch (e) {}
    }
    document.querySelectorAll(".ol-tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.k)));
    let first = ${JSON.stringify(tools[0][0])}; try { const l = localStorage.getItem("offline_last_tool"); if (l && OPEN[l]) first = l; } catch (e) {}
    show(first);`
      : `Classroom.open(document.getElementById("classroom"), ${key === "all" ? "{}" : JSON.stringify({ heading: title, sub: "Works without internet.", tools: [key] })});`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${teacherName ? " – " + esc(teacherName) : ""}</title>
<style>
${css}
.ol-top { background: #14213d; color: #fff; padding: 14px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ol-top strong { font-family: var(--serif); font-size: 1.4rem; }
.ol-top small { color: #c9a96a; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; font-size: .75rem; }
.ol-main { max-width: 1140px; margin: 0 auto; padding: 22px 16px 60px; }
.ol-tabs { display: flex; gap: 4px; padding: 6px; margin-bottom: 18px; background: #14213d; border-radius: 16px; overflow-x: auto; }
.ol-tabs button { flex: 1 0 auto; padding: 12px 16px; border: 0; border-radius: 11px; background: none; color: #d9d0bd; font: 600 .98rem var(--sans, sans-serif); cursor: pointer; }
.ol-tabs button[aria-selected=true] { background: linear-gradient(180deg, #e2c58f, #c9a96a); color: #14213d; }
.ol-note { text-align: center; color: #6b7180; font-size: .85rem; margin-top: 26px; }
</style>
</head>
<body class="portal" data-page="offline">
  <header class="ol-top"><div><small>Works without internet</small><div><strong>${esc(title)}</strong></div></div><span data-teacher>${esc(teacherName)}</span>${gradeTxt ? `<span data-grade hidden>${esc(gradeTxt)}</span>` : ""}</header>
  <main class="ol-main">
    ${tabs.length > 1 ? `<nav class="ol-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" data-k="${k}">${esc(l)}</button>`).join("")}</nav>` : ""}
    ${sections}
    <p class="ol-note">Saved only in this browser on this computer. Use “Download backup” in a tool to move your work back to the website's version.</p>
  </main>
<script>
  window.SITE = { teacherName: ${JSON.stringify(teacherName)}, grade: ${JSON.stringify(gradeTxt)}, welcome: "" };
  (function () { const seed = ${JSON.stringify(seed).replace(/</g, "\\u003c")}; try { Object.keys(seed).forEach(k => { if (localStorage.getItem(k) == null) localStorage.setItem(k, seed[k]); }); } catch (e) {} })();
</script>
${pdf}
${parts.join("\n")}
<script>
  ${opener}
</script>
</body>
</html>`;
    return { html, name: `${title} - offline.html`, size: html.length };
  }

  function settingsCard(el) {
    if (!el || el.dataset.ready) return; el.dataset.ready = "1";
    el.appendChild(panel(true));
  }
  // the "⬇ Download for offline" window (Teacher Tools and Classroom Tools pages)
  function dialog() {
    const overlay = document.createElement("div"); overlay.className = "pl-overlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    const box = document.createElement("div"); box.className = "pl-form ol-dialog";
    const head = document.createElement("div"); head.className = "pl-form-head";
    head.innerHTML = '<div><small>Works without internet</small><h2>Download for offline</h2></div>';
    const x = document.createElement("button"); x.type = "button"; x.className = "pl-x"; x.setAttribute("aria-label", "Close"); x.textContent = "×"; x.onclick = () => overlay.remove(); head.appendChild(x);
    box.append(head, panel(false)); overlay.appendChild(box); document.body.appendChild(overlay);
  }
  function panel(asCard) {
    const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }); kids.flat().forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); }); return e; };
    const list = h("input", { type: "checkbox" }); list.checked = true;
    const rec = h("input", { type: "checkbox" });
    const msg = h("p", { class: "status" });
    const go = async (kind, key, btn) => {
      const label = btn.textContent; btn.disabled = true; btn.textContent = "Building…"; msg.className = "status"; msg.textContent = "Putting the tool together…";
      try {
        const f = await build(kind, key, list.checked, rec.checked);
        const a = h("a", { href: URL.createObjectURL(new Blob([f.html], { type: "text/html" })), download: f.name }); document.body.appendChild(a); a.click(); a.remove();
        msg.className = "status ok"; msg.textContent = `✓ Downloaded “${f.name}” (${Math.max(1, Math.round(f.size / 1024))} KB). Open it from your Downloads — it works without internet.`;
      } catch (e) { msg.className = "status err"; msg.textContent = "Couldn't build it: " + e.message + ". Check your internet and try again."; }
      finally { btn.disabled = false; btn.textContent = label; }
    };
    const row = (kind, items, allLabel) => h("div", { class: "ol-row" },
      h("button", { type: "button", class: "button", onclick: e => go(kind, "all", e.currentTarget) }, allLabel),
      items.map(([k, l]) => h("button", { type: "button", class: "small-btn", onclick: e => go(kind, k, e.currentTarget) }, l)));
    return h("div", { class: asCard ? "card" : "" },
      asCard ? h("h2", { class: "section-title" }, "Use the Tools Offline") : null,
      h("p", { class: "help" }, "Download any tool as a single file that works with no internet — open it from your computer like a document. Pick everything in one file, or just one tool."),
      h("div", { class: "ol-row ol-all" }, h("button", { type: "button", class: "button", onclick: e => go("everything", "everything", e.currentTarget) }, "⬇ Everything in one file (all Teacher + Classroom Tools)")),
      h("h3", { class: "sh-h" }, "Teacher Tools"), row("teacher", TEACHER.map(t => [t[0], t[1]]), "All Teacher Tools"),
      h("h3", { class: "sh-h" }, "Classroom Tools"), row("classroom", CLASSROOM, "All Classroom Tools"),
      h("h3", { class: "sh-h" }, "What to put in the file"),
      h("label", { class: "check-line" }, list, " My class list (student names)"),
      h("label", { class: "check-line" }, rec, " My records too — grades, calls, student info, support, raffle and prizes"),
      h("p", { class: "help" }, "Anyone who has the file can see what's in it, so only include records on a computer you trust. The file keeps its own copy: changes you make offline stay on that computer (use “Download backup” and “Restore backup” in a tool to move them)."),
      msg);
  }

  // a "Download for offline" button in the Back / Home bar of Teacher Tools and Classroom Tools
  function addButton() {
    if (!/teacher-tools\.html|classroom\.html/.test(location.pathname)) return;
    const bar = document.querySelector(".tn-bar"); if (!bar || bar.querySelector(".ol-btn")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "tn-btn ol-btn"; b.title = "Download these tools as a file that works without internet";
    b.innerHTML = '<span aria-hidden="true">⬇</span><span>Download for offline</span>'; b.onclick = dialog;
    bar.appendChild(b);
  }
  document.addEventListener("DOMContentLoaded", () => { addButton(); setTimeout(addButton, 500); setTimeout(addButton, 1500); });
  window.TeacherOffline = { build, settingsCard, dialog };
})();

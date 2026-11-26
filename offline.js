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
    ["attendance", "Attendance", "Attendance", ["attendance.js"]],
    ["seating", "Seating Chart", "SeatingChart", []]
  ];
  const CLASSROOM = [["students", "Students"], ["groups", "Group Maker"], ["number", "Random Number"], ["picker", "Random Student"], ["raffle", "Raffle"], ["prizes", "Prize Boxes"], ["timer", "Timer"]];
  const CLASS_LIST = ["classroom_students_v1"];
  const RECORDS = ["teacher_seating_v1", "teacher_attendance_v1", "teacher_phone_log_v1", "teacher_gradebook_v1", "teacher_student_info_v1", "teacher_support_v1", "classroom_raffle_v1", "teacher_prizes_v1"];

  const cache = {};
  async function get(path) {
    if (cache[path]) return cache[path];
    const r = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("Couldn't load " + path);
    return (cache[path] = await r.text());
  }
  const safe = js => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // the site's fonts, put inside the file so it looks the same with no internet (skipped if they can't be fetched)
  const FONT_URL = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap";
  let fontCache = null;
  async function fontsCSS() {
    if (fontCache !== null) return fontCache;
    try {
      const css = await (await fetch(FONT_URL)).text();
      const blocks = css.split(/(?=\/\*)/).filter(b => /^\/\*\s*latin\s*\*\//.test(b));
      if (!blocks.length) throw new Error("no fonts");
      let out = "";
      for (const b of blocks) {
        const m = b.match(/url\(([^)]+)\)/); if (!m) continue;
        const bytes = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        out += b.replace(m[1], "data:font/woff2;base64," + btoa(bin));
      }
      fontCache = out;
    } catch (e) { fontCache = ""; }
    return fontCache;
  }

  // Makes a copy of the real page (Teacher Tools or Classroom Tools) with everything inside it,
  // so the offline file looks and works exactly like the website.
  async function build(kind, key, withList, withRecords) {
    const everything = kind === "everything";
    if (everything) { kind = "teacher"; key = "all"; }
    const page = kind === "teacher" ? "teacher-tools.html" : "classroom.html";
    const doc = new DOMParser().parseFromString(await get(page), "text/html");
    const teacherName = ((document.querySelector("[data-teacher]") || {}).textContent || (window.SITE && SITE.teacherName) || "").trim();
    const gradeEl = document.querySelector("[data-grade]");
    const gradeTxt = (typeof content !== "undefined" && content && content.settings && content.settings.grade) || (gradeEl && gradeEl.textContent.trim()) || (window.SITE && SITE.grade) || "";
    const list = kind === "teacher" ? TEACHER : CLASSROOM;
    const one = key !== "all" ? list.find(t => t[0] === key) : null;
    const title = everything ? "Teacher & Classroom Tools" : one ? one[1] : kind === "teacher" ? "Teacher Tools" : "Classroom Tools";
    doc.title = title + (teacherName ? " – " + teacherName : "");

    // only the chosen tool
    if (one && kind === "teacher") {
      doc.querySelectorAll(".tt-switch button").forEach(b => { if (b.dataset.tool !== key) b.remove(); else b.setAttribute("aria-selected", "true"); });
      doc.querySelectorAll(".ts-main > section").forEach(s => { if (s.id !== key) s.remove(); else s.classList.remove("hidden"); });
    }
    // everything: Classroom Tools becomes one more tab on the Teacher Tools page
    if (everything) {
      const link = doc.querySelector('.ts-nav a[href="classroom.html"]'), sw = doc.querySelector(".tt-switch");
      const b = doc.createElement("button"); b.type = "button"; b.dataset.tool = "classroom"; b.setAttribute("aria-selected", "false");
      b.innerHTML = (link ? link.querySelector("svg").outerHTML : "") + "Classroom Tools";
      sw.insertBefore(b, sw.querySelector(".tt-glider"));
      const sec = doc.createElement("section"); sec.id = "classroom"; sec.className = "hidden";
      const secs = doc.querySelectorAll(".ts-main > section"); secs[secs.length - 1].after(sec);
    }

    // styles (with the fonts) inside the file
    let css = await get("style.css");
    const fonts = await fontsCSS();
    if (fonts) css = css.replace(/@import url\([^)]*fonts\.googleapis[^)]*\);?/g, "");
    const link = doc.querySelector('link[rel="stylesheet"]');
    const style = doc.createElement("style"); style.textContent = fonts + "\n" + css; link.replaceWith(style);

    // scripts inside the file (not Sync or this downloader — they need the website)
    const scripts = [...doc.querySelectorAll("script[src]")];
    const src = s => s.getAttribute("src").split("?")[0];
    for (const s of scripts) {
      const f = src(s);
      if (f === "sync.js" || f === "offline.js") { s.remove(); continue; }
      const n = doc.createElement("script"); n.textContent = `/* ${f} */\n` + safe(await get(f)); s.replaceWith(n);
    }
    // Classroom Tools' timer lives in timer.js
    if (kind === "teacher") {
      const cls = [...doc.querySelectorAll("script")].find(s => s.textContent.startsWith("/* classroom.js */"));
      const t = doc.createElement("script"); t.textContent = "/* timer.js */\n" + safe(await get("timer.js")); cls.before(t);
    }
    // PDF Tools: the PDF libraries, inside the file
    if (kind === "teacher" && (!one || key === "pdfjoin")) {
      const pj = [...doc.querySelectorAll("script")].find(s => s.textContent.startsWith("/* pdfjoin.js */"));
      const add = (txt, type, id) => { const e = doc.createElement("script"); if (type) e.type = type; if (id) e.id = id; e.textContent = txt; pj.before(e); };
      add("/* pdf-lib */\n" + safe(await get("pdf-lib.min.js")));
      add("/* pdf.js */\n" + safe(await get("pdf.min.js")));
      add(safe(await get("pdf.worker.min.js")), "text/plain", "pdf-worker");
      add('pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([document.getElementById("pdf-worker").textContent], { type: "text/javascript" }));');
    }

    // first thing on the page: say it's an offline copy, and (if chosen) the class list / records to start with
    const seed = {};
    (withList ? CLASS_LIST : []).concat(withRecords ? RECORDS : []).forEach(k => { const v = localStorage.getItem(k); if (v != null) seed[k] = v; });
    const site = location.origin.startsWith("http") ? location.origin + location.pathname.replace(/[^/]*$/, "") : "https://www.reisgrau.com/";
    const first = doc.createElement("script");
    first.textContent = `window.OFFLINE_COPY = ${JSON.stringify({ site, page: kind, tools: one && kind === "classroom" ? [key] : null, built: new Date().toISOString().slice(0, 10) })};
(function () { const seed = ${JSON.stringify(seed).replace(/</g, "\\u003c")}; try { Object.keys(seed).forEach(k => { if (localStorage.getItem(k) == null) localStorage.setItem(k, seed[k]); }); } catch (e) {} })();`;
    doc.head.querySelector("script").before(first);
    const names = doc.createElement("script");
    names.textContent = `Object.assign(SITE, ${JSON.stringify({ teacherName, grade: gradeTxt }).replace(/</g, "\\u003c")});`;
    const dataJs = [...doc.head.querySelectorAll("script")].find(s => s.textContent.startsWith("/* data.js */"));
    dataJs.after(names);
    const brand = doc.querySelector(".ts-brand strong"); if (brand && teacherName) brand.textContent = teacherName;
    // "Offline" under the name, and the brand goes to the start of this file
    const brandLink = doc.querySelector(".ts-brand");
    if (brandLink) {
      brandLink.setAttribute("href", page);
      const tag = doc.createElement("span"); tag.className = "ts-offline"; tag.textContent = "Offline";
      brandLink.querySelector("small").after(tag);
    }
    style.textContent += "\n.ts-offline { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px; background: #c9a96a; color: #14213d; font: 700 .7rem var(--sans, sans-serif); letter-spacing: 1.5px; text-transform: uppercase; }";
    // leave out menu items that are only on the website
    const inFile = new Set([page].concat(everything ? ["classroom.html"] : []));
    doc.querySelectorAll(".ts-nav .ts-item").forEach(a => { if (!inFile.has((a.getAttribute("href") || "").split("#")[0])) a.remove(); });

    // links: pages in this file stay here; everything else opens the website
    const out = doc.getElementById("ts-signout"); if (out) out.style.display = "none";   // nothing to sign out of in a file
    const nav = doc.createElement("script");
    nav.textContent = `(function () {
  const SITE_URL = OFFLINE_COPY.site, KIND = OFFLINE_COPY.page;
  const here = { "teacher-tools.html": KIND === "teacher", "classroom.html": KIND === "classroom" || !!document.querySelector('.tt-switch [data-tool="classroom"]') };
  function go(page) {
    if (page === "classroom.html" && KIND === "teacher") { TeacherSections.openItem("classroom"); return; }
    if (page === "teacher-tools.html" && KIND === "teacher") { const first = document.querySelector(".tt-switch button"); TeacherSections.styleOf("tools") === "bar" ? first.click() : TeacherSections.showChooser(); return; }
    if (page === "classroom.html") { if (TeacherSections.styleOf("classroom") !== "bar") TeacherSections.showChooser(); else window.scrollTo({ top: 0 }); }
  }
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    const href = a.getAttribute("href"); if (!href || /^(#|blob:|data:|https?:|mailto:|tel:)/.test(href)) return;
    e.preventDefault();
    const page = href.split("#")[0];
    if (here[page]) return go(page);
    if (a.classList.contains("tn-home")) return go(KIND === "teacher" ? "teacher-tools.html" : "classroom.html");   // Home: the start of this file
    window.open(SITE_URL + href, "_blank", "noopener");                                                           // the rest of the Teacher Area is on the website
  }, true);
})();`;
    doc.body.appendChild(nav);

    const html = "<!doctype html>\n" + doc.documentElement.outerHTML;
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

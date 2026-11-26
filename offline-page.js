/* ============================================================
   OFFLINE COPY — pages and Settings
   Runs only inside a downloaded offline file (see offline.js).
   The side menu switches between the pages in the file
   (Teacher Tools, Classroom Tools, Settings).
   ============================================================ */
(function () {
  const OC = window.OFFLINE_COPY; if (!OC) return;
  const NAMES_KEY = "offline_names";
  const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }); kids.flat().forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); }); return e; };
  const views = {}; document.querySelectorAll(".ol-view").forEach(v => { views[v.dataset.view] = v; });
  const MAIN_ID = OC.page === "teacher" ? "tools" : "classroom", MAIN_TITLE = OC.page === "teacher" ? "Teacher Tools" : "Classroom Tools";
  const TITLES = { classroom: "Classroom Tools", settings: "Settings" };

  // your name and grade, as changed in this file's Settings
  function savedNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY) || "null"); } catch { return null; } }
  function applyNamesHere(n) {
    if (!n) return;
    Object.assign(SITE, n);
    document.querySelectorAll("[data-teacher]").forEach(e => { e.textContent = n.teacherName; });
    if (typeof applyGrade === "function") applyGrade(n.grade);
    const w = n.teacherName.split(/\s+/).filter(Boolean); const mono = document.getElementById("ts-mono"); if (mono) mono.textContent = w.slice(-2).map(x => x[0]).join("").toUpperCase();
    document.title = document.title.replace(/ – .*$/, "") + (n.teacherName ? " – " + n.teacherName : "");
  }
  const start = savedNames(); if (start) { Object.assign(SITE, start); document.addEventListener("DOMContentLoaded", () => applyNamesHere(start)); }

  /* ---------- switching pages ---------- */
  let cur = "main", prev = "main", crOpen = false;
  function mainTrail() {
    if (TeacherSections.styleOf(MAIN_ID) !== "bar") return;
    const on = OC.page === "teacher" ? document.querySelector('.tt-switch button[aria-selected="true"]') : document.querySelector('#classroom .cr-tool[aria-current="true"]');
    TeacherSections.setTrail(MAIN_TITLE, on ? on.textContent.trim() : null);
  }
  function crTrail() { const on = document.querySelector('[data-view="classroom"] .cr-tool[aria-current="true"]'); TeacherSections.setTrail("Classroom Tools", on ? on.textContent.trim() : null); }
  function show(v) {
    if (!views[v]) v = "main";
    if (v === cur) { if (v === "main") home(); return; }
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== v; });
    document.querySelectorAll(".ts-nav .ts-item").forEach(a => { const on = a.dataset.view === v; a.classList.toggle("active", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (v === "main") { TeacherSections.suspend(false); mainTrail(); }
    else {
      if (cur === "main") TeacherSections.suspend(true, TITLES[v]); else TeacherSections.setTrail(TITLES[v]);
      if (v === "classroom") {
        const sec = views.classroom.querySelector("#classroom");
        if (!crOpen) { Classroom.open(sec); crOpen = true; sec.addEventListener("click", e => { if (e.target.closest(".cr-tool")) setTimeout(crTrail, 0); }); }
        crTrail();
      }
      if (v === "settings") drawSettings();
    }
    prev = cur; cur = v;
    window.scrollTo({ top: 0 });
  }
  function home() {
    if (cur !== "main") return show("main");
    if (TeacherSections.styleOf(MAIN_ID) !== "bar") TeacherSections.showChooser(); else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", e => {
    if (!e.target.closest) return;
    const back = e.target.closest(".tn-back");
    if (back && cur !== "main") { e.preventDefault(); e.stopImmediatePropagation(); show(prev !== cur ? prev : "main"); return; }
    const a = e.target.closest("a[href]"); if (!a) return;
    if (a.dataset.view) { e.preventDefault(); show(a.dataset.view); return; }
    if (a.classList.contains("tn-home") || a.classList.contains("ts-brand")) { e.preventDefault(); home(); return; }
    const href = a.getAttribute("href"); if (!href || /^(#|blob:|data:|https?:|mailto:|tel:)/.test(href)) return;
    e.preventDefault();
    window.open(OC.site + href, "_blank", "noopener");     // other Teacher Area pages are on the website
  }, true);

  /* ---------- Settings ---------- */
  function drawSettings() {
    const box = views.settings; box.innerHTML = "";
    box.appendChild(h("div", { class: "card" },
      h("h1", { class: "page-title" }, "Settings"),
      h("p", { class: "help" }, "Settings for this offline copy. They're saved only in this browser on this computer.")));

    // your details
    const n = savedNames() || { teacherName: SITE.teacherName || "", grade: SITE.grade || "" };
    const name = h("input", { type: "text", id: "ol-name", value: n.teacherName, maxlength: "60" });
    const grade = h("input", { type: "text", id: "ol-grade", value: n.grade || "", maxlength: "60", placeholder: "e.g. 5th Grade" });
    const msg1 = h("p", { class: "status" });
    box.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Your Details"),
      h("div", { class: "two", style: "margin-top:12px" },
        h("div", { class: "field" }, h("label", { for: "ol-name" }, "Teacher name"), name),
        h("div", { class: "field" }, h("label", { for: "ol-grade" }, "Grade / class (optional)"), grade)),
      h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => {
        const v = { teacherName: name.value.trim() || "Teacher", grade: grade.value.trim() };
        try { localStorage.setItem(NAMES_KEY, JSON.stringify(v)); } catch {}
        applyNamesHere(v); msg1.className = "status ok"; msg1.textContent = "✓ Saved.";
      } }, "Save")),
      msg1));

    // how each section opens
    const rows = h("div", { class: "sec-set" }), msg2 = h("p", { class: "status" });
    const secs = [["tools", "Teacher Tools", "Student profile, attendance, seating, phone log, gradebook, student info, support, PDF tools"], ["classroom", "Classroom Tools", "Students, groups, random picks, raffle, prize boxes, timer"]]
      .filter(([id]) => id === MAIN_ID);
    secs.forEach(([id, label, sub]) => {
      const curStyle = TeacherSections.styleOf(id), seg = h("div", { class: "pl-seg" });
      [["bar", "Tool bar"], ["buttons", "Buttons"], ["list", "List"]].forEach(([v, l]) => seg.appendChild(h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": curStyle === v ? "true" : "false", onclick: e => {
        TeacherSections.setStyle(id, v);
        seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === e.currentTarget ? "true" : "false"));
        msg2.className = "status ok"; msg2.innerHTML = "";
        msg2.append(`✓ ${label} will open with ${v === "bar" ? "the tool bar" : v === "buttons" ? "a page of buttons" : "a list of choices"}. `, h("button", { type: "button", class: "small-btn", onclick: () => location.reload() }, "See it now"));
      } }, l)));
      rows.appendChild(h("div", { class: "sec-set-row" }, h("div", null, h("strong", null, label), h("small", null, sub)), seg));
    });
    if (secs.length && (MAIN_ID === "classroom" || document.querySelectorAll(".tt-switch button").length > 1))
      box.appendChild(h("div", { class: "card" },
        h("h2", { class: "section-title" }, "How Sections Open"),
        h("p", { class: "help" }, "“Tool bar” shows the tools across the top. “Buttons” or “List” opens a page of choices; press one to go to that tool, and use ‹ Back to return to the choices."),
        rows, msg2));

    // back up / restore
    if (window.TeacherBackup) box.appendChild(TeacherBackup.card());

    // about this file
    const built = OC.built ? new Date(OC.built + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    box.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "About This Offline Copy"),
      h("p", { class: "help" }, `Downloaded from your website${built ? " on " + built : ""}. It works with no internet. Your work is saved only in this browser on this computer — it doesn't sync with the website. To get the newest version of the tools, download it again from the website: Settings → Use the Tools Offline.`),
      h("div", { class: "actions" }, h("a", { class: "button secondary", href: OC.site + "portal.html#settings", target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open the website's Settings"))));
  }
  window.OfflinePage = { show };
})();

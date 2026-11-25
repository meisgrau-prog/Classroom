/* ============================================================
   Teacher Area home page: choose what shows, plus student birthdays.
   Everything here is saved ONLY in this browser (never on the website).
   ============================================================ */
(function () {
  const HOME_KEY = "teacher_home_v1";
  const BDAY_KEY = "teacher_birthdays_v1";
  const STUDENTS = "classroom_students_v1";

  const WIDGETS = [
    ["stats", "At a glance", "Families due for a call, follow-ups due, calls this week", true],
    ["birthdays", "This week's birthdays", "Students with a birthday this week (add birthdays below)", true],
    ["followups", "Follow-ups", "Open follow-ups from the Phone Log, overdue first", true],
    ["gbattention", "Gradebook: needs attention", "Students below the warning line this week", true],
    ["gbmissing", "Gradebook: grades still to enter", "Categories with no grades yet today / this week", true],
    ["gbaverages", "Gradebook: class averages", "This week's class average for each category", true],
    ["gbstars", "Gradebook: top students", "Highest averages this week", false],
    ["support", "Student Support: plans", "Things you planned to do to help a student, oldest first", true],
    ["duecalls", "Families due for a call", "Names of families you haven't called in a while", false],
    ["recent", "Recent calls", "The last few calls you logged", false],
    ["absent", "Absent today", "Students marked absent in Classroom Tools", false],
    ["reminders", "My reminders", "A notes box you can type in right on the home page", true],
    ["quick", "Quick access buttons", "Big buttons to each part of the Teacher Area", true]
  ];

  /* ---------- storage ---------- */
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  function getHome() {
    const h = read(HOME_KEY, {});
    h.show = Object.assign(Object.fromEntries(WIDGETS.map(w => [w[0], w[3]])), h.show || {});
    const keys = WIDGETS.map(w => w[0]);
    h.order = (Array.isArray(h.order) ? h.order.filter(k => keys.includes(k)) : []);
    keys.forEach(k => { if (!h.order.includes(k)) h.order.push(k); });
    h.reminders = typeof h.reminders === "string" ? h.reminders : "";
    return h;
  }
  const saveHome = h => write(HOME_KEY, h);
  // birthdays live in Teacher Tools → Student Info (older birthday-box data is read too)
  function getBdays() {
    const out = Object.assign({}, read(BDAY_KEY, {}));
    const info = read("teacher_student_info_v1", null);
    if (info && info.rows) Object.entries(info.rows).forEach(([n, r]) => { if (r && r.birthday && /\d{2}-\d{2}$/.test(r.birthday)) out[n] = r.birthday; });
    return out;
  }
  const classList = () => { const s = read(STUDENTS, null); return s && Array.isArray(s.names) ? s.names : []; };
  const absentList = () => { const s = read(STUDENTS, null); return s && Array.isArray(s.absent) ? s.absent : []; };

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // Accepts 2015-03-14, 3/14/2015, 3/14, 14 March 2015, March 14, Excel date numbers → "YYYY-MM-DD" or "--MM-DD" (no year)
  function parseBirthday(v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return null;
    let y = "", m, d, r;
    if (/^\d{4,5}(\.\d+)?$/.test(v) && +v > 1000 && +v < 80000) {            // Excel serial date
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
  const mmdd = b => b.slice(-5);
  const hasYear = b => /^\d{4}/.test(b);
  function prettyBday(b) {
    const [m, d] = mmdd(b).split("-").map(Number);
    return new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + (hasYear(b) ? ", " + b.slice(0, 4) : "");
  }
  // birthdays falling in this Sunday–Saturday week
  function birthdaysThisWeek() {
    const b = getBdays(), now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const out = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start); day.setDate(start.getDate() + i);
      const key = `${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
      Object.entries(b).forEach(([name, v]) => {
        if (v && mmdd(v) === key) out.push({ name, day, today: iso(day) === iso(now), past: day < new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          age: hasYear(v) ? day.getFullYear() - +v.slice(0, 4) : null });
      });
    }
    return out;
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.entries(v).forEach(([p, x]) => p.startsWith("--") ? e.style.setProperty(p, x) : (e.style[p] = x));
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }
  const fmtDay = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };

  /* ================= HOME PAGE ================= */
  const ICON = {
    portal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18M8 21h8M12 18v3"/></svg>',
    class: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/><path d="M3 21h18"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    grade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9"/><path d="M4 16c1.5 1 3 1 4 0s2.5-1 4 0 3 1 4 0 2.5-1 4 0"/><path d="M2 21h20M12 10V7M12 4.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z"/></svg>'
  };
  const card = (title, link, ...kids) => h("section", { class: "th-card" },
    h("div", { class: "th-card-head" }, h("h3", null, title), link ? h("a", { href: link[1], class: "th-more" }, link[0]) : null), ...kids);
  const none = t => h("p", { class: "th-none" }, t);

  function render(container) {
    const H = getHome();
    const pl = window.PhoneLog ? PhoneLog.summary() : null;
    const gb = window.Gradebook && Gradebook.summary ? Gradebook.summary() : null;
    container.innerHTML = "";
    const B = {
      stats: () => pl && h("section", { class: "ts-stats", "aria-label": "At a glance" },
        h("a", { class: "ts-stat", href: "teacher-tools.html" }, h("span", { class: "ts-stat-num" }, pl.students ? String(pl.dueCalls) : "–"), h("span", { class: "ts-stat-label" }, "Families due for a call"), h("small", null, "No contact in a while")),
        h("a", { class: "ts-stat warn" + (pl.followDue ? " alert" : ""), href: "teacher-tools.html#follow" }, h("span", { class: "ts-stat-num" }, String(pl.followDue)), h("span", { class: "ts-stat-label" }, "Follow-ups due"), h("small", null, pl.followOpen + " open follow-up" + (pl.followOpen === 1 ? "" : "s"))),
        h("a", { class: "ts-stat", href: "teacher-tools.html#history" }, h("span", { class: "ts-stat-num" }, String(pl.callsThisWeek)), h("span", { class: "ts-stat-label" }, "Calls this week"), h("small", null, pl.students + " students in class"))),
      birthdays: () => {
        const list = birthdaysThisWeek();
        return card("🎂 This week's birthdays", ["Student Info", "teacher-tools.html#info"],
          list.length ? h("ul", { class: "th-list" }, list.map(b => h("li", { class: b.today ? "today" : b.past ? "past" : "" },
            h("strong", null, b.name), h("span", null, b.today ? "Today! 🎉" : b.day.toLocaleDateString("en-US", { weekday: "long" })), b.age ? h("small", null, `turns ${b.age}`) : null)))
            : none(Object.keys(getBdays()).length ? "No birthdays this week." : "No birthdays added yet."));
      },
      followups: () => pl && card("Follow-ups", ["Open Phone Log", "teacher-tools.html#follow"],
        pl.followList.length ? h("ul", { class: "th-list" }, pl.followList.slice(0, 8).map(f => h("li", { class: f.overdue ? "late" : f.today ? "today" : "" },
          h("strong", null, f.name), h("span", null, f.due ? (f.overdue ? "Overdue · " : f.today ? "Due today · " : "Due ") + fmtDay(f.due) : "No date"))))
          : none("No open follow-ups.")),
      duecalls: () => pl && card("Families due for a call", ["Log a call", "teacher-tools.html"],
        pl.dueList.length ? h("ul", { class: "th-list" }, pl.dueList.slice(0, 10).map(d => h("li", null, h("strong", null, d.name), h("span", null, d.days == null ? "Never called" : d.days + " days ago"))))
          : none(pl.students ? "Everyone has been called recently. 👏" : "Add your class list in Teacher Tools.")),
      recent: () => pl && card("Recent calls", ["History", "teacher-tools.html#history"],
        pl.recent.length ? h("ul", { class: "th-list" }, pl.recent.map(c => h("li", null, h("strong", null, c.name), h("span", null, fmtDay(c.ts) + (c.result ? " · " + c.result : "")))))
          : none("No calls logged yet.")),
      gbattention: () => gb && card("Needs attention this week", ["Gradebook", "teacher-tools.html#gradebook"],
        gb.attention.length ? h("ul", { class: "th-list" }, gb.attention.slice(0, 10).map(a => h("li", null, h("strong", null, a.name),
          h("span", { class: "th-tags" }, a.flags.map(f => h("span", { class: "th-tag", style: { "--c": f.color } }, `${f.cat}: ${f.v}`))))))
          : none(gb.averages.length ? "Nobody is below the line this week. 👏" : "No grades entered this week yet.")),
      gbmissing: () => gb && card("Grades still to enter", ["Enter grades", "teacher-tools.html#gradebook"],
        gb.missing.length ? h("div", { class: "th-tags" }, gb.missing.map(m => h("span", { class: "th-tag", style: { "--c": m.color } }, `${m.name} · ${m.when}`)))
          : none("All caught up! ✓")),
      gbaverages: () => gb && card("Class averages this week", ["Dashboard", "teacher-tools.html#gradebook"],
        gb.averages.length ? h("div", { class: "th-avgs" }, gb.averages.map(a => h("div", { class: "th-avg " + a.tone, style: { "--c": a.color } },
          h("small", null, a.name), h("strong", null, a.avg + (a.low ? "" : a.max ? ` / ${a.max}` : "")), a.low ? h("small", null, "avg incidents") : null)))
          : none("No grades entered this week yet.")),
      gbstars: () => gb && card("⭐ Top students this week", ["Gradebook", "teacher-tools.html#gradebook"],
        gb.stars.length ? h("ol", { class: "th-list th-ol" }, gb.stars.map(s => h("li", null, h("strong", null, s.name), h("span", null, Math.round(s.p) + "%"))))
          : none(`Nobody at ${gb.good}% or above yet this week.`)),
      support: () => {
        const s = read("teacher_support_v1", null);
        const plans = s && Array.isArray(s.entries) ? s.entries.filter(e => e.kind === "plan").sort((a, b) => a.date < b.date ? -1 : 1) : [];
        return card("Support plans", ["Student Support", "teacher-tools.html#support"],
          plans.length ? h("ul", { class: "th-list" }, plans.slice(0, 8).map(e => h("li", null, h("strong", null, e.student), h("span", null, e.text.length > 70 ? e.text.slice(0, 70) + "…" : e.text))))
            : none("No plans waiting."));
      },
      absent: () => {
        const a = absentList();
        return card("Absent today", ["Classroom Tools", "classroom.html"], a.length ? h("div", { class: "th-tags" }, a.map(n => h("span", { class: "th-tag" }, n))) : none("Nobody marked absent."));
      },
      reminders: () => {
        const ta = h("textarea", { class: "th-notes", rows: "4", placeholder: "Type reminders here… (saved on this device only)" });
        ta.value = H.reminders;
        let t; ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { const x = getHome(); x.reminders = ta.value; saveHome(x); }, 300); });
        return card("My reminders", null, ta);
      },
      quick: () => h("div", null, h("h2", { class: "ts-h2" }, "Quick access"), h("section", { class: "ts-cards" },
        [["classroom.html", ICON.class, "Classroom Tools", "Students, groups, random picks, raffle, prize boxes"],
         ["teacher-tools.html", ICON.phone, "Teacher Tools", "Phone log, gradebook, student info, support, PDF tools & timer"],
         ["portal.html", ICON.portal, "Parent Portal Settings", "Post classwork, homework, news & banners; who can see it"],
         ["parents.html", ICON.eye, "View Parent Portal", "See the site the way families see it"]].map(([href, ico, t, s]) =>
          h("a", { class: "ts-card", href }, h("span", { class: "ts-card-ico", html: ico }), h("strong", null, t), h("small", null, s)))))
    };
    // Full-width blocks stay full width; smaller cards flow two per row.
    const WIDE = ["stats", "quick", "gbaverages"];
    let grid = null;
    H.order.forEach(k => {
      if (!H.show[k] || !B[k]) return;
      const el = B[k](); if (!el) return;
      if (WIDE.includes(k)) { grid = null; container.appendChild(h("div", { class: "th-wide" }, el)); }
      else { if (!grid) { grid = h("div", { class: "th-grid" }); container.appendChild(grid); } grid.appendChild(el); }
    });
    if (!container.children.length) container.appendChild(none("Everything is hidden. Choose what to show in Settings."));
  }

  /* ================= SETTINGS CARD (portal.html#settings) ================= */
  function settingsCard(container) {
    container.innerHTML = "";
    const H = getHome();
    // --- home page choices ---
    const list = h("div", { class: "th-choices" });
    function drawChoices() {
      list.innerHTML = "";
      H.order.forEach((k, i) => {
        const w = WIDGETS.find(x => x[0] === k);
        const chk = h("input", { type: "checkbox", "data-widget": k }); chk.checked = !!H.show[k];
        chk.addEventListener("change", () => { H.show[k] = chk.checked; saveHome(H); row.classList.toggle("off", !chk.checked); });
        const move = d => () => { const j = i + d; if (j < 0 || j >= H.order.length) return; [H.order[i], H.order[j]] = [H.order[j], H.order[i]]; saveHome(H); drawChoices(); };
        const row = h("div", { class: "th-choice" + (chk.checked ? "" : " off") },
          h("label", null, chk, h("span", null, h("strong", null, w[1]), h("small", null, w[2]))),
          h("span", { class: "th-move" },
            h("button", { type: "button", class: "small-btn", "aria-label": "Move up", disabled: i === 0 ? true : null, onclick: move(-1) }, "↑"),
            h("button", { type: "button", class: "small-btn", "aria-label": "Move down", disabled: i === H.order.length - 1 ? true : null, onclick: move(1) }, "↓")));
        list.appendChild(row);
      });
    }
    drawChoices();
    container.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Teacher Area Home Page"),
      h("p", { class: "help" }, "Choose what shows on your Teacher Area home page and in what order. Saved right away, on this device only."),
      list,
      h("div", { class: "actions" },
        h("a", { class: "button secondary", href: "teacher.html", style: "text-decoration:none" }, "See home page"),
        h("button", { type: "button", class: "small-btn", onclick: () => { if (!confirm("Go back to the original home page choices?")) return; const r = getHome(); delete r.show; delete r.order; saveHome(r); settingsCard(container); } }, "Reset to original"))));

    // --- how each Teacher Area section opens ---
    const SEC_KEY = "teacher_sections_v1";
    const secRead = () => { try { return JSON.parse(localStorage.getItem(SEC_KEY) || "{}") || {}; } catch { return {}; } };
    const secRows = h("div", { class: "sec-set" });
    [["classroom", "Classroom Tools", "Students, groups, random picks, raffle, prize boxes"], ["tools", "Teacher Tools", "Phone log, gradebook, student info, support, PDF tools, timer"], ["portal", "Parent Portal Settings", "Classwork, homework, news, programs, banners, parents & access"]].forEach(([id, label, sub]) => {
      const cur = secRead()[id] || "bar";
      const seg = h("div", { class: "pl-seg" });
      [["bar", "Tool bar"], ["buttons", "Buttons"], ["list", "List"]].forEach(([v, l]) => seg.appendChild(h("button", { type: "button", class: "pl-seg-btn", "aria-pressed": cur === v ? "true" : "false", "data-sec": id, "data-val": v, onclick: e => {
        const s = secRead(); s[id] = v; try { localStorage.setItem(SEC_KEY, JSON.stringify(s)); } catch {}
        seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === e.currentTarget ? "true" : "false"));
        secMsg.className = "status ok"; secMsg.textContent = `✓ ${label} will open with ${v === "bar" ? "the tool bar (your last tool)" : v === "buttons" ? "a page of buttons" : "a list of choices"}.`;
      } }, l)));
      secRows.appendChild(h("div", { class: "sec-set-row" }, h("div", null, h("strong", null, label), h("small", null, sub)), seg));
    });
    const secMsg = h("p", { class: "status" });
    container.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Teacher Area Sections"),
      h("p", { class: "help" }, "Choose how each section opens. “Tool bar” shows the tools across the top and opens the last one you used. “Buttons” or “List” opens a page of choices; press one to go to that tool, and use ‹ Back to return to the choices. Saved on this device."),
      secRows, secMsg));

    container.appendChild(h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Birthdays, Parents & Student Info"),
      h("p", { class: "help" }, "Load an Excel sheet with birthdays, parents' names, phones, emails and more — or type it in — in Teacher Tools → Student Info. Birthdays show on your home page during the week of the birthday."),
      h("div", { class: "actions" }, h("a", { class: "button", href: "teacher-tools.html#info", style: "text-decoration:none" }, "Open Student Info"))));
  }

  window.TeacherHome = { render, settingsCard, _t: { parseBirthday, birthdaysThisWeek } };
})();

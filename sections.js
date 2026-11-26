/* ============================================================
   Teacher Area sections: Back / Home bar, and (if chosen in Settings)
   opening a section as a page of choices — big buttons or a list.
   Choice saved per device: localStorage "teacher_sections_v1".
   ============================================================ */
(function () {
  const KEY = "teacher_sections_v1";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
  const styleOf = id => { const v = read()[id]; return v === "buttons" || v === "list" ? v : "bar"; };
  function setStyle(id, v) { const s = read(); s[id] = v; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  const HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  /* ---------- Back / Home bar at the top of every Teacher Area page ---------- */
  let bar, trail, backBtn;
  function navBar(sectionTitle) {
    if (bar) return bar;
    const main = document.querySelector(".ts-main"); if (!main) return null;
    backBtn = h("button", { type: "button", class: "tn-btn tn-back", onclick: goBack }, h("span", { html: BACK }), h("span", null, "Back"));
    trail = h("span", { class: "tn-trail" });
    bar = h("nav", { class: "tn-bar", "aria-label": "Page navigation" },
      backBtn,
      h("a", { class: "tn-btn tn-home", href: "teacher.html" }, h("span", { html: HOME }), h("span", null, "Home")),
      trail);
    main.insertBefore(bar, main.firstChild);
    // a soft shadow once it's stuck to the top; on phones it sits just under the menu bar
    const side = document.querySelector(".ts-side");
    const fit = () => { if (side) document.documentElement.style.setProperty("--side-h", (matchMedia("(max-width: 860px)").matches ? side.offsetHeight : 0) + "px"); bar.classList.toggle("stuck", window.scrollY > 10); };
    window.addEventListener("scroll", fit, { passive: true }); window.addEventListener("resize", fit); fit();
    setTrail(sectionTitle);
    return bar;
  }
  function setTrail(section, item) {
    if (!trail) return;
    trail.innerHTML = "";
    if (section) {
      const s = h(item && cfg && cfg.style !== "bar" ? "button" : "span", { class: "tn-crumb" + (item ? "" : " current"), type: item ? "button" : null, onclick: item && cfg && cfg.style !== "bar" ? () => showChooser(true) : null }, section);
      trail.appendChild(s);
    }
    if (item) trail.append(h("span", { class: "tn-sep", html: CHEV }), h("span", { class: "tn-crumb current" }, item));
  }
  function goBack() {
    if (suspended) { history.back(); return; }                                         // e.g. Settings → back to where you were
    if (cfg && cfg.style !== "bar" && current) { showChooser(true); return; }       // in a tool → back to the choices
    let sameSite = false; try { sameSite = document.referrer && new URL(document.referrer).origin === location.origin && !/index\.html$|\/$/.test(new URL(document.referrer).pathname); } catch {}
    if (history.length > 1 && sameSite) history.back(); else location.href = "teacher.html";
  }

  /* ---------- a section opened as choices ---------- */
  let cfg = null, chooser = null, current = null, suspended = false;
  function init(c) {
    cfg = Object.assign({ hashPrefix: "" }, c);
    cfg.style = styleOf(c.id);
    navBar(c.title);
    if (cfg.style === "bar") { cfg.onBar && cfg.onBar(); return; }
    document.body.classList.add("sec-choices");
    cfg.bar().forEach(el => el.classList.add("sec-hide"));
    chooser = h("div", { class: "sec-chooser " + cfg.style, role: "list" });
    cfg.items.forEach(it => chooser.appendChild(h("button", { type: "button", class: "sec-choice", role: "listitem", "data-key": it.key, onclick: () => openItem(it.key, true) },
      h("span", { class: "sec-ico", html: it.icon || "" }),
      h("span", { class: "sec-text" }, h("strong", null, it.label), it.desc ? h("small", null, it.desc) : null),
      h("span", { class: "sec-go", html: CHEV }))));
    cfg.place(chooser);
    window.addEventListener("popstate", e => {
      if (suspended || (cfg.ignore && cfg.ignore.test(location.hash))) return;
      const k = e.state && e.state.sec;
      if (k && cfg.items.some(i => i.key === k)) openItem(k, false); else showChooser(false);
    });
    if (cfg.initial && cfg.items.some(i => i.key === cfg.initial)) { history.replaceState({ sec: null }, ""); openItem(cfg.initial, true, true); }
    else showChooser(false);
  }
  function showChooser(viaBack) {
    if (!cfg || cfg.style === "bar") return;
    if (viaBack && history.state && history.state.sec) { history.back(); return; }   // keep the browser's Back in step
    current = null;
    cfg.content().forEach(el => el.classList.add("sec-hide"));
    chooser.classList.remove("hidden"); chooser.classList.remove("tt-enter"); void chooser.offsetWidth; chooser.classList.add("tt-enter");
    setTrail(cfg.title);
    cfg.onChooser && cfg.onChooser();
    window.scrollTo({ top: 0 });
  }
  function openItem(key, push, replace) {
    const it = cfg.items.find(i => i.key === key); if (!it) return;
    current = key;
    chooser.classList.add("hidden");
    cfg.content().forEach(el => el.classList.remove("sec-hide"));
    cfg.open(key);
    if (push) history[replace ? "replaceState" : "pushState"]({ sec: key }, "", "#" + cfg.hashPrefix + key);
    setTrail(cfg.title, it.label);
    window.scrollTo({ top: 0 });
  }
  // the portal's Settings view hides the section; coming back restores it
  function suspend(on, title) {
    suspended = on;
    if (!cfg || cfg.style === "bar") { setTrail(on ? title : cfg ? cfg.title : title); return; }
    if (on) { chooser.classList.add("hidden"); setTrail(title); }
    else if (current) setTrail(cfg.title, cfg.items.find(i => i.key === current).label);
    else showChooser(false);
  }

  window.TeacherSections = { init, navBar, setTrail, styleOf, setStyle, suspend, showChooser, openItem: k => cfg && cfg.style !== "bar" ? openItem(k, true) : cfg && cfg.open(k),
    SECTIONS: [["classroom", "Classroom Tools"], ["tools", "Teacher Tools"], ["portal", "Parent Portal Settings"]] };
})();

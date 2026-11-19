// Shared helpers used by every page.

// Teacher name & welcome text: set in the Teacher Portal (falls back to data.js).
function applyNames(name, welcome) {
  document.querySelectorAll("[data-teacher]").forEach(el => { el.textContent = name; });
  document.querySelectorAll("[data-welcome]").forEach(el => { el.textContent = welcome; });
  document.title = document.title.replace(/Rabbi Eisgrau|\u2013 .*$/, m => m.startsWith("\u2013") ? "\u2013 " + name : name);
}
// Pages stay hidden until we know whether the site is locked (see showSiteGate).
const IS_PORTAL = /portal\.html$/.test(location.pathname);
if (!IS_PORTAL) document.documentElement.classList.add("gate-wait");

document.addEventListener("DOMContentLoaded", () => {
  if (IS_PORTAL) return;
  applyNames(SITE.teacherName, SITE.welcome);
  loadContent().then(async c => {
    applyNames(c.settings.teacherName, c.settings.welcome);
    showBanners(c);
    await checkSiteLock(c);
  }).catch(() => document.documentElement.classList.remove("gate-wait"));
});

/* ---------------- Show/hide password (eye icon) ---------------- */
const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function addPasswordToggles(root) {
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach(input => {
    input.dataset.eye = "1";
    const wrap = document.createElement("span");
    wrap.className = "pw-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-eye";
    btn.innerHTML = EYE_OPEN;
    btn.setAttribute("aria-label", "Show password");
    btn.title = "Show password";
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_SHUT : EYE_OPEN;
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.title = show ? "Hide password" : "Show password";
      input.focus();
    });
    wrap.appendChild(btn);
  });
}

/* ---------------- Site lock (turned on/off in the Teacher Portal) ----------------
   A privacy screen: visitors must type the class password to see the pages. */
const UNLOCK_KEY = "classroom_site_unlocked";
function b64(buf) { let s = ""; new Uint8Array(buf).forEach(x => s += String.fromCharCode(x)); return btoa(s); }
async function hashSitePassword(password, saltB64, iterations) {
  const salt = Uint8Array.from(atob(saltB64), ch => ch.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256));
}
function readUnlock() {
  try { return localStorage.getItem(UNLOCK_KEY) || sessionStorage.getItem(UNLOCK_KEY); } catch { return null; }
}
async function checkSiteLock(c) {
  const lock = c.settings.siteLock;
  const reveal = () => document.documentElement.classList.remove("gate-wait");
  if (!lock || !lock.on || !lock.hash) return reveal();
  if (readUnlock() === lock.hash) return reveal();
  showSiteGate(c, lock, reveal);
}
function showSiteGate(c, lock, reveal) {
  const gate = el("div", "site-gate");
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  const box = el("form", "gate-box");
  box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  box.appendChild(el("h1", "gate-title", c.settings.teacherName));
  box.appendChild(el("p", "gate-sub", "This class website is private. Please enter the password."));
  const input = el("input"); input.type = "password"; input.placeholder = "Password"; input.autocomplete = "current-password";
  input.setAttribute("aria-label", "Password");
  const remLab = el("label", "gate-remember");
  const rem = el("input"); rem.type = "checkbox";
  remLab.append(rem, document.createTextNode(" Remember this device"));
  const btn = el("button", "gate-btn", "Enter"); btn.type = "submit";
  const msg = el("p", "gate-msg");
  box.append(input, remLab, btn, msg);
  gate.appendChild(box);
  document.body.appendChild(gate);
  addPasswordToggles(gate);
  input.focus();
  box.addEventListener("submit", async e => {
    e.preventDefault();
    msg.textContent = "";
    if (!(window.crypto && crypto.subtle)) { msg.textContent = "Please open this site with https:// at the start of the address."; return; }
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      const h = await hashSitePassword(input.value, lock.salt, lock.iterations);
      if (h !== lock.hash) { msg.textContent = "That password isn't right. Please try again."; input.select(); return; }
      try { (rem.checked ? localStorage : sessionStorage).setItem(UNLOCK_KEY, h); } catch {}
      gate.remove();
      reveal();
    } finally { btn.disabled = false; btn.textContent = "Enter"; }
  });
}

// Loads classwork / homework / news / banner (managed in the Teacher Portal).
let contentPromise = null;
function loadContent() {
  if (!contentPromise) {
    contentPromise = fetch("content.json?t=" + Date.now(), { cache: "no-store" })
      .then(res => { if (!res.ok) throw new Error("Could not load content.json"); return res.json(); })
      .then(normalizeContent)
      .catch(e => { contentPromise = null; throw e; });
  }
  return contentPromise;
}

const CLASSWORK_SECTIONS = 7;
const MAX_BANNERS = 3;
const BANNER_PAGES = [
  ["home", "Home page"], ["classwork", "Classwork"], ["homework", "Homework"],
  ["news", "News"], ["programs", "Programs"], ["contact", "Contact"]
];
const BANNER_COLORS = {
  yellow: { name: "Yellow", bg: "#fcd34d", border: "#eab308", text: "#3b2f05" },
  gold:   { name: "Gold",   bg: "#e3c88f", border: "#b8955a", text: "#14213d" },
  orange: { name: "Orange", bg: "#fed7aa", border: "#f97316", text: "#7c2d12" },
  red:    { name: "Red",    bg: "#fecaca", border: "#ef4444", text: "#7f1d1d" },
  pink:   { name: "Pink",   bg: "#fbcfe8", border: "#ec4899", text: "#831843" },
  purple: { name: "Purple", bg: "#e9d5ff", border: "#a855f7", text: "#4c1d95" },
  blue:   { name: "Blue",   bg: "#bfdbfe", border: "#3b82f6", text: "#1e3a8a" },
  green:  { name: "Green",  bg: "#bbf7d0", border: "#22c55e", text: "#14532d" },
  navy:   { name: "Navy",   bg: "#14213d", border: "#c9a96a", text: "#f3e6c4" },
  white:  { name: "White",  bg: "#ffffff", border: "#c9a96a", text: "#14213d" }
};

// Fills in anything missing so older content.json files keep working.
function normalizeContent(c) {
  c = c || {};
  c.settings = Object.assign({ newsNewDays: 7, teacherName: SITE.teacherName, welcome: SITE.welcome }, c.settings);
  c.settings.siteLock = Object.assign({ on: false, hash: "", salt: "", iterations: 150000 }, c.settings.siteLock);
  if (!c.settings.teacherName) c.settings.teacherName = SITE.teacherName;
  if (!c.settings.welcome) c.settings.welcome = SITE.welcome;
  if (!Array.isArray(c.banners)) {
    const nh = c.noHomework || {};
    c.banners = [{ on: !!nh.on, message: nh.message || "No homework tonight!", emojiStart: "🎉", emojiEnd: "🥳", color: "yellow", pages: ["home", "homework"] }];
  }
  delete c.noHomework;
  c.banners = c.banners.slice(0, MAX_BANNERS).map(b => ({
    on: !!b.on,
    message: b.message || "",
    emojiStart: b.emojiStart == null ? "" : b.emojiStart,
    emojiEnd: b.emojiEnd == null ? "" : b.emojiEnd,
    color: b.color || "yellow",
    pages: Array.isArray(b.pages) ? b.pages : ["home"]
  }));

  // Classwork: a page heading + 7 named sections that can be switched on/off.
  let cw = c.classwork || {};
  if (!Array.isArray(cw.sections)) {
    const old = cw;
    cw = { heading: "Classwork", intro: "", sections: [] };
    if (old.date || old.notes || (old.files && old.files.length)) {
      cw.sections.push({ name: "Section 1", on: true, date: old.date || "", notes: old.notes || "", files: old.files || [] });
    }
  }
  cw.heading = cw.heading || "Classwork";
  cw.intro = cw.intro || "";
  for (let i = cw.sections.length; i < CLASSWORK_SECTIONS; i++) {
    cw.sections.push({ name: "Section " + (i + 1), on: true, date: "", notes: "", files: [] });
  }
  cw.sections = cw.sections.slice(0, CLASSWORK_SECTIONS);
  cw.sections.forEach((sec, i) => {
    sec.id = "s" + (i + 1);
    sec.name = sec.name || "Section " + (i + 1);
    sec.on = sec.on !== false;
    sec.date = sec.date || "";
    sec.notes = sec.notes || "";
    sec.files = sec.files || [];
  });
  c.classwork = cw;

  c.homework = Object.assign({ title: "Today's Homework", date: "", due: "", notes: "", files: [] }, c.homework);
  const lists = ["news", "programs"];
  lists.forEach(k => {
    c[k] = Array.isArray(c[k]) ? c[k] : [];
    c[k].forEach(n => { n.files = n.files || []; n.id = n.id || k[0] + Math.random().toString(36).slice(2, 8); });
  });
  return c;
}

// Days between a "YYYY-MM-DD" date and today (0 = today, positive = in the past).
function daysAgo(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t - d) / 86400000);
}
function isNewNews(item, days) {
  if (!days) return false;
  const a = daysAgo(item.date);
  return a !== null && a < days;
}
function newNewsCount(c) {
  return (c.news || []).filter(n => isNewNews(n, c.settings.newsNewDays)).length;
}

// "Nov 3 – Dec 15, 2026" style range for programs.
function formatRange(start, end) {
  const short = v => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : (v || "");
  };
  if (start && end) return short(start) + " – " + short(end);
  if (start) return "Starting " + short(start);
  if (end) return "Until " + short(end);
  return "";
}

// List of posts (news, programs): each shows a heading + subtitle and opens on click.
function renderPosts(items, container, opts) {
  opts = opts || {};
  if (!items.length) {
    container.appendChild(el("div", "card empty", opts.empty || "Nothing posted yet. Please check back soon."));
    return;
  }
  items.forEach(item => {
    const post = el("details", "card post" + (item.urgent ? " urgent" : ""));
    const head = el("summary", "post-head");
    const text = el("div", "post-titles");
    const h = el("h2", "post-title", item.title || "");
    if (item.urgent) h.prepend(el("span", "urgent-tag", "Urgent"));
    if (opts.isNew && opts.isNew(item)) h.appendChild(el("span", "new-tag", "New"));
    text.appendChild(h);
    if (item.subtitle) text.appendChild(el("p", "post-subtitle", item.subtitle));
    const when = opts.dateLine ? opts.dateLine(item) : formatDate(item.date);
    if (when) text.appendChild(el("p", "post-date", when));
    head.appendChild(text);
    head.appendChild(el("span", "post-toggle", ""));
    post.appendChild(head);

    const body = el("div", "post-body");
    if (item.text) body.appendChild(el("p", "news-text", item.text));
    (item.files || []).forEach(f => {
      if (fileKind(f.path) === "image") {
        const img = el("img", "post-image");
        img.src = f.path; img.alt = f.name; img.loading = "lazy";
        body.appendChild(img);
      }
    });
    (item.files || []).forEach(f => {
      const row = el("div", "attachment");
      row.innerHTML = ICON_FILE;
      row.appendChild(el("span", "attachment-name", f.name));
      const view = el("a", "link", "View");
      view.href = f.path; view.target = "_blank"; view.rel = "noopener";
      const dl = el("a", "link", "Download");
      dl.href = f.path; dl.setAttribute("download", f.name);
      row.append(view, dl);
      body.appendChild(row);
    });
    if (!body.childNodes.length) body.appendChild(el("p", "help", "No further details."));
    post.appendChild(body);
    container.appendChild(post);
  });
}

// "2026-11-16" -> "Monday, November 16, 2026"
function formatDate(value) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fileKind(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) return "office";
  return "other";
}

const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function downloadButtons(file) {
  const actions = el("div", "actions");
  const download = el("a", "button");
  download.href = file.path;
  download.setAttribute("download", file.name || file.path.split("/").pop());
  download.innerHTML = ICON_DOWNLOAD + "<span>Download</span>";
  const open = el("a", "button secondary");
  open.href = file.path;
  open.target = "_blank";
  open.rel = "noopener";
  open.innerHTML = ICON_OPEN + "<span>Open full screen</span>";
  actions.append(download, open);
  return actions;
}

// One posted document: name, preview, download buttons.
function fileBlock(file) {
  const card = el("div", "card file-card");
  const head = el("div", "file-head");
  head.innerHTML = ICON_FILE;
  head.appendChild(el("span", null, file.name || file.path));
  card.appendChild(head);

  const kind = fileKind(file.path);
  let preview = null;
  if (kind === "image") {
    preview = el("img", "preview");
    preview.src = file.path;
    preview.alt = file.name;
  } else if (kind === "pdf") {
    preview = el("iframe", "preview");
    preview.src = file.path;
    preview.title = file.name;
  } else if (kind === "office") {
    preview = el("iframe", "preview");
    const abs = new URL(file.path, location.href).href;
    preview.src = "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(abs);
    preview.title = file.name;
  }
  if (preview) card.appendChild(preview);
  else card.appendChild(el("p", "empty", "Preview isn't available for this type of file. Use Download to open it."));

  card.appendChild(downloadButtons(file));
  return card;
}

// Colors for a banner: a named color above, or any custom "#rrggbb".
function bannerColors(color) {
  if (BANNER_COLORS[color]) return BANNER_COLORS[color];
  const m = /^#([0-9a-f]{6})$/i.exec(color || "");
  if (!m) return BANNER_COLORS.yellow;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = v => Math.round(v * 0.72).toString(16).padStart(2, "0");
  return { bg: color, border: "#" + dark(r) + dark(g) + dark(b), text: lum > 0.6 ? "#1c2333" : "#ffffff" };
}
function makeBanner(b) {
  const c = bannerColors(b.color);
  const div = el("div", "nohw-banner");
  div.setAttribute("role", "status");
  div.style.setProperty("--b-bg", c.bg);
  div.style.setProperty("--b-border", c.border);
  div.style.setProperty("--b-text", c.text);
  if (b.emojiStart) div.appendChild(el("span", "nohw-emoji", b.emojiStart));
  div.appendChild(el("span", null, b.message));
  if (b.emojiEnd) div.appendChild(el("span", "nohw-emoji", b.emojiEnd));
  return div;
}
// Shows the banners that are switched on for this page (body data-page="…").
function showBanners(c) {
  const page = document.body.dataset.page;
  if (!page) return;
  const list = c.banners.filter(b => b.on && b.message.trim() && b.pages.includes(page));
  if (!list.length) return;
  let box = document.getElementById("banner");
  if (!box) {
    box = el("div", "page-banners");
    const top = document.querySelector(".topbar");
    if (top) top.after(box); else document.body.prepend(box);
  }
  list.forEach(b => box.appendChild(makeBanner(b)));
}

// Classwork & homework pages.
function renderAssignment(info, container) {
  info = info || {};
  const card = el("div", "card");
  card.appendChild(el("h1", "page-title", info.title || ""));
  if (info.date) card.appendChild(el("p", "date", formatDate(info.date)));
  card.appendChild(el("hr", "rule"));
  if (info.due) card.appendChild(el("p", "due", "Due " + formatDate(info.due)));
  if (info.notes) {
    const n = el("p", "notes", info.notes);
    card.appendChild(n);
  }
  container.appendChild(card);

  const files = info.files || [];
  if (files.length === 0) {
    const empty = el("div", "card");
    empty.appendChild(el("p", "empty", "Nothing has been posted yet. Please check back later."));
    container.appendChild(empty);
    return;
  }
  files.forEach(f => container.appendChild(fileBlock(f)));
}

function showLoadError(container) {
  const c = el("div", "card");
  c.appendChild(el("p", "empty", "Sorry, this page couldn't load. Please refresh and try again."));
  container.appendChild(c);
}

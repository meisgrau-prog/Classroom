// Shared helpers used by every page.

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-teacher]").forEach(el => { el.textContent = SITE.teacherName; });
  document.querySelectorAll("[data-welcome]").forEach(el => { el.textContent = SITE.welcome; });
  document.title = document.title.replace("Rabbi Eisgrau", SITE.teacherName);
});

// Loads classwork / homework / news / banner (managed in the Teacher Portal).
async function loadContent() {
  const res = await fetch("content.json?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load content.json");
  return normalizeContent(await res.json());
}

const CLASSWORK_SECTIONS = 7;

// Fills in anything missing so older content.json files keep working.
function normalizeContent(c) {
  c = c || {};
  c.settings = Object.assign({ newsNewDays: 7 }, c.settings);
  c.noHomework = Object.assign({ on: false, message: "No homework tonight!" }, c.noHomework);

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
    const post = el("details", "card post");
    const head = el("summary", "post-head");
    const text = el("div", "post-titles");
    const h = el("h2", "post-title", item.title || "");
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

function noHomeworkBanner(content) {
  if (!content.noHomework || !content.noHomework.on) return null;
  const b = el("div", "nohw-banner");
  b.setAttribute("role", "status");
  b.appendChild(el("span", "nohw-emoji", "🎉"));
  b.appendChild(el("span", null, content.noHomework.message || "No homework tonight!"));
  b.appendChild(el("span", "nohw-emoji", "🥳"));
  return b;
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

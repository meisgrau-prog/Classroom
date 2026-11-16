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
  return res.json();
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
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
  b.appendChild(el("span", null, content.noHomework.message || "No homework tonight!"));
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

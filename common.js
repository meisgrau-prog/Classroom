// Shared helpers used by every page.

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-teacher]").forEach(el => { el.textContent = SITE.teacherName; });
  document.querySelectorAll("[data-welcome]").forEach(el => { el.textContent = SITE.welcome; });
  document.title = document.title.replace("Rabbi Eisgrau", SITE.teacherName);
});

const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

// Shows a preview + download button for a posted file (used by classwork & homework).
function renderAssignment(info, container) {
  const card = document.createElement("div");
  card.className = "card";

  const h = document.createElement("h1");
  h.className = "page-title";
  h.textContent = info.title;
  card.appendChild(h);

  if (info.date) {
    const d = document.createElement("p");
    d.className = "date";
    d.textContent = info.date;
    card.appendChild(d);
  }
  const rule = document.createElement("hr");
  rule.className = "rule";
  card.appendChild(rule);

  if (info.due) {
    const due = document.createElement("p");
    due.className = "due";
    due.textContent = "Due " + info.due;
    card.appendChild(due);
  }
  if (info.notes) {
    const n = document.createElement("p");
    n.style.margin = "0";
    n.textContent = info.notes;
    card.appendChild(n);
  }
  container.appendChild(card);

  const previewCard = document.createElement("div");
  previewCard.className = "card";
  container.appendChild(previewCard);

  if (!info.file) {
    previewCard.innerHTML = '<p class="empty">Nothing has been posted yet. Please check back later.</p>';
    return;
  }

  const file = info.file;
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(file);

  let preview;
  if (isImage) {
    preview = document.createElement("img");
    preview.src = file;
    preview.alt = info.title + " preview";
  } else {
    preview = document.createElement("iframe");
    preview.src = file;
    preview.title = info.title + " preview";
  }
  preview.className = "preview";
  previewCard.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "actions";

  const download = document.createElement("a");
  download.className = "button";
  download.href = file;
  download.setAttribute("download", file.split("/").pop());
  download.innerHTML = ICON_DOWNLOAD + "<span>Download</span>";
  actions.appendChild(download);

  const open = document.createElement("a");
  open.className = "button secondary";
  open.href = file;
  open.target = "_blank";
  open.rel = "noopener";
  open.innerHTML = ICON_OPEN + "<span>Open full screen</span>";
  actions.appendChild(open);

  previewCard.appendChild(actions);
}

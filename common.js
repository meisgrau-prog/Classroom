// Shared helpers used by every page.

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-class-name]").forEach(el => {
    el.textContent = SITE.className;
  });
  document.title = document.title.replace("My Classroom", SITE.className);
});

// Shows a preview + download button for a posted file (used by classwork & homework).
function renderAssignment(info, container) {
  const card = document.createElement("div");
  card.className = "card";

  const h = document.createElement("h2");
  h.className = "page-title";
  h.textContent = info.title;
  card.appendChild(h);

  if (info.date) {
    const d = document.createElement("p");
    d.className = "date";
    d.textContent = info.date;
    card.appendChild(d);
  }
  if (info.due) {
    const due = document.createElement("p");
    due.className = "due";
    due.textContent = "Due: " + info.due;
    card.appendChild(due);
  }
  if (info.notes) {
    const n = document.createElement("p");
    n.textContent = info.notes;
    card.appendChild(n);
  }
  container.appendChild(card);

  const previewCard = document.createElement("div");
  previewCard.className = "card";
  container.appendChild(previewCard);

  if (!info.file) {
    previewCard.innerHTML = '<p class="empty">Nothing has been posted yet. Check back later!</p>';
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
  download.textContent = "⬇ Download";
  actions.appendChild(download);

  const open = document.createElement("a");
  open.className = "button secondary";
  open.href = file;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "Open full screen";
  actions.appendChild(open);

  previewCard.appendChild(actions);
}

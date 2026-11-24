/* ============================================================
   PDF JOINER (Teacher Tools): put PDFs and pictures together into one PDF.
   Everything happens in this browser — files are never uploaded.
   Uses pdf-lib (pdf-lib.min.js, loaded only when this tool opens).
   ============================================================ */
(function () {
  let files = [];          // { id, name, kind: "pdf"|"jpg"|"png", bytes, pages, range, error }
  let outName = "Joined.pdf";
  let root, listEl, statusEl, resultEl, nameIn, joinBtn;
  let libPromise = null;
  // "Split & arrange pages" mode
  let mode = "files", pages = [], sel = new Set(), filesPane, pagesPane, pagesGrid, pagesInfo, pagesStatus, pagesResult, modeBar;
  const COLORS = ["#2563eb", "#c0392b", "#2f8f57", "#b25e00", "#7c3aed", "#0f766e", "#be185d", "#4d7c0f"];
  let colorN = 0;

  function loadLib() {
    if (window.PDFLib) return Promise.resolve();
    if (!libPromise) libPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "pdf-lib.min.js?v=1.17.1";
      s.onload = () => window.PDFLib ? res() : rej(new Error("The PDF tool didn't load."));
      s.onerror = () => { libPromise = null; rej(new Error("The PDF tool couldn't load. Check your internet and try again.")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k); });
    return e;
  }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const size = b => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const ICON_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
  const ICON_IMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>';

  /* ---------- pages to use: "1-3, 5, 8-" ---------- */
  function parseRange(text, count) {
    text = (text || "").trim().toLowerCase();
    if (!text || text === "all") return Array.from({ length: count }, (_, i) => i);
    const out = [];
    for (const part of text.split(/[,\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/) || part.match(/^(\d+)$/);
      if (!m) throw new Error(`“${part}” isn't a page number or range.`);
      let a, b;
      if (m.length === 2) a = b = +m[1];
      else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : count; }
      if (a < 1 || b > count || a > b) throw new Error(`Pages ${part} don't fit — this file has ${count} page${count === 1 ? "" : "s"}.`);
      for (let i = a; i <= b; i++) out.push(i - 1);
    }
    return out;
  }

  /* ---------- adding files ---------- */
  async function addFiles(list) {
    const arr = [...list];
    const bad = arr.filter(f => !/\.(pdf|jpe?g|png)$/i.test(f.name) && !/^(application\/pdf|image\/(jpeg|png))$/.test(f.type));
    const good = arr.filter(f => !bad.includes(f));
    if (bad.length) setStatus(`Skipped ${bad.map(f => f.name).join(", ")} — only PDF, JPG and PNG files can be joined.`, "err");
    if (!good.length) return;
    try { await loadLib(); } catch (e) { setStatus(e.message, "err"); return; }
    for (const f of good) {
      const kind = /pdf$/i.test(f.name) || f.type === "application/pdf" ? "pdf" : /png$/i.test(f.name) || f.type === "image/png" ? "png" : "jpg";
      const item = { id: uid(), name: f.name, kind, bytes: null, pages: kind === "pdf" ? null : 1, range: "", error: "", size: f.size, color: COLORS[colorN++ % COLORS.length] };
      files.push(item); draw();
      try {
        item.bytes = new Uint8Array(await f.arrayBuffer());
        if (kind === "pdf") {
          const doc = await PDFLib.PDFDocument.load(item.bytes, { ignoreEncryption: true, updateMetadata: false });
          item.pages = doc.getPageCount();
        }
        // its pages go to the end of the page list — or right after the one selected page
        const newPages = Array.from({ length: item.pages }, (_, i) => ({ pid: uid(), fid: item.id, idx: i, rot: 0 }));
        let at = pages.length;
        if (mode === "pages" && sel.size === 1) { const k = pages.findIndex(x => sel.has(x.pid)); if (k >= 0) at = k + 1; }
        pages.splice(at, 0, ...newPages);
        if (mode === "pages" && sel.size === 1) { sel = new Set([newPages[newPages.length - 1].pid]); }
        drawPages();
      } catch (e) {
        item.error = /encrypt/i.test(String(e && e.message)) ? "This PDF is password-protected and can't be joined." : "This file couldn't be read. Is it a real PDF?";
      }
      draw();
    }
    if (!bad.length) setStatus(`${files.length} file${files.length === 1 ? "" : "s"} ready. Drag to change the order, then press Join.`);
  }

  /* ---------- joining ---------- */
  async function join() {
    const use = files.filter(f => !f.error && f.bytes);
    if (!use.length) { setStatus("Add at least one PDF or picture first.", "err"); return; }
    if (files.some(f => !f.error && !f.bytes)) { setStatus("Still reading files… try again in a moment.", "err"); return; }
    joinBtn.disabled = true; joinBtn.textContent = "Joining…"; resultEl.innerHTML = "";
    try {
      await loadLib();
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();
      let total = 0;
      for (const f of use) {
        if (f.kind === "pdf") {
          let idx;
          try { idx = parseRange(f.range, f.pages); } catch (e) { throw new Error(f.name + ": " + e.message); }
          const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
          const pages = await out.copyPages(src, idx);
          pages.forEach(p => out.addPage(p)); total += pages.length;
        } else {
          const img = f.kind === "png" ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
          // a letter-size page, turned to match the picture, with the picture fitted inside
          const land = img.width > img.height, W = land ? 792 : 612, H = land ? 612 : 792, M = 28;
          const s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
          const page = out.addPage([W, H]);
          page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
          total++;
        }
      }
      out.setTitle(outName.replace(/\.pdf$/i, ""));
      out.setProducer("Teacher Tools PDF Joiner");
      const bytes = await out.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      let name = (outName || "Joined").trim().replace(/[\\/:*?"<>|]+/g, "-") || "Joined";
      if (!/\.pdf$/i.test(name)) name += ".pdf";
      const a = h("a", { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
      setStatus(`✓ Joined ${use.length} file${use.length === 1 ? "" : "s"} into ${total} page${total === 1 ? "" : "s"} (${size(bytes.length)}). It's downloading as “${name}”.`, "ok");
      resultEl.append(
        h("a", { class: "button", href: url, download: name, style: "text-decoration:none" }, "Download again"),
        h("a", { class: "button secondary", href: url, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open to view / print"));
    } catch (e) {
      setStatus("Couldn't join: " + (e.message || e), "err");
    } finally { joinBtn.disabled = false; joinBtn.textContent = "Join & Download"; }
  }

  /* ---------- drawing ---------- */
  function setStatus(t, kind) { if (statusEl) { statusEl.className = "status" + (kind ? " " + kind : ""); statusEl.textContent = t; } }
  let dragId = null;
  function draw() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!files.length) { listEl.appendChild(h("p", { class: "th-none pj-empty" }, "No files yet.")); joinBtn.disabled = true; return; }
    joinBtn.disabled = false;
    let pages = 0;
    files.forEach((f, i) => {
      if (!f.error && f.pages) pages += f.kind === "pdf" && f.range ? (() => { try { return parseRange(f.range, f.pages).length; } catch { return 0; } })() : f.pages;
      const range = f.kind === "pdf" && !f.error ? h("input", { type: "text", class: "pj-range", placeholder: "All pages", value: f.range, "aria-label": "Pages to use from " + f.name, title: "e.g. 1-3, 5" }) : null;
      const rangeMsg = h("small", { class: "pj-range-msg" });
      if (range) {
        const check = () => { try { if (f.pages) parseRange(range.value, f.pages); range.classList.remove("bad"); rangeMsg.textContent = ""; } catch (e) { range.classList.add("bad"); rangeMsg.textContent = e.message; } };
        range.addEventListener("input", () => { f.range = range.value; check(); });
        range.addEventListener("change", () => draw());
        if (f.range) check();
      }
      const row = h("li", { class: "pj-item" + (f.error ? " bad" : "") + (f.seen ? "" : " pj-new"), draggable: "true", "data-id": f.id },
        h("span", { class: "pj-grip", "aria-hidden": "true", title: "Drag to move" }, "⋮⋮"),
        h("span", { class: "pj-num" }, String(i + 1)),
        h("span", { class: "pj-ico " + f.kind, html: f.kind === "pdf" ? ICON_PDF : ICON_IMG }),
        h("span", { class: "pj-info" }, h("strong", null, f.name),
          h("small", null, f.error ? f.error : f.bytes ? [f.kind === "pdf" ? `${f.pages} page${f.pages === 1 ? "" : "s"}` : "Picture → 1 page", size(f.size)].join(" · ") : "Reading…")),
        range ? h("span", { class: "pj-pages" }, h("label", null, "Pages", range), rangeMsg) : h("span"),
        h("span", { class: "pj-btns" },
          h("button", { type: "button", class: "small-btn", "aria-label": "Move up", disabled: i === 0 ? true : null, onclick: () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); } }, "↑"),
          h("button", { type: "button", class: "small-btn", "aria-label": "Move down", disabled: i === files.length - 1 ? true : null, onclick: () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); } }, "↓"),
          h("button", { type: "button", class: "rf-x", "aria-label": "Remove " + f.name, onclick: () => { files.splice(i, 1); pages = pages.filter(x => x.fid !== f.id); draw(); drawPages(); setStatus(files.length ? "" : "All files removed."); } }, "×")));
      row.addEventListener("dragstart", e => { dragId = f.id; row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", f.id); } catch {} });
      row.addEventListener("dragend", () => { dragId = null; row.classList.remove("dragging"); listEl.querySelectorAll(".over").forEach(x => x.classList.remove("over")); });
      row.addEventListener("dragover", e => { if (!dragId || dragId === f.id) return; e.preventDefault(); row.classList.add("over"); });
      row.addEventListener("dragleave", () => row.classList.remove("over"));
      row.addEventListener("drop", e => {
        if (!dragId) return; e.preventDefault(); e.stopPropagation();
        const from = files.findIndex(x => x.id === dragId), to = files.findIndex(x => x.id === f.id);
        if (from < 0 || to < 0) return;
        const [m] = files.splice(from, 1); files.splice(to, 0, m); draw();
      });
      listEl.appendChild(row);
      if (f.bytes || f.error) f.seen = true;
    });
    const ok = files.filter(f => !f.error).length;
    listEl.appendChild(h("li", { class: "pj-total" }, `${ok} file${ok === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} in the joined PDF`));
  }

  /* ================= Split & arrange pages ================= */
  const fileOf = id => files.find(f => f.id === id);
  // page pictures (thumbnails) with PDF.js — loaded only when needed
  let pdfjsPromise = null;
  const thumbCache = {}, docCache = {};
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsPromise) pdfjsPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "pdf.min.js?v=3.11.174";
      s.onload = () => { if (!window.pdfjsLib) return rej(new Error("no pdf.js")); pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js?v=3.11.174"; res(pdfjsLib); };
      s.onerror = () => { pdfjsPromise = null; rej(new Error("no pdf.js")); };
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }
  let queue = Promise.resolve();
  function thumb(f, idx, rot) {
    const key = f.id + ":" + idx + ":" + rot;
    if (thumbCache[key]) return Promise.resolve(thumbCache[key]);
    if (f.kind !== "pdf") return Promise.resolve(null);
    const job = queue.then(async () => {
      if (thumbCache[key]) return thumbCache[key];
      const lib = await loadPdfJs();
      if (!docCache[f.id]) docCache[f.id] = lib.getDocument({ data: f.bytes.slice() }).promise;
      const doc = await docCache[f.id];
      const page = await doc.getPage(idx + 1);
      const vp0 = page.getViewport({ scale: 1, rotation: (page.rotate + rot) % 360 });
      const vp = page.getViewport({ scale: 300 / Math.max(vp0.width, vp0.height), rotation: (page.rotate + rot) % 360 });
      const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return (thumbCache[key] = cv.toDataURL("image/jpeg", .8));
    });
    queue = job.catch(() => {});
    return job;
  }
  const imgURL = {};
  const imageSrc = f => imgURL[f.id] || (imgURL[f.id] = URL.createObjectURL(new Blob([f.bytes], { type: f.kind === "png" ? "image/png" : "image/jpeg" })));

  let observer = null, dragPid = null;
  function drawPages() {
    if (!pagesGrid) return;
    pagesGrid.innerHTML = "";
    if (observer) observer.disconnect();
    observer = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { observer.unobserve(e.target); e.target._load(); } }), { rootMargin: "300px" }) : null;
    sel.forEach(id => { if (!pages.some(x => x.pid === id)) sel.delete(id); });
    pages.forEach((pg, i) => {
      const f = fileOf(pg.fid); if (!f) return;
      const pic = h("div", { class: "pp-pic" }, h("span", { class: "pp-wait" }, "…"));
      const load = () => {
        if (f.kind === "pdf") thumb(f, pg.idx, pg.rot).then(url => { pic.innerHTML = ""; pic.appendChild(h("img", { src: url, alt: "" })); }).catch(() => { pic.innerHTML = ""; pic.appendChild(h("span", { class: "pp-noimg" }, "Page " + (pg.idx + 1))); });
        else { pic.innerHTML = ""; pic.appendChild(h("img", { src: imageSrc(f), alt: "", style: `transform: rotate(${pg.rot}deg)` })); }
      };
      const on = sel.has(pg.pid);
      const tile = h("div", { class: "pp-tile" + (on ? " sel" : ""), draggable: "true", "data-pid": pg.pid, style: `--fc:${f.color}` },
        h("label", { class: "pp-check", title: "Select" }, h("input", { type: "checkbox", checked: on ? true : null, "aria-label": `Select page ${i + 1}`, onchange: e => { e.target.checked ? sel.add(pg.pid) : sel.delete(pg.pid); tile.classList.toggle("sel", e.target.checked); drawInfo(); } })),
        h("span", { class: "pp-pos" }, String(i + 1)),
        pic,
        h("div", { class: "pp-cap" }, h("span", { class: "pp-dot" }), h("span", { class: "pp-name", title: f.name }, f.name.replace(/\.(pdf|png|jpe?g)$/i, "")), h("small", null, f.kind === "pdf" ? "p." + (pg.idx + 1) : "picture")),
        h("div", { class: "pp-btns" },
          h("button", { type: "button", title: "Move left", "aria-label": "Move left", disabled: i === 0 ? true : null, onclick: () => { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; drawPages(); } }, "←"),
          h("button", { type: "button", title: "Rotate", "aria-label": "Rotate", onclick: () => { pg.rot = (pg.rot + 90) % 360; drawPages(); } }, "⟳"),
          h("button", { type: "button", title: "Copy this page", "aria-label": "Copy this page", onclick: () => { pages.splice(i + 1, 0, Object.assign({}, pg, { pid: uid() })); drawPages(); } }, "⧉"),
          h("button", { type: "button", title: "Remove", "aria-label": "Remove page", class: "x", onclick: () => { pages.splice(i, 1); drawPages(); } }, "×"),
          h("button", { type: "button", title: "Move right", "aria-label": "Move right", disabled: i === pages.length - 1 ? true : null, onclick: () => { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; drawPages(); } }, "→")));
      tile.addEventListener("dragstart", e => { dragPid = pg.pid; tile.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", pg.pid); } catch {} });
      tile.addEventListener("dragend", () => { dragPid = null; tile.classList.remove("dragging"); pagesGrid.querySelectorAll(".over-l,.over-r").forEach(x => x.classList.remove("over-l", "over-r")); });
      tile.addEventListener("dragover", e => {
        if (!dragPid || dragPid === pg.pid) return; e.preventDefault();
        const r = tile.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2;
        tile.classList.toggle("over-r", right); tile.classList.toggle("over-l", !right);
      });
      tile.addEventListener("dragleave", () => tile.classList.remove("over-l", "over-r"));
      tile.addEventListener("drop", e => {
        if (!dragPid) return; e.preventDefault(); e.stopPropagation();
        const right = tile.classList.contains("over-r");
        // move every selected page if the dragged one is selected, otherwise just the one
        const moving = sel.has(dragPid) ? pages.filter(x => sel.has(x.pid)) : pages.filter(x => x.pid === dragPid);
        if (moving.some(x => x.pid === pg.pid)) return;
        pages = pages.filter(x => !moving.includes(x));
        const t = pages.findIndex(x => x.pid === pg.pid) + (right ? 1 : 0);
        pages.splice(t, 0, ...moving); drawPages();
      });
      tile._load = load;
      if (observer) observer.observe(tile); else load();
      pagesGrid.appendChild(tile);
    });
    if (!pages.length) pagesGrid.appendChild(h("p", { class: "th-none pj-empty" }, files.length ? "All pages removed. Use “Start over” to bring them back." : "Add PDFs above — every page will show here."));
    drawInfo();
  }
  function drawInfo() {
    if (!pagesInfo) return;
    const n = sel.size;
    pagesInfo.innerHTML = "";
    pagesInfo.append(h("span", { class: "label-text", style: "margin:0" }, `${pages.length} page${pages.length === 1 ? "" : "s"}` + (n ? ` · ${n} selected` : "")),
      h("span", { class: "pj-tools-btns" },
        n ? [
          h("button", { type: "button", class: "small-btn", onclick: () => { sel.clear(); drawPages(); } }, "Unselect"),
          h("button", { type: "button", class: "small-btn", onclick: () => { const m = pages.filter(x => sel.has(x.pid)); pages = m.concat(pages.filter(x => !sel.has(x.pid))); drawPages(); } }, "Move to front"),
          h("button", { type: "button", class: "small-btn", onclick: () => { const m = pages.filter(x => sel.has(x.pid)); pages = pages.filter(x => !sel.has(x.pid)).concat(m); drawPages(); } }, "Move to end"),
          h("button", { type: "button", class: "small-btn", onclick: () => { pages.forEach(x => { if (sel.has(x.pid)) x.rot = (x.rot + 90) % 360; }); drawPages(); } }, "Rotate"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => { pages = pages.filter(x => !sel.has(x.pid)); sel.clear(); drawPages(); } }, "Remove")
        ] : [
          h("button", { type: "button", class: "small-btn", disabled: pages.length ? null : true, onclick: () => { pages.forEach(x => sel.add(x.pid)); drawPages(); } }, "Select all"),
          h("button", { type: "button", class: "small-btn", disabled: pages.length ? null : true, onclick: () => { pages.reverse(); drawPages(); } }, "Reverse"),
          h("button", { type: "button", class: "small-btn", disabled: files.length ? null : true, onclick: () => { if (!confirm("Put every page back in its original order?")) return; pages = []; files.filter(f => !f.error && f.pages).forEach(f => { for (let i = 0; i < f.pages; i++) pages.push({ pid: uid(), fid: f.id, idx: i, rot: 0 }); }); sel.clear(); drawPages(); } }, "Start over")
        ]));
  }

  // build a PDF from a list of pages
  async function buildPdf(list) {
    await loadLib();
    const { PDFDocument, degrees } = PDFLib;
    const out = await PDFDocument.create();
    const src = {}, emb = {};
    for (const pg of list) {
      const f = fileOf(pg.fid);
      let page;
      if (f.kind === "pdf") {
        if (!src[f.id]) src[f.id] = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
        [page] = await out.copyPages(src[f.id], [pg.idx]);
        out.addPage(page);
        page.setRotation(degrees(((page.getRotation().angle || 0) + pg.rot) % 360));
      } else {
        if (!emb[f.id]) emb[f.id] = f.kind === "png" ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
        const img = emb[f.id], land = img.width > img.height, W = land ? 792 : 612, H = land ? 612 : 792, M = 28;
        const s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
        page = out.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
        if (pg.rot) page.setRotation(degrees(pg.rot));
      }
    }
    out.setProducer("Teacher Tools PDF Tools");
    return out;
  }
  const cleanName = (n, fallback) => { n = (n || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\.pdf$/i, ""); return n || fallback; };
  function saveBlob(blob, name) { const url = URL.createObjectURL(blob); const a = h("a", { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); return url; }
  function pStatus(t, kind) { pagesStatus.className = "status" + (kind ? " " + kind : ""); pagesStatus.textContent = t; }

  async function savePages(onlySelected) {
    const list = onlySelected ? pages.filter(x => sel.has(x.pid)) : pages;
    if (!list.length) { pStatus(onlySelected ? "Select some pages first (tick the box on each page)." : "There are no pages to save.", "err"); return; }
    pagesResult.innerHTML = ""; pStatus("Making your PDF…");
    try {
      const doc = await buildPdf(list);
      const base = cleanName(pagesName.value, onlySelected ? "Selected pages" : "Arranged");
      doc.setTitle(base);
      const bytes = await doc.save();
      const url = saveBlob(new Blob([bytes], { type: "application/pdf" }), base + ".pdf");
      pStatus(`✓ Saved ${list.length} page${list.length === 1 ? "" : "s"} as “${base}.pdf” (${size(bytes.length)}).`, "ok");
      pagesResult.append(h("a", { class: "button secondary", href: url, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open to view / print"));
    } catch (e) { pStatus("Couldn't make the PDF: " + (e.message || e), "err"); }
  }

  // split: every page as its own PDF, in one .zip
  async function splitAll() {
    const list = sel.size ? pages.filter(x => sel.has(x.pid)) : pages;
    if (!list.length) { pStatus("There are no pages to split.", "err"); return; }
    pagesResult.innerHTML = ""; pStatus(`Splitting ${list.length} page${list.length === 1 ? "" : "s"}…`);
    try {
      const base = cleanName(pagesName.value, "Page");
      const entries = [], w = String(list.length).length;
      for (let i = 0; i < list.length; i++) {
        const doc = await buildPdf([list[i]]);
        const f = fileOf(list[i].fid);
        entries.push({ name: `${base} ${String(i + 1).padStart(Math.max(2, w), "0")} (${cleanName(f.name, "file")} p${list[i].idx + 1}).pdf`, data: await doc.save() });
        if (i % 5 === 4) pStatus(`Splitting… ${i + 1} of ${list.length}`);
      }
      const blob = zip(entries);
      saveBlob(blob, base + " - separate pages.zip");
      pStatus(`✓ Split into ${list.length} separate PDF${list.length === 1 ? "" : "s"}, downloaded together as “${base} - separate pages.zip”. Open the .zip to see each page.`, "ok");
    } catch (e) { pStatus("Couldn't split: " + (e.message || e), "err"); }
  }

  // tiny .zip maker (files stored as-is)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(entries) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const e of entries) {
      const name = enc.encode(e.name), data = e.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  let pagesName;
  function setMode(m) {
    mode = m;
    modeBar.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false"));
    filesPane.classList.toggle("hidden", m !== "files");
    pagesPane.classList.toggle("hidden", m !== "pages");
    (m === "pages" ? pagesPane : filesPane).classList.remove("tt-enter"); void (m === "pages" ? pagesPane : filesPane).offsetWidth; (m === "pages" ? pagesPane : filesPane).classList.add("tt-enter");
    if (m === "pages") { drawPages(); loadPdfJs().catch(() => {}); }
    try { localStorage.setItem("teacher_pdf_mode", m); } catch {}
  }

  function open(container) {
    root = container; root.innerHTML = "";
    const picker = h("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png", multiple: true, class: "hidden" });
    picker.addEventListener("change", () => { addFiles(picker.files); picker.value = ""; });
    const drop = h("button", { type: "button", class: "pj-drop", onclick: () => picker.click() },
      h("span", { class: "pj-drop-ico", html: ICON_PDF }),
      h("strong", null, "Add PDFs or pictures"),
      h("small", null, "or drag them here — PDF, JPG, PNG · pick several at once"));
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { if (dragId) return; e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", e => { if (dragId) return; e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    listEl = h("ol", { class: "pj-list" });
    statusEl = h("p", { class: "status" });
    resultEl = h("div", { class: "actions" });
    nameIn = h("input", { type: "text", class: "pj-name", value: outName, "aria-label": "Name of the joined file" });
    nameIn.addEventListener("input", () => { outName = nameIn.value; });
    joinBtn = h("button", { type: "button", class: "button pj-join", onclick: join }, "Join & Download");
    pagesGrid = h("div", { class: "pp-grid" });
    pagesInfo = h("div", { class: "pj-tools" });
    pagesStatus = h("p", { class: "status" });
    pagesResult = h("div", { class: "actions" });
    pagesName = h("input", { type: "text", class: "pj-name", value: "Arranged", "aria-label": "Name for the new PDF" });
    modeBar = h("div", { class: "pl-seg pj-modes", role: "tablist" },
      h("button", { type: "button", class: "pl-seg-btn", "data-mode": "files", onclick: () => setMode("files") }, "Join files"),
      h("button", { type: "button", class: "pl-seg-btn", "data-mode": "pages", onclick: () => setMode("pages") }, "Split & arrange pages"));
    filesPane = h("div", null,
      h("div", { class: "pj-tools" },
        h("span", { class: "label-text", style: "margin:0" }, "Files, in order"),
        h("span", { class: "pj-tools-btns" },
          h("button", { type: "button", class: "small-btn", onclick: () => { files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); draw(); } }, "Sort A–Z"),
          h("button", { type: "button", class: "small-btn", onclick: () => { files.reverse(); draw(); } }, "Reverse"),
          h("button", { type: "button", class: "small-btn danger", onclick: () => { if (files.length && confirm("Remove all files?")) { files = []; pages = []; sel.clear(); draw(); drawPages(); resultEl.innerHTML = ""; setStatus(""); } } }, "Clear all"))),
      listEl,
      h("p", { class: "help" }, "Drag a file (or use ↑ ↓) to change the order. To use only some pages, type them in Pages — like 1-3, 5 or 2-. To reorder single pages or mix pages from different files, use “Split & arrange pages”."),
      h("div", { class: "pj-foot" }, h("label", null, "File name", nameIn), joinBtn),
      statusEl, resultEl);
    pagesPane = h("div", { class: "hidden" },
      pagesInfo,
      h("p", { class: "help", style: "margin:0 0 10px" }, "Every page of every file is shown here. Drag a page to put it anywhere (or use ← →). ⟳ rotates, ⧉ copies, × removes. Tick pages to move, rotate or remove several at once. To insert another PDF in the middle, tick the page it should come after, then add the file."),
      pagesGrid,
      h("div", { class: "pj-foot" }, h("label", null, "Name", pagesName),
        h("span", { class: "pj-foot-btns" },
          h("button", { type: "button", class: "button secondary", onclick: splitAll, title: "Every page as its own PDF, downloaded together in a .zip" }, "Split into separate pages"),
          h("button", { type: "button", class: "button secondary", onclick: () => savePages(true) }, "Save ticked pages only"),
          h("button", { type: "button", class: "button pj-join", onclick: () => savePages(false) }, "Save as one PDF"))),
      pagesStatus, pagesResult);
    root.append(
      h("div", { class: "card cr-head" }, h("h1", { class: "page-title" }, "PDF Tools"),
        h("p", { class: "help", style: "margin:0" }, "Join PDFs and pictures into one file, or split a PDF into separate pages and put the pages in any order. It all happens on this computer; your files are never uploaded.")),
      h("div", { class: "card" }, modeBar, drop, picker, filesPane, pagesPane));
    let m = "files"; try { m = localStorage.getItem("teacher_pdf_mode") || m; } catch {}
    setMode(m === "pages" ? "pages" : "files");
    draw();
    loadLib().catch(() => {});   // get it ready in the background
  }

  window.PdfJoiner = { open, _t: { parseRange, zip, crc32 } };
})();

// Teacher Portal: edits content.json and uploads files in the GitHub
// repository using the teacher's own GitHub key (stored only in this browser).

const API = "https://api.github.com";
const OWNER = SITE.github.owner;
const REPO = SITE.github.repo;
const TOKEN_KEY = "classroom_portal_session";

let token = null;
let branch = "main";
let content = null;
let dirty = false;
const pendingFiles = new Map(); // pendingId -> File
let pendingCounter = 0;

const $ = id => document.getElementById(id);

/* ---------------- storage (this device only) ---------------- */
function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(t, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
  } catch {}
}
function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

/* ---------------- GitHub API ---------------- */
async function gh(path, options = {}) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { ...options, headers, cache: "no-store" });
  if (!res.ok) {
    let message = "GitHub error " + res.status;
    try { const j = await res.json(); if (j.message) message = j.message; } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
const contentsPath = p => `/repos/${OWNER}/${REPO}/contents/` + p.split("/").map(encodeURIComponent).join("/");

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/* ---------------- content ---------------- */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function normalize(c) {
  return normalizeContent(c);
}

async function loadFromGitHub() {
  try {
    const f = await gh(contentsPath("content.json") + "?ref=" + encodeURIComponent(branch));
    content = normalize(JSON.parse(b64DecodeUtf8(f.content)));
  } catch (e) {
    if (e.status === 404) content = normalize({});
    else throw e;
  }
}

/* ---------------- password lock ----------------
   The GitHub key is encrypted with the portal password (PBKDF2 + AES-GCM)
   and stored in portal-key.json. Only someone with the password can unlock it. */
const LOCK_FILE = "portal-key.json";
const PBKDF2_ITERATIONS = 600000;
const MIN_PASSWORD = 10;
const toB64 = buf => { let s = ""; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const cryptoAvailable = () => !!(window.isSecureContext && window.crypto && crypto.subtle);

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function lockToken(tokenText, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(tokenText));
  return { v: 1, kdf: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}
async function unlockToken(lock, password) {
  const key = await deriveKey(password, fromB64(lock.salt), lock.iterations);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(lock.iv) }, key, fromB64(lock.data));
  return new TextDecoder().decode(plain);
}
async function fetchSiteLock() {
  try { const r = await fetch(LOCK_FILE + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return await r.json(); } catch {}
  return null;
}
async function fetchGitHubLock() {
  // Latest copy straight from GitHub (the website copy can be 1–2 minutes behind).
  try {
    const r = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${LOCK_FILE}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}
// Returns the GitHub key, null if the password is wrong, or undefined if no password is set up.
async function unlockWithPassword(pw) {
  let found = false;
  for (const getLock of [fetchSiteLock, fetchGitHubLock]) {
    const lock = await getLock();
    if (!lock) continue;
    found = true;
    try { return await unlockToken(lock, pw); } catch {}
  }
  return found ? null : undefined;
}
async function saveLock(password) {
  const lock = await lockToken(token, password);
  let sha;
  try { sha = (await gh(contentsPath(LOCK_FILE) + "?ref=" + encodeURIComponent(branch))).sha; }
  catch (e) { if (e.status !== 404) throw e; }
  const body = { message: "Update Teacher Portal password", content: b64EncodeUtf8(JSON.stringify(lock, null, 2) + "\n"), branch };
  if (sha) body.sha = sha;
  await gh(contentsPath(LOCK_FILE), { method: "PUT", body: JSON.stringify(body) });
}
function checkNewPassword(p1, p2) {
  if (p1.length < MIN_PASSWORD) return `Please use at least ${MIN_PASSWORD} characters.`;
  if (p1 !== p2) return "The two passwords don't match.";
  return "";
}
const HTTPS_MSG = "Please open the portal with https:// at the start of the web address.";

/* ---------------- sign in ---------------- */
const SCREENS = ["signin", "keysignin", "setup", "changepw"];
function showOnly(id) { SCREENS.forEach(x => $(x).classList.toggle("hidden", x !== id)); }

async function connect(t) {
  token = t.trim();
  const repo = await gh(`/repos/${OWNER}/${REPO}`);
  branch = repo.default_branch || "main";
  await loadFromGitHub();
}
function openEditor() {
  showOnly(null);
  $("editor").classList.remove("hidden");
  $("savebar").classList.remove("hidden");
  $("signout").classList.remove("hidden");
  $("changepw-open").classList.remove("hidden");
  renderAll();
  setDirty(false);
}
function busy(btn, on, text) {
  btn.disabled = on;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = text; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
}
const keyError = e => e.status === 401
  ? "The GitHub key has expired or is wrong. Make a new key and use “First-time setup or reset password”."
  : "Couldn't connect to GitHub: " + e.message;

// Password sign-in
$("signin-btn").addEventListener("click", async () => {
  const msg = $("signin-msg"), btn = $("signin-btn");
  msg.textContent = "";
  const pw = $("password").value;
  if (!pw) { msg.textContent = "Please type the password."; return; }
  if (!cryptoAvailable()) { msg.textContent = HTTPS_MSG; return; }
  busy(btn, true, "Signing in…");
  try {
    const t = await unlockWithPassword(pw);
    if (t === undefined) { msg.textContent = "The portal password hasn't been set up yet. Click “First-time setup” below."; return; }
    if (t === null) { msg.textContent = "Wrong password. Please try again."; return; }
    await connect(t);
    saveToken(token, $("remember").checked);
    $("password").value = "";
    openEditor();
  } catch (e) {
    token = null;
    msg.textContent = keyError(e);
  } finally { busy(btn, false); }
});
$("password").addEventListener("keydown", e => { if (e.key === "Enter") $("signin-btn").click(); });

// GitHub key sign-in (backup)
$("show-key").addEventListener("click", e => { e.preventDefault(); showOnly("keysignin"); $("token").focus(); });
$("key-btn").addEventListener("click", async () => {
  const msg = $("key-msg"), btn = $("key-btn");
  msg.textContent = "";
  const t = $("token").value.trim();
  if (!t) { msg.textContent = "Please paste your GitHub key."; return; }
  busy(btn, true, "Signing in…");
  try {
    await connect(t);
    saveToken(token, false);
    $("token").value = "";
    openEditor();
  } catch (e) {
    token = null;
    msg.textContent = e.status === 401 ? "That key didn't work. Check that you copied the whole key, or make a new one." : "Couldn't sign in: " + e.message;
  } finally { busy(btn, false); }
});
$("token").addEventListener("keydown", e => { if (e.key === "Enter") $("key-btn").click(); });

// First-time setup / reset
$("show-setup").addEventListener("click", e => { e.preventDefault(); showOnly("setup"); $("setup-token").focus(); });
document.querySelectorAll(".back-to-signin").forEach(b => b.addEventListener("click", () => showOnly("signin")));
$("setup-btn").addEventListener("click", async () => {
  const msg = $("setup-msg"), btn = $("setup-btn");
  msg.className = "status err";
  const t = $("setup-token").value.trim();
  const p1 = $("setup-pass").value, p2 = $("setup-pass2").value;
  if (!t) { msg.textContent = "Please paste your GitHub key."; return; }
  const bad = checkNewPassword(p1, p2);
  if (bad) { msg.textContent = bad; return; }
  if (!cryptoAvailable()) { msg.textContent = HTTPS_MSG; return; }
  busy(btn, true, "Saving…");
  msg.textContent = "";
  try {
    await connect(t);
    await saveLock(p1); // also proves the key can save to the repository
    ["setup-token", "setup-pass", "setup-pass2"].forEach(id => $(id).value = "");
    saveToken(token, false);
    msg.className = "status ok";
    msg.textContent = "✓ Password saved. From now on, sign in with just the password.";
    setTimeout(openEditor, 1200);
  } catch (e) {
    token = null;
    msg.textContent = e.status === 401 ? "That GitHub key didn't work. Check that you copied the whole key."
      : (e.status === 403 || e.status === 404) ? "That GitHub key can't save to the Classroom repository. Make a new key with the “repo” box checked. (GitHub said: " + e.message + ")"
      : "Couldn't save: " + e.message;
  } finally { busy(btn, false); }
});

// Change password (signed in)
$("changepw-open").addEventListener("click", () => {
  if (!cryptoAvailable()) { alert(HTTPS_MSG); return; }
  $("changepw").classList.remove("hidden");
  $("changepw-msg").textContent = "";
  $("new-pass").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("changepw-cancel").addEventListener("click", () => $("changepw").classList.add("hidden"));
$("changepw-btn").addEventListener("click", async () => {
  const msg = $("changepw-msg"), btn = $("changepw-btn");
  msg.className = "status err";
  const bad = checkNewPassword($("new-pass").value, $("new-pass2").value);
  if (bad) { msg.textContent = bad; return; }
  busy(btn, true, "Saving…");
  try {
    await saveLock($("new-pass").value);
    $("new-pass").value = $("new-pass2").value = "";
    msg.className = "status ok";
    msg.textContent = "✓ Password changed. The old password no longer works.";
  } catch (e) {
    msg.textContent = "Couldn't change the password: " + e.message;
  } finally { busy(btn, false); }
});

$("signout").addEventListener("click", () => {
  if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
  forgetToken();
  dirty = false;
  location.reload();
});

// If someone opens the portal on http://, switch to the secure https:// address.
if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  location.replace("https://" + location.host + location.pathname + location.search);
}

/* ---------------- dirty / save bar ---------------- */
function setDirty(v) {
  dirty = v;
  const m = $("save-msg");
  m.className = "msg";
  m.textContent = v ? "You have unsaved changes." : "All changes saved.";
}
const changed = () => setDirty(true);
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ---------------- UI builders ---------------- */
function field(labelText, input, help) {
  const wrap = el("div", "field");
  const id = "f" + Math.random().toString(36).slice(2, 9);
  input.id = id;
  const label = el("label", null, labelText);
  label.htmlFor = id;
  wrap.append(label, input);
  if (help) wrap.appendChild(el("p", "help", help));
  return wrap;
}
function textInput(obj, key, placeholder) {
  const i = el("input");
  i.type = "text";
  i.value = obj[key] || "";
  if (placeholder) i.placeholder = placeholder;
  i.addEventListener("input", () => { obj[key] = i.value; changed(); });
  return i;
}
function textArea(obj, key, placeholder) {
  const t = el("textarea");
  t.value = obj[key] || "";
  if (placeholder) t.placeholder = placeholder;
  t.addEventListener("input", () => { obj[key] = t.value; changed(); });
  return t;
}
function dateField(labelText, obj, key) {
  const wrap = el("div", "field");
  const id = "f" + Math.random().toString(36).slice(2, 9);
  const label = el("label", null, labelText);
  label.htmlFor = id;
  const row = el("div", "row");
  const i = el("input");
  i.type = "date"; i.id = id; i.value = obj[key] || "";
  i.addEventListener("input", () => { obj[key] = i.value; changed(); });
  const btn = el("button", "small-btn", "Today");
  btn.type = "button";
  btn.addEventListener("click", () => { i.value = obj[key] = today(); changed(); });
  const clear = el("button", "small-btn", "Clear");
  clear.type = "button";
  clear.addEventListener("click", () => { i.value = obj[key] = ""; changed(); });
  row.append(i, btn, clear);
  wrap.append(label, row);
  return wrap;
}

function filesEditor(files, labelText) {
  const wrap = el("div", "field");
  wrap.appendChild(el("span", "label-text", labelText));
  const list = el("ul", "file-list");
  wrap.appendChild(list);

  function draw() {
    list.innerHTML = "";
    if (files.length === 0) {
      const li = el("li");
      li.appendChild(el("span", "fname help", "No documents posted."));
      list.appendChild(li);
    }
    files.forEach((f, idx) => {
      const li = el("li");
      li.innerHTML = ICON_FILE;
      li.appendChild(el("span", "fname", f.name));
      if (f.pendingId) li.appendChild(el("span", "tag", "New – not saved yet"));
      else {
        const view = el("a", "link", "View");
        view.href = f.path; view.target = "_blank"; view.rel = "noopener";
        li.appendChild(view);
      }
      const rm = el("button", "small-btn danger", "Remove");
      rm.type = "button";
      rm.addEventListener("click", () => {
        if (f.pendingId) pendingFiles.delete(f.pendingId);
        files.splice(idx, 1);
        changed();
        draw();
      });
      li.appendChild(rm);
      list.appendChild(li);
    });
  }

  const zone = el("label", "upload-zone");
  zone.appendChild(document.createTextNode("＋ Upload documents (PDF, Word, PowerPoint, images) — click or drag files here"));
  const input = el("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt";
  zone.appendChild(input);

  function addFiles(fileList) {
    for (const file of fileList) {
      if (file.size > 50 * 1024 * 1024) { alert(`"${file.name}" is too big (over 50 MB).`); continue; }
      const id = "p" + (++pendingCounter);
      pendingFiles.set(id, file);
      files.push({ name: file.name, pendingId: id });
    }
    changed();
    draw();
  }
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("drag"); addFiles(e.dataTransfer.files); });

  wrap.appendChild(zone);
  draw();
  return wrap;
}

function assignmentPanel(key, withDue) {
  const panel = $("panel-" + key);
  panel.innerHTML = "";
  const data = content[key];
  const card = el("div", "card");
  card.appendChild(field("Title", textInput(data, "title")));
  if (withDue) {
    const two = el("div", "two");
    two.append(dateField("Date", data, "date"), dateField("Due date", data, "due"));
    card.appendChild(two);
  } else {
    card.appendChild(dateField("Date", data, "date"));
  }
  card.appendChild(field("Instructions / notes", textArea(data, "notes", "Optional")));
  card.appendChild(filesEditor(data.files, "Documents"));
  panel.appendChild(card);
}

function onOffSwitch(obj, key, onChange) {
  const label = el("label", "switch");
  label.setAttribute("aria-label", "Show or hide");
  const input = el("input");
  input.type = "checkbox";
  input.checked = !!obj[key];
  input.addEventListener("change", () => { obj[key] = input.checked; changed(); if (onChange) onChange(); });
  label.append(input, el("span", "slider"));
  // Inside a section header: flip the switch without also opening/closing the section.
  label.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change"));
  });
  return label;
}

/* Classwork: page heading + 7 sections (name, on/off, date, notes, documents) */
function classworkPanel() {
  const panel = $("panel-classwork");
  const openIds = new Set([...panel.querySelectorAll("details[open]")].map(d => d.dataset.id));
  panel.innerHTML = "";
  const cw = content.classwork;

  const top = el("div", "card");
  top.appendChild(el("h2", "section-title", "Classwork Page"));
  top.appendChild(el("p", "help", "Shown when someone first opens Classwork. Use the sections below for each subject or group."));
  const sp = el("div"); sp.style.height = "12px"; top.appendChild(sp);
  top.appendChild(field("Page heading", textInput(cw, "heading", "Classwork")));
  top.appendChild(field("Welcome message (optional)", textArea(cw, "intro", "e.g. Find each subject's work in the menu.")));
  panel.appendChild(top);

  cw.sections.forEach((sec, i) => {
    const d = el("details", "card section-card" + (sec.on ? "" : " sec-off"));
    d.dataset.id = sec.id;
    if (openIds.has(sec.id) || (openIds.size === 0 && i === 0)) d.open = true;
    const sum = el("summary");
    sum.appendChild(el("span", "sec-num", String(i + 1)));
    const nameEl = el("span", "sec-name", sec.name || "Section " + (i + 1));
    sum.appendChild(nameEl);
    const pill = el("span", "pill " + (sec.on ? "on" : "off"), sec.on ? "Shown" : "Hidden");
    sum.appendChild(pill);
    const sw = onOffSwitch(sec, "on", () => {
      d.classList.toggle("sec-off", !sec.on);
      pill.className = "pill " + (sec.on ? "on" : "off");
      pill.textContent = sec.on ? "Shown" : "Hidden";
    });
    sum.appendChild(sw);
    d.appendChild(sum);

    const body = el("div", "section-body");
    const nameInput = textInput(sec, "name", "e.g. Math");
    nameInput.addEventListener("input", () => { nameEl.textContent = sec.name || "Section " + (i + 1); });
    body.appendChild(field("Section name (shown in the menu)", nameInput));
    body.appendChild(dateField("Date", sec, "date"));
    body.appendChild(field("Instructions / notes", textArea(sec, "notes", "Optional")));
    body.appendChild(filesEditor(sec.files, "Documents"));
    d.appendChild(body);
    panel.appendChild(d);
  });
}

/* News & Programs: a list of posts */
function postListPanel(key, cfg) {
  const panel = $("panel-" + key);
  panel.innerHTML = "";
  const list = content[key];
  if (cfg.top) panel.appendChild(cfg.top());

  const add = el("button", "button", "＋ " + cfg.addLabel);
  add.type = "button";
  add.style.marginBottom = "16px";
  add.addEventListener("click", () => {
    list.unshift(cfg.blank());
    changed();
    postListPanel(key, cfg);
    const first = panel.querySelector(".news-item input[type=text]");
    if (first) first.focus();
  });
  panel.appendChild(add);

  if (list.length === 0) {
    const c = el("div", "card");
    c.appendChild(el("p", "empty", cfg.empty));
    panel.appendChild(c);
  }

  list.forEach((item, idx) => {
    const card = el("div", "card news-item");
    cfg.fields(card, item);
    card.appendChild(filesEditor(item.files, "Pictures & attachments (optional)"));

    const row = el("div", "row");
    row.style.justifyContent = "flex-end";
    row.style.flexWrap = "wrap";
    const mk = (label, cls, fn) => { const bt = el("button", cls, label); bt.type = "button"; bt.addEventListener("click", fn); row.appendChild(bt); };
    if (idx > 0) mk("↑ Move up", "small-btn", () => { [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]; changed(); postListPanel(key, cfg); });
    if (idx < list.length - 1) mk("↓ Move down", "small-btn", () => { [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]]; changed(); postListPanel(key, cfg); });
    mk("Delete", "small-btn danger", () => {
      if (!confirm("Delete this item?")) return;
      item.files.forEach(f => f.pendingId && pendingFiles.delete(f.pendingId));
      list.splice(idx, 1);
      changed(); postListPanel(key, cfg);
    });
    card.appendChild(row);
    panel.appendChild(card);
  });
}

const NEWS_CFG = {
  addLabel: "Add news item",
  empty: "No news yet. Click “Add news item” to post one.",
  blank: () => ({ id: "n" + Date.now(), title: "", subtitle: "", date: today(), text: "", files: [] }),
  top: () => {
    const c = el("div", "card");
    c.appendChild(el("h2", "section-title", "“New” Number on the News Button"));
    c.appendChild(el("p", "help", "The News button on the home page shows a small number for news posted in the last few days."));
    const row = el("div", "row"); row.style.marginTop = "12px";
    const inp = el("input"); inp.type = "number"; inp.min = "0"; inp.max = "90";
    inp.value = content.settings.newsNewDays;
    inp.id = "news-days";
    inp.addEventListener("input", () => {
      const v = Math.max(0, Math.min(90, parseInt(inp.value, 10) || 0));
      content.settings.newsNewDays = v; changed();
      note.textContent = countText();
    });
    const lab = el("label", null, "Count news as new for");
    lab.htmlFor = "news-days"; lab.style.margin = "0";
    row.append(lab, inp, el("span", null, "days"));
    c.appendChild(row);
    const countText = () => {
      const n = newNewsCount(content);
      return content.settings.newsNewDays === 0 ? "Set to 0: the number is turned off."
        : `Right now the button would show: ${n === 0 ? "no number" : n > 9 ? "9+" : n}.`;
    };
    const note = el("p", "help", countText());
    c.appendChild(note);
    c.appendChild(el("p", "help", "The number goes by each item's Date, so set the date when you post."));
    return c;
  },
  fields: (card, item) => {
    card.appendChild(field("Headline", textInput(item, "title", "e.g. Field trip on Friday")));
    card.appendChild(field("Subtitle (short line shown under the headline)", textInput(item, "subtitle", "e.g. Permission slips due Wednesday")));
    card.appendChild(dateField("Date", item, "date"));
    card.appendChild(field("Full message (shown when clicked)", textArea(item, "text")));
  }
};

const PROGRAMS_CFG = {
  addLabel: "Add program",
  empty: "No programs yet. Click “Add program” to post one.",
  blank: () => ({ id: "p" + Date.now(), title: "", subtitle: "", start: today(), end: "", text: "", files: [] }),
  fields: (card, item) => {
    card.appendChild(field("Program name", textInput(item, "title", "e.g. Reading Challenge")));
    card.appendChild(field("Subtitle (short line shown under the name)", textInput(item, "subtitle", "e.g. Read 20 minutes a night")));
    const two = el("div", "two");
    two.append(dateField("Starts", item, "start"), dateField("Ends (optional)", item, "end"));
    card.appendChild(two);
    card.appendChild(field("Full description (shown when clicked)", textArea(item, "text", "What is it, who is it for, what should families know?")));
  }
};

function bannerControls() {
  const on = $("nohw-on"), msg = $("nohw-msg"), state = $("nohw-state"), preview = $("nohw-preview");
  function drawPreview() {
    state.textContent = content.noHomework.on ? "On" : "Off";
    preview.innerHTML = "";
    const b = noHomeworkBanner({ noHomework: { on: true, message: content.noHomework.message } });
    b.style.margin = "0";
    b.style.opacity = content.noHomework.on ? "1" : ".35";
    preview.appendChild(b);
    if (!content.noHomework.on) preview.appendChild(el("p", "help", "Preview — the banner is OFF and not shown on the site."));
  }
  on.checked = !!content.noHomework.on;
  msg.value = content.noHomework.message || "";
  on.onchange = () => { content.noHomework.on = on.checked; changed(); drawPreview(); };
  msg.oninput = () => { content.noHomework.message = msg.value; changed(); drawPreview(); };
  drawPreview();
}

function settingsControls() {
  const name = $("set-name"), welcome = $("set-welcome");
  name.value = content.settings.teacherName || "";
  welcome.value = content.settings.welcome || "";
  name.oninput = () => { content.settings.teacherName = name.value; changed(); };
  welcome.oninput = () => { content.settings.welcome = welcome.value; changed(); };
}

function renderAll() {
  settingsControls();
  bannerControls();
  classworkPanel();
  assignmentPanel("homework", true);
  postListPanel("news", NEWS_CFG);
  postListPanel("programs", PROGRAMS_CFG);
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== "panel-" + tab.dataset.tab));
  });
});

/* ---------------- save & publish ---------------- */
function safeName(name) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}
function allFileLists() {
  return [...content.classwork.sections.map(s => s.files), content.homework.files,
          ...content.news.map(n => n.files), ...content.programs.map(p => p.files)];
}

$("save-btn").addEventListener("click", async () => {
  const btn = $("save-btn"), msg = $("save-msg");
  btn.disabled = true;
  msg.className = "msg";
  try {
    // 1. Upload any new documents
    const toUpload = allFileLists().flat().filter(f => f.pendingId);
    let n = 0;
    for (const f of toUpload) {
      n++;
      msg.textContent = `Uploading ${n} of ${toUpload.length}: ${f.name}…`;
      const file = pendingFiles.get(f.pendingId);
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const path = `uploads/${stamp}-${safeName(f.name)}`;
      await gh(contentsPath(path), {
        method: "PUT",
        body: JSON.stringify({ message: `Upload ${f.name}`, content: await fileToBase64(file), branch })
      });
      pendingFiles.delete(f.pendingId);
      delete f.pendingId;
      f.path = path;
    }

    // 2. Save content.json
    msg.textContent = "Publishing…";
    let sha;
    try {
      sha = (await gh(contentsPath("content.json") + "?ref=" + encodeURIComponent(branch))).sha;
    } catch (e) { if (e.status !== 404) throw e; }
    const body = { message: "Update class website from Teacher Portal", content: b64EncodeUtf8(JSON.stringify(content, null, 2) + "\n"), branch };
    if (sha) body.sha = sha;
    await gh(contentsPath("content.json"), { method: "PUT", body: JSON.stringify(body) });

    setDirty(false);
    renderAll();
    msg.textContent = "✓ Published! The website updates in 1–2 minutes.";
  } catch (e) {
    msg.className = "msg err";
    msg.textContent = (e.status === 403 || e.status === 404)
      ? "Couldn't save: your GitHub key isn't allowed to make changes. Edit the key on GitHub: Repository access → Only select repositories → Classroom, and Permissions → Contents → Read and write. (GitHub said: " + e.message + ")"
      : e.status === 401
        ? "The GitHub key has expired. Make a new key and use “First-time setup or reset password”."
        : "Couldn't save: " + e.message + ". Please try again.";
    renderAll();
    dirty = true;
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- start ---------------- */
(async () => {
  const saved = readToken();
  if (!saved) return;
  try {
    await connect(saved);
    openEditor();
  } catch (e) {
    token = null;
    if (e.status === 401) forgetToken();
    $("signin-msg").textContent = e.status === 401 ? "Your saved key has expired. Please sign in with a new key." : "Couldn't connect to GitHub: " + e.message;
  }
})();

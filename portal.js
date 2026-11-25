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
// One page, two views: "Parent Portal Controls" (posting) and "Settings" (portal.html#settings).
function portalView() {
  const view = location.hash === "#settings" ? "settings" : "posts";
  const TITLES = { posts: "Parent Portal Settings", settings: "Settings" };
  $("settings-card").classList.toggle("hidden", view !== "settings");
  $("home-settings").classList.toggle("hidden", view !== "settings");
  $("sync-settings").classList.toggle("hidden", view !== "settings");
  $("site-home-card").classList.toggle("hidden", view !== "settings");
  if (view === "settings") homePreview(true);
  if (view === "settings" && window.TeacherSync) TeacherSync.settingsCard($("sync-settings"));
  $("posts-area").classList.toggle("hidden", view !== "posts");
  if (view === "settings" && window.TeacherHome && !$("home-settings").children.length) TeacherHome.settingsCard($("home-settings"));
  if (location.hash === "#portal-settings" || location.hash === "#access") { const t = document.querySelector('.tab[data-tab="access"]'); if (t) t.click(); }
  if (location.hash === "#parents") { const t = document.querySelector('.tab[data-tab="access"]'); if (t) { t.click(); const p = $("panel-parents"); if (p && !p.classList.contains("hidden")) p.scrollIntoView({ behavior: "smooth" }); } }
  $("pp-title").textContent = TITLES[view];
  if (window.TeacherSections) { TeacherSections.navBar(TITLES[view]); if (sectionsReady) TeacherSections.suspend(view === "settings", "Settings"); else TeacherSections.setTrail(TITLES[view]); }
  $("changepw-open").classList.toggle("hidden", view !== "settings");
  document.querySelectorAll(".ts-item[data-nav]").forEach(a => {
    const on = a.dataset.nav === view;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.title = TITLES[view] + " – " + (content && content.settings ? content.settings.teacherName : SITE.teacherName);
}
window.addEventListener("hashchange", () => { if (!$("editor").classList.contains("hidden")) { portalView(); window.scrollTo({ top: 0 }); } });
function openEditor() {
  showOnly(null);
  portalView();
  $("editor").classList.remove("hidden");
  $("savebar").classList.remove("hidden");
  renderAll();
  setDirty(false);
  initSections();
}
// Parent Portal Settings as a page of choices (if chosen in Settings → Teacher Area sections)
var sectionsReady = false;
function initSections() {
  if (sectionsReady || !window.TeacherSections) return;
  sectionsReady = true;
  const I = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const META = {
    classwork: ["Post classwork for each subject", I('<path d="M12 6c-2-1.7-5-2-8-1.7v13c3-.3 6 0 8 1.7 2-1.7 5-2 8-1.7v-13c-3-.3-6 0-8 1.7z"/><path d="M12 6v13"/>')],
    homework: ["Tonight's homework and files", I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>')],
    news: ["Announcements for families", I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6v4H7zM15 8h2M15 12h2M7 16h10"/>')],
    programs: ["Upcoming programs and events", I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>')],
    banners: ["“No homework tonight!” and other banners", I('<path d="M4 4h16v10H4z"/><path d="M4 14l3 6M20 14l-3 6"/><path d="M8 9h8"/>')],
    access: ["Who can open it, class password, parent profiles and the parent list", I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')],
  };
  const hsh = location.hash.slice(1);
  TeacherSections.init({
    id: "portal", title: "Parent Portal Settings", hashPrefix: "tab-", ignore: /^#settings$/,
    items: [...document.querySelectorAll(".tab")].map(t => ({ key: t.dataset.tab, label: t.textContent.trim(), desc: (META[t.dataset.tab] || [])[0], icon: (META[t.dataset.tab] || [])[1] })),
    bar: () => [document.querySelector(".tabs")],
    content: () => [...document.querySelectorAll("#posts-area .panel")],
    place: el => document.querySelector(".tabs").after(el),
    open: k => { const t = document.querySelector(`.tab[data-tab="${k}"]`); if (t) t.click(); },
    initial: hsh === "portal-settings" || hsh === "access" || hsh === "parents" ? "access" : hsh.startsWith("tab-") ? hsh.slice(4) : null,
    onBar: () => {
      const on = document.querySelector('.tab[aria-selected="true"]');
      if (on && location.hash !== "#settings") TeacherSections.setTrail("Parent Portal Settings", on.textContent.trim());
      document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => TeacherSections.setTrail("Parent Portal Settings", t.textContent.trim())));
    }
  });
  if (location.hash === "#settings") TeacherSections.suspend(true, "Settings");
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
    // the same password unlocks the rest of the Teacher Area too
    try { const lk = await fetchSiteLock(); if (lk && lk.salt) ($("remember").checked ? localStorage : sessionStorage).setItem("classroom_teacher_unlocked", lk.salt); } catch {}
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
  teacherSignOut();
  location.href = "index.html";
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
    const ul = el("label", "check-line");
    const uc = el("input"); uc.type = "checkbox"; uc.checked = !!item.urgent;
    card.classList.toggle("is-urgent", !!item.urgent);
    uc.addEventListener("change", () => { item.urgent = uc.checked; card.classList.toggle("is-urgent", uc.checked); changed(); });
    ul.append(uc, document.createTextNode(" Mark as URGENT (red border and “Urgent” label on the site)"));
    const uf = el("div", "field"); uf.appendChild(ul);
    card.appendChild(uf);
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

const EMOJI_PICKS = ["🎉","🥳","⭐","🌟","✨","📚","✏️","📝","🍎","🎈","🎊","❤️","👏","😀","☀️","❄️","🍂","🌸","🕯️","✡️","📣","⚠️","⏰","🏆"];

function bannersPanel() {
  const box = $("banners-editor");
  box.innerHTML = "";
  const list = content.banners;

  list.forEach((b, i) => {
    const card = el("div", "card banner-card");
    const top = el("div", "banner-top");
    top.appendChild(el("h3", "section-title", "Banner " + (i + 1)));
    const right = el("div", "row");
    const state = el("span", "switch-state", b.on ? "On" : "Off");
    const sw = el("label", "switch");
    sw.setAttribute("aria-label", "Banner " + (i + 1) + " on or off");
    const chk = el("input"); chk.type = "checkbox"; chk.checked = b.on;
    chk.addEventListener("change", () => { b.on = chk.checked; state.textContent = b.on ? "On" : "Off"; changed(); draw(); });
    sw.append(chk, el("span", "slider"));
    right.append(state, sw);
    top.appendChild(right);
    card.appendChild(top);

    // words
    const msg = textInput(b, "message", "e.g. No homework tonight!");
    msg.addEventListener("input", draw);
    const f1 = field("Words", msg); f1.style.marginTop = "14px";
    card.appendChild(f1);

    // emojis
    const er = el("div", "emoji-row");
    const emojiField = (label, key) => {
      const f = el("div", "field");
      const id = "e" + i + key;
      const lab = el("label", null, label); lab.htmlFor = id;
      const inp = el("input"); inp.type = "text"; inp.id = id; inp.className = "emoji-box"; inp.value = b[key]; inp.maxLength = 16;
      inp.addEventListener("input", () => { b[key] = inp.value.trim(); changed(); draw(); });
      const picks = el("div", "emoji-picks");
      const mark = () => picks.querySelectorAll("button").forEach(bt =>
        bt.setAttribute("aria-pressed", (bt.dataset.emoji || "") === (b[key] || "") ? "true" : "false"));
      const none = el("button", "no-emoji", "No emoji"); none.type = "button"; none.dataset.emoji = "";
      none.addEventListener("click", () => { inp.value = b[key] = ""; changed(); draw(); mark(); });
      picks.appendChild(none);
      EMOJI_PICKS.forEach(em => {
        const bt = el("button", null, em); bt.type = "button"; bt.dataset.emoji = em;
        bt.addEventListener("click", () => { inp.value = b[key] = em; changed(); draw(); mark(); });
        picks.appendChild(bt);
      });
      inp.addEventListener("input", mark);
      inp.placeholder = "none";
      mark();
      f.append(lab, inp, picks);
      return f;
    };
    er.append(emojiField("Emoji before the words", "emojiStart"), emojiField("Emoji after the words", "emojiEnd"));
    card.appendChild(er);

    // color
    const cf = el("div", "field");
    cf.appendChild(el("span", "label-text", "Color"));
    const sw2 = el("div", "swatches");
    const swatchButtons = [];
    Object.entries(BANNER_COLORS).forEach(([key, col]) => {
      const bt = el("button", "swatch"); bt.type = "button";
      bt.style.background = col.bg; bt.style.borderColor = col.border;
      bt.title = col.name; bt.setAttribute("aria-label", col.name);
      bt.addEventListener("click", () => { b.color = key; changed(); draw(); });
      bt.dataset.key = key;
      swatchButtons.push(bt);
      sw2.appendChild(bt);
    });
    const custom = el("label", "custom-color");
    const picker = el("input"); picker.type = "color";
    picker.value = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#7c3aed";
    picker.addEventListener("input", () => { b.color = picker.value; changed(); draw(); });
    custom.append(picker, document.createTextNode("Any color"));
    sw2.appendChild(custom);
    cf.appendChild(sw2);
    card.appendChild(cf);

    // pages
    const pf = el("div", "field");
    pf.appendChild(el("span", "label-text", "Show on these pages"));
    const checks = el("div", "page-checks");
    BANNER_PAGES.forEach(([key, label]) => {
      const lab = el("label");
      const c = el("input"); c.type = "checkbox"; c.checked = b.pages.includes(key);
      c.addEventListener("change", () => {
        b.pages = BANNER_PAGES.map(p => p[0]).filter(k => k === key ? c.checked : b.pages.includes(k));
        changed(); draw();
      });
      lab.append(c, document.createTextNode(label));
      checks.appendChild(lab);
    });
    pf.appendChild(checks);
    card.appendChild(pf);

    // preview
    const pv = el("div", "banner-preview");
    card.appendChild(el("span", "label-text", "Preview"));
    card.appendChild(pv);
    const note = el("p", "help");
    card.appendChild(note);

    const del = el("button", "small-btn danger", "Delete this banner");
    del.type = "button"; del.style.marginTop = "12px";
    del.addEventListener("click", () => {
      if (!confirm("Delete Banner " + (i + 1) + "?")) return;
      list.splice(i, 1); changed(); bannersPanel();
    });
    card.appendChild(del);

    function draw() {
      pv.innerHTML = "";
      const shown = makeBanner(Object.assign({}, b, { message: b.message || "Your words here" }));
      shown.style.opacity = b.on ? "1" : ".4";
      pv.appendChild(shown);
      swatchButtons.forEach(bt => bt.setAttribute("aria-pressed", bt.dataset.key === b.color ? "true" : "false"));
      note.textContent = !b.on ? "This banner is OFF and not shown on the site."
        : !b.message.trim() ? "Type some words to show this banner."
        : !b.pages.length ? "Pick at least one page to show this banner on."
        : "Showing on: " + BANNER_PAGES.filter(p => b.pages.includes(p[0])).map(p => p[1]).join(", ") + ".";
    }
    draw();
    box.appendChild(card);
  });

  if (list.length < MAX_BANNERS) {
    const add = el("button", "button secondary", "＋ Add a banner");
    add.type = "button"; add.style.marginBottom = "20px";
    add.addEventListener("click", () => {
      list.push({ on: true, message: "", emojiStart: "⭐", emojiEnd: "⭐", color: "blue", pages: ["home"] });
      changed(); bannersPanel();
      const inputs = box.querySelectorAll(".banner-card");
      inputs[inputs.length - 1].querySelector("input[type=text]").focus();
    });
    box.appendChild(add);
  }
}

// One clear choice for Parent Portal access; it sets the website lock and parent-profile switches.
function accessControls() {
  const lock = content.settings.siteLock, pa = content.settings.parentAccounts, msg = $("access-msg");
  const current = () => pa.on ? "profiles" : lock.on ? "password" : "open";
  const radios = document.querySelectorAll('input[name="pp-access"]');
  const show = () => {
    const v = current();
    radios.forEach(r => { r.checked = r.value === v; r.closest(".access-opt").classList.toggle("chosen", r.checked); });
    msg.className = "status";
    msg.textContent = v === "open" ? "The Parent Portal is unlocked — anyone with the address can open it."
      : v === "password" ? (lock.hash ? "Families need the class password." : "Set a class password below, then Save & Publish.")
      : (pa.apiKey ? "Parents sign in with their own profiles." : "Finish the Parent Profiles setup below, then Save & Publish.");
    if ((v === "password" && !lock.hash) || (v === "profiles" && !pa.apiKey)) msg.className = "status err";
    // Only show the setup box for the choice that's picked (no duplicate on/off switches).
    $("lock-box").classList.toggle("hidden", v === "open" || (v === "profiles" && pa.requireCode === false));
    $("pa-box").classList.toggle("hidden", v !== "profiles");
    showParentList();
  };
  radios.forEach(r => r.onchange = () => {
    if (r.value === "open") { lock.on = false; pa.on = false; }
    if (r.value === "password") { lock.on = true; pa.on = false; }
    if (r.value === "profiles") { pa.on = true; }
    changed();
    lockControls(); parentAccountControls(); show();
  });
  show();
  window.__refreshAccess = show;
}

// The parent list sits at the bottom of "Parents & Access", only when parent profiles are chosen.
let parentListOpened = false;
function showParentList() {
  const box = $("panel-parents"); if (!box || !content) return;
  const on = !!content.settings.parentAccounts.on;
  box.classList.toggle("hidden", !on);
  if (!on) return;
  const tabOpen = !$("panel-access").classList.contains("hidden");
  if (tabOpen && !parentListOpened && window.ParentList) { parentListOpened = true; ParentList.open(box); }
}

function parentAccountControls() {
  const pa = content.settings.parentAccounts;
  const on = $("pa-on"), state = $("pa-state"), key = $("pa-key"), proj = $("pa-project"), code = $("pa-code"), msg = $("pa-msg"), users = $("pa-users");
  const sync = () => {
    state.textContent = pa.on ? "On" : "Off";
    users.href = pa.projectId ? `https://console.firebase.google.com/project/${encodeURIComponent(pa.projectId)}/authentication/users` : "https://console.firebase.google.com/";
    if (pa.on && !pa.apiKey) { msg.className = "status err"; msg.textContent = "Paste your Firebase Web API key before saving (setup steps below)."; }
    else if (pa.on && pa.requireCode && !content.settings.siteLock.hash) { msg.className = "status err"; msg.textContent = "Set a class password above — it's the class code parents type when creating a profile."; }
    else if (!msg.dataset.keep) { msg.className = "status"; msg.textContent = pa.on ? "Parents sign in with their own profiles." : "Off — the Parent Portal uses the one class password (if the lock is on)."; }
  };
  on.checked = !!pa.on; key.value = pa.apiKey || ""; proj.value = pa.projectId || ""; code.checked = pa.requireCode !== false;
  on.onchange = () => { pa.on = on.checked; changed(); delete msg.dataset.keep; sync(); if (window.__refreshAccess) window.__refreshAccess(); };
  key.oninput = () => { pa.apiKey = key.value.trim(); changed(); delete msg.dataset.keep; sync(); };
  proj.oninput = () => { pa.projectId = proj.value.trim(); changed(); sync(); };
  code.onchange = () => { pa.requireCode = code.checked; changed(); delete msg.dataset.keep; sync(); if (window.__refreshAccess) window.__refreshAccess(); };
  $("pa-test").onclick = async () => {
    msg.dataset.keep = "1";
    if (!pa.apiKey) { msg.className = "status err"; msg.textContent = "Paste the Web API key first."; return; }
    msg.className = "status"; msg.textContent = "Testing…";
    ParentAccounts._setKey(pa.apiKey);
    try {
      await ParentAccounts._call("accounts:signInWithPassword", { email: "connection-test@example.invalid", password: "x-test-only", returnSecureToken: true });
      msg.className = "status ok"; msg.textContent = "✓ Connected to Firebase.";
    } catch (e) {
      if (["EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD", "INVALID_EMAIL"].includes(e.code)) { msg.className = "status ok"; msg.textContent = "✓ Connected to Firebase. Email/password sign-in is ready."; }
      else if (e.code === "OPERATION_NOT_ALLOWED") { msg.className = "status err"; msg.textContent = "Connected, but Email/Password sign-in is switched off. Turn it on in Firebase → Security → Authentication → Sign-in method."; }
      else if (/API_KEY|API key/i.test((e.raw || "") + e.code)) { msg.className = "status err"; msg.textContent = "That API key wasn't accepted. Copy the apiKey value again from Firebase Project settings."; }
      else { msg.className = "status err"; msg.textContent = "Couldn't reach Firebase: " + e.message; }
    }
  };
  sync();
}

function lockControls() {
  const lock = content.settings.siteLock;
  const on = $("lock-on"), state = $("lock-state"), msg = $("lock-msg");
  const status = () => {
    state.textContent = lock.on ? "On" : "Off";
    msg.className = "status" + (lock.on && !lock.hash ? " err" : "");
    msg.textContent = lock.on && !lock.hash ? "Set a class password below before saving."
      : lock.hash ? "✓ A class password is set. Type a new one above to change it."
      : "No class password set yet.";
  };
  on.checked = !!lock.on;
  on.onchange = () => { lock.on = on.checked; changed(); status(); if (window.__refreshAccess) window.__refreshAccess(); };
  $("lock-set").onclick = async () => {
    const p1 = $("lock-pass").value, p2 = $("lock-pass2").value;
    msg.className = "status err";
    if (p1.length < 4) { msg.textContent = "Please use at least 4 characters."; return; }
    if (p1 !== p2) { msg.textContent = "The two passwords don't match."; return; }
    if (!cryptoAvailable()) { msg.textContent = HTTPS_MSG; return; }
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    lock.salt = salt;
    lock.iterations = 150000;
    lock.hash = await hashSitePassword(p1, salt, lock.iterations);
    $("lock-pass").value = $("lock-pass2").value = "";
    changed(); status();
    msg.className = "status ok";
    msg.textContent = "✓ Website password set. Click Save & Publish to apply it.";
  };
  status();
}

function settingsControls() {
  const name = $("set-name"), welcome = $("set-welcome");
  name.value = content.settings.teacherName || "";
  welcome.value = content.settings.welcome || "";
  const live = () => { applyNames(content.settings.teacherName || SITE.teacherName, content.settings.welcome); applyGrade(content.settings.grade); portalView(); homePreview(); };
  name.oninput = () => { content.settings.teacherName = name.value; changed(); live(); };
  welcome.oninput = () => { content.settings.welcome = welcome.value; changed(); homePreview(); };
  [["set-grade", "grade"], ["set-phone", "phone"], ["set-email", "contactEmail"], ["set-formemail", "formEmail"]].forEach(([id, k]) => {
    const inp = $(id);
    inp.value = content.settings[k] || "";
    inp.oninput = () => { content.settings[k] = inp.value.trim(); changed(); if (k === "grade") live(); };
  });
  live();
  const ht = content.settings.homeText;
  ["message", "classwork", "homework", "news", "programs", "contact"].forEach(k => {
    const el = $("hp-" + k);
    el.value = k === "message" ? (ht[k] || "") : (ht[k] && ht[k] !== el.placeholder ? ht[k] : "");
    el.oninput = () => { ht[k] = el.value.trim() || (k === "message" ? "" : el.placeholder); changed(); };
  });
}

/* ---------- Settings → Website Home Page ---------- */
let homePhotoBlob = null, homePhotoData = "", previewTimer = null;
function homePreview(load) {
  const H = content && content.settings && content.settings.home; if (!H) return;
  try { localStorage.setItem("site_home_preview", JSON.stringify({ home: H, photoData: homePhotoData, welcome: content.settings.welcome, teacherName: content.settings.teacherName, grade: content.settings.grade, t: Date.now() })); }
  catch { try { localStorage.setItem("site_home_preview", JSON.stringify({ home: H, welcome: content.settings.welcome, teacherName: content.settings.teacherName, grade: content.settings.grade, t: Date.now() })); } catch {} }
  const f = $("sh-frame"); if (load && f && !f.getAttribute("src")) {
    f.src = "index.html?preview=1";
    const box = f.parentNode, fit = () => { f.style.transform = `scale(${box.clientWidth / 1280})`; };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(box); fit();
  }
}
function homePageControls() {
  const H = content.settings.home;
  const upd = () => { changed(); clearTimeout(previewTimer); previewTimer = setTimeout(() => homePreview(), 120); };
  const text = (id, key) => { const el = $(id); el.value = H[key] || ""; el.oninput = () => { H[key] = el.value.trim() ? el.value : ""; upd(); }; };
  text("sh-footer", "footer");
  $("sh-blurb").value = H.blurb || ""; $("sh-blurb").oninput = () => { H.blurb = $("sh-blurb").value.trim() ? $("sh-blurb").value : ""; upd(); };
  $("sh-card").value = H.cardTitle && H.cardTitle !== "Sign in" ? H.cardTitle : ""; $("sh-card").oninput = () => { H.cardTitle = $("sh-card").value.trim() || "Sign in"; upd(); };
  [["sh-name", "showName"], ["sh-grade", "showGrade"], ["sh-nav", "showNav"], ["sh-motion", "motion"]].forEach(([id, k]) => { const el = $(id); el.checked = H[k] !== false; el.onchange = () => { H[k] = el.checked; upd(); }; });
  const seg = (id, key, after) => { const box = $(id); const sync = () => box.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === H[key] ? "true" : "false")); box.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { H[key] = b.dataset.v; sync(); after && after(); upd(); }); sync(); };
  const showBg = () => ["drawing", "photo", "color"].forEach(k => $("sh-bg-" + k).classList.toggle("hidden", H.bg !== k));
  seg("sh-bg", "bg", showBg); showBg();
  seg("sh-layout", "layout");
  const acc = $("sh-accent"); const syncAcc = () => acc.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === H.accent ? "true" : "false"));
  acc.querySelectorAll("button").forEach(b => b.onclick = () => { H.accent = b.dataset.v; syncAcc(); upd(); }); syncAcc();
  $("sh-color").value = H.color || "#14213d"; $("sh-color").oninput = () => { H.color = $("sh-color").value; upd(); };
  $("sh-dim").value = H.dim == null ? 1 : H.dim; $("sh-dim").oninput = () => { H.dim = +$("sh-dim").value; upd(); };
  const pmsg = $("sh-photo-msg");
  $("sh-photo-btn").onclick = () => $("sh-photo").click();
  $("sh-photo-remove").classList.toggle("hidden", !(H.photo || homePhotoData));
  $("sh-photo-remove").onclick = () => { H.photo = ""; homePhotoBlob = null; homePhotoData = ""; H.bg = "drawing"; homePageControls(); upd(); };
  $("sh-photo").onchange = async () => {
    const file = $("sh-photo").files[0]; $("sh-photo").value = ""; if (!file) return;
    pmsg.textContent = "Getting the photo ready…";
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      const s = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      homePhotoData = cv.toDataURL("image/jpeg", 0.82);
      homePhotoBlob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.82));
      H.bg = "photo"; homePageControls(); upd();
      pmsg.textContent = `✓ Photo ready (${Math.round(homePhotoBlob.size / 1024)} KB). Click Save & Publish to put it on the website.`;
    } catch { pmsg.textContent = "That file couldn't be opened as a picture. Try a JPG or PNG."; }
  };
  if (homePhotoBlob) pmsg.textContent = "✓ New photo ready — click Save & Publish to put it on the website.";
  else if (H.photo) pmsg.textContent = "Using your uploaded photo.";
  $("sh-reset").onclick = () => {
    if (!confirm("Put the home page back to the original look? (Your name and heading stay.)")) return;
    const keep = H.photo; Object.assign(H, { blurb: "Classwork, homework, news and programs for our class families — all in one place. Please sign in to continue.", cardTitle: "Sign in", footer: "", showName: true, showGrade: true, showNav: true, bg: "drawing", motion: true, color: "#14213d", dim: 1, layout: "right", accent: "navy" }); H.photo = keep;
    homePageControls(); upd();
  };
  homePreview();
}

function renderAll() {
  homePageControls();
  settingsControls();
  lockControls();
  parentAccountControls();
  accessControls();
  bannersPanel();
  classworkPanel();
  assignmentPanel("homework", true);
  postListPanel("news", NEWS_CFG);
  postListPanel("programs", PROGRAMS_CFG);
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== "panel-" + tab.dataset.tab));
    if (tab.dataset.tab === "access") showParentList();
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
  if (content.settings.parentAccounts.on && !content.settings.parentAccounts.apiKey) {
    msg.className = "msg err";
    msg.textContent = "Paste your Firebase Web API key (Parent Profiles) or switch Parent Profiles off before saving.";
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (content.settings.siteLock.on && !content.settings.siteLock.hash) {
    msg.className = "msg err";
    msg.textContent = "Set a website password (Site Settings) or turn the lock off before saving.";
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!token && !(await askPasswordForKey())) return;
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

    // 1b. New home page photo
    if (homePhotoBlob) {
      msg.textContent = "Uploading the home page photo…";
      const path = `uploads/home-photo-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.jpg`;
      await gh(contentsPath(path), { method: "PUT", body: JSON.stringify({ message: "Home page photo", content: await fileToBase64(homePhotoBlob), branch }) });
      content.settings.home.photo = path; homePhotoBlob = null;
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

/* ---------------- start ----------------
   No separate lock: if you're signed in to the Teacher Area this page just opens.
   If not, it shows the same Teacher Area sign-in as every other teacher page. */
async function teacherIsSignedIn() {
  const lk = await fetchSiteLock(); if (!lk || !lk.salt) return false;
  try { return (localStorage.getItem("classroom_teacher_unlocked") || sessionStorage.getItem("classroom_teacher_unlocked")) === lk.salt; } catch { return false; }
}
async function openFromWebsite() {          // signed in to the Teacher Area, but this device has no GitHub key yet
  try { content = normalize(await loadContent()); } catch { content = normalize({}); }
  openEditor();
}
function teacherGate() {
  showOnly(null);
  let key = null;
  const foot = document.createElement("p"); foot.className = "gate-foot";
  const a = document.createElement("a"); a.href = "index.html"; a.textContent = "← Back to sign in"; foot.appendChild(a);
  showGate({
    title: "Teacher Area", sub: "Enter your Teacher Area password.",
    check: async pw => { const t = await unlockWithPassword(pw); if (!t) return null; key = t; const lk = await fetchSiteLock(); return (lk && lk.salt) || "1"; },
    storeKey: "classroom_teacher_unlocked",
    after: remember => saveToken(key, remember),
    footer: foot,
    reveal: async () => { try { await connect(key); openEditor(); } catch (e) { showOnly("signin"); $("signin-msg").textContent = "Couldn't connect to GitHub: " + e.message; } }
  });
}
(async () => {
  const saved = readToken();
  if (saved) {
    try { await connect(saved); openEditor(); return; }
    catch (e) { token = null; if (e.status === 401) forgetToken(); }
  }
  if (location.hash === "#key") return;                    // backup sign-in with a GitHub key
  // Signed in to the Teacher Area already: open right away, no second password.
  // (If this device has no working GitHub key, the password is asked once, only when you press Save & Publish.)
  if (await teacherIsSignedIn()) { await openFromWebsite(); return; }
  // (signed in to the Teacher Area always includes the key now, so this page opened above;
  //  anyone else gets the same Teacher Area sign-in as every teacher page)
  if (await fetchSiteLock()) teacherGate();               // otherwise the first-time setup screen stays
})();

// Publishing needs the GitHub key; ask for the Teacher Area password only if this device doesn't have it yet.
function askPasswordForKey() {
  return new Promise(resolve => {
    const overlay = document.createElement("div"); overlay.className = "pl-overlay";
    overlay.innerHTML = '<form class="pl-form" style="max-width:440px"><div class="pl-form-head"><div><small>One more step</small><h2>Confirm your password</h2></div></div><p>To publish changes to the website, type your Teacher Area password once on this device.</p><input type="password" autocomplete="current-password" placeholder="Password" aria-label="Password"><label class="check-line"><input type="checkbox"> Keep me signed in on this device</label><p class="status err"></p><div class="pl-actions"><button type="button" class="button secondary">Cancel</button><button type="submit" class="button">Continue</button></div></form>';
    document.body.appendChild(overlay);
    const f = overlay.querySelector("form"), pw = f.querySelector("input[type=password]"), rem = f.querySelector("input[type=checkbox]"), msg = f.querySelector(".status");
    addPasswordToggles(overlay); pw.focus();
    f.querySelector(".button.secondary").onclick = () => { overlay.remove(); resolve(null); };
    f.onsubmit = async e => {
      e.preventDefault(); msg.textContent = "Checking…";
      const t = await unlockWithPassword(pw.value).catch(() => null);
      if (!t) { msg.textContent = "That password isn't right."; pw.select(); return; }
      try { token = t.trim(); const repo = await gh(`/repos/${OWNER}/${REPO}`); branch = repo.default_branch || "main"; }
      catch (er) { msg.textContent = "Couldn't connect to GitHub: " + er.message; return; }
      saveToken(token, rem.checked); overlay.remove(); resolve(token);
    };
  });
}

addPasswordToggles(document);

// Hidden backup: open the portal as …/portal.html#key to sign in with a GitHub key.
function checkKeyHash() {
  if (location.hash === "#key" && !$("signin").classList.contains("hidden")) showOnly("keysignin");
}
checkKeyHash();
window.addEventListener("hashchange", checkKeyHash);
if (window.TeacherSections) TeacherSections.navBar(location.hash === "#settings" ? "Settings" : "Parent Portal Settings");

// Shared helpers used by every page.

// Parent Portal home page wording (set in the Teacher Portal)
function applyHomeText(t) {
  document.querySelectorAll("[data-hp]").forEach(el => {
    const v = (t[el.dataset.hp] || "").trim();
    if (el.dataset.hp === "message") { el.textContent = v; el.classList.toggle("hidden", !v); }
    else if (v) el.textContent = v;
  });
}

// Teacher name & welcome text: set in the Teacher Portal (falls back to data.js).
function applyGrade(grade) {
  grade = (grade || "").trim();
  document.querySelectorAll("[data-grade]").forEach(el => { el.textContent = grade; });
  document.querySelectorAll("[data-grade-wrap]").forEach(el => { el.hidden = !grade; });
}
function applyNames(name, welcome) {
  document.querySelectorAll("[data-teacher]").forEach(el => { el.textContent = name; });
  document.querySelectorAll("[data-welcome]").forEach(el => { el.textContent = welcome; });
  const mono = document.getElementById("ts-mono");
  if (mono && name) mono.textContent = name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join("").toUpperCase();
  document.title = document.title.replace(/Rabbi Eisgrau|\u2013 .*$/, m => m.startsWith("\u2013") ? "\u2013 " + name : name);
}
// Pages stay hidden until we know whether the site is locked (see showSiteGate).
const IS_PORTAL = /portal\.html$/.test(location.pathname);
// Locks: the Parent Portal pages use the website password (set in the portal, can be off);
// the teacher side (main site, Classroom Tools, Teacher Tools) uses the Teacher Portal password.
const SIGNIN_PAGE = !window.OFFLINE_COPY && /(^|\/)(index\.html)?$/.test(location.pathname);
// a downloaded copy of a Teacher Area page (works with no internet — see offline.js)
const OFFLINE_COPY = window.OFFLINE_COPY || null;
const TEACHER_PAGE = !!OFFLINE_COPY || /(^|\/)(teacher\.html|classroom\.html|teacher-tools\.html)$/.test(location.pathname);
const NO_LOCK = IS_PORTAL || TEACHER_PAGE || SIGNIN_PAGE;
if (!IS_PORTAL && !SIGNIN_PAGE) document.documentElement.classList.add("gate-wait");

// When the teacher is looking at the Parent Portal, offer a quick way back.
function teacherBackButton() {
  let t = null; try { t = localStorage.getItem("classroom_teacher_unlocked") || sessionStorage.getItem("classroom_teacher_unlocked"); } catch {}
  if (!t || document.querySelector(".teacher-back")) return;
  const a = el("a", "teacher-back");
  a.href = "teacher.html";
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>Back to Teacher Area</span>';
  a.title = "You're viewing the Parent Portal as the teacher";
  a.querySelector("span").textContent = "Teacher Area";
  // top-left: next to the Home button in the top bar, or the corner of the Parent Portal home page
  const bar = document.querySelector(".topbar"), home = bar && bar.querySelector(".home-btn");
  if (home) { const left = el("div", "tb-left"); home.parentNode.insertBefore(left, home); left.append(a, home); a.classList.add("in-bar"); }
  else { a.classList.add("corner"); document.body.appendChild(a); }
}
document.addEventListener("DOMContentLoaded", () => {
  if (IS_PORTAL) return;
  if (!TEACHER_PAGE && !SIGNIN_PAGE) teacherBackButton();
  applyNames(SITE.teacherName, SITE.welcome);
  applyGrade(SITE.grade);
  if (TEACHER_PAGE) checkTeacherLock();
  loadContent().then(async c => {
    applyNames(c.settings.teacherName, c.settings.welcome);
    applyGrade(c.settings.grade);
    applyHomeText(c.settings.homeText);
    showBanners(c);
    if (!NO_LOCK) await checkSiteLock(c);
  }).catch(() => { if (!TEACHER_PAGE) document.documentElement.classList.remove("gate-wait"); });
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
  const pa = c.settings.parentAccounts;
  if (pa && pa.on && pa.apiKey) return ParentAccounts.check(c, reveal);
  if (!lock || !lock.on || !lock.hash) return reveal();
  if (readUnlock() === lock.hash) { classSignOutButton(); return reveal(); }
  try { if (localStorage.getItem("classroom_teacher_unlocked") || sessionStorage.getItem("classroom_teacher_unlocked")) return reveal(); } catch {}
  showSiteGate(c, lock, reveal);
}
function showSiteGate(c, lock, reveal) {
  showGate({
    title: c.settings.teacherName,
    sub: "This class website is private. Please enter the password.",
    check: async pw => { const h = await hashSitePassword(pw, lock.salt, lock.iterations); return h === lock.hash ? h : null; },
    storeKey: UNLOCK_KEY,
    reveal: () => { classSignOutButton(); reveal(); }
  });
}

// A full-screen password screen. `check(pw)` returns a value to remember, or null if wrong.
function showGate(opt) {
  const gate = el("div", "site-gate");
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  const box = el("form", "gate-box");
  box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  box.appendChild(el("h1", "gate-title", opt.title));
  box.appendChild(el("p", "gate-sub", opt.sub));
  const input = el("input"); input.type = "password"; input.placeholder = "Password"; input.autocomplete = "current-password";
  input.setAttribute("aria-label", "Password");
  const remLab = el("label", "gate-remember");
  const rem = el("input"); rem.type = "checkbox";
  remLab.append(rem, document.createTextNode(" Remember this device"));
  const btn = el("button", "gate-btn", "Enter"); btn.type = "submit";
  const msg = el("p", "gate-msg");
  box.append(input, remLab, btn, msg);
  if (opt.footer) box.appendChild(opt.footer);
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
      const ok = await opt.check(input.value);
      if (!ok) { msg.textContent = "That password isn't right. Please try again."; input.select(); return; }
      try { (rem.checked ? localStorage : sessionStorage).setItem(opt.storeKey, ok); } catch {}
      if (opt.after) opt.after(rem.checked);
      gate.remove();
      opt.reveal();
    } catch { msg.textContent = "That password isn't right. Please try again."; }
    finally { btn.disabled = false; btn.textContent = "Enter"; }
  });
}

/* ---------------- Parent list (Firestore) ----------------
   When the teacher has set up the parent list, each parent's profile (name, child, email,
   last visit) is saved here, and blocked parents are refused. Only the teacher can read the list. */
const ParentRegistry = (() => {
  const base = pid => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(pid)}/databases/(default)/documents`;
  async function fs(pid, token, method, path, body) {
    const r = await fetch(base(pid) + "/" + path, { method, headers: Object.assign({ Authorization: "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j, error: (j.error && (j.error.status || j.error.message)) || "", message: (j.error && j.error.message) || "" };
  }
  async function sha(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text).trim().toLowerCase()));
    return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
  }
  const val = v => typeof v === "boolean" ? { booleanValue: v } : v instanceof Date ? { timestampValue: v.toISOString() } : { stringValue: String(v == null ? "" : v) };
  const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
  function fromDoc(d) {
    const o = { id: d.name.split("/").pop() };
    Object.entries(d.fields || {}).forEach(([k, v]) => { o[k] = "stringValue" in v ? v.stringValue : "booleanValue" in v ? v.booleanValue : "timestampValue" in v ? v.timestampValue : "integerValue" in v ? +v.integerValue : null; });
    return o;
  }
  async function patch(pid, token, path, obj) {
    const mask = Object.keys(obj).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
    return fs(pid, token, "PATCH", path + "?" + mask, { fields: toFields(obj) });
  }
  // Is this parent blocked? (by account or by email)
  async function isBlocked(pid, sess) {
    for (const id of [sess.uid, await sha(sess.email)]) {
      if (!id) continue;
      const r = await fs(pid, sess.idToken, "GET", "blocked/" + id);
      if (r.ok) return true;
    }
    return false;
  }
  // Save the visit. Returns "blocked", "ok" or "off" (no parent list set up).
  async function touch(pa, sess, extra, force) {
    if (!pa || !pa.projectId || !sess || !sess.idToken || !sess.uid || !(window.crypto && crypto.subtle)) return "off";
    const KEY = "classroom_parent_touch";
    try { if (!force && Date.now() - (+sessionStorage.getItem(KEY) || 0) < 5 * 60 * 1000) return "ok"; } catch {}
    try {
      if (await isBlocked(pa.projectId, sess)) return "blocked";
      const r = await patch(pa.projectId, sess.idToken, "parents/" + sess.uid, Object.assign({ email: sess.email, lastSeen: new Date(), signedIn: true }, sess.name ? { accountName: sess.name } : {}, extra || {}));
      if (r.ok) { try { sessionStorage.setItem(KEY, String(Date.now())); } catch {} }
      return r.ok ? "ok" : "off";
    } catch { return "off"; }
  }
  async function signedOut(pa, sess) {
    if (!pa || !pa.projectId || !sess || !sess.uid || !sess.idToken) return;
    try { await patch(pa.projectId, sess.idToken, "parents/" + sess.uid, { signedIn: false, lastSeen: new Date() }); } catch {}
    try { sessionStorage.removeItem("classroom_parent_touch"); } catch {}
  }
  return { fs, sha, patch, fromDoc, toFields, touch, signedOut, isBlocked };
})();

/* The user button (bottom-right of the Parent Portal) and its menu. */
const SIGNOUT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';
const KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M17 6l3 3M15 8l2 2"/></svg>';
function userMenuItem(text, icon, fn, cls) {
  const b = el("button", "parent-pill-item" + (cls ? " " + cls : ""), text); b.type = "button";
  b.insertAdjacentHTML("afterbegin", icon);
  b.addEventListener("click", fn);
  return b;
}
// The user button sits top-right: in the top bar instead of the teacher's name, or in the corner of the home page.
function placeUserPill(pill) {
  const bar = document.querySelector(".topbar");
  if (bar) {
    const brand = bar.querySelector(".brand"); if (brand) brand.classList.add("hidden");
    pill.classList.add("in-bar");
    bar.appendChild(pill);
  } else {
    pill.classList.add("corner");
    document.body.appendChild(pill);
  }
}
function wireUserMenu(pill, btn, menu) {
  btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
  const set = open => { menu.classList.toggle("hidden", !open); btn.setAttribute("aria-expanded", open ? "true" : "false"); };
  btn.addEventListener("click", () => set(menu.classList.contains("hidden")));
  document.addEventListener("click", e => { if (!pill.contains(e.target)) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
}
function classSignOutButton() {
  if (document.querySelector(".parent-pill")) return;
  const pill = el("div", "parent-pill");
  const b = el("button", "parent-pill-btn"); b.type = "button";
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
  b.appendChild(el("span", null, "Class family"));
  const menu = el("div", "parent-pill-menu hidden");
  menu.appendChild(el("p", "parent-pill-email", "Signed in with the class password"));
  menu.appendChild(userMenuItem("Sign out", SIGNOUT_ICON, () => { try { localStorage.removeItem(UNLOCK_KEY); sessionStorage.removeItem(UNLOCK_KEY); } catch {} location.href = "index.html"; }, "danger"));
  wireUserMenu(pill, b, menu);
  pill.append(b, menu);
  placeUserPill(pill);
}

/* ---------------- Parent accounts (Firebase Authentication, email + password) ----------------
   Each parent makes a profile with their own password; "Forgot password?" emails a reset link.
   Uses Firebase's public sign-in web service directly; only the web API key is needed. */
const ParentAccounts = (() => {
  const STORE = "classroom_parent_session";
  const ERR = {
    EMAIL_EXISTS: "There's already a profile with that email. Try signing in, or use “Forgot password?”.",
    INVALID_EMAIL: "Please check the email address.",
    WEAK_PASSWORD: "Please choose a password with at least 6 characters.",
    EMAIL_NOT_FOUND: "That email or password isn't right.",
    INVALID_PASSWORD: "That email or password isn't right.",
    INVALID_LOGIN_CREDENTIALS: "That email or password isn't right.",
    USER_DISABLED: "This profile has been turned off. Please contact the teacher.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Please wait a few minutes and try again.",
    MISSING_PASSWORD: "Please type a password.",
    OPERATION_NOT_ALLOWED: "Parent sign-in isn't switched on yet. Please contact the teacher."
  };
  let apiKey = "", currentPA = null;
  const BLOCKED_MSG = "Your access to the Parent Portal has been turned off. Please contact the teacher.";
  function blockedScreen(c) {
    const gate = el("div", "site-gate"); const box = el("div", "gate-box");
    box.append(el("h1", "gate-title", c.settings.teacherName), el("p", "gate-sub", BLOCKED_MSG));
    const a = el("a", "gate-btn", "Back to the home page"); a.href = "index.html"; a.style.textDecoration = "none"; a.style.display = "block"; a.style.textAlign = "center";
    box.appendChild(a); gate.appendChild(box); document.body.appendChild(gate);
    document.documentElement.classList.remove("gate-wait");
  }
  async function call(path, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = ((j.error && j.error.message) || "ERROR").split(" ")[0].split(":")[0];
      const e = new Error(ERR[code] || "Something went wrong (" + code + "). Please try again."); e.code = code; e.raw = (j.error && j.error.message) || ""; throw e;
    }
    return j;
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || sessionStorage.getItem(STORE) || "null"); } catch { return null; } };
  const save = (sess, remember) => { try { (remember ? localStorage : sessionStorage).setItem(STORE, JSON.stringify(sess)); } catch {} };
  const clear = () => { try { localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); } catch {} };

  // A saved session is checked with Firebase, so a removed or turned-off profile is signed out.
  async function stillValid(sess) {
    try {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(sess.refreshToken)
      });
      if (r.ok) {
        const j = await r.json(); sess.refreshToken = j.refresh_token || sess.refreshToken; sess.idToken = j.id_token || sess.idToken; sess.uid = j.user_id || sess.uid;
        try { (localStorage.getItem(STORE) ? localStorage : sessionStorage).setItem(STORE, JSON.stringify(sess)); } catch {}
        return true;
      }
      return false;
    } catch { return true; }          // offline: let them in with their saved session
  }

  function badge(sess) {
    const pill = el("div", "parent-pill");
    const b = el("button", "parent-pill-btn");
    b.type = "button";
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
    const m = (sess.name || "").match(/^(.*?)\s*(?:\(parent of (.*)\))?$/) || [];
    b.appendChild(el("span", null, (m[1] || "").trim() || sess.email));
    const menu = el("div", "parent-pill-menu hidden");
    const who = el("div", "parent-pill-who");
    if (m[1]) who.appendChild(el("strong", null, m[1].trim()));
    if (m[2]) who.appendChild(el("span", null, "Parent of " + m[2].trim()));
    who.appendChild(el("small", null, sess.email));
    menu.appendChild(who);
    const signOut = async () => { await ParentRegistry.signedOut(currentPA, read() || sess); clear(); location.href = "index.html"; };
    const out = userMenuItem("Sign out", SIGNOUT_ICON, signOut, "danger");
    const pw = userMenuItem("Change password", KEY_ICON, async () => {
      try { await call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email: sess.email }); alert("We emailed you a link to choose a new password: " + sess.email); }
      catch (e) { alert(e.message); }
    });
    menu.append(pw, out);
    wireUserMenu(pill, b, menu);
    pill.append(b, menu);
    placeUserPill(pill);
  }

  async function check(c, reveal) {
    const pa = c.settings.parentAccounts;
    apiKey = pa.apiKey;
    currentPA = pa;
    const sess = read();
    if (sess && sess.refreshToken && await stillValid(sess)) {
      const t = await ParentRegistry.touch(pa, sess);
      if (t === "blocked") { clear(); return blockedScreen(c); }
      badge(sess); return reveal();
    }
    try { if (localStorage.getItem("classroom_teacher_unlocked") || sessionStorage.getItem("classroom_teacher_unlocked")) return reveal(); } catch {}
    if (sess) clear();
    showLogin(c, reveal);
  }

  function showLogin(c, reveal) {
    const pa = c.settings.parentAccounts, lock = c.settings.siteLock;
    const needCode = pa.requireCode && lock && lock.hash;
    const gate = el("div", "site-gate");
    gate.setAttribute("role", "dialog"); gate.setAttribute("aria-modal", "true");
    const box = el("form", "gate-box parent-box");
    gate.appendChild(box);
    document.body.appendChild(gate);
    const field = (type, ph, ac) => { const i = el("input"); i.type = type; i.placeholder = ph; i.setAttribute("aria-label", ph); if (ac) i.autocomplete = ac; return i; };
    const link = (text, fn) => { const a = el("button", "gate-link", text); a.type = "button"; a.addEventListener("click", fn); return a; };
    const links = (...items) => { const d = el("div", "gate-links"); d.append(...items); return d; };
    let mode = location.hash === "#signup" ? "signup" : location.hash === "#forgot" ? "forgot" : "signin";
    function render() {
      box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
      box.appendChild(el("h1", "gate-title", c.settings.teacherName));
      const msg = el("p", "gate-msg");
      const btn = el("button", "gate-btn"); btn.type = "submit";
      const rem = el("input"); rem.type = "checkbox";
      const remLab = el("label", "gate-remember"); remLab.append(rem, document.createTextNode(" Keep me signed in on this device"));
      let submit;
      if (mode === "signin") {
        box.appendChild(el("p", "gate-sub", "Parent Portal — sign in to your profile."));
        const email = field("email", "Email", "email"), pw = field("password", "Password", "current-password");
        btn.textContent = "Sign in";
        box.append(email, pw, remLab, btn, msg,
          links(link("Forgot password?", () => { mode = "forgot"; render(); }), link("Create a profile", () => { mode = "signup"; render(); })));
        submit = async () => {
          const j = await call("accounts:signInWithPassword", { email: email.value.trim(), password: pw.value, returnSecureToken: true });
          const s = { email: j.email, name: j.displayName || "", refreshToken: j.refreshToken, idToken: j.idToken, uid: j.localId };
          const t = await ParentRegistry.touch(pa, s, null, true);
          if (t === "blocked") throw new Error(BLOCKED_MSG);
          save(s, rem.checked);
          gate.remove(); badge(s); reveal();
        };
        setTimeout(() => email.focus(), 0);
      } else if (mode === "signup") {
        box.appendChild(el("p", "gate-sub", "Create your Parent Portal profile with your own password."));
        const name = field("text", "Your name", "name"), child = field("text", "Your child's name", "off");
        const email = field("email", "Email", "email"), pw = field("password", "Choose a password (6+ characters)", "new-password"), pw2 = field("password", "Type the password again", "new-password");
        const code = needCode ? field("password", "Class code (from the teacher)", "off") : null;
        btn.textContent = "Create profile";
        box.append(name, child, email, pw, pw2); if (code) box.appendChild(code);
        box.append(remLab, btn, msg, links(link("I already have a profile", () => { mode = "signin"; render(); })));
        submit = async () => {
          if (!name.value.trim()) throw new Error("Please type your name.");
          if (pw.value !== pw2.value) throw new Error("The two passwords don't match.");
          if (code) {
            const h = await hashSitePassword(code.value, lock.salt, lock.iterations);
            if (h !== lock.hash) throw new Error("That class code isn't right. Please ask the teacher for it.");
          }
          const j = await call("accounts:signUp", { email: email.value.trim(), password: pw.value, returnSecureToken: true });
          const display = name.value.trim() + (child.value.trim() ? ` (parent of ${child.value.trim()})` : "");
          const u = await call("accounts:update", { idToken: j.idToken, displayName: display, returnSecureToken: true }).catch(() => ({}));
          const s = { email: j.email, name: display, refreshToken: u.refreshToken || j.refreshToken, idToken: u.idToken || j.idToken, uid: j.localId };
          const t = await ParentRegistry.touch(pa, s, { name: name.value.trim(), child: child.value.trim(), created: new Date() }, true);
          if (t === "blocked") throw new Error(BLOCKED_MSG);
          save(s, rem.checked);
          gate.remove(); badge(s); reveal();
        };
        setTimeout(() => name.focus(), 0);
      } else {
        box.appendChild(el("p", "gate-sub", "Forgot your password? Type your email and we'll send you a link to choose a new one."));
        const email = field("email", "Email", "email");
        btn.textContent = "Email me a reset link";
        box.append(email, btn, msg, links(link("Back to sign in", () => { mode = "signin"; render(); })));
        submit = async () => {
          if (!email.value.trim()) throw new Error("Please type your email.");
          try { await call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email: email.value.trim() }); }
          catch (e) { if (e.code !== "EMAIL_NOT_FOUND") throw e; }       // don't reveal whether an email has a profile
          msg.className = "gate-msg ok";
          msg.textContent = "If that email has a profile, a reset link is on its way. Check your inbox (and spam).";
        };
        setTimeout(() => email.focus(), 0);
      }
      addPasswordToggles(box);
      box.onsubmit = async e => {
        e.preventDefault();
        msg.className = "gate-msg"; msg.textContent = "";
        const label = btn.textContent; btn.disabled = true; btn.textContent = "Please wait…";
        try { await submit(); }
        catch (err) { msg.className = "gate-msg"; msg.textContent = err.message || "Something went wrong. Please try again."; }
        finally { btn.disabled = false; btn.textContent = label; }
      };
    }
    render();
  }
  async function signIn(key, email, password, remember) {
    apiKey = key;
    const j = await call("accounts:signInWithPassword", { email, password, returnSecureToken: true });
    save({ email: j.email, name: j.displayName || "", refreshToken: j.refreshToken, idToken: j.idToken, uid: j.localId }, remember);
    return j;
  }
  return { check, signIn, _call: call, _setKey: k => { apiKey = k; }, BLOCKED_MSG };
})();

/* ---------------- Teacher lock (main site, Classroom Tools, Teacher Tools) ----------------
   Uses the Teacher Portal password: it is right if it unlocks portal-key.json. */
const TEACHER_UNLOCK_KEY = "classroom_teacher_unlocked";
async function fetchTeacherLock() {
  try { const r = await fetch("portal-key.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return await r.json(); } catch {}
  try {
    const r = await fetch(`https://api.github.com/repos/${SITE.github.owner}/${SITE.github.repo}/contents/portal-key.json`,
      { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}
async function teacherPasswordOK(lock, pw) {
  const fromB64 = x => Uint8Array.from(atob(x), ch => ch.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: fromB64(lock.salt), iterations: lock.iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(lock.iv) }, key, fromB64(lock.data));   // throws if wrong
  return new TextDecoder().decode(plain) || true;      // the GitHub key it unlocks
}
// One sign-in for the whole Teacher Area: the same password also opens Parent Portal Settings and Settings.
const PORTAL_SESSION_KEY = "classroom_portal_session";
function rememberPortalKey(token, remember) {
  if (typeof token !== "string" || !token) return;
  try { (remember ? localStorage : sessionStorage).setItem(PORTAL_SESSION_KEY, token); (remember ? sessionStorage : localStorage).removeItem(PORTAL_SESSION_KEY); } catch {}
}
function teacherSignOut() {
  try { [localStorage, sessionStorage].forEach(s => { s.removeItem("classroom_teacher_unlocked"); s.removeItem("classroom_site_unlocked"); s.removeItem(PORTAL_SESSION_KEY); }); } catch {}
}
async function checkTeacherLock() {
  const reveal = () => document.documentElement.classList.remove("gate-wait");
  if (OFFLINE_COPY) return reveal();                    // a file on this computer — nothing to unlock
  const lock = await fetchTeacherLock();
  if (!lock || !lock.salt) return reveal();            // no Teacher Portal password set up yet
  let saved = null;
  try { saved = localStorage.getItem(TEACHER_UNLOCK_KEY) || sessionStorage.getItem(TEACHER_UNLOCK_KEY); } catch {}
  // one password for the whole teacher side: a sign-in also holds the key Settings and publishing need,
  // so an older sign-in without it is asked once more, and then never again
  let hasKey = false; try { hasKey = !!(localStorage.getItem(PORTAL_SESSION_KEY) || sessionStorage.getItem(PORTAL_SESSION_KEY)); } catch {}
  if (saved && saved === lock.salt && hasKey) return reveal();
  let unlockedKey = null;
  const footer = el("p", "gate-foot");
  const a = el("a", null, "← Back to sign in");
  a.href = "index.html";
  footer.appendChild(a);
  showGate({
    title: "Teacher Area",
    sub: "Enter your Teacher Portal password.",
    check: async pw => { const tok = await teacherPasswordOK(lock, pw); unlockedKey = tok; return tok ? lock.salt : null; },
    after: remember => rememberPortalKey(unlockedKey, remember),
    storeKey: TEACHER_UNLOCK_KEY,
    footer,
    reveal
  });
}

// Loads classwork / homework / news / banner (managed in the Teacher Portal).
let contentPromise = null;
function loadContent() {
  if (OFFLINE_COPY) return Promise.reject(new Error("offline copy"));
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
  c.settings.homeText = Object.assign({ message: "", classwork: "Classwork", homework: "Homework", news: "News", programs: "Programs", contact: "Contact" }, c.settings.homeText);
  if (c.settings.homeText.contact === "Contact Me") c.settings.homeText.contact = "Contact";   // old default
  c.settings.siteLock = Object.assign({ on: false, hash: "", salt: "", iterations: 150000 }, c.settings.siteLock);
  c.settings.parentAccounts = Object.assign({ on: false, apiKey: "", projectId: "", requireCode: true }, c.settings.parentAccounts);
  if (!c.settings.teacherName) c.settings.teacherName = SITE.teacherName;
  if (!c.settings.welcome) c.settings.welcome = SITE.welcome;
  // Contact details (Settings page in the Teacher Area); fall back to data.js.
  if (typeof c.settings.grade !== "string") c.settings.grade = SITE.grade || "";
  // the website's home (sign-in) page — Settings → Website Home Page
  c.settings.home = Object.assign({ blurb: "Classwork, homework, news and programs for our class families — all in one place. Please sign in to continue.", cardTitle: "Sign in", footer: "", showName: true, showGrade: true, showNav: true,
    bg: "drawing", motion: true, photo: "", color: "#14213d", dim: 1, layout: "right", accent: "navy" }, c.settings.home);
  ["phone", "contactEmail", "formEmail"].forEach(k => {
    if (typeof c.settings[k] !== "string") c.settings[k] = SITE[k] || "";
    if (c.settings[k] || k === "formEmail") SITE[k] = c.settings[k];
  });
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

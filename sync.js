/* ============================================================
   SYNC BETWEEN DEVICES (Teacher Area)
   Your class data (gradebook, phone log, student info, support log,
   class list, raffle, prizes, home page choices) is encrypted on this
   device and kept in your Firebase project, so it follows you to any
   computer or phone.

   - A random DATA KEY encrypts everything (AES-256-GCM).
   - The data key is locked twice: with your SYNC PASSPHRASE and with a
     RECOVERY KEY you save when you turn Sync on.
   - A device you've unlocked remembers the data key, so it can set a
     new passphrase without the old one.
   - Firebase only ever stores scrambled data and the locked keys.
   Firestore: collection "sync" (teacher-only rules), doc "_keys" + one doc per store.
   ============================================================ */
(function () {
  const STORES = [
    ["classroom_students_v1", "Class list"],
    ["teacher_gradebook_v1", "Gradebook"],
    ["teacher_phone_log_v1", "Phone log"],
    ["teacher_student_info_v1", "Student info"],
    ["teacher_support_v1", "Student support"],
    ["classroom_raffle_v1", "Raffle"],
    ["teacher_prizes_v1", "Prize boxes"],
    ["teacher_home_v1", "Home page choices"],
    ["teacher_sections_v1", "Section settings"],
    ["teacher_birthdays_v1", "Birthdays (old)"]
  ];
  const TRACK = new Set(STORES.map(s => s[0]));
  const DK_KEY = "teacher_sync_dk", STATE_KEY = "teacher_sync_state", CONFLICTS = "teacher_sync_conflicts", FB = "teacher_firebase_session", UNDO = "teacher_sync_undo";
  const PASS_ITER = 600000, REC_ITER = 200000, PART = 700000;
  const ls = window.localStorage;
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const lsSet = (k, v) => { try { rawSet.call(ls, k, v); } catch {} };
  const lsDel = k => { try { rawRemove.call(ls, k); } catch {} };
  const lsGet = k => { try { return ls.getItem(k); } catch { return null; } };
  const readJSON = (k, d) => { try { const v = JSON.parse(lsGet(k) || "null"); return v == null ? d : v; } catch { return d; } };

  /* ---------- notice local changes ---------- */
  let applying = false, pushTimer = null;
  function state() { const s = readJSON(STATE_KEY, {}); s.stores = s.stores || {}; return s; }
  function saveState(s) { lsSet(STATE_KEY, JSON.stringify(s)); }
  function touched(key) {
    if (applying || !TRACK.has(key)) return;
    const s = state(); (s.stores[key] = s.stores[key] || {}).localTime = Date.now(); saveState(s);
    if (lsGet(DK_KEY)) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow({ quiet: true }), 2500); setBadge("pending"); }
  }
  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === ls) touched(k); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === ls) touched(k); };

  /* ---------- small helpers ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  function hash(str) { if (str == null) return "∅"; let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + "." + str.length; }
  async function gzip(u8) {
    if (!window.CompressionStream) return { data: u8, gz: false };
    const out = await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    return { data: new Uint8Array(out), gz: true };
  }
  async function gunzip(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()); }

  /* ---------- keys ---------- */
  async function kek(secret, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function lock(rawKey, secret, iter) {
    const salt = rand(16), iv = rand(12), k = await kek(secret, salt, iter);
    return { salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, rawKey))), iter };
  }
  async function unlock(box, secret) {
    const k = await kek(secret, unb64(box.salt), +box.iter);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, k, unb64(box.ct)));   // throws if wrong
  }
  const dataKey = raw => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  // recovery key: 25 random characters in groups of 5, no look-alike letters
  const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function newRecovery() { const r = rand(25); let s = ""; for (let i = 0; i < 25; i++) s += ALPH[r[i] % ALPH.length]; return s.match(/.{5}/g).join("-"); }
  const normRec = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  async function encryptStr(raw, text) {
    const z = await gzip(enc.encode(text)), iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await dataKey(raw), z.data));
    return { iv: b64(iv), ct: b64(ct), gz: z.gz };
  }
  async function decryptStr(raw, o) {
    let u8 = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, await dataKey(raw), unb64(o.ct)));
    if (o.gz) u8 = await gunzip(u8);
    return dec.decode(u8);
  }
  const deviceKey = () => { const v = lsGet(DK_KEY); return v ? unb64(v) : null; };

  /* ---------- Firebase (teacher account + Firestore) ---------- */
  let PA = null;
  async function project() {
    if (PA) return PA;
    try { const c = typeof content !== "undefined" && content && content.settings ? content : await loadContent(); PA = c.settings.parentAccounts || {}; } catch { PA = {}; }
    return PA;
  }
  async function token() {
    const pa = await project(); const s = readJSON(FB, null);
    if (!pa.apiKey || !s || !s.refreshToken) return null;
    if (s.idToken && s.exp && s.exp > Date.now() + 60000) return s;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(pa.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken) });
    if (!r.ok) return null;
    const j = await r.json(); s.idToken = j.id_token; s.refreshToken = j.refresh_token; s.uid = j.user_id; s.exp = Date.now() + (+j.expires_in || 3600) * 1000;
    lsSet(FB, JSON.stringify(s)); return s;
  }
  async function idt(path, body) {
    const pa = await project();
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(pa.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const code = ((j.error && j.error.message) || "ERROR").split(" ")[0].split(":")[0]; const e = new Error(FBERR[code] || "Firebase said: " + code); e.code = code; throw e; }
    return j;
  }
  const FBERR = { EMAIL_EXISTS: "There's already an account with that email — use Sign in.", INVALID_EMAIL: "Please check the email address.", WEAK_PASSWORD: "Please choose a password with at least 6 characters.", EMAIL_NOT_FOUND: "That email or password isn't right.", INVALID_PASSWORD: "That email or password isn't right.", INVALID_LOGIN_CREDENTIALS: "That email or password isn't right. (New here? Use “Create my teacher account”.)", TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Please wait a few minutes.", OPERATION_NOT_ALLOWED: "Email/Password sign-in is switched off in Firebase (Security → Authentication → Sign-in method)." };
  async function db(method, path, body) { const pa = await project(), t = await token(); if (!t) throw Object.assign(new Error("Not signed in to Firebase"), { code: "SIGNIN" }); return ParentRegistry.fs(pa.projectId, t.idToken, method, path, body); }
  const F = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? { integerValue: String(Math.round(v)) } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) }])) });
  const fromDoc = d => ParentRegistry.fromDoc(d);
  const deviceName = () => { let n = lsGet("teacher_sync_device"); if (!n) { n = (/iPhone|iPad|Android/i.test(navigator.userAgent) ? "Phone/tablet " : "Computer ") + Math.random().toString(36).slice(2, 6).toUpperCase(); lsSet("teacher_sync_device", n); } return n; };

  async function getKeys() { const r = await db("GET", "sync/_keys"); if (r.ok) return fromDoc(r.json); if (r.status === 404 && !/database/i.test(r.message)) return null; throw problem(r); }
  function problem(r) {
    const t = (r.error || "") + " " + (r.message || "");
    const e = new Error(/database|does not exist/i.test(t) ? "Firestore isn't set up yet in your Firebase project." : /PERMISSION/i.test(t) ? "Firebase's rules don't allow Sync yet — paste the updated rules (below) and Publish." : "Firebase problem: " + (r.message || r.status));
    e.code = /database|does not exist/i.test(t) ? "NODB" : /PERMISSION/i.test(t) ? "RULES" : "OTHER"; return e;
  }
  async function saveKeys(raw, passBox, recBox) {
    const check = await encryptStr(raw, "sync-ok");
    const o = { v: 1, created: Date.now(), by: deviceName(), checkIv: check.iv, checkCt: check.ct, checkGz: check.gz };
    ["salt", "iv", "ct", "iter"].forEach(k => { o["pass_" + k] = passBox[k]; o["rec_" + k] = recBox[k]; });
    const r = await db("PATCH", "sync/_keys", F(o)); if (!r.ok) throw problem(r);
  }
  async function keyMatches(raw, K) { try { return (await decryptStr(raw, { iv: K.checkIv, ct: K.checkCt, gz: K.checkGz })) === "sync-ok"; } catch { return false; } }
  const box = (K, p) => ({ salt: K[p + "_salt"], iv: K[p + "_iv"], ct: K[p + "_ct"], iter: K[p + "_iter"] });

  /* ---------- store upload / download ---------- */
  async function putStore(raw, key, text, updated) {
    const e = await encryptStr(raw, text == null ? "" : text);
    const parts = []; for (let i = 0; i < e.ct.length; i += PART) parts.push(e.ct.slice(i, i + PART));
    if (!parts.length) parts.push("");
    for (let i = 1; i < parts.length; i++) { const r = await db("PATCH", `sync/${key}~${i}`, F({ ct: parts[i] })); if (!r.ok) throw problem(r); }
    const r = await db("PATCH", "sync/" + key, F({ iv: e.iv, ct: parts[0], parts: parts.length, gz: e.gz, empty: text == null, updated, device: deviceName() }));
    if (!r.ok) throw problem(r);
  }
  async function readStore(raw, doc, all) {
    let ct = doc.ct || "";
    for (let i = 1; i < (+doc.parts || 1); i++) { const p = all[`${doc.id}~${i}`] || fromDoc((await db("GET", `sync/${doc.id}~${i}`)).json); ct += p.ct || ""; }
    const text = await decryptStr(raw, { iv: doc.iv, ct, gz: doc.gz });
    return doc.empty ? null : text;
  }
  async function listAll() {
    const out = {}; let tokenQ = "";
    do {
      const r = await db("GET", "sync?pageSize=100" + tokenQ); if (!r.ok) throw problem(r);
      (r.json.documents || []).map(fromDoc).forEach(d => out[d.id] = d);
      tokenQ = r.json.nextPageToken ? "&pageToken=" + encodeURIComponent(r.json.nextPageToken) : "";
    } while (tokenQ);
    return out;
  }
  function stash(key, text, why) {
    if (text == null) return;
    const list = readJSON(CONFLICTS, []);
    list.unshift({ key, label: (STORES.find(s => s[0] === key) || [key, key])[1], at: Date.now(), why, value: text });
    const keep = []; const per = {};
    for (const c of list) { per[c.key] = (per[c.key] || 0) + 1; if (per[c.key] <= 2) keep.push(c); }
    try { lsSet(CONFLICTS, JSON.stringify(keep.slice(0, 12))); } catch { lsSet(CONFLICTS, JSON.stringify(keep.slice(0, 3))); }
  }

  /* ---------- the sync itself ---------- */
  let running = null, lastError = "";
  async function syncNow(opt) { if (running) return running; running = doSync(opt || {}).finally(() => { running = null; }); return running; }
  async function doSync(opt) {
    const raw = deviceKey(); if (!raw) { setBadge(status()); return { off: true }; }
    setBadge("syncing");
    try {
      const all = await listAll();
      const K = all._keys;
      if (!K || !(await keyMatches(raw, K))) { lsDel(DK_KEY); setBadge("locked"); lastError = "Sync was reset from another device — unlock again with your passphrase."; return { locked: true }; }
      const s = state(); let applied = 0, pushed = 0; const before = [];
      for (const [key] of STORES) {
        const local = lsGet(key), m = s.stores[key] || {}, R = all[key];
        const localChanged = m.hash === undefined ? local != null : hash(local) !== m.hash;
        const remoteChanged = R && +R.updated > (+m.rev || 0);
        if (remoteChanged && !localChanged) {
          const text = await readStore(raw, R, all);
          if (text !== local) before.push({ key, value: local });
          applying = true; try { text == null ? rawRemove.call(ls, key) : rawSet.call(ls, key, text); } finally { applying = false; }
          s.stores[key] = { rev: +R.updated, hash: hash(text) }; applied++;
        } else if (localChanged && !remoteChanged) {
          const now = Date.now(); await putStore(raw, key, local, now);
          s.stores[key] = { rev: now, hash: hash(local) }; pushed++;
        } else if (localChanged && remoteChanged) {
          const text = await readStore(raw, R, all);
          if ((+m.localTime || 0) > +R.updated) {        // this device's change is newer: keep it, save the other copy
            stash(key, text, "older copy from " + (R.device || "another device"));
            const now = Date.now(); await putStore(raw, key, local, now); s.stores[key] = { rev: now, hash: hash(local) }; pushed++;
          } else {
            stash(key, local, "older copy from this device");
            before.push({ key, value: local });
            applying = true; try { text == null ? rawRemove.call(ls, key) : rawSet.call(ls, key, text); } finally { applying = false; }
            s.stores[key] = { rev: +R.updated, hash: hash(text) }; applied++;
          }
        }
      }
      s.last = Date.now(); saveState(s); lastError = "";
      // keep what this device had before, so the sync can be undone
      if (before.length) { try { lsSet(UNDO, JSON.stringify({ at: Date.now(), items: before })); } catch { lsSet(UNDO, JSON.stringify({ at: Date.now(), items: before.filter(b => (b.value || "").length < 500000) })); } }
      setBadge("on");
      if (applied && !opt.noReload && opt.reloadIfChanged) {
        try { if (!sessionStorage.getItem("teacher_sync_reloaded")) { sessionStorage.setItem("teacher_sync_reloaded", "1"); location.reload(); return { applied, pushed }; } } catch {}
      } else if (applied && !opt.quiet) toast("✓ Updated from your other device. Refresh the page to see it.");
      return { applied, pushed };
    } catch (e) {
      lastError = e.code === "SIGNIN" ? "Sign in to Firebase in Settings → Sync." : e.message || "Couldn't reach Firebase.";
      setBadge(navigator.onLine === false ? "offline" : "error");
      return { error: lastError };
    }
  }
  function status() { return lsGet(DK_KEY) ? "on" : readJSON(STATE_KEY, {}).enabled ? "locked" : "off"; }

  /* ---------- badge in the Teacher Area side menu, and toasts ---------- */
  let badge = null;
  const LABEL = { on: "Synced", syncing: "Syncing…", pending: "Saving…", locked: "Sync locked", error: "Sync problem", offline: "Offline — will sync later", off: "" };
  function setBadge(st) {
    if (!badge) { const side = document.querySelector(".ts-side .ts-out"); if (!side) return; badge = document.createElement("a"); badge.className = "ts-sync"; badge.href = "portal.html#settings"; side.parentNode.insertBefore(badge, side); }
    badge.className = "ts-sync " + st; badge.classList.toggle("hidden", st === "off");
    badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.75 3.75 0 0 0 7 19z"/>' + (st === "on" ? '<path d="M9.5 14.5l2 2 4-4"/>' : st === "locked" ? '<rect x="10" y="12.5" width="5" height="4" rx="1"/><path d="M11 12.5v-1a1.5 1.5 0 0 1 3 0v1"/>' : "") + '</svg><span></span>';
    badge.querySelector("span").textContent = LABEL[st] || "";
    badge.title = st === "on" ? "Last synced " + new Date(state().last || Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : lastError || LABEL[st];
  }
  function toast(t) { let el = document.getElementById("sync-toast"); if (el) el.remove(); el = document.createElement("div"); el.id = "sync-toast"; el.className = "pl-toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5000); }

  /* ---------- turning Sync on, unlocking, recovery ---------- */
  async function enable(pass) {
    const raw = rand(32), rec = newRecovery();
    await saveKeys(raw, await lock(raw, pass, PASS_ITER), await lock(raw, normRec(rec), REC_ITER));
    lsSet(DK_KEY, b64(raw));
    const s = state(); s.enabled = true; s.stores = {}; saveState(s);       // everything here gets uploaded
    return rec;
  }
  async function unlockWith(secret, isRecovery) {
    const K = await getKeys(); if (!K) throw new Error("Sync isn't turned on yet.");
    let raw;
    try { raw = await unlock(box(K, isRecovery ? "rec" : "pass"), isRecovery ? normRec(secret) : secret); }
    catch { throw new Error(isRecovery ? "That recovery key isn't right. Check each group of letters." : "That passphrase isn't right."); }
    lsSet(DK_KEY, b64(raw));
    const s = state(); s.enabled = true; saveState(s);
    return { raw, K };
  }
  async function setPassphrase(newPass, alsoNewRecovery) {
    const raw = deviceKey(); if (!raw) throw new Error("Unlock Sync on this device first.");
    const K = await getKeys(); if (!K || !(await keyMatches(raw, K))) throw new Error("Sync was reset from another device. Unlock again.");
    let rec = null, recBox = box(K, "rec");
    if (alsoNewRecovery) { rec = newRecovery(); recBox = await lock(raw, normRec(rec), REC_ITER); }
    await saveKeys(raw, newPass ? await lock(raw, newPass, PASS_ITER) : box(K, "pass"), recBox);
    return rec;
  }
  async function wipeCloud() { const all = await listAll(); for (const id of Object.keys(all)) await db("DELETE", "sync/" + id); }
  function forgetDevice() { lsDel(DK_KEY); const s = state(); s.enabled = false; s.stores = {}; saveState(s); setBadge("off"); }

  /* ---------- start on every Teacher Area page ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    if (!document.querySelector(".ts-side")) return;
    setBadge(status());
    if (!deviceKey()) return;
    await syncNow({ reloadIfChanged: true, quiet: true });
    try { sessionStorage.removeItem("teacher_sync_reloaded"); } catch {}
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow({ quiet: false }); else if (state().stores && Object.values(state().stores).some(x => x.localTime && x.localTime > (state().last || 0))) syncNow({ quiet: true }); });
    setInterval(() => { if (document.visibilityState === "visible") syncNow({ quiet: false }); }, 5 * 60 * 1000);
  });

  /* ================= Settings card ================= */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  let root = null;
  const pwField = (ph, ac) => h("input", { type: "password", placeholder: ph, autocomplete: ac || "new-password", "aria-label": ph });
  function checkPass(a, b) { if (a.length < 8) return "Use at least 8 characters — a short phrase works well, like “blue-apple-river-42”."; if (a !== b) return "The two passphrases don't match."; return ""; }
  function busy(btn, on, text) { btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || "Please wait…"; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; }

  // Undo the last sync on this device: put back what was here before it downloaded changes
  function undoBox() {
    const u = readJSON(UNDO, null);
    const lbl = k => (STORES.find(x => x[0] === k) || [k, k])[1];
    if (!u || !u.items || !u.items.length) return h("details", { class: "sync-more" }, h("summary", null, "Undo last sync"), h("p", { class: "help" }, "Nothing to undo — the last sync didn't change anything on this device."));
    return h("details", { class: "sync-more", open: true }, h("summary", null, "Undo last sync"),
      h("p", null, "The sync on ", h("b", null, new Date(u.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), " changed: ", h("b", null, u.items.map(i => lbl(i.key)).join(", ")), "."),
      h("p", { class: "help" }, "Undo puts back what this device had before that sync. The put-back version then syncs to your other devices (what's there now is kept under “Saved older copies”)."),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button secondary", onclick: async () => {
          if (!confirm("Undo the last sync and put back what this device had before?")) return;
          u.items.forEach(it => { stash(it.key, lsGet(it.key), "replaced by Undo last sync"); it.value == null ? ls.removeItem(it.key) : ls.setItem(it.key, it.value); });
          lsDel(UNDO);
          const r = await syncNow({ quiet: true });
          draw(r.error ? r.error : "✓ Undone. This device's earlier version is back and has been synced to your other devices.", !!r.error);
        } }, "Undo last sync"),
        h("button", { type: "button", class: "small-btn", onclick: () => { lsDel(UNDO); draw(); } }, "Keep it — forget the undo")));
  }
  function recoveryModal(rec, done) {
    const overlay = h("div", { class: "pl-overlay" });
    const ok = h("input", { type: "checkbox" }), go = h("button", { type: "button", class: "button", disabled: true, onclick: () => { overlay.remove(); done(); } }, "Continue");
    ok.addEventListener("change", () => go.disabled = !ok.checked);
    const text = `CLASS WEBSITE — SYNC RECOVERY KEY\n\n${rec}\n\nUse this if you ever forget your sync passphrase:\nTeacher Area → Settings → Sync → “Forgot passphrase? Use recovery key”.\nKeep it somewhere safe and private. Made ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;
    overlay.appendChild(h("div", { class: "pl-form sync-rec" },
      h("div", { class: "pl-form-head" }, h("div", null, h("small", null, "Save this now"), h("h2", null, "Your recovery key"))),
      h("p", null, "If you ever forget your sync passphrase, this key unlocks your data. ", h("b", null, "It's shown only now."), " Save it in two places — e.g. print it, and save it in your school Google Drive."),
      h("div", { class: "sync-rec-key" }, rec),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button secondary", onclick: async e => { try { await navigator.clipboard.writeText(rec); e.target.textContent = "✓ Copied"; } catch { e.target.textContent = "Select it and press Ctrl+C"; } } }, "Copy"),
        h("button", { type: "button", class: "button secondary", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "Sync recovery key.txt" }); document.body.appendChild(a); a.click(); a.remove(); } }, "Download"),
        h("button", { type: "button", class: "button secondary", onclick: () => { const w = window.open("", "_blank"); if (!w) return; w.document.write(`<pre style="font:16px/1.6 monospace;padding:40px;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`); w.document.close(); w.print(); } }, "Print")),
      h("label", { class: "check-line", style: "margin-top:14px" }, ok, " I saved my recovery key somewhere safe"),
      h("div", { class: "pl-actions" }, go)));
    document.body.appendChild(overlay);
  }

  async function draw(flash, isErr) {
    if (!root) return;
    root.innerHTML = "";
    const card = h("div", { class: "card sync-card" });
    root.appendChild(card);
    const head = (sub) => card.append(h("div", { class: "sync-head" }, h("span", { class: "sync-ico", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.75 3.75 0 0 0 7 19z"/><rect x="10" y="12.5" width="5" height="4" rx="1"/><path d="M11 12.5v-1a1.5 1.5 0 0 1 3 0v1"/></svg>' }),
      h("div", null, h("h2", { class: "section-title", style: "margin:0" }, "Sync Between Devices"), h("p", { class: "help", style: "margin:2px 0 0" }, sub))));
    const msg = h("p", { class: "status" + (flash ? (isErr ? " err" : " ok") : "") }, flash || "");
    const pa = await project();
    if (!pa.apiKey || !pa.projectId) {
      head("Use your gradebook, phone log and student info on any computer or phone.");
      card.append(h("p", null, "Sync uses your class's Firebase project. First connect Firebase: ", h("b", null, "Parent Portal Settings → Access & Wording → Parent Profiles"), " — paste the Web API key and Project ID and Save & Publish."));
      return;
    }
    head("Your class data, encrypted on this device, available on any computer or phone.");
    // 1. teacher's Firebase account
    let t = null; try { t = await token(); } catch {}
    if (!t) {
      const email = h("input", { type: "email", value: (readJSON(FB, null) || {}).email || SITE.contactEmail || "", "aria-label": "Your email", autocomplete: "username" });
      const pw = h("input", { type: "password", placeholder: "Password", "aria-label": "Password", autocomplete: "current-password" });
      const go = async create => {
        msg.className = "status"; msg.textContent = create ? "Creating your account…" : "Signing in…";
        try {
          const j = await idt(create ? "accounts:signUp" : "accounts:signInWithPassword", { email: email.value.trim(), password: pw.value, returnSecureToken: true });
          if (create) await idt("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken: j.idToken }).catch(() => {});
          lsSet(FB, JSON.stringify({ email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, apiKey: pa.apiKey, exp: Date.now() + 3500000 }));
          draw(create ? "We sent a confirmation link to " + j.email + ". Click it, then press “I clicked the link”." : "");
        } catch (e) { msg.className = "status err"; msg.textContent = e.message; }
      };
      card.append(h("p", null, "Step 1: sign in with your ", h("b", null, "teacher account"), " in the class Firebase project (the same one used on the Parents tab)."),
        h("div", { class: "two" }, h("div", { class: "field" }, h("label", null, "Your email"), email), h("div", { class: "field" }, h("label", null, "Password"), pw)),
        h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => go(false) }, "Sign in"), h("button", { type: "button", class: "button secondary", onclick: () => go(true) }, "Create my teacher account")), msg);
      return;
    }
    const look = await idt("accounts:lookup", { idToken: t.idToken }).catch(() => null);
    const verified = !!(look && look.users && look.users[0] && look.users[0].emailVerified);
    const who = h("div", { class: "plist-who" }, h("span", null, "Firebase account: ", h("b", null, t.email)),
      h("button", { type: "button", class: "small-btn", onclick: () => { lsDel(FB); draw(); } }, "Sign out of Firebase"));
    card.appendChild(who);
    if (!verified) {
      card.append(h("p", null, flash || ("Confirm your email first: click the link Firebase sent to " + t.email + ".")),
        h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => { const s = readJSON(FB, {}); s.exp = 0; lsSet(FB, JSON.stringify(s)); draw(); } }, "I clicked the link"),
          h("button", { type: "button", class: "small-btn", onclick: async () => { await idt("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken: t.idToken }).catch(() => {}); draw("Sent again — check spam too."); } }, "Send the link again")));
      return;
    }
    // 2. is Sync on in the cloud?
    let K;
    try { K = await getKeys(); }
    catch (e) {
      card.append(h("p", { class: "status err" }, e.message));
      if (window.ParentList && ParentList._t.rulesText) {
        const rules = ParentList._t.rulesText(t.email);
        card.append(h("ol", { class: "steps" },
          e.code === "NODB" ? h("li", null, "In Firebase open ", h("b", null, "Databases & Storage → Firestore"), " → ", h("b", null, "Create database"), " (Standard, production mode).") : null,
          h("li", null, "Open Firestore's ", h("b", null, "Rules"), " tab, replace everything with the rules below, and click ", h("b", null, "Publish"), "."),
          h("li", null, "Come back and click ", h("b", null, "Check again"), ".")),
          h("pre", { class: "plist-rules" }, rules),
          h("div", { class: "actions" }, h("button", { type: "button", class: "small-btn", onclick: async ev => { try { await navigator.clipboard.writeText(rules); ev.target.textContent = "✓ Copied"; } catch {} } }, "Copy rules"),
            h("button", { type: "button", class: "button", onclick: () => draw() }, "Check again")));
      }
      return;
    }
    const raw = deviceKey();
    if (raw && K && !(await keyMatches(raw, K))) { forgetDevice(); return draw("Sync was reset from another device. Unlock it here with the new passphrase.", true); }
    if (!K) {
      // turn on
      const p1 = pwField("Choose a sync passphrase"), p2 = pwField("Type it again");
      const btn = h("button", { type: "button", class: "button" }, "Turn on Sync");
      btn.addEventListener("click", async () => {
        const bad = checkPass(p1.value, p2.value); if (bad) { msg.className = "status err"; msg.textContent = bad; return; }
        busy(btn, true, "Locking your data…");
        try {
          const rec = await enable(p1.value);
          recoveryModal(rec, async () => { busy(btn, true, "Uploading…"); const r = await syncNow({ quiet: true }); draw(r.error ? r.error : `✓ Sync is on. ${r.pushed || 0} item${r.pushed === 1 ? "" : "s"} uploaded.`, !!r.error); });
        } catch (e) { busy(btn, false); msg.className = "status err"; msg.textContent = e.message; }
      });
      card.append(h("p", null, "Turn on Sync to use your class data on any computer or phone. Everything is ", h("b", null, "encrypted on this device"), " with a passphrase only you know, before it's saved in Firebase."),
        h("ul", { class: "sync-what" }, STORES.slice(0, 7).map(s => h("li", null, s[1]))),
        h("div", { class: "two" }, h("div", { class: "field" }, h("label", null, "Sync passphrase"), p1), h("div", { class: "field" }, h("label", null, "Type it again"), p2)),
        h("p", { class: "help", style: "margin-top:-6px" }, "At least 8 characters. Use something different from your other passwords. Next you'll get a recovery key to save, in case you forget it."),
        h("div", { class: "actions" }, btn), msg);
      addPasswordToggles(card);
      return;
    }
    if (!raw) {
      // locked on this device
      const p = pwField("Sync passphrase", "current-password"), btn = h("button", { type: "button", class: "button" }, "Unlock");
      const rec = h("input", { type: "text", placeholder: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", "aria-label": "Recovery key", autocomplete: "off", spellcheck: "false", class: "sync-rec-in" });
      const n1 = pwField("New passphrase"), n2 = pwField("Type it again"), rbtn = h("button", { type: "button", class: "button" }, "Unlock & set new passphrase");
      btn.addEventListener("click", async () => {
        busy(btn, true, "Unlocking…");
        try { await unlockWith(p.value, false); const r = await syncNow({ quiet: true }); draw(`✓ Unlocked. ${r.applied || 0} item${r.applied === 1 ? "" : "s"} downloaded, ${r.pushed || 0} uploaded. Open any tool to see your data.`); }
        catch (e) { busy(btn, false); msg.className = "status err"; msg.textContent = e.message; }
      });
      rbtn.addEventListener("click", async () => {
        const bad = checkPass(n1.value, n2.value); if (bad) { msg.className = "status err"; msg.textContent = bad; return; }
        busy(rbtn, true, "Unlocking…");
        try { await unlockWith(rec.value, true); await setPassphrase(n1.value, false); const r = await syncNow({ quiet: true }); draw(`✓ Unlocked with your recovery key and your new passphrase is set. ${r.applied || 0} item${r.applied === 1 ? "" : "s"} downloaded.`); }
        catch (e) { busy(rbtn, false); msg.className = "status err"; msg.textContent = e.message; }
      });
      card.append(h("p", null, "Sync is on for your account. Unlock it on this device with your sync passphrase."),
        h("div", { class: "pj-foot", style: "margin-top:0" }, h("label", null, "Sync passphrase", p), btn), msg,
        h("details", { class: "sync-more" }, h("summary", null, "Forgot your passphrase? Use your recovery key"),
          h("div", { class: "field" }, h("label", null, "Recovery key"), rec),
          h("div", { class: "two" }, h("div", { class: "field" }, h("label", null, "New passphrase"), n1), h("div", { class: "field" }, h("label", null, "Type it again"), n2)),
          h("div", { class: "actions" }, rbtn),
          h("p", { class: "help" }, "Lost the recovery key too? On any computer or phone that's still unlocked, go to Settings → Sync → “Set a new passphrase”. Or use “Start over” below from a computer that has your data.")),
        h("details", { class: "sync-more" }, h("summary", null, "Start over (only if you've lost every way in)"),
          h("p", null, "This deletes the encrypted copy in Firebase and turns Sync on again with a new passphrase, uploading ", h("b", null, "the data on this device"), ". Data that was only on other devices will be lost there until they upload again."),
          h("button", { type: "button", class: "small-btn danger", onclick: async () => {
            if (!confirm("Delete the online copy and start Sync over from this device's data?")) return;
            try { await wipeCloud(); forgetDevice(); draw("The online copy was deleted. Turn Sync on again below."); } catch (e) { draw(e.message, true); }
          } }, "Delete the online copy and start over")));
      addPasswordToggles(card);
      return;
    }
    // on & unlocked
    const st = state();
    const now = h("button", { type: "button", class: "button" }, "Sync now");
    now.addEventListener("click", async () => { busy(now, true, "Syncing…"); const r = await syncNow({ quiet: true }); draw(r.error ? r.error : `✓ Synced. ${r.applied || 0} downloaded, ${r.pushed || 0} uploaded.` + (r.applied ? " Open a tool to see the changes." : ""), !!r.error); });
    const n1 = pwField("New passphrase"), n2 = pwField("Type it again");
    const conflicts = readJSON(CONFLICTS, []);
    card.append(
      h("div", { class: "sync-status" }, h("span", { class: "sync-dot" }), h("div", null, h("strong", null, "Sync is on for this device"),
        h("small", null, (st.last ? "Last synced " + new Date(st.last).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not synced yet") + " · this device: " + deviceName())), now),
      msg,
      h("p", { class: "help" }, "Changes upload automatically a few seconds after you make them. Other devices pick them up when you open or come back to a Teacher Area page."),
      undoBox(),
      h("details", { class: "sync-more" }, h("summary", null, "Set a new passphrase"),
        h("p", { class: "help" }, "No need to know the old one — this device is already unlocked. Your other devices will ask for the new passphrase."),
        h("div", { class: "two" }, h("div", { class: "field" }, h("label", null, "New passphrase"), n1), h("div", { class: "field" }, h("label", null, "Type it again"), n2)),
        h("button", { type: "button", class: "button secondary", onclick: async e => {
          const bad = checkPass(n1.value, n2.value); if (bad) { msg.className = "status err"; msg.textContent = bad; return; }
          busy(e.target, true, "Saving…"); try { await setPassphrase(n1.value, false); draw("✓ New passphrase saved. Your recovery key still works."); } catch (er) { busy(e.target, false); msg.className = "status err"; msg.textContent = er.message; }
        } }, "Save new passphrase")),
      h("details", { class: "sync-more" }, h("summary", null, "Make a new recovery key"),
        h("p", { class: "help" }, "Lost your recovery key, or worried someone saw it? Make a new one — the old one stops working."),
        h("button", { type: "button", class: "button secondary", onclick: async e => {
          if (!confirm("Make a new recovery key? The old one will stop working.")) return;
          busy(e.target, true, "Making…"); try { const rec = await setPassphrase(null, true); recoveryModal(rec, () => draw("✓ New recovery key saved. The old one no longer works.")); } catch (er) { busy(e.target, false); msg.className = "status err"; msg.textContent = er.message; }
        } }, "Make a new recovery key")),
      conflicts.length ? h("details", { class: "sync-more" }, h("summary", null, `Saved older copies (${conflicts.length})`),
        h("p", { class: "help" }, "When the same thing was changed on two devices at once, the newest change wins and the other copy is kept here, just in case."),
        h("ul", { class: "plist-blocked" }, conflicts.map((c, i) => h("li", null, h("span", null, h("strong", null, c.label), h("small", null, " · " + new Date(c.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " · " + c.why)),
          h("span", null,
            h("button", { type: "button", class: "small-btn", onclick: () => { if (!confirm(`Put this older copy of “${c.label}” back? (What's there now is kept as an older copy.)`)) return; stash(c.key, lsGet(c.key), "replaced by an older copy"); ls.setItem(c.key, c.value); const l = readJSON(CONFLICTS, []); l.splice(l.findIndex(x => x.at === c.at && x.key === c.key), 1); lsSet(CONFLICTS, JSON.stringify(l)); draw("✓ Put back. Open the tool to see it."); } }, "Use this copy"),
            h("button", { type: "button", class: "small-btn danger", onclick: () => { const l = readJSON(CONFLICTS, []); l.splice(i, 1); lsSet(CONFLICTS, JSON.stringify(l)); draw(); } }, "Delete")))))) : "",
      h("details", { class: "sync-more" }, h("summary", null, "Turn off Sync"),
        h("p", { class: "help" }, "“This device only”: stops syncing here and forgets the key (your data stays on this computer). Use this on a shared computer when you're done."),
        h("div", { class: "actions" },
          h("button", { type: "button", class: "small-btn", onclick: () => { if (confirm("Stop syncing on this device? Your data stays on this computer.")) { forgetDevice(); draw("Sync is off on this device."); } } }, "This device only"),
          h("button", { type: "button", class: "small-btn danger", onclick: async () => {
            if (!confirm("Turn Sync off everywhere and delete the encrypted online copy? Each device keeps the data it already has.")) return;
            try { await wipeCloud(); forgetDevice(); draw("Sync is off and the online copy was deleted."); } catch (e) { draw(e.message, true); }
          } }, "Everywhere (delete the online copy)"))));
    addPasswordToggles(card);
  }

  window.TeacherSync = { settingsCard: el => { root = el; draw(); }, syncNow, status, _t: { newRecovery, normRec, hash, encryptStr, decryptStr, lock, unlock } };
})();

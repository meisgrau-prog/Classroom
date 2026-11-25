/* ============================================================
   PARENTS (Parent Portal Settings → Parents tab)
   See who has a parent profile and who is signed in; edit, delete
   and block profiles; block email addresses.
   Uses the class's Firebase project: Authentication + Firestore.
   Only the teacher's own Firebase account can read or change the list.
   ============================================================ */
(function () {
  const SESSION = "teacher_firebase_session";
  let root, pa, T = null, view = { q: "", list: [], blocked: [], notes: {} };

  /* ---------- helpers ---------- */
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
  const ERR = {
    EMAIL_EXISTS: "There's already an account with that email — use Sign in.",
    INVALID_EMAIL: "Please check the email address.",
    WEAK_PASSWORD: "Please choose a password with at least 6 characters.",
    EMAIL_NOT_FOUND: "That email or password isn't right. (New here? Use “Create my teacher account”.)",
    INVALID_PASSWORD: "That email or password isn't right.",
    INVALID_LOGIN_CREDENTIALS: "That email or password isn't right. (New here? Use “Create my teacher account”.)",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Please wait a few minutes.",
    OPERATION_NOT_ALLOWED: "Email/Password sign-in is switched off in Firebase (Security → Authentication → Sign-in method)."
  };
  async function idt(path, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(pa.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const code = ((j.error && j.error.message) || "ERROR").split(" ")[0].split(":")[0]; const e = new Error(ERR[code] || "Firebase said: " + code); e.code = code; throw e; }
    return j;
  }
  const readSess = () => { try { return JSON.parse(localStorage.getItem(SESSION) || "null"); } catch { return null; } };
  const saveSess = s => { try { s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION); } catch {} };
  async function refresh() {
    const s = readSess(); if (!s || !s.refreshToken || s.apiKey !== pa.apiKey) return null;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(pa.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken) });
    if (!r.ok) { saveSess(null); return null; }
    const j = await r.json();
    s.idToken = j.id_token; s.refreshToken = j.refresh_token; s.uid = j.user_id;
    const info = await idt("accounts:lookup", { idToken: s.idToken }).catch(() => null);
    s.verified = !!(info && info.users && info.users[0] && info.users[0].emailVerified);
    saveSess(s); return s;
  }
  const db = (method, path, body) => ParentRegistry.fs(pa.projectId, T.idToken, method, path, body);
  const when = iso => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
  const ago = iso => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " hr ago" : Math.round(m / 1440) + " days ago"; };
  function status(p) {
    if (p.blocked) return ["Blocked", "blocked"];
    if (p.signedIn && p.lastSeen && Date.now() - new Date(p.lastSeen) < 30 * 60000) return ["Online now", "online"];
    if (p.signedIn) return ["Signed in", "in"];
    return ["Signed out", "out"];
  }
  function rulesText(email) {
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isTeacher() {
      return request.auth != null && request.auth.token.email_verified == true
        && request.auth.token.email == "${(email || "").toLowerCase()}";
    }
    match /parents/{uid} {
      allow read, write: if isTeacher();
      allow get: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && !exists(/databases/$(database)/documents/blocked/$(uid));
    }
    match /blocked/{id} {
      allow read, write: if isTeacher();
      allow get: if request.auth != null;
    }
    match /notes/{uid} {
      allow read, write: if isTeacher();
    }
    match /sync/{id} {
      allow read, write: if isTeacher();
    }
  }
}`;
  }

  /* ---------- setup steps (shown until the list works) ---------- */
  function setupCard(problem, open) {
    const email = (T && T.email) || SITE.contactEmail || "";
    const rules = h("pre", { class: "plist-rules" }, rulesText(email));
    const copyBtn = h("button", { type: "button", class: "small-btn", onclick: async () => {
      try { await navigator.clipboard.writeText(rulesText(email)); copyBtn.textContent = "✓ Copied"; }
      catch { const r = document.createRange(); r.selectNodeContents(rules); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copyBtn.textContent = "Selected — press Ctrl+C"; }
      setTimeout(() => copyBtn.textContent = "Copy rules", 2500);
    } }, "Copy rules");
    const projectLink = p => `https://console.firebase.google.com/project/${encodeURIComponent(pa.projectId)}/${p}`;
    return h("details", { class: "card plist-setup", open: open ? true : null },
      h("summary", null, "Set up the parent list (one time, about 5 minutes)"),
      problem ? h("p", { class: "status err" }, problem) : null,
      h("ol", { class: "steps" },
        h("li", null, "Open ", h("a", { href: projectLink("firestore"), target: "_blank", rel: "noopener" }, "Firestore in your Firebase project ↗"),
          " (or in Firebase's left menu: ", h("b", null, "Databases & Storage → Firestore"), "; you can also search “Firestore” at the top)."),
        h("li", null, "Click ", h("b", null, "Create database"), ". Choose the ", h("b", null, "Standard"), " edition if asked, pick a location near you (e.g. ", h("i", null, "nam5 (United States)"), "), choose ", h("b", null, "Start in production mode"), ", and click ", h("b", null, "Create"), "."),
        h("li", null, "Open the ", h("b", null, "Rules"), " tab, delete everything there, paste the rules below, and click ", h("b", null, "Publish"), "."),
        h("li", null, "Come back here and click ", h("b", null, "Check again"), ".")),
      h("div", { class: "plist-rules-head" }, h("span", null, "Rules for ", h("b", null, email || "your email")), copyBtn),
      rules,
      h("p", { class: "help" }, "These rules let ", h("b", null, "only you"), " (signed in below, with a confirmed email) see or change the parent list. Each parent can only save their own visit."));
  }

  /* ---------- teacher sign-in to Firebase ---------- */
  function signInCard(msgText) {
    const email = h("input", { type: "email", value: (readSess() && readSess().email) || SITE.contactEmail || "", autocomplete: "username", "aria-label": "Your email" });
    const pw = h("input", { type: "password", autocomplete: "current-password", placeholder: "Password", "aria-label": "Password" });
    const msg = h("p", { class: "status" + (msgText ? " err" : "") }, msgText || "");
    const go = async create => {
      msg.className = "status"; msg.textContent = create ? "Creating your account…" : "Signing in…";
      try {
        const j = await idt(create ? "accounts:signUp" : "accounts:signInWithPassword", { email: email.value.trim(), password: pw.value, returnSecureToken: true });
        if (create) await idt("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken: j.idToken }).catch(() => {});
        saveSess({ email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, apiKey: pa.apiKey });
        await draw(create ? "We sent a confirmation link to " + j.email + ". Click it, then come back and press “I clicked the link”." : "");
      } catch (e) { msg.className = "status err"; msg.textContent = e.message; }
    };
    return h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Sign in to see your parents"),
      h("p", { class: "help" }, "Use your own teacher account in the class's Firebase project — not a parent profile. The first time, use “Create my teacher account” (your email gets a confirmation link)."),
      h("div", { class: "two" }, h("div", { class: "field" }, h("label", null, "Your email"), email), h("div", { class: "field" }, h("label", null, "Password"), pw)),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button", onclick: () => go(false) }, "Sign in"),
        h("button", { type: "button", class: "button secondary", onclick: () => go(true) }, "Create my teacher account"),
        h("button", { type: "button", class: "small-btn", onclick: async () => {
          if (!email.value.trim()) { msg.className = "status err"; msg.textContent = "Type your email first."; return; }
          await idt("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email: email.value.trim() }).catch(() => {});
          msg.className = "status ok"; msg.textContent = "If that email has an account, a reset link is on its way.";
        } }, "Forgot password?")),
      msg);
  }

  /* ---------- the list ---------- */
  async function load() {
    const [p, b, n] = await Promise.all([db("GET", "parents?pageSize=300"), db("GET", "blocked?pageSize=300"), db("GET", "notes?pageSize=300")]);
    if (!p.ok) return p;
    view.blocked = b.ok ? (b.json.documents || []).map(ParentRegistry.fromDoc) : [];
    view.notes = {}; if (n.ok) (n.json.documents || []).map(ParentRegistry.fromDoc).forEach(x => view.notes[x.id] = x.note || "");
    const blockedUids = new Set(view.blocked.map(x => x.uid).filter(Boolean)), blockedEmails = new Set(view.blocked.map(x => (x.email || "").toLowerCase()));
    // profiles made before the list was set up: use the name they typed when they signed up
    const fromAccount = x => { const m = (x.accountName || "").match(/^(.*?)\s*(?:\(parent of (.*)\))?$/); if (!x.name && m) x.name = m[1] || ""; if (!x.child && m && m[2]) x.child = m[2]; return x; };
    view.list = (p.json.documents || []).map(ParentRegistry.fromDoc).map(fromAccount).map(x => Object.assign(x, { blocked: blockedUids.has(x.id) || blockedEmails.has((x.email || "").toLowerCase()) }))
      .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
    return p;
  }

  async function block(email, uid, reason) {
    const at = new Date(), rec = { email: email || "", uid: uid || "", reason: reason || "blocked", at };
    const jobs = [];
    if (uid) jobs.push(ParentRegistry.patch(pa.projectId, T.idToken, "blocked/" + uid, rec));
    if (email) jobs.push(ParentRegistry.patch(pa.projectId, T.idToken, "blocked/" + await ParentRegistry.sha(email), rec));
    const rs = await Promise.all(jobs);
    if (rs.some(r => !r.ok)) throw new Error("Couldn't block: " + (rs.find(r => !r.ok).message || "permission denied"));
  }
  async function unblock(email, uid) {
    const ids = new Set();
    if (uid) ids.add(uid);
    if (email) ids.add(await ParentRegistry.sha(email));
    view.blocked.filter(b => (uid && b.uid === uid) || (email && (b.email || "").toLowerCase() === email.toLowerCase())).forEach(b => ids.add(b.id));
    await Promise.all([...ids].map(id => db("DELETE", "blocked/" + id)));
  }

  function editParent(p) {
    const overlay = h("div", { class: "pl-overlay", onclick: e => { if (e.target === overlay) overlay.remove(); } });
    const name = h("input", { type: "text", value: p.name || "" }), child = h("input", { type: "text", value: p.child || "" });
    const note = h("textarea", { rows: "3", placeholder: "Only you can see this" }); note.value = view.notes[p.id] || "";
    const msg = h("p", { class: "status err" });
    overlay.appendChild(h("div", { class: "pl-form" },
      h("div", { class: "pl-form-head" }, h("div", null, h("small", null, "Parent profile"), h("h2", null, p.name || p.email)), h("button", { type: "button", class: "pl-x", "aria-label": "Close", onclick: () => overlay.remove() }, "×")),
      h("p", { class: "pl-label" }, "Email"), h("p", { style: "margin:0" }, p.email || "—"),
      h("p", { class: "pl-label" }, "Parent's name"), name,
      h("p", { class: "pl-label" }, "Child's name"), child,
      h("p", { class: "pl-label" }, "Private note"), note,
      msg,
      h("div", { class: "pl-actions" },
        h("button", { type: "button", class: "button secondary", onclick: () => overlay.remove() }, "Cancel"),
        h("button", { type: "button", class: "button", onclick: async () => {
          const r = await ParentRegistry.patch(pa.projectId, T.idToken, "parents/" + p.id, { name: name.value.trim(), child: child.value.trim() });
          const r2 = await ParentRegistry.patch(pa.projectId, T.idToken, "notes/" + p.id, { note: note.value.trim() });
          if (!r.ok || !r2.ok) { msg.textContent = "Couldn't save: " + ((r.ok ? r2 : r).message || "permission denied"); return; }
          overlay.remove(); draw("✓ Saved " + (name.value.trim() || p.email) + ".");
        } }, "Save"))));
    document.body.appendChild(overlay);
    name.focus();
  }

  function listCard(flash) {
    const q = h("input", { type: "search", class: "si-search", placeholder: "Search name, child or email…", value: view.q });
    const tbody = h("tbody");
    const online = view.list.filter(p => status(p)[1] === "online").length, signedIn = view.list.filter(p => ["online", "in"].includes(status(p)[1])).length;
    function fill() {
      tbody.innerHTML = "";
      const t = view.q.toLowerCase();
      const rows = view.list.filter(p => !t || [p.name, p.child, p.email].some(v => (v || "").toLowerCase().includes(t)));
      rows.forEach(p => {
        const [label, cls] = status(p);
        tbody.appendChild(h("tr", { class: p.blocked ? "is-blocked" : "" },
          h("td", null, h("strong", null, p.name || "—"), view.notes[p.id] ? h("small", { class: "plist-note", title: view.notes[p.id] }, "📝 " + view.notes[p.id]) : null),
          h("td", null, p.child || "—"),
          h("td", null, h("a", { href: "mailto:" + p.email }, p.email || "—")),
          h("td", null, h("span", { class: "plist-status " + cls }, label), p.lastSeen ? h("small", null, ago(p.lastSeen)) : null),
          h("td", null, when(p.created)),
          h("td", { class: "plist-acts" },
            h("button", { type: "button", class: "small-btn", onclick: () => editParent(p) }, "Edit"),
            p.blocked
              ? h("button", { type: "button", class: "small-btn", onclick: async () => { await unblock(p.email, p.id); draw("✓ " + (p.name || p.email) + " can sign in again."); } }, "Unblock")
              : h("button", { type: "button", class: "small-btn danger", onclick: async () => {
                  if (!confirm(`Block ${p.name || p.email}? They won't be able to open the Parent Portal.`)) return;
                  try { await block(p.email, p.id); draw("✓ Blocked " + (p.name || p.email) + ". They're signed out within a few minutes."); } catch (e) { draw(e.message, true); }
                } }, "Block"),
            h("button", { type: "button", class: "small-btn danger", onclick: async () => {
              if (!confirm(`Delete ${p.name || p.email}'s profile?\n\nThey'll be removed from this list and won't be able to sign in. To erase the account completely, also delete it in Firebase → Authentication → Users.`)) return;
              try {
                await block(p.email, p.id, "deleted");
                await Promise.all([db("DELETE", "parents/" + p.id), db("DELETE", "notes/" + p.id)]);
                draw("✓ Deleted " + (p.name || p.email) + "'s profile.");
              } catch (e) { draw(e.message, true); }
            } }, "Delete"))));
      });
      if (!rows.length) tbody.appendChild(h("tr", null, h("td", { colspan: "6", class: "th-none" }, view.list.length ? "No matches." : "No parent profiles yet. When parents make a profile (or sign in), they show up here.")));
    }
    q.addEventListener("input", () => { view.q = q.value; fill(); });
    fill();
    return h("div", { class: "card" },
      h("div", { class: "plist-top" },
        h("div", null, h("h2", { class: "section-title", style: "margin:0" }, "Parent Profiles"),
          h("p", { class: "help", style: "margin:4px 0 0" }, `${view.list.length} profile${view.list.length === 1 ? "" : "s"} · ${signedIn} signed in · ${online} online now`)),
        h("span", { class: "pj-tools-btns" },
          h("button", { type: "button", class: "small-btn", onclick: () => draw() }, "↻ Refresh"),
          h("a", { class: "small-btn", href: `https://console.firebase.google.com/project/${encodeURIComponent(pa.projectId)}/authentication/users`, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Firebase users ↗"))),
      flash ? h("p", { class: "status " + (flash.err ? "err" : "ok") }, flash.text) : null,
      h("div", { class: "pl-bar", style: "margin:10px 0" }, q),
      h("div", { class: "gb-scroll" }, h("table", { class: "plist-table" },
        h("thead", null, h("tr", null, ["Parent", "Child", "Email", "Status", "Joined", ""].map(x => h("th", null, x)))), tbody)),
      h("p", { class: "help" }, "“Online now” = used the Parent Portal in the last 30 minutes. “Signed in” = stayed signed in on their device. Blocking takes effect within about 5 minutes."));
  }

  function blockedCard() {
    const email = h("input", { type: "email", placeholder: "email@example.com", "aria-label": "Email to block" });
    const msg = h("p", { class: "status" });
    const rows = view.blocked.filter((b, i, a) => a.findIndex(x => (x.email || x.uid) === (b.email || b.uid)) === i);
    return h("div", { class: "card" },
      h("h2", { class: "section-title" }, "Blocked"),
      h("p", { class: "help" }, "Block an email address — even one that hasn't made a profile yet — so it can't open the Parent Portal."),
      h("div", { class: "pj-foot", style: "margin-top:0" }, h("label", null, "Email to block", email),
        h("button", { type: "button", class: "button secondary", onclick: async () => {
          const v = email.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { msg.className = "status err"; msg.textContent = "Type a full email address."; return; }
          const p = view.list.find(x => (x.email || "").toLowerCase() === v.toLowerCase());
          try { await block(v, p && p.id); draw("✓ Blocked " + v + "."); } catch (e) { msg.className = "status err"; msg.textContent = e.message; }
        } }, "Block email")),
      msg,
      rows.length ? h("ul", { class: "plist-blocked" }, rows.map(b => h("li", null,
        h("span", null, h("strong", null, b.email || "(account " + (b.uid || "").slice(0, 6) + "…)"), h("small", null, (b.reason === "deleted" ? " · profile deleted" : "") + (b.at ? " · " + when(b.at) : ""))),
        h("button", { type: "button", class: "small-btn", onclick: async () => { await unblock(b.email, b.uid); draw("✓ Unblocked " + (b.email || "account") + "."); } }, "Unblock"))))
        : h("p", { class: "th-none" }, "Nobody is blocked."));
  }

  async function draw(flashText, isErr) {
    if (!root) return;
    pa = (window.content && content.settings && content.settings.parentAccounts) || (typeof content !== "undefined" && content && content.settings.parentAccounts) || {};
    root.innerHTML = "";
    root.appendChild(h("div", { class: "card" }, h("h2", { class: "section-title" }, "Parents"),
      h("p", { class: "help", style: "margin:0" }, "See who has a parent profile and who is signed in. Edit, delete or block profiles, and block email addresses.")));
    if (!pa.apiKey || !pa.projectId) {
      root.appendChild(h("div", { class: "card" }, h("p", { style: "margin:0" }, "First connect Firebase: open the ", h("b", null, "Access & Wording"), " tab, choose ", h("b", null, "Parent profiles"), ", paste the Web API key and Project ID, and click Save & Publish.")));
      return;
    }
    const loading = h("p", { class: "help" }, "Loading…"); root.appendChild(loading);
    T = await refresh().catch(() => null);
    loading.remove();
    if (!T) { root.appendChild(signInCard(flashText && isErr ? flashText : "")); root.appendChild(setupCard("", false)); return; }
    const who = h("div", { class: "plist-who" }, h("span", null, "Signed in to Firebase as ", h("b", null, T.email)),
      h("button", { type: "button", class: "small-btn", onclick: () => { saveSess(null); draw(); } }, "Sign out of Firebase"));
    root.appendChild(who);
    if (!T.verified) {
      root.appendChild(h("div", { class: "card" }, h("h3", null, "Confirm your email"),
        h("p", null, flashText || ("Firebase sent a confirmation link to " + T.email + ". Click the link in that email, then press the button below.")),
        h("div", { class: "actions" },
          h("button", { type: "button", class: "button", onclick: () => draw() }, "I clicked the link"),
          h("button", { type: "button", class: "small-btn", onclick: async () => { await idt("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken: T.idToken }).catch(() => {}); draw("Sent again to " + T.email + ". Check spam too."); } }, "Send the link again"))));
      return;
    }
    const r = await load().catch(e => ({ ok: false, message: e.message, error: "" }));
    if (!r.ok) {
      const txt = r.error + " " + r.message;
      const problem = /database|does not exist|NOT_FOUND|not been used|disabled/i.test(txt) ? "Firestore isn't set up yet in your Firebase project — do steps 1–2."
        : /PERMISSION|permission/i.test(txt) ? `The rules aren't set yet (or they're for a different email than ${T.email}) — do step 3.`
        : "Couldn't open the parent list: " + (r.message || "unknown problem");
      root.appendChild(setupCard(problem, true));
      root.appendChild(h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => draw() }, "Check again")));
      return;
    }
    root.appendChild(listCard(flashText ? { text: flashText, err: !!isErr } : null));
    root.appendChild(blockedCard());
    root.appendChild(setupCard("", false));
  }

  window.ParentList = { open: el => { root = el; draw(); }, _t: { rulesText, status } };
})();

/* ============================================================
   BACK UP EVERYTHING / RESTORE
   One file with all your Teacher Area records (class list, grades,
   calls, attendance, seating, student info, support, raffle, prizes…).
   Used in Settings on the website and in the offline copy, so work
   can move between them. The file stays on your computer.
   ============================================================ */
(function () {
  const KEYS = ["classroom_students_v1", "classroom_raffle_v1", "teacher_prizes_v1", "teacher_phone_log_v1", "teacher_gradebook_v1",
    "teacher_student_info_v1", "teacher_support_v1", "teacher_attendance_v1", "teacher_seating_v1", "teacher_birthdays_v1",
    "teacher_home_v1", "teacher_sections_v1", "teacher_timer_v1"];
  const NAMES = { classroom_students_v1: "Class list", classroom_raffle_v1: "Raffle", teacher_prizes_v1: "Prize boxes", teacher_phone_log_v1: "Phone log",
    teacher_gradebook_v1: "Gradebook", teacher_student_info_v1: "Student info", teacher_support_v1: "Student support", teacher_attendance_v1: "Attendance",
    teacher_seating_v1: "Seating charts", teacher_birthdays_v1: "Birthdays", teacher_home_v1: "Home page choices", teacher_sections_v1: "Section choices", teacher_timer_v1: "Timer" };
  const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }); kids.flat().forEach(k => { if (k != null && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); }); return e; };

  function download() {
    const data = {}; KEYS.forEach(k => { const v = localStorage.getItem(k); if (v != null) data[k] = v; });
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify({ kind: "teacher-area-backup", saved: new Date().toISOString(), from: window.OFFLINE_COPY ? "offline" : "website", data }, null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `Teacher Area backup ${day}.json` }); document.body.appendChild(a); a.click(); a.remove();
    return Object.keys(data).length;
  }
  async function restore(file, msg) {
    let b; try { b = JSON.parse(await file.text()); } catch { b = null; }
    if (!b || b.kind !== "teacher-area-backup" || !b.data) { msg.className = "status err"; msg.textContent = "That isn't a Teacher Area backup file."; return; }
    const keys = Object.keys(b.data).filter(k => KEYS.includes(k));
    const when = new Date(b.saved).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    if (!confirm(`Restore the backup from ${when}?\n\nThis replaces on this ${window.OFFLINE_COPY ? "computer's offline copy" : "device"}:\n• ${keys.map(k => NAMES[k]).join("\n• ")}\n\nTip: download a backup of what's here first, just in case.`)) return;
    keys.forEach(k => localStorage.setItem(k, b.data[k]));
    msg.className = "status ok"; msg.textContent = `✓ Restored ${keys.length} item${keys.length === 1 ? "" : "s"}. Reloading…`;
    setTimeout(() => location.reload(), 900);
  }
  function card() {
    const msg = h("p", { class: "status" });
    const file = h("input", { type: "file", accept: ".json,application/json", class: "hidden", onchange: e => { const f = e.target.files[0]; e.target.value = ""; if (f) restore(f, msg); } });
    return h("div", { class: "card", id: "backup-card" },
      h("h2", { class: "section-title" }, "Back Up Everything"),
      h("p", { class: "help" }, window.OFFLINE_COPY
        ? "Save all your work in this offline copy to one file — then use “Restore from a backup” in Settings on the website (or another offline copy) to bring it over."
        : "Save all your Teacher Area records to one file on your computer — class list, grades, calls, attendance, seating, student info, support, raffle and prizes. Use “Restore” on another computer or in an offline copy to bring them over."),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "button", onclick: () => { const n = download(); msg.className = "status ok"; msg.textContent = `✓ Downloaded a backup of ${n} item${n === 1 ? "" : "s"}. Keep it somewhere safe — it has student information in it.`; } }, "⬇ Download a backup"),
        h("button", { type: "button", class: "button secondary", onclick: () => file.click() }, "Restore from a backup…"), file),
      msg);
  }
  window.TeacherBackup = { card, download, KEYS };
})();

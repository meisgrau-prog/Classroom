/* ============================================================
   EDIT THIS FILE TO UPDATE YOUR SITE
   ------------------------------------------------------------
   On GitHub: open data.js, click the pencil (Edit) icon,
   change the text between the quotes, then click
   "Commit changes". Your site updates in about a minute.

   To post a new classwork or homework file:
   1. Upload the file to GitHub
      (Add file > Upload files).
   2. Put its name below, for example "math-page-12.pdf".
   PDFs work best. Images (.png, .jpg) also preview.
   ============================================================ */

const SITE = {
  // Shown at the top of every page
  className: "My Classroom",

  // ---------- TODAY'S CLASSWORK ----------
  classwork: {
    date: "Monday, November 16",
    title: "Today's Classwork",
    notes: "Complete both sections. Show your work!",
    file: "classwork.pdf"      // leave "" if nothing is posted
  },

  // ---------- TODAY'S HOMEWORK ----------
  homework: {
    date: "Monday, November 16",
    title: "Today's Homework",
    due: "Tuesday, November 17",
    notes: "Bring it to class tomorrow.",
    file: "homework.pdf"       // leave "" if nothing is posted
  },

  // ---------- NEWS ----------
  // Newest first. Copy a { ... }, block to add another item.
  news: [
    {
      date: "November 16",
      title: "Welcome to our class website!",
      text: "Check here every day for classwork, homework, and news."
    },
    {
      date: "November 20",
      title: "Field trip permission slips",
      text: "Please return signed permission slips by Friday."
    }
  ],

  // ---------- CONTACT ----------
  // Messages from the Contact page are emailed here.
  contactEmail: "meisgrau@ykwaterbury.org"
};

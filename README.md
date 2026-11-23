# Rabbi Eisgrau's Class Website

## How the site is organized
- **Sign-in page** (`index.html`, your web address): one password box over an empty classroom that slowly pans out.
  - **Teacher Portal password** → **Teacher Area** (`teacher.html`) with the Teacher Menu: View Parent Portal,
    Parent Portal Controls, Teacher Tools, Classroom Tools, and Sign out.
  - **Class password** → **Parent Portal** (`parents.html`). With parent profiles on, parents type email + password
    (links for "Forgot password?" and "Create a parent profile"). With "Open to everyone", a Parent Portal button shows.
- Parents never see the teacher side; teacher pages ask for the Teacher Portal password if opened directly.
- To use a real photo behind the sign-in page, upload one named **signin-photo.jpg**.

## Teacher Area
After signing in with the Teacher Portal password you land on the **Teacher Area** home: a side menu
(Home, Parent Portal Controls, Classroom Tools, Teacher Tools, View Parent Portal, Sign out) and a
dashboard showing families due for a call, follow-ups due and calls this week.

## Teacher Tools → Phone Log
- **Log a Call:** student grid with "Called 3 days ago" and a colored bar (green ≤2 weeks, gold 2–6 weeks,
  grey >6 weeks/never); "Due for a call" and "Follow-ups" boxes; tap a student to log a call
  (result, color-coded categories with subcategories, spoke with, note, follow-up, date/time, Save + Undo).
- **Follow-ups:** Due now / Coming up / No date set, filter by type, "Log follow-up" and "Done", print.
- **History:** by day with colored stripes and tags; filter by student, type, follow-ups only;
  Delete, Mark followed up, **Download spreadsheet**, **Print report** (filter by a student for a student report).
- **Students:** class list (shared with Classroom Tools) and **Download/Restore backup**.
- **Settings:** categories (name, color, subcategories — put subjects under Academics; add, remove, reorder),
  result buttons, "spoke with" choices, follow-up choices, and the green/due timing.
- The phone log is private: it's saved only in that browser on that device, never on GitHub.

## Classroom Tools
Students, Group Maker, Random Number, Random Student, Raffle, Prize Boxes.

## Parent Portal home page wording
Teacher Portal → Site Settings: welcome heading, a short message under your name, and the names of the
Classwork, Homework, News, Programs and Contact buttons.

## Parent profiles (optional)
Parents can each have their own profile (email + password) instead of one class password, with
"Forgot password?" emailing a reset link. It uses Google Firebase (free). Set it up once in the
portal: Site Settings → **Parent Profiles** (step-by-step instructions are there), then switch it on.
Parents create a profile with the class code (your website password). Remove a parent in Firebase →
Authentication → Users.

## Using the Teacher Portal
Open the main site → **Teacher Menu** → **Parent Portal Controls** (or go to /portal.html).

Sign in with the **portal password**. (Backup: "Sign in with GitHub key instead".)
- **Site Settings:** teacher name, welcome message, and the website lock (password + on/off switch).
- **Banners (up to 3):** words, color, emojis, which pages they show on, and on/off.
- **Classwork / Homework / News / Programs / Banners** tabs: change text and upload documents. News items can be marked **Urgent**.
- Click **Save & Publish**. The website updates in 1–2 minutes.

### Classroom tools (button at the top of the portal)
Switch between **Website** (edit the site) and **Classroom** (teacher tools):
- **Students:** click **Upload Excel sheet** (Excel .xlsx, CSV, or text), check the first/last name columns and starting row, then **Use these names** — or type names. Click names to mark absent.
  The list is saved only in that browser on that device — never on GitHub or the website.
- **Group Maker:** choose how many groups; uneven numbers give some groups one extra student. Every tool has a **Print** button (groups, number picks, student picks, student order) that prints a clean sheet.
- **Random Number:** quick ranges (1–6 up to 1–10,000) or any range up to 10,000; optional "no repeats". The newest pick shows big; earlier picks stay listed in order (1, 2, 3…).
- **Raffle:** upload an Excel sheet of names and ticket counts, or add names by hand with any number of tickets (same name can have many), shuffle & draw with drum, gold winner ticket, confetti, drumroll and applause; redraw, winners list, print.
- **Random Student:** pick one student (everyone gets a turn before repeats) or shuffle the whole order.

### First-time setup (or forgot the password / GitHub key expired)
1. Make a GitHub key at https://github.com/settings/tokens/new (check **repo**).
2. In the portal click **First-time setup or reset password**, paste the key,
   choose a password (10+ characters) and click **Save password**.

The GitHub key is stored in `portal-key.json`, locked (encrypted) with the
password. Anyone with the password can edit the site, so share it only with
people you trust. Change it with **Change password** (top right of the portal).

## Important when uploading files by hand
Never upload `content.json` or `portal-key.json` — the portal manages them, and
uploading an old copy would erase your posts or password.

## Home page picture
The home page shows a slowly moving picture of classroom desks. To use your own photo instead,
upload a picture named **home-photo.jpg** to the repository; it will appear with the same slow movement.

## Other settings
`data.js` holds the contact email, phone number and default teacher name.

## Contact form (one-time setup)
Messages are delivered by FormSubmit (formsubmit.co). The **first** message sent
triggers an activation email — click the link once and all later messages go
straight to your inbox.

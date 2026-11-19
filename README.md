# Rabbi Eisgrau's Class Website

## Pages
- **Home page** (`index.html`) – welcome, section buttons on the side, Contact Me bar at the bottom
- (`menu.html` now just forwards to the home page)
- **Classwork** – a Classwork page with a side menu of up to 7 sections (named and switched on/off in the portal)
- **Homework** – preview and download posted documents
- **Programs** – programs currently running in class
- **News** – announcements (headline + subtitle, click to open). The News button shows a small number for new items
- **Contact Me** – call button and an email form
- **Teacher Portal** (`portal.html`) – where you make changes

## Using the Teacher Portal
Click the small 🔒 at the bottom of the home page (or open /portal.html).

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

## Other settings
`data.js` holds the contact email, phone number and default teacher name.

## Contact form (one-time setup)
Messages are delivered by FormSubmit (formsubmit.co). The **first** message sent
triggers an activation email — click the link once and all later messages go
straight to your inbox.

# Rabbi Eisgrau's Class Website

## How the site is organized
- **Main site** (`index.html`, your web address): welcome page with a **Parent Portal** button and a
  **Teacher Menu** with: **Parent Portal Controls** (the Teacher Portal, password protected),
  **Teacher Tools** (Prize Boxes) and **Classroom Tools** (students, groups, random picks, raffle).
- **Parent Portal** (`parents.html`, also reachable at **/parents**): Classwork, Homework, News,
  Programs and Contact. It has no links to the teacher side. Give families this address.
- **Parent Portal access** (Teacher Portal → Site Settings → "Who can open the Parent Portal?"): Open to everyone, Class password, or Parent profiles.
- **Locks:** the main site, Classroom Tools and Teacher Tools ask for your **Teacher Portal password**.
  The Parent Portal pages use the **website password** (switch it on/off in the portal).

## Teacher Tools
- **Prize Boxes:** add prizes with how many of each (type "Pencil × 10", paste a list like "3 x Stickers",
  or upload an Excel sheet). Four numbered gift boxes each hide a random prize; click one to open it.
  That prize is taken off the list. "New round" refills the boxes; "Show the other boxes" peeks.
  Prizes given out can be printed. Saved only in that browser on that device.

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

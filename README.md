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
- **Site Settings:** teacher name and welcome message.
- **Banners (up to 3):** words, color, emojis, which pages they show on, and on/off.
- **Classwork / Homework / News / Programs** tabs: change text and upload documents.
- Click **Save & Publish**. The website updates in 1–2 minutes.

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

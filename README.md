# Rabbi Eisgrau's Class Website

## Pages
- **Home page** (`index.html`) – welcome, section buttons on the side, Contact Me bar at the bottom
- (`menu.html` now just forwards to the home page)
- **Classwork / Homework** – preview and download posted documents
- **News** – class announcements with optional attachments
- **Contact Me** – call button and an email form
- **Teacher Portal** (`portal.html`) – where you make changes

## Using the Teacher Portal
Open **/portal.html** on your site (it isn't linked anywhere — bookmark it).

Sign in with the **portal password**. Then:
- Turn the **No Homework banner** on/off and edit its text.
- Use the **Classwork / Homework / News** tabs to change text and upload documents.
- Click **Save & Publish**. The website updates in 1–2 minutes.

### First-time setup (or if you forget the password / the GitHub key expires)
1. Make a GitHub key: https://github.com/settings/personal-access-tokens/new
   - Repository access: **Only select repositories** → **Classroom**
   - Permissions → **Contents: Read and write**
2. In the portal click **First-time setup or reset password**, paste the key,
   choose a password (10+ characters) and click **Save password**.

The GitHub key is stored in `portal-key.json`, **locked (encrypted) with the
password**. Anyone with the password can edit the site, so share it only with
people you trust, and change it (top right of the portal) if needed.

## Other settings
Your name, welcome text, phone number and contact email are in `data.js`.

## Contact form (one-time setup)
Messages are delivered by FormSubmit (formsubmit.co). The **first** message sent
triggers an activation email to you — click the link once and all later
messages go straight to your inbox.

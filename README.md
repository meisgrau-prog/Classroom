# Rabbi Eisgrau's Class Website

## Pages
- **Home page** (`index.html`) – welcome, section buttons on the side, Contact Me bar at the bottom
- (`menu.html` now just forwards to the home page)
- **Classwork / Homework** – preview and download posted documents
- **News** – class announcements with optional attachments
- **Contact Me** – call button and an email form
- **Teacher Portal** (`portal.html`) – where you make changes

## Using the Teacher Portal
Open **https://meisgrau-prog.github.io/Classroom/portal.html**
(the portal is not linked anywhere on the site — bookmark it).

1. Sign in with your GitHub key (see below — one time only).
2. Turn the **No Homework banner** on/off and edit its text.
3. Use the **Classwork / Homework / News** tabs to change text and upload documents.
4. Click **Save & Publish**. The website updates in 1–2 minutes.

### Getting your GitHub key (one time)
1. Go to https://github.com/settings/personal-access-tokens/new
2. Token name: *Classroom portal*. Expiration: the longest option.
3. Repository access: **Only select repositories** → **Classroom**.
4. Permissions → Repository permissions → **Contents: Read and write**.
5. Click **Generate token**, copy it, and paste it into the portal.

Keep the key private like a password. If it expires, make a new one the same way.

## Other settings
Your name, welcome text, phone number and contact email are in `data.js`.

## Contact form (one-time setup)
Messages are delivered by FormSubmit (formsubmit.co). The **first** message sent
triggers an activation email to you — click the link once and all later
messages go straight to your inbox.

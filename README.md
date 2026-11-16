# Classroom Website

A class website for Rabbi Eisgrau.

- **Welcome page** (`index.html`) – "Welcome to My Class", the teacher's name, and a Get Started button
- **Sections page** (`menu.html`) – large buttons for the pages below
- **Today's Classwork** – preview and download today's classwork
- **Today's Homework** – preview and download today's homework
- **News** – class announcements
- **Contact Me** – phone number (tap to call or text) and a form that emails the teacher

## How to update the site

Everything you change is in **`data.js`**. On GitHub, open `data.js`, click the ✏️ pencil icon, edit the text, then click **Commit changes**.

### Post new classwork or homework
1. Click **Add file → Upload files** and upload your PDF (or image).
2. In `data.js`, set `file:` to its name, e.g. `"fractions-worksheet.pdf"`.
3. Update the `date`, `notes`, and (for homework) `due`.

Tip: if you upload a new file with the **same name** (`classwork.pdf` / `homework.pdf`), it replaces the old one, so you only need to update the date in `data.js`.

### Add news
Copy one `{ date, title, text },` block in the `news` list, paste it at the top, and change the words.

## Change the welcome text, name, or phone number
In `data.js`, edit `welcome`, `teacherName`, or `phone`.

## Contact form (one-time setup)
Messages are delivered by the free service FormSubmit (formsubmit.co).
The **very first** time someone sends a message, FormSubmit emails you an
**activation link**. Click it once, and after that every message goes straight to your inbox.
Send yourself a test message right after the site goes live.

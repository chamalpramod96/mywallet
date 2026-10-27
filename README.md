# MyWallet

A personal wallet and expense tracker, built to be used on one phone (Samsung Galaxy S25) and installed from GitHub Pages.

- Track expenses, income and transfers across accounts. It starts with Cash, HNB, BOC and HNB Credit Card (only balances, no account numbers)
- Credit card shows the amount you owe: card purchases add to it, and paying the bill is a **Transfer** from HNB or BOC to the card
- **Ongoing loans** on Home: tap **+ Add** for money you borrowed or lent, lower the amount as it's paid back, tap **Settled** to remove it
- Monthly budget, spending by category, 6-month income vs expenses chart
- 4-digit PIN lock with auto-lock
- Works offline once installed
- Light and dark mode

**Your data never leaves your phone.** It is kept in the browser storage on the phone. The GitHub repository only holds the app's code, so nobody can see your transactions, even though the repository is public.

## Publish on GitHub Pages

1. Push this folder to `https://github.com/chamalpramod96/mywallet` (the `main` branch).
2. On GitHub, open the repository → **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**.
4. Wait a minute or two. The app will be live at **https://chamalpramod96.github.io/mywallet/**

> GitHub Pages is free for public repositories. A private repository needs a paid GitHub plan.

## Install on your phone

1. Open **https://chamalpramod96.github.io/mywallet/** in **Chrome** on your S25.
2. Tap **⋮** → **Add to Home screen** → **Install**.
   (Samsung Internet: **☰** → **Add page to** → **Home screen**.)
3. Open MyWallet from your home screen. Tap **Get started**, create your PIN and enter your starting balances.

## Keep a backup

Your data lives only in the phone's browser storage. You lose it if you uninstall the app, clear Chrome's site data or reset the phone.

- **Settings → Share backup** saves a backup file to Google Drive, WhatsApp or email.
- **Settings → Download backup** saves it to your Downloads folder.
- **Settings → Restore from backup** brings it back on a new phone. Your PIN is never included in a backup.

The app reminds you on the Home screen if you haven't backed up for 30 days.

## Updating the app

1. Change the files you want.
2. In `sw.js`, raise `VERSION` (for example `1.0.0` → `1.0.1`). Otherwise phones keep showing the old cached version.
3. Push to GitHub. Next time you open the app, tap **Update** on the "new version is ready" message.

## Run it on your computer

Any static file server works. With Node installed:

```bash
npx serve .
```

Offline caching is switched off on `localhost`, so your edits show up straight away. Add `?sw` to the address to test it anyway.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell and bottom tab bar |
| `css/app.css` | All styles, light and dark theme |
| `js/app.js` | Screens, forms, PIN lock, backup |
| `js/store.js` | Data model and calculations (amounts stored in cents) |
| `js/format.js` | Money and date formatting |
| `js/charts.js` | Category bars and the monthly chart |
| `js/icons.js` | Line icons |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | App name, icons, colours for installing |
| `icons/`, `assets/`, `fonts/` | App icons, logo, Montserrat font (OFL licence) |

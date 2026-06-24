# Kingdom To The Counties — Ambassador Companion

A lightweight, no-login companion app for K2C ambassadors. Everyone shares one
live view: checklist, announcements, check-ins, headcount, praises, and feedback
all stay in sync across phones within a few seconds.

## How it works

- **`index.html`** — the entire app (front end).
- **`netlify/functions/data.mjs`** — the sync backend, built on [Netlify Blobs](https://docs.netlify.com/blobs/overview/). All phones read and write one shared record in the cloud.
- **`netlify.toml`** — tells Netlify where the site and functions live.
- **`package.json`** — lists the `@netlify/blobs` dependency.

Every phone re-reads the shared state every 5 seconds, so changes show up for
everyone within a few seconds. No accounts, no separate database to set up —
Netlify enables Blobs automatically on deploy.

## Hosting (Netlify)

This repo is set up for automatic deploys: connect it to a Netlify site and
every push to `main` rebuilds and publishes the site.

1. In Netlify: **Add new site → Import an existing project → Deploy with GitHub**
2. Pick this repository.
3. Build settings come from `netlify.toml` (publish `.`, functions `netlify/functions`).
4. Deploy.

## Checking it's live

Open the site and look at the little pill near the top:

- **"Live — synced to everyone"** = working
- **"Demo mode — deploy to sync"** = the function isn't reachable yet

## Local development

Requires [Node.js](https://nodejs.org). Then:

```bash
npm install
npx netlify dev
```

## Contributing

Push changes to a branch and open a pull request, or commit to `main` to deploy.

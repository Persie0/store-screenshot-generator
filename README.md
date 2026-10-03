# Store Screenshot Generator

A browser-only app for turning app screenshots into App Store and Google Play creatives. Upload screenshots, enter a Google Gemini API key, review the English creative, approve it, then generate translations and export the platform-sized artwork or project as ZIP files.

## Run locally

```sh
npm install
npm run dev
```

## Build and test

```sh
npm test
npm run build
```

## Deploy on Vercel

Import `Persie0/store_screenshot_generator` as a new Vercel project. The included `vercel.json` configures the Vite build and static output. No ChatGPT account or sign-in is used by this app; the deployed site is publicly reachable. Each user supplies their own Gemini API key in the browser. The key is saved in that browser's local storage so it can be reused for new projects, is used for direct Google Gemini API requests, and is never stored inside saved projects. Screenshots and projects are persisted locally in that user's browser.

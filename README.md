# SongForge – AI Music Generator

A web app that lets users generate full songs with AI, powered by the [sunoapi.org](https://docs.sunoapi.org/) API.
It's a static frontend plus Netlify Functions, so your API key stays on the server and is never sent to the browser.

## Features

- **Simple mode**: describe a song in plain words and lyrics are written for you.
- **Custom mode**: your own title, lyrics, style, styles to avoid, vocal gender, length, style weight, weirdness and variety.
- **AI lyrics writer**: generate lyrics from a short idea, then edit them.
- Models: V6 (default), V6 Wild, V6 Mini.
- Live progress, streaming playback while tracks finish, MP3 download, lyrics view.
- Song history saved in the browser, and a remaining-credits indicator.
- Optional password so strangers can't spend your credits.

## Deploy on Netlify

1. In Netlify choose **Add new site → Import an existing project** and pick this repo.
   Build settings come from `netlify.toml` (publish `public`, functions `netlify/functions`), and no build command is needed.
2. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY`: your key from https://sunoapi.org/api-key
   - `APP_PASSWORD` (optional but recommended): a password users must enter before generating.
3. Trigger a redeploy (**Deploys → Trigger deploy**) so the functions pick up the variables.

## How it works

| App endpoint | Suno API call |
| --- | --- |
| `POST /api/generate` | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics` | `POST /api/v1/lyrics` |
| `GET /api/lyrics-status?taskId=` | `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | `GET /api/v1/generate/credit` |
| `POST /api/callback` | Receives Suno's required callback and acknowledges it |

The browser polls the status endpoint every 5 seconds until the tracks are ready, which usually takes 1 to 3 minutes.
Suno keeps generated files for 14 days, so download the songs you want to keep.

## Local development

```bash
npm i -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

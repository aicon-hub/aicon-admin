# AiCoN Admin

Phone-first admin dashboard for [aicon-hub.github.io](https://aicon-hub.github.io). Compose a post, preview it with the real site styles, and publish it to the website repo in one commit. Icons and other images can be pushed to the repo too.

## What it does

- **New post** - form tuned to every AiCoN post type (AI tool, Android app, PC/Linux tool, scholarship, govt service, digital safety, learning, offer, event, news). It builds the article HTML in the current site template, adds the card on top of `posts/index.html`, and commits any icon/logo you attach. Deadlines become `data-deadlines` on the card so they show in the site's Closing soon row.
- **Preview** - renders the article with the live site CSS before anything is committed.
- **Publish** - one atomic commit through the GitHub API (article + posts/index.html + icon). The repo's existing Pages build then refreshes the home page, search and sitemap. After publishing it gives you the WhatsApp caption and Telegram text to copy, plus an optional one-tap **Send to Telegram** button (dispatches the repo's existing `telegram.yml` workflow, so the bot token stays in GitHub secrets).
- **Assets** - push icons, logos and posters into any folder of the site repo.
- **Posts** - the newest guides as readers see them.

## Setup (one time)

The dashboard talks to GitHub with a fine-grained personal access token that you create on the `aicon-hub` account:

1. github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
2. Name `aicon-admin`, expiration 90 days.
3. Repository access: only `aicon-hub/aicon-hub.github.io`.
4. Repository permissions: **Contents: Read and write** (required). **Actions: Read and write** (optional, enables the Telegram button).
5. Paste the token in the dashboard's Setup tab.

The token is stored only in the browser's localStorage on your own device. It is never committed, never logged, and only ever sent to api.github.com.

## Safety

- This repo contains no secrets. Never commit a token.
- Publishing overwrites nothing silently: if the slug already exists, the dashboard asks before replacing the post.
- Every publish is a normal git commit, so anything can be reverted from the repo history.

## Stack

Plain HTML/CSS/JS, no build step, no third-party scripts (only Google Fonts, same as the site). Hosted on GitHub Pages from this repo.

# PhyBot

A self-hosted, multi-purpose Discord bot with a web control panel. It streams
music from YouTube, SoundCloud and Spotify links, manages community features
such as auto-roles and events, announces games that are currently free, and can
listen and answer in Turkish through free speech and language services.

Everything the bot can do is also available from the dashboard, including
changing the bot's own name, avatar, banner, description and presence.

## Features

### Music

- Play from a YouTube, SoundCloud or Spotify link, or from plain search words
  (prefix a search with `sc:` to search SoundCloud instead of YouTube)
- Playlists and albums are imported in one request, optionally shuffled
- Queue with add, add-next, remove, move, jump, clear and duplicate removal
- Previous track, next track, play again, stop, pause and resume
- Rewind and fast forward in 5 second steps, or seek to an exact position
- Repeat one track or the whole queue, random order, and autoplay of related
  tracks when the queue runs out
- Volume control, per-server default volume and idle disconnect timeout
- A live music panel in the chosen music channel: the current track, a progress
  bar, the whole queue and working control buttons. Each new track posts a fresh
  panel at the bottom and clears the previous one, so the queue is always in
  view; playback changes update that message in place
- The voice channel status shows the track that is playing, with a music note
- Autoplay keeps similar music going when the queue runs out, seeded from the
  track that just finished

### Soundboard

- Upload short clips (up to 30 seconds) and give each one a name
- Play them with `/sound <name>`, with their own slash command such as
  `/airhorn`, or by clicking a card in the dashboard
- Clips play over the music, which resumes by itself afterwards

### Images

- Generate images locally with FLUX.2-klein-4B, so nothing leaves the machine
  and there is nothing to pay for
- One to four images per prompt, from Discord with /imagine or from the
  dashboard, with buttons to upscale or keep each one
- Defaults to 512 by 512 at four steps; larger sizes are a setting away.
  About 5 GB of weights, which fits an 8 GB card comfortably
- Everything the generator needs lives in the Flux folder; run
  `npm run flux:setup` once to download it

### Speech

- Type text in the dashboard and the bot reads it out loud in a voice channel
- The voice list is a library, not a fixed set: install any of the 300 or more
  Microsoft neural voices, or point a voice at a local speech program to use a
  custom or cloned voice
- Pick the voice per message, in the dashboard or with /say

### Community

- Automatic role for new members (with a separate role for bots)
- Welcome and goodbye messages with `{user}`, `{username}`, `{server}` and
  `{memberCount}` placeholders
- Events with RSVP buttons (going, maybe, declined), capacity limits and
  reminders before the start
- Button role panels for self-assignable roles
- Custom commands (plain text, embed, or random line) usable as slash commands
  or with a message prefix

### Free games

- Checks Epic Games and Steam giveaways every 30 minutes
- Posts new offers to a channel you choose per server, optionally mentioning a
  role
- Each game is announced once and never again, even if the store changes its
  offer id or the giveaway comes back later

### Assistant

- Understands and replies in Turkish (or English) using a free provider:
  Google Gemini, Groq, or a fully local Ollama model
- Optional voice mode: say the wake word ("fay" by default), ask a question or
  give an order, and it answers out loud in the voice channel. For 15 seconds
  after each reply you can keep talking without repeating the wake word, and
  saying the wake word again cuts a reply short
- It both chats and acts: small talk gets a spoken answer, while "play this",
  "skip", "turn it down" control the player directly

### Dashboard

- Live player with progress bar, queue management and search
- Server settings, events, role panels, custom commands, free game offers and
  assistant settings
- Bot profile editor (username, description, tags, avatar, banner, presence)
- Live log console

## Requirements

- Node.js 22.5 or newer (Node 24 LTS recommended)
- A Discord application with a bot user
- No paid service is required. ffmpeg and yt-dlp are downloaded automatically
  during installation.

Optional:

- A Spotify account and a free Spotify application, to import playlists
  completely (Spotify links still work without one, see "Spotify setup")
- A Gemini or Groq API key (both have free tiers), or a local Ollama install,
  for the assistant

## Installation

### Windows

```powershell
git clone <your-repository-url> PhyBot
cd PhyBot
npm install
```

### macOS and Linux

```bash
git clone <your-repository-url> PhyBot
cd PhyBot
npm install
```

`npm install` also creates a `.env` file from `.env.example` and downloads the
ffmpeg and yt-dlp binaries into `node_modules`.

## Discord application setup

1. Open <https://discord.com/developers/applications> and create an application.
2. Under **Bot**, add a bot user and copy the token into `DISCORD_TOKEN`.
3. On the same page enable both privileged intents:
   **Server Members Intent** and **Message Content Intent**.
   The bot cannot start without them.
4. Copy the **Application ID** from **General Information** into
   `DISCORD_CLIENT_ID`, and your own Discord user id into `DISCORD_OWNER_ID`.
5. Invite the bot with the link shown on the dashboard's Bot profile page, or
   build one with the `bot` and `applications.commands` scopes and the
   permissions: View Channels, Send Messages, Embed Links, Attach Files, Read
   Message History, Connect, Speak, Manage Roles, Manage Messages.
6. Move the bot's role above any role it should be able to assign.

## Spotify setup (optional)

Spotify links work out of the box: single tracks, albums and artists are read
through the Web API, and playlists fall back to Spotify's public page, which
shares at most 100 tracks per playlist.

Link your own Spotify account once and your own playlists, private ones
included, import completely with no track limit:

1. Create a free application at <https://developer.spotify.com/dashboard> and
   put its client id and secret into `SPOTIFY_CLIENT_ID` and
   `SPOTIFY_CLIENT_SECRET`.
2. In that application's settings, add the redirect URI
   `http://127.0.0.1:8420/api/spotify/callback` (adjust the port if you changed
   `WEB_PORT`). The dashboard shows the exact value to paste.
3. Start the bot, open the dashboard, and use **Connect Spotify** on the
   overview page. You will be sent to Spotify to approve read access to your
   playlists and back again.

The link is stored in the local database and can be removed at any time with
**Disconnect**. The bot never plays Spotify audio; it only reads the track list
and finds each song on YouTube.

## Configuration

All configuration lives in `.env` in the project root. `.env.example` documents
every value; the important ones are:

| Variable                                        | Purpose                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `DISCORD_TOKEN`                                 | Bot token. Required.                                                           |
| `DISCORD_CLIENT_ID`                             | Application id, used to register slash commands. Required.                     |
| `DISCORD_OWNER_ID`                              | Your Discord user id, used for owner-only commands.                            |
| `DISCORD_DEV_GUILD_ID`                          | Optional. Registers commands in one server instantly instead of globally.      |
| `DASHBOARD_PASSWORD`                            | Password for the web dashboard. Must be set before you can sign in.            |
| `WEB_HOST`, `WEB_PORT`                          | Where the dashboard listens. Defaults to `127.0.0.1:8420`.                     |
| `DATA_DIR`                                      | Where the SQLite database and generated keys are stored. Defaults to `./data`. |
| `TIMEZONE`                                      | Timezone used for event times and reminders. Defaults to `Europe/Istanbul`.    |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`    | Optional, needed to link a Spotify account for complete playlists.             |
| `SPOTIFY_REDIRECT_URI`                          | Optional override for the Spotify callback URL.                                |
| `AI_PROVIDER`, `AI_STT_PROVIDER`                | `gemini`, `groq`, `ollama` or `none`.                                          |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OLLAMA_HOST` | Credentials for the chosen provider.                                           |
| `AI_TTS_VOICE`, `AI_LANGUAGE`, `AI_WAKE_WORD`   | Assistant voice, language and wake word.                                       |

Per-server options (auto-role, welcome messages, music channel, free game
channel, DJ role, assistant channel) are stored in the database and edited from
the dashboard or with `/config`.

## Running

Build once and start:

```bash
npm run build
npm start
```

Then open <http://127.0.0.1:8420> and sign in with `DASHBOARD_PASSWORD`.

On Windows you can also double-click `start.bat`, and on macOS or Linux run
`./start.sh`. Both install dependencies and build the dashboard on first run,
and both keep watching the bot so it can restart itself.

### Restarting

Use **Restart bot** on the dashboard overview page, or `/restart` in Discord.
Playback stops and the bot is back in a few seconds. This is how changes to
`.env` are picked up.

Started through `start.bat` or `start.sh`, the launcher brings the bot back and
the console window keeps its log output. Started any other way, the bot spawns
a replacement process for itself.

After changing the source code, build before restarting:

```bash
npm run build
```

For development with automatic reloads and the Vite dev server on port 5173:

```bash
npm run dev
```

Other scripts:

```bash
npm test
npm run typecheck
npm run deploy-commands --workspace @phybot/server
```

## Usage

Slash commands are registered automatically when the bot starts. `/help` lists
them inside Discord.

| Command                                                                       | What it does                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/play <query>`                                                               | Play or queue a link, playlist or search                   |
| `/search <words>`                                                             | Show the top results for a search                          |
| `/nowplaying`                                                                 | Show the current track with control buttons                |
| `/pause`, `/resume`, `/stop`                                                  | Basic transport controls                                   |
| `/skip [count]`, `/previous`, `/replay`                                       | Move between tracks                                        |
| `/forward [seconds]`, `/rewind [seconds]`                                     | Jump 5 seconds (or a custom amount)                        |
| `/seek <position>`                                                            | Jump to `90`, `1:30` or `1:02:03`                          |
| `/queue [page]`, `/remove`, `/move`, `/jump`, `/clear`, `/dedupe`             | Manage the queue                                           |
| `/shuffle [random-order]`                                                     | Mix the queue once, or keep picking at random              |
| `/panel`                                                                      | Post the live music panel with the queue and controls here |
| `/loop <off\|track\|queue>`, `/autoplay`, `/volume`                           | Playback modes                                             |
| `/join`, `/leave`                                                             | Move the bot in and out of voice                           |
| `/event create\|list\|publish\|cancel`                                        | Events with RSVP buttons                                   |
| `/sound <name>`, `/sounds`                                                    | Play a soundboard clip, or list them                       |
| `/imagine <prompt> [count]`                                                   | Generate one to four images locally                        |
| `/freegames [refresh]`                                                        | Show games that are free right now                         |
| `/config view\|autorole\|welcome\|goodbye\|freegames\|music-channel\|dj-role` | Server configuration                                       |
| `/ask <message>`, `/listen <on\|off>`, `/say <text> [voice]`                  | Assistant                                                  |
| `/help`, `/ping`, `/stats`, `/invite`                                         | Utility                                                    |
| `/restart`                                                                    | Restart the bot after an update (owner only)               |

Playback commands respect the DJ role when one is configured, and require the
member to be in the same voice channel as the bot.

All built-in commands are Discord slash commands, so they always start with `/`.
The message prefix in the server settings (`!` by default) applies only to your
own custom commands, and only to the ones whose slash switch is turned off.

## Project structure

```
PhyBot
├── apps
│   ├── server          Bot, REST API and websocket server
│   │   └── src
│   │       ├── ai          Assistant: providers, speech to text, text to speech
│   │       ├── api         Fastify routes, session auth, websocket hub
│   │       ├── core        Config, logging, event bus, errors, time helpers
│   │       ├── db          SQLite connection, migrations, repositories
│   │       ├── discord     Client, slash commands, interactions, embeds
│   │       ├── features    Auto-role, events, role panels, free games
│   │       └── music       Resolvers, queue, player, streaming
│   └── web             React dashboard
├── packages
│   └── shared          Types, validation schemas and helpers used by both
├── scripts             Install helpers
└── data                SQLite database and generated keys (not in git)
```

## Troubleshooting

**The bot does not start and the log mentions disallowed intents.**
Enable Server Members Intent and Message Content Intent on the Bot page of your
Discord application, then restart.

**Sign in says the password is not set.**
`DASHBOARD_PASSWORD` in `.env` is still the placeholder. Set a real password and
restart.

**Music does not play or yt-dlp is reported as missing.**
Run `npm install` again with a working network connection. The binaries live in
`node_modules/youtube-dl-exec/bin` and `node_modules/ffmpeg-static`.

**A YouTube video fails with an age or region error.**
Export cookies from a signed-in browser session in Netscape format and point
`YOUTUBE_COOKIES_FILE` at the file.

**A Spotify playlist only queued 100 songs.**
That happens for playlists owned by other people. Spotify only serves playlist
contents to the account that owns them, so someone else's playlist is read from
the public Spotify page instead, and that page shares at most 100 tracks. Your
own playlists import completely once your account is linked on the dashboard
overview page. Tracks, albums and artist links are unaffected either way.

**The bot cannot give the auto-role.**
Move the bot's own role above the role it should assign, and make sure it has
the Manage Roles permission.

**The dashboard shows no servers.**
The bot has not connected yet, or it is not a member of any server. Check the
status card on the overview page and the log console.

## Development

- `npm run dev` runs the shared package in watch mode, the server with reload,
  and the Vite dev server. The dev server proxies `/api` to the bot process.
- `npm run typecheck` and `npm test` cover every workspace.
- Database changes are additive: add a new entry to
  `apps/server/src/db/migrations.ts`, never edit an applied one.
- The REST and websocket contract is shared through `packages/shared`; adding a
  field there updates both the server and the dashboard types.

## License

Private project. All rights reserved.

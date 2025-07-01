This Project is based on [instauto](https://github.com/mifi/instauto), since the original project is not maintained anymore and out of date.

Main goal here is to migrate to latest tooling (updated Puppeteer, eslint, prettier), migration to typescript and more readable and easier improvable codebase.

# Setup

- Install Node 23.6.0 or higher
- Install dependencies `npm install`
- Make a copy of [settings.example.json](settings.example.json) and name it `.settings.json` and fill it with your credentials. Adjust other settings as needed.
- Run the bot with `npm run start`

Your instagram account should be set to english.

# Roadmap

- refactor codebase into smaller files
- Add support for multiple accounts
- Find a way to scrap data without instagram blocking us (I guess it is the getting the user data from the page)
- Fix running puppeteer with chromium or firefox (`page.goto()` timeout after the initialization)

# Features

- Follow the followers of some particular users. (e.g. celebrities.) Parameters like max/min ratio for followers/following can be set.
- Unfollow users that don't follow us back. Will not unfollow any users that we recently followed.
- Unfollow auto followed users (also those following us back) after a certain number of days.
- The code automatically prevents breaching 100 follow/unfollows per hour or 700 per 24hr, to prevent bans. This can be configured.

# Tips

Run this on a machine with a non-cloud IP to avoid being banned

# Troubleshooting

- running in Docker / Pi
  - Currently running this bot with something else than chrome results in a timeout of `page.goto()`, so you need to run it with chrome, chromium does not work.

# Support

Support this project with a [donation (paypal.me/hellotece)](https://paypal.me/hellotece) or make a pull request.

This Project is based on [instauto](https://github.com/mifi/instauto), since the original project is not maintained anymore and out of date.

Main goal here was to migrate to latest tooling (updated Puppeteer, eslint, prettier), migration to typescript and more readable and easier improvable codebase.
Also added new features like muting followed users and generally keeping the features up to date with latest instagram changes.

# Setup

- Install Node 21.0.0 or higher
- Install dependencies `npm install`
- Either use the [default config](config/default/options.ts) and fill out the credentials and/or adjust the other options as needed. Or duplicate the [default folder](config/default) and name it `config/your-config-name`.
- First start needs to be run with password as second argument. For example: `npm run start default MyPassword`.
  - Else run the bot with `npm run start` or `npm run start your-config-name`.
- This is also how you can have different accounts and configs and run them in parallel.

Your instagram account should be set to english.

# Roadmap

- Fix taking screenshots
- Fix running puppeteer with chromium or firefox (`page.goto()` timeout after the initialization)

# Features

- Follow the followers of some particular users. (e.g. celebrities.) Parameters like max/min ratio for followers/following can be set.
- Unfollow users that don't follow us back. Will not unfollow any users that we recently followed.
- Unfollow auto followed users (also those following us back) after a certain number of days.
- The code automatically prevents breaching 100 follow/unfollows per hour or 700 per 24hr, to prevent bans. This can be configured.
- Have different configs for different accounts and run them in parallel.
- Mute followed users (follow and mute stories and posts)

# Tips

Run this on a machine with a non-cloud IP to avoid being banned

# FAQ

- How to run the bot with a different config?
  - Duplicate the [default folder](config/default) and name it `config/your-config-name`.
  - Adjust the options in the `options.ts` file.
  - Run the bot with `npm run start your-config-name`.
  - This is also how you can have different accounts and configs and run them in parallel.

# Troubleshooting

- running in Docker / Pi
  - Currently running this bot with something else than chrome results in a timeout of `page.goto()`, so you need to run it with chrome, chromium does not work.

# Support

Support this project with a [donation (paypal.me/hellotece)](https://paypal.me/hellotece) or make a pull request.

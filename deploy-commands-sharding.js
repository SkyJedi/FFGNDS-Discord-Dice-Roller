// One-off script to register the bot's slash commands with Discord - sharding-safe variant of
// deploy-commands.js. That script logs in a full discord.js Client, which opens a real gateway
// connection just to read client.application.id - fine when the bot isn't already running, but
// registering commands is a pure REST call and doesn't need a gateway session at all. Logging in
// a second session while start.js's ShardingManager already has shards connected is unnecessary
// and, at scale, competes for the same session-start-limit bucket those shards use to
// (re)identify. This script talks to the REST API directly instead, so it's safe to run anytime,
// including while the sharded bot is live, and doesn't care how many shards exist.
// Run manually after changing commands.js: `npm run deploy-commands-sharding`
// Global commands can take up to an hour to propagate to all servers.
const { REST, Routes } = require('discord.js');
const { token } = require('./config');
const commands = require('./commands');
const { inviteUrl } = require('./modules/functions');

// A bot token is `<base64 application id>.<base64 timestamp>.<base64 hmac>` - decoding the first
// segment gives our own application (client) ID locally, without an API round trip to look it up.
const clientId = Buffer.from(token.split('.')[0], 'base64').toString('utf8');

const rest = new REST().setToken(token);

(async () => {
    try {
        const result = await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`Registered ${result.length} global application commands.`);
        console.log(
            'Slash commands only appear in a server if the bot was authorized there with the ' +
            "applications.commands scope. If a server was invited before this migration, re-invite " +
            'it (safe to run again on an existing install - it will not duplicate the bot) with:\n' +
            inviteUrl(clientId)
        );
    } catch (error) {
        console.error(error);
    }
})();

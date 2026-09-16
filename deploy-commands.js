// One-off script to register the bot's slash commands with Discord.
// Run manually after changing commands.js: `npm run deploy-commands`
// Global commands can take up to an hour to propagate to all servers.
const { Client, GatewayIntentBits } = require('discord.js');
const { token } = require('./config');
const commands = require('./commands');
const { inviteUrl } = require('./modules/functions');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    try {
        const result = await client.application.commands.set(commands);
        console.log(`Registered ${result.size} global application commands.`);
        console.log(
            'Slash commands only appear in a server if the bot was authorized there with the ' +
            "applications.commands scope. If a server was invited before this migration, re-invite " +
            'it (safe to run again on an existing install - it will not duplicate the bot) with:\n' +
            inviteUrl(client.application.id)
        );
    } catch (error) {
        console.error(error);
    } finally {
        client.destroy();
    }
});

client.login(token).catch(error => console.error(error));

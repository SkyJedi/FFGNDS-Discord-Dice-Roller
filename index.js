/*
  Developed by Astrydax, aka Royalcrown28 for vampwood
  For Custom Discord Bots please email me at Astrydax@gmail.com
*/
const { Client, Options, Partials, GatewayIntentBits, EmbedBuilder, Colors } = require('discord.js');
const { token } = require('./config');
const handlers = require('./handlers');

const ClientOptions = {
    makeCache: Options.cacheWithLimits({
        MessageManager: 10
    }),
    partials: [Partials.Channel],
    //GuildMessages/DirectMessages/MessageContent are only needed to catch people still using the old
    //! commands and point them at re-inviting the bot - see handlers.onLegacyMessage
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent]
};
const client = new Client(ClientOptions);

//Discord invalidates an interaction if it isn't acknowledged within ~3s (a redeploy/restart or a
//network blip catching it mid-flight, most often), and a followUp/editReply/deleteReply can
//likewise fail if the interaction or message it targets is already gone - neither is fixable on
//our end, so both log as a short one-liner instead of dumping the full DiscordAPIError stack
//trace every time. Used here and by every module's interaction .catch()es (see roll.js,
//reroll.js, destiny.js, char.js) that clean up an ephemeral message once they're done with it.
const EXPECTED_DISCORD_ERROR_CODES = { 10062: 'Unknown interaction', 10008: 'Unknown Message' };
const logError = (context, error) => {
    const reason = EXPECTED_DISCORD_ERROR_CODES[error?.code];
    if (reason) {
        console.error(`${context}: ${reason} (${error.code}) - interaction/message no longer available, nothing to do`);
        return;
    }
    console.error(context, error);
};

//none of the interactionCreate/messageCreate/threadCreate listeners below are awaited by
//discord.js, and none of the handler chains they call into (onInteraction's command switch,
//onComponent's per-module button routers, ...) wrap themselves in try/catch - so a single
//rejected editReply/followUp/etc. anywhere in that chain (a stale interaction token, a Discord
//API hiccup, a bug) becomes an unhandled promise rejection. Node crashes the whole process on
//those by default, which looks like the shard randomly dying and needing a full respawn+reconnect
//instead of just failing that one interaction - these .catch()s and the process-level handlers
//below keep a single bad interaction from taking the shard down.
process.on('unhandledRejection', (error) => logError('Unhandled promise rejection', error));
process.on('uncaughtException', (error) => logError('Uncaught exception', error));

client.login(token).catch(error => console.error(error));

// Register our event handlers (defined below):
client.on('interactionCreate', interaction => handlers.onInteraction({ interaction, client }).catch((error) => logError('onInteraction', error)));
client.on('messageCreate', message => handlers.onLegacyMessage({ message, client }).catch(console.error));
client.on('clientReady', async () => {
});

client.on('threadCreate', async (thread) => {
        if (thread.joinable) await thread.join().catch(console.error);
    }
);

//tracks which interactions we've already sent an initial response to, so repeated calls know to
//follow up with a new message instead of racing to edit the same one. interaction.replied only flips
//to true *after* the reply's HTTP call resolves, which is too late for back-to-back unawaited calls
//(e.g. crit.js sending a roll announcement immediately followed by the injury text), so this is
//tracked synchronously ourselves instead of relying on that property.
const respondedInteractions = new WeakSet();

//wraps plain text in a simple embed so every response - including the many string-based call
//sites throughout modules/ - renders as an embed instead of raw message content
const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

const respond = (interaction, payload) => {
    if (typeof payload === 'string') payload = { embeds: [textEmbed(payload)] };
    const alreadyResponded = respondedInteractions.has(interaction);
    respondedInteractions.add(interaction);
    const send = alreadyResponded ? interaction.followUp(payload) : interaction.editReply(payload);
    return send.catch((error) => logError('respond', error));
};

const sendMessage = ({ interaction, embed, text, attachment }) => {
    const response = {};
    if (embed) {
        response.embeds = [embed];
    } else if (text) {
        response.embeds = [textEmbed(text)];
    }

    if (attachment) {
        response.files = [attachment];
    }

    return respond(interaction, response);
}

exports.respond = respond;
exports.sendMessage = sendMessage;
exports.textEmbed = textEmbed;
exports.logError = logError;


/*
  Developed by Astrydax, aka Royalcrown28 for vampwood
  For Custom Discord Bots please email me at Astrydax@gmail.com
*/
const { Client, Options, Partials, GatewayIntentBits, EmbedBuilder, Colors } = require('discord.js');
const { token } = require('./config');
const handlers = require('./handlers');
const emoji = require('./modules/emoji');

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

//A handful of error codes are expected, non-actionable noise rather than real bugs, so they log
//as a short one-liner instead of dumping a full stack trace every time:
// - 10062/10008 (Discord): the interaction or message an editReply/followUp/deleteReply targeted
//   is already gone - most often because the interaction's ~3s acknowledgment window closed
//   (a redeploy/restart or network blip catching it mid-flight), which isn't fixable on our end.
// - ERR_IPC_CHANNEL_CLOSED (Node/discord.js): a shard's child process tried to notify the parent
//   ShardingManager over their internal IPC pipe (see start.js) after the parent had already
//   started shutting down - a normal race during a restart, not something our code triggers.
// - 50013 (Discord): the bot lacks a permission it needs in that channel (e.g. Send Messages) -
//   only a server admin can fix that, so there's nothing for our code to do about it either.
// Used here and by every module's interaction .catch()es (see roll.js, reroll.js, destiny.js,
// char.js) that clean up an ephemeral message once they're done with it.
const EXPECTED_ERROR_CODES = { 10062: 'Unknown interaction', 10008: 'Unknown Message', ERR_IPC_CHANNEL_CLOSED: 'IPC channel closed', 50013: 'Missing Permissions' };
const logError = (context, error) => {
    const reason = EXPECTED_ERROR_CODES[error?.code];
    if (reason) {
        console.error(`${context}: ${reason} (${error.code}) - nothing to do`);
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
    const count = await emoji.loadEmojis(client).catch((error) => logError('loadEmojis', error));
    if (count !== undefined) console.log(`Loaded ${count} application emoji`);
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


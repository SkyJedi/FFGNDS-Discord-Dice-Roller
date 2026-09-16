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

//none of the interactionCreate/messageCreate/threadCreate listeners below are awaited by
//discord.js, and none of the handler chains they call into (onInteraction's command switch,
//onComponent's per-module button routers, ...) wrap themselves in try/catch - so a single
//rejected editReply/followUp/etc. anywhere in that chain (a stale interaction token, a Discord
//API hiccup, a bug) becomes an unhandled promise rejection. Node crashes the whole process on
//those by default, which looks like the shard randomly dying and needing a full respawn+reconnect
//instead of just failing that one interaction - these .catch()s and the process-level handlers
//below keep a single bad interaction from taking the shard down.
process.on('unhandledRejection', (error) => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

client.login(token).catch(error => console.error(error));

// Register our event handlers (defined below):
client.on('interactionCreate', interaction => handlers.onInteraction({ interaction, client }).catch(console.error));
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
    return send.catch(console.error);
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


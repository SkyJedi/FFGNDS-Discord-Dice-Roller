const Discord = require('discord.js');
const { PermissionFlagsBits, Colors, MessageFlags } = Discord;
const { version } = require('./package.json');
const config = require('./config');
const { readData, writeData } = require('./modules/data');
const modules = require('./modules/');
const main = require('./index');
const swCommands = require('./modules/SW.GENESYS/').commands;
const l5rCommands = require('./modules/L5R/').commands;
const swCharacterComponent = require('./modules/SW.GENESYS/').characterComponent;
const swDestinyComponent = require('./modules/SW.GENESYS/').destinyComponent;
const swRollComponent = require('./modules/SW.GENESYS/').rollComponent;
const swInitiativeComponent = require('./modules/SW.GENESYS/').initiativeComponent;
const swRerollComponent = require('./modules/SW.GENESYS/').rerollComponent;
const l5rRollComponent = require('./modules/L5R/').rollComponent;
const l5rRerollComponent = require('./modules/L5R/').rerollComponent;

const SYSTEM_AGNOSTIC_COMMANDS = ['stats', 'ver', 'poly', 'swrpg', 'genesys', 'l5r', 'invite', 'help', 'roll'];
const SW_GENESYS_COMMANDS = ['character', 'crit', 'shipcrit', 'species', 'gleepglop', 'destiny', 'story', 'initiative', 'reroll', 'obligation', 'duty', 'oldroll'];
const L5R_COMMANDS = ['keep', 'add', 'reroll', 'oldroll'];
const ADMIN_COMMANDS = ['restart'];

//Routes button clicks and modal submissions from the interactive /character, /destiny, and /roll menus.
//Prefixed customIds let this stay a simple dispatch table as more features grow their own UIs.
const onComponent = async ({ interaction, client }) => {
    if (interaction.customId.startsWith('char:')) return swCharacterComponent({ interaction, client });
    if (interaction.customId.startsWith('destiny:')) return swDestinyComponent({ interaction, client });
    if (interaction.customId.startsWith('roll:')) return swRollComponent({ interaction, client });
    if (interaction.customId.startsWith('l5rroll:')) return l5rRollComponent({ interaction, client });
    if (interaction.customId.startsWith('init:')) return swInitiativeComponent({ interaction, client });
    if (interaction.customId.startsWith('reroll:')) return swRerollComponent({ interaction, client });
    if (interaction.customId.startsWith('l5rreroll:')) return l5rRerollComponent({ interaction, client });
};

//Called whenever a user triggers one of the bot's slash commands
const onInteraction = async ({ interaction, client }) => {
    if (interaction.isButton() || interaction.isModalSubmit()) return onComponent({ interaction, client });
    if (!interaction.isChatInputCommand()) return;

    //check to see if external emoji and embeds can be used (not applicable in DMs)
    if (interaction.guild && interaction.channel) {
        const permissions = interaction.channel.permissionsFor(client.user);
        if (permissions && !permissions.has(PermissionFlagsBits.UseExternalEmojis)) {
            await interaction.reply({
                embeds: [new Discord.EmbedBuilder().setColor(Colors.DarkNavy).setDescription(`Please enable \'Use External Emoji\' permission for ${client.user.username}`)],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        //this one can't be an embed - the bot lacks the very permission that would let it send one
        if (permissions && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
            await interaction.reply({
                content: `Please enable \'Embed Links\' permission for ${client.user.username}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    const command = interaction.commandName;

    //every button-driven menu is ephemeral (visible only to whoever ran the command) - each one's
    //onComponent router closes out with a public followUp() once something actually happens (a
    //roll, a pool change, a character update, ...), so the table still sees the result even though
    //the menu itself is private. A message's ephemeral flag is fixed at its first reply/deferReply
    //and can never change on later edits, so this has to be decided here before that goes out.
    // NOTE: this means these menus' buttons only work for the person who ran the command - nobody
    // else in the channel can see or click them, even for shared trackers like /destiny or /initiative.
    const EPHEMERAL_COMMANDS = ['roll', 'reroll', 'character', 'destiny', 'story', 'initiative'];
    await interaction.deferReply(EPHEMERAL_COMMANDS.includes(command) ? { flags: MessageFlags.Ephemeral } : undefined);
    const messageRef = modules.asMessageRef(interaction);

    //get channelEmoji
    let channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(console.error);

    console.log(`${interaction.user.username}, ${command}, ${new Date()}`);

//************************COMMANDS START HERE************************

    switch (command) {
        case 'stats':
            await modules.stats({ client, interaction });
            break;
        case 'ver':
            await main.sendMessage({ interaction, text: `${client.user.username}: version: ${version}` });
            break;
        case 'poly':
            modules.poly(interaction);
            break;
        case 'swrpg':
        case 'genesys':
        case 'l5r':
            writeData(client, messageRef, 'channelEmoji', command);
            await main.sendMessage({
                interaction, text: `${client.user.username} will now use ${command} dice`
            });
            break;
        case 'invite':
            const embed = new Discord.EmbedBuilder()
                .setColor(Colors.Grey)
                .setTitle(`**Invite**`)
                .setDescription(`Click [here](${modules.inviteUrl(client.user.id)}) to invite the bot to your server!`);
            await main.sendMessage({ interaction, embed });
            break;
    }
    let recognized = SYSTEM_AGNOSTIC_COMMANDS.includes(command);

    if (interaction.user.id === config.adminID) {
        if (ADMIN_COMMANDS.includes(command)) recognized = true;
        await modules.admin({ client, interaction, command });
    }
    switch (channelEmoji) {
        case 'swrpg':
        case 'genesys':
            if (SW_GENESYS_COMMANDS.includes(command)) recognized = true;
            await swCommands({ client, interaction, command, channelEmoji });
            break;
        case 'l5r':
            if (L5R_COMMANDS.includes(command)) recognized = true;
            await l5rCommands({ client, interaction, command, channelEmoji });
            break;
        default:
            break;
    }

    //never leave an interaction hanging if the command isn't valid here (e.g. an admin-only or
    //system-specific command used without permission or in the wrong channel mode)
    if (!recognized) {
        await main.respond(interaction, 'This command is not available in this channel.');
    }
};

//The bot now only responds to slash commands, but people used to the old ! commands won't see that
//until something tells them - this catches messages that still use the old prefix and points them at
//re-inviting the bot with the applications.commands scope it needs for slash commands to appear at all.
const onLegacyMessage = async ({ message, client }) => {
    if (message.author.bot) return;

    let prefix = await readData(client, message, 'prefix').catch(() => null);
    if (!prefix) prefix = config.prefix;
    if (!prefix || !message.content.startsWith(prefix)) return;

    await message.reply(
        `${client.user.username} now uses Discord's slash commands instead of \`${prefix}\` commands - type \`/\` to see what's available. ` +
        `If you don't see any slash commands for ${client.user.username}, ask a server admin to re-authorize the bot (this won't duplicate or remove it) here: ${modules.inviteUrl(client.user.id)}`
    ).catch((error) => main.logError('onLegacyMessage', error));
};

exports.onInteraction = onInteraction;
exports.onLegacyMessage = onLegacyMessage;

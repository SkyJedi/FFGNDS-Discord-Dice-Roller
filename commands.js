const { SlashCommandBuilder } = require('discord.js');

// Every free-text command reuses a single "input" string option so the
// existing param-array-based command logic (char.js, initiative.js, reroll.js, ...)
// keeps working unchanged - see modules/functions.js's getParams() and handlers.js.
const withInput = (builder, description, required = false) =>
    builder.addStringOption(option =>
        option.setName('input').setDescription(description).setRequired(required));

// /character takes no options - it opens an interactive button/modal menu instead.
// See modules/SW.GENESYS/char.js (the slash command entry point and the button/modal router).

const commands = [
    // System-agnostic
    // /roll takes no options for any system now - it opens an interactive button-driven pool
    // builder instead. See modules/SW.GENESYS/roll.js and modules/L5R/roll.js for the button/modal
    // routers. (/add still takes free-text dice identifiers for L5R channels - see below.)
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Rolls dice for the system currently active in this channel.'),
    withInput(
        new SlashCommandBuilder().setName('poly').setDescription('Rolls polyhedral dice with an optional modifier.'),
        'Polyhedral dice, e.g. 1d4 2d6+1 1d100-60', true
    ),
    withInput(
        new SlashCommandBuilder().setName('help').setDescription('Shows help for a topic.'),
        'Topic, e.g. roll, character, destiny, initiative'
    ),
    new SlashCommandBuilder().setName('swrpg').setDescription('Use Star Wars: Edge of the Empire / Age of Rebellion / Force and Destiny dice in this channel.'),
    new SlashCommandBuilder().setName('genesys').setDescription('Use Genesys dice in this channel.'),
    new SlashCommandBuilder().setName('l5r').setDescription('Use Legend of the Five Rings dice in this channel.'),
    new SlashCommandBuilder().setName('ver').setDescription('Shows the bot version.'),
    new SlashCommandBuilder().setName('invite').setDescription('Get an invite link for this bot.'),
    new SlashCommandBuilder().setName('stats').setDescription('Shows server and member stats.'),

    // SW / Genesys only
    new SlashCommandBuilder().setName('character').setDescription('Simple character stat manager (SWRPG/Genesys channels).'),
    withInput(
        new SlashCommandBuilder().setName('crit').setDescription('Rolls and displays a critical injury (SWRPG/Genesys channels).'),
        '+10, -10, or 54? to look up a specific roll'
    ),
    withInput(
        new SlashCommandBuilder().setName('shipcrit').setDescription('Rolls and displays a ship critical hit (SWRPG/Genesys channels).'),
        '+10, -10, or 54? to look up a specific roll'
    ),
    // /oldroll is the pre-button-UI free-text dice code /roll used to use, kept for players who'd
    // rather type a code than click through the button pool builder - see
    // modules/SW.GENESYS/roll.js's oldRoll().
    new SlashCommandBuilder()
        .setName('oldroll')
        .setDescription('Rolls dice using the old dice-code syntax, e.g. yygggrrpp (SWRPG/Genesys channels).')
        .addStringOption(option =>
            option.setName('input').setDescription('Dice code, e.g. yygggrrpp or 2y 3g 2r 2p').setRequired(true))
        .addStringOption(option =>
            option.setName('text').setDescription('Assigns a label to the roll. (optional)')),
    // /species and /gleepglop are the same command under two names (a holdover from the old
    // !species/!gleepglop prefix aliases - slash commands can't alias one another, so both are
    // registered separately). See modules/SW.GENESYS/commands.js's dispatch switch.
    new SlashCommandBuilder().setName('species').setDescription('Picks a random species (SWRPG/Genesys channels).'),
    new SlashCommandBuilder().setName('gleepglop').setDescription('Picks a random species (SWRPG/Genesys channels).'),
    // /destiny and /story take no options - they open an interactive button/modal menu instead.
    // See modules/SW.GENESYS/destiny.js (the slash command entry point and the button/modal router).
    new SlashCommandBuilder().setName('destiny').setDescription('Manages the destiny pool (SWRPG/Force and Destiny channels).'),
    new SlashCommandBuilder().setName('story').setDescription('Manages the story pool (Genesys channels).'),
    // /initiative takes no options - it opens an interactive button/modal menu instead.
    // See modules/SW.GENESYS/initiative.js.
    new SlashCommandBuilder().setName('initiative').setDescription('Initiative tracker (SWRPG/Genesys channels).'),
    // /reroll takes no options for any system now - it opens an interactive button menu instead.
    // See modules/SW.GENESYS/reroll.js and modules/L5R/reroll.js.
    new SlashCommandBuilder().setName('reroll').setDescription('Modifies the previous roll (SWRPG/Genesys/L5R channels).'),
    new SlashCommandBuilder().setName('obligation').setDescription('Gathers all obligation and rolls to trigger (SWRPG channels).'),
    new SlashCommandBuilder().setName('duty').setDescription('Gathers all duty and rolls to trigger (SWRPG channels).'),

    // L5R only
    withInput(
        new SlashCommandBuilder().setName('keep').setDescription('Keeps specific dice from the previous roll (L5R channels).'),
        'Positions to keep, e.g. 12', true
    ),
    withInput(
        new SlashCommandBuilder().setName('add').setDescription('Adds dice to the previous roll (L5R channels).'),
        'Dice to add, e.g. ww', true
    ),

    // Admin only
    new SlashCommandBuilder().setName('restart').setDescription('Restarts all shards.').setDefaultMemberPermissions(0),
    new SlashCommandBuilder().setName('build').setDescription('Rebuilds the emoji cache from the configured guilds.').setDefaultMemberPermissions(0)
].map(command => command.toJSON());

module.exports = commands;

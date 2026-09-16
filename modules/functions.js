const { random } = require('lodash');

const dice = sides => random(1, sides);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

const polyhedral = (sides, str, interaction) => {
    //required lazily (not at module load) to avoid a load-order-dependent circular require with
    //../index, which itself transitively requires this file via modules/index.js's barrel exports
    const main = require('../index');
    let total = 0, r = 0, text = '', modifier;
    if (str.length > 0) modifier = +(str[str.length - 1]).replace(/\D/g, '');
    //no modifier
    if (str.length < 1) {
        total = dice(sides);
        text = ` rolled a d${sides}: ${total}`;
        //addition modifier
    } else if (str.some(e => e.includes('+'))) {
        r = dice(sides);
        total = r + modifier;
        text = ` rolled a d${sides}: ${r} + ${modifier} for at total of ${total}`;
        //subtraction modifier
    } else if (str.some(e => e.includes('-'))) {
        r = dice(sides);
        total = r - modifier;
        text = ` rolled a d${sides}: ${r} - ${modifier} for a total of ${total}`;
    }
    main.respond(interaction, text);
    return total;
};

//shapes an interaction into the {guild, channel, author} fields data.js needs
const asMessageRef = (interaction) => ({
    guild: interaction.guild,
    channel: interaction.channel,
    author: interaction.user
});

//every command's free-text option is named "input" - split/lowercase it into a params array
const getParams = (interaction) =>
    (interaction.options.getString('input') || '').toLowerCase().split(' ').filter(Boolean);

//OAuth2 invite URL with both the bot and applications.commands scopes, needed for slash commands to work
const inviteUrl = (clientId) =>
    `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=105227020288`;

exports.asMessageRef = asMessageRef;
exports.asyncForEach = asyncForEach;
exports.dice = dice;
exports.getParams = getParams;
exports.inviteUrl = inviteUrl;
exports.modifierRoll = polyhedral;
exports.sleep = sleep;

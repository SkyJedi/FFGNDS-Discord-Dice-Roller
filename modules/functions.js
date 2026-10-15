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
    //addition modifier
    if (str.some(e => e.includes('+'))) {
        r = dice(sides);
        total = r + modifier;
        text = ` rolled a d${sides}: ${r} + ${modifier} for at total of ${total}`;
        //subtraction modifier
    } else if (str.some(e => e.includes('-'))) {
        r = dice(sides);
        total = r - modifier;
        text = ` rolled a d${sides}: ${r} - ${modifier} for a total of ${total}`;
        //no modifier, or input without +/- (used to leave text empty and crash the embed)
    } else {
        total = dice(sides);
        text = ` rolled a d${sides}: ${total}`;
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

//Google Form "pre-filled link" with Bot=BOT; one form serves every bot and site.
//The link has no Server field yet, so the SERVER replace below is a no-op until one is added (=SERVER).
const FEEDBACK_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSedneM-ImrTrMm92VgBKOThjvEsf2Jq95HiesN7pxh_8wWg-w/viewform?usp=pp_url&entry.1736849516=BOT';
//encodeURIComponent leaves ( and ), which would end the [here](...) markdown link early
const formValue = (text) => encodeURIComponent(text).replace(/\(/g, '%28').replace(/\)/g, '%29');
const feedbackUrl = (bot, server) => FEEDBACK_FORM
    .replace('=BOT', `=${formValue(bot)}`)
    .replace('=SERVER', `=${formValue(server)}`);

exports.asMessageRef = asMessageRef;
exports.asyncForEach = asyncForEach;
exports.dice = dice;
exports.feedbackUrl = feedbackUrl;
exports.getParams = getParams;
exports.inviteUrl = inviteUrl;
exports.modifierRoll = polyhedral;
exports.sleep = sleep;

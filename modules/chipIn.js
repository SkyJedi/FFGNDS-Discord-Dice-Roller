const { MessageFlags } = require('discord.js');

// The Chip in link at the end of /help and in /chipin. It points at our funding page, not Stripe
// directly, so swapping Stripe's test links for live ones needs no bot change.
const CHIP_IN = 'https://somethingveryclever.com/funding.html?bot=D1-C3';
const CHIP_IN_TEXT = `Like this bot? [Chip in](${CHIP_IN})`;

// /chipin: one private line, plain text so it works even without the Embed Links permission
const chipIn = (interaction) => interaction.reply({ content: CHIP_IN_TEXT, flags: MessageFlags.Ephemeral });

module.exports = { CHIP_IN, CHIP_IN_TEXT, chipIn };

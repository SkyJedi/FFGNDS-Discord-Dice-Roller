const functions = require('./');

async function commands({ client, interaction, command, channelEmoji }) {
	switch (command) {
		case 'roll':
		case 'r':
			await functions.rollMenu({ interaction, client, channelEmoji });
			break;
		case 'keep':
		case 'k':
			await functions.keep({ interaction, client, channelEmoji });
			break;
		case 'add':
			await functions.roll({ interaction, client, channelEmoji, add: true });
			break;
		case 'reroll':
		case 'rr':
			await functions.rerollMenu({ interaction, client, channelEmoji });
			break;
		case 'help':
			functions.help(interaction);
			break;
		default:
			break;
	}
}

module.exports = commands;

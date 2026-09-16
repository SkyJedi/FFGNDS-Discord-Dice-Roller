const {EmbedBuilder, Colors} = require('discord.js');
const { getParams } = require('../');

const help = (interaction) => {
	//required lazily to avoid a load-order-dependent circular require with ../../index
	//(see modules/functions.js for the full explanation)
	const main = require('../../index');
	const topic = getParams(interaction)[0];
	const embed = new EmbedBuilder().setColor(Colors.DarkNavy);
	switch (topic) {
		case `roll`:
		case 'r':
			embed.setTitle('**Roll Help**')
				.setDescription(`*/roll input:diceIdentifiers text:"text"*`)
				.addFields({ name: `diceIdentifiers`, value: `**white/w/skill/s** = skill die
					**black/b/blk/ring/r** = ring die
					**explosiveSuccess/exp/e** = explosive success
					**success/suc/+** = success
					**opportunity/o** = opportunity
					**strife/str/t** = strife` })
				.addFields({ name: 'text', value: `assigns a label to the roll. (optional)` })
				.addFields({ name: 'Examples', value: `\`\`\`/roll input:wwbb\`\`\` (must use single character identifiers)
    				\`\`\`/roll input:2skill 2ring\`\`\` (must specify a number before each identifier)` });
			break;
		case 'polyhedral':
		case 'poly':
		case 'p':
			embed.setTitle('**Polyhedral Roll Help**')
				.addFields({ name: `/poly`, value: 'Rolls any combination of polyhedral dice with modifier.' })
				.addFields({ name: `Examples`, value: `\`\`\`/poly input:1d4 2d6+1 1d100-60\`\`\`` });
			break;
		default:
			embed.setTitle('**Help Contents**')
				.setDescription(`'/help topic:[topic]' for further information.`)
				.addFields({ name: `/swrpg`, value: 'Uses swrpg dice for this channel.' })
				.addFields({ name: `/genesys`, value: 'Uses genesys dice for this channel.' })
				.addFields({ name: `/l5r`, value: 'Uses l5r dice in this channel.' })
				.addFields({ name: `/poly`, value: 'Rolls any combination of polyhedral dice.' })
				.addFields({ name: `/ver`, value: 'Displays bot version.' })
				.addFields({ name: `/help`, value: 'Displays help for topics.' })
				.addFields({ name: `/roll`, value: 'Rolls any combination of L5R dice.' })
				.addFields({ name: `/keep`, value: `ie /keep input:12 - keeps the first, second, and discards the rest of the dice.` })
				.addFields({ name: `/add`, value: `ie /add input:ww - adds specified dice to previous dicepool.` })
				.addFields({ name: `/reroll`, value: `ie /reroll input:12 - rerolls the first and second dice without modifying the rest of the dicepool` })
				.addFields({ name: 'More Information', value: 'For more information or help join the [FFG NDS Assistant Bot server](https://discord.gg/G8au6FH)' })
				.addFields({ name: 'Role playing games by Fantasy Flight Games', value: `[Edge of the Empire](https://www.fantasyflightgames.com/en/products/star-wars-edge-of-the-empire), [Force and Destiny](https://www.fantasyflightgames.com/en/products/star-wars-force-and-destiny), [Age of Rebellion](https://www.fantasyflightgames.com/en/products/star-wars-age-ofrebellion),[Genesys](https://www.fantasyflightgames.com/en/products/genesys), [Legends of the Five Rings](https://www.fantasyflightgames.com/en/legend-of-the-five-rings-roleplaying-game)` });
			break;
	}
	main.sendMessage({interaction, embed});

}

module.exports = help;

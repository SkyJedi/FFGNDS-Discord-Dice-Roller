const { upperFirst } = require('lodash');
const { EmbedBuilder, Colors } = require('discord.js');
const { getParams } = require('../');

const help = ({ interaction }) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    const params = getParams(interaction);
    const embed = new EmbedBuilder().setColor(Colors.DarkNavy);
    switch(params[0]) {
        case 'destiny':
        case 'd':
            embed.setTitle('**Destiny Pool Help**')
                 .addFields({ name: `/destiny`, value: 'View the destiny pool.' })
                 .addFields({ name: `/destiny roll`, value: `Rolls a force die and adds result to the destiny pool.` })
                 .addFields({ name: `/destiny light/dark`, value: `Use light or dark side point.` })
                 .addFields({ name: `/destiny set #l #d`, value: `Sets destiny pool.` })
                 .addFields({ name: `/destiny set lldd`, value: `Sets destiny pool` })
                 .addFields({ name: `/destiny reset`, value: `Resets the destiny pool` });
            break;
        case 'story':
        case 's':
            embed.setTitle('**Story Pool Help**')
                 .addFields({ name: `/story`, value: 'View the story pool.' })
                 .addFields({ name: `/story roll`, value: 'Rolls a white die and adds result to the story points.' })
                 .addFields({ name: `/story player/gm`, value: 'Uses a player or GM point.' })
                 .addFields({ name: `/story set #p #g`, value: 'Sets story points.' })
                 .addFields({ name: `/story set ppgg`, value: 'Sets story points.' })
                 .addFields({ name: `/story reset`, value: 'Resets the story pool.' });
            break;
        case 'character':
        case 'char':
        case 'c':
            embed.setTitle('**Character Help**')
                 .addFields({ name: `/character`, value: 'Opens an interactive character manager with buttons - no options to type.' })
                 .addFields({ name: `Add`, value: 'Opens a form for name, max wounds, max strain, and credits, then creates the character.' })
                 .addFields({ name: `Remove`, value: 'Lists each character with a Remove button; asks you to confirm before deleting.' })
                 .addFields({ name: `Modify`, value: 'Lists each character as a button; picking one shows their status with +/- buttons for wounds and strain. An Apply button appears once you have pending changes.' })
                 .addFields({ name: `List`, value: 'Displays every character in this channel.' });
            break;
        case 'roll':
        case 'r':
            embed.setTitle('**Roll Help**')
                 .setDescription(`*/roll input:diceIdentifiers text:"text"*`)
                 .addFields({ name: `diceIdentifiers`, value: `**y/pro** = yellow/proficiency
					**g/a** = green/ability
					**b/boo** = blue/boost
					**blk/k/sb/s** = black/setback
					**r/c** = red/challenge
					**p/diff/d** = purple/difficulty
					**w/f** = white/force
					**success/suc/\***  = success
					**advantage/adv/v** = advantage
					**triumph/tri/!** = triumph
					**failure/fail/-** = failure
					**threat/thr/t** = threat
					**despair/des/$** = despair
					**light/l** = lightpip
					**dark/n** = darkpip` })
                 .addFields({ name: 'text', value: `assigns a label to the roll. (optional)` })
                 .addFields({ name: 'Examples', value: `\`\`\`/roll input:yyyggbbd\`\`\` (must use single character identifiers)
    				\`\`\`/roll input:1g 1p 1adv\`\`\` (must specify a number before each identifier)` });
            break;
        case 'initiative':
        case 'init':
        case 'i':
            embed.setTitle('**Initiative Help**')
                 .addFields({ name: `/initiative`, value: 'Shows current initiative order.' })
                 .addFields({ name: `/initiative roll diceIdentifiers npc/pc`, value: 'Rolls your initiative dice and adds character to the order' })
                 .addFields({ name: `/initiative next`, value: 'Moves to next initiative slot.' })
                 .addFields({ name: `/initiative previous`, value: 'Moves to previous initiative slot.' })
                 .addFields({ name: `/initiative set`, value: 'Manually set initiative order before any turns occur.' })
                 .addFields({ name: `/initiative modify`, value: 'Manually alter initiative order mid-round.' })
                 .addFields({ name: `/initiative reset`, value: 'Resets the initiative order.' })
                 .addFields({ name: `/initiative remove #`, value: 'Removes slot# from initiative.' });
            break;
        case 'reroll':
        case 'rr':
            embed.setTitle('**ReRoll Help**')
                 .addFields({ name: `/reroll same`, value: 'Rolls the same pool again.' })
                 .addFields({ name: `/reroll add diceIdentifiers`, value: 'Roll additional dice and adds them to the pool.' })
                 .addFields({ name: `/reroll remove diceIdentifiers`, value: 'Remove random dice of the designated color.' })
                 .addFields({ name: `/reroll select diceColor/dicePosition`, value: 'rerolls specified dice.' })
                 .addFields({ name: `ie /reroll select y3 p1`, value: 'rerolls only the 3rd yellow die and the 1st purple die in the current dice pool.' })
                 .addFields({ name: `/reroll fortune show diceColor/dicePosition`, value: `shows adjacent sides for the specified die.
					\`\`\`/reroll fortune show y1 p2\`\`\`  (shows the adjacent side for the 1st yellow and 2 purple diceFaces).` })
                 .addFields({ name: `/reroll fortune swap diceColor / dicePosition adjacentFace`, value: 'swaps the current face for an adjacent one.' })
                 .addFields({ name: `/reroll fortune swap y3 2`, value: 'swaps the current die face on the 2nd yellow with option 3 of the adjacent sides.' });
            break;
        case 'polyhedral':
        case 'poly':
        case 'p':
            embed.setTitle('**Polyhedral Roll Help**')
                 .addFields({ name: `/poly`, value: 'Rolls any combination of polyhedral dice with modifier.' })
                 .addFields({ name: `Examples`, value: `\`\`\`/poly input:1d4 2d6+1 1d100-60\`\`\`` });
            break;
        case 'crit':
        case 'shipcrit':
            embed.setTitle('**Critical Help**')
                 .addFields({ name: `/crit and /shipcrit`, value: 'Rolls a d100 and matches the roll to the appropriate critical injury table then prints the result.' })
                 .addFields({ name: `/crit input:+10`, value: 'Automatically add 10 to the roll (any number can be used).' })
                 .addFields({ name: `/crit input:-10`, value: 'Automatically subtract 10 to the roll (any number can be used).' })
                 .addFields({ name: `/crit input:54?`, value: 'Look up critical by number (any number can be used).' });
            break;
        case 'duty':
        case 'obligation':
            embed.setTitle(`**${upperFirst(params[0])} Help**`)
                 .addFields({ name: `/${params[0]}`, value: `Gathers all ${params[0]} from /character and rolls a d100 to trigger ${params[0]}.` });
            break;
        default:
            embed.setTitle('**Help Contents**')
                 .setDescription(`'/help topic:[topic]' for further information.`)
                 .addFields({ name: `/swrpg`, value: 'uses swrpg dice for this channel.' })
                 .addFields({ name: `/genesys`, value: 'uses genesys dice for this channel.' })
                 .addFields({ name: `/l5r`, value: 'uses l5r dice in this channel.' })
                 .addFields({ name: `/poly`, value: 'rolls any combination of polyhedral dice.' })
                 .addFields({ name: `/ver`, value: 'displays bot version.' })
                 .addFields({ name: `/help`, value: 'displays help for topics.' })
                 .addFields({ name: `/roll`, value: 'rolls any combination of SWRPG/GENESYS dice.' })
                 .addFields({ name: `/reroll`, value: 'modifies the previous roll.' })
                 .addFields({ name: `/destiny`, value: 'manages the destiny balance.' })
                 .addFields({ name: `/crit`, value: 'rolls and displays the critical hit.' })
                 .addFields({ name: `/shipcrit`, value: 'rolls and displays the ship critical hit.' })
                 .addFields({ name: `/character`, value: 'simple character stat manager.' })
                 .addFields({ name: `/initiative`, value: 'initiative tracker and roller.' })
                 .addFields({ name: `/obligation`, value: `gathers all the obligations entered with /character and rolls to trigger.` })
                 .addFields({ name: `/duty`, value: `gathers all the duty entered with /character and rolls to trigger.` })
                 .addFields({ name: `/species`, value: 'picks a random species.' })
                 .addFields({ name: 'Bot Information', value: 'For more information or help join the [SkyJedi\'s Bot Emporium](https://discord.gg/G8au6FH)' })
                 .addFields({ name: 'Role playing games by Fantasy Flight Games', value: `[Edge of the Empire](https://www.fantasyflightgames.com/en/products/star-wars-edge-of-the-empire), [Force and Destiny](https://www.fantasyflightgames.com/en/products/star-wars-force-and-destiny), [Age of Rebellion](https://www.fantasyflightgames.com/en/products/star-wars-age-ofrebellion),[Genesys](https://www.fantasyflightgames.com/en/products/genesys), [Legends of the Five Rings](https://www.fantasyflightgames.com/en/legend-of-the-five-rings-roleplaying-game)` });
            break;
    }
    main.sendMessage({ interaction, embed });

};

module.exports = help;

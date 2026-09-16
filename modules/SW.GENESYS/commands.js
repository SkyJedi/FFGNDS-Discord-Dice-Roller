const functions = require('./');

async function commands({ client, interaction, command, channelEmoji }) {
    switch(command) {
        //Character Tracker
        case 'character':
        case 'char':
            await functions.character({ client, interaction });
            break;
        // help module
        case 'help':
            functions.help({ interaction });
            break;
        case 'gleepglop':
        case 'species':
            functions.gleepglop({ interaction, channelEmoji });
            break;
        case 'critical':
        case 'crit':
            functions.crit({ interaction, channelEmoji });
            break;
        //!shipcrit command
        case 'shipcritical':
        case 'shipcrit':
            functions.shipcrit({ interaction, channelEmoji });
            break;
        //Destiny Point Module
        case 'destiny':
        case 'd':
        case 'story':
        case 's':
            await functions.destiny({ client, interaction, channelEmoji });
            break;
        // Roll the dice command
        case 'roll':
        case 'r':
            await functions.roll({ interaction, client, channelEmoji });
            break;
        case 'reroll':
        case 'rr':
            await functions.reroll({ client, interaction, channelEmoji });
            break;
        case 'initiative':
        case 'init':
        case 'i':
            await functions.initiative({ client, interaction });
            break;
        case 'obligation':
        case 'o':
            await functions.trigger({ client, interaction, type: 'obligation' });
            break;
        case 'duty':
            await functions.trigger({ client, interaction, type: 'duty' });
            break;
    }
}

module.exports = commands;

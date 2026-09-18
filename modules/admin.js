const admin = async ({ client, interaction, command }) => {
    //required lazily to avoid a load-order-dependent circular require with ../index
    //(see modules/functions.js for the full explanation)
    const main = require('../index');
    switch(command) {
        case 'restart':
            await main.respond(interaction, 'Restarting, Sir!');
            await client.shard.respawnAll();
            break;
        case 'fix':
            break;
        case 'test':
            break;
        default:
            break;
    }
};

module.exports = admin;


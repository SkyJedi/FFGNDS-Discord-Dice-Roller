const { db } = require('../firestore');
const { prefix } = require('../config.json');

const readData = async (client, message, dataSet) => {
    let dbRef = getDbRef(client, message, dataSet);
    let doc = await dbRef.get();
    if (!doc.exists) {
        if (dataSet === 'channelEmoji') return 'swrpg';
        //legacy per-guild prefix, kept only so we can detect and redirect users still on the old ! commands
        if (dataSet === 'prefix') return prefix;
        return {};
    } else {
        let data = doc.data()[dataSet];
        if (!data) data = {};
        switch(dataSet) {
            case 'characterStatus':
                Object.keys(data).forEach((name) => {
                    if (!data[name].crit) data[name].crit = [];
                    if (!data[name].obligation) data[name].obligation = {};
                });
                break;
            default:
                break;
        }
        return data;
    }
};

const writeData = (client, message, dataSet, data, merge = false) => {
    //required lazily to avoid a load-order-dependent circular require with ../index
    //(see modules/functions.js for the full explanation)
    const main = require('../index');
    let dbRef = getDbRef(client, message, dataSet);
    return dbRef.set({ [dataSet]: data }, { merge }).catch((error) => main.logError('writeData', error));
};

const getDbRef = (client, message, dataSet) => {
    let dbRef = db.collection('Bots').doc(`${client.user.username}_Discord`);

    if (message.guild) {
        dbRef = dbRef.collection('Guild').doc(message.guild.id);
    }

    //legacy per-guild prefix was stored above the Channel level - keep that path so old data is still reachable
    if (dataSet !== 'prefix') {
        dbRef = dbRef.collection('Channel').doc(message.channel.id);
    }

    //per-user data within the channel - the last roll, and /character's in-progress obligation/duty/morality/inventory edit
    if (dataSet === 'diceResult' || dataSet === 'trackDraft') {
        dbRef = dbRef.collection('User').doc(message.author.id);
    }

    dbRef = dbRef.collection('Data').doc(dataSet);
    return dbRef;
};

exports.readData = readData;
exports.writeData = writeData;

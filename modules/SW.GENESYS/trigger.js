const { dice, readData, asMessageRef } = require('../');

const trigger = async ({ client, interaction, type }) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    const messageRef = asMessageRef(interaction);
    let characterStatus = await readData(client, messageRef, 'characterStatus');
    let list = [];
    if (Object.keys(characterStatus).length === 0) {
        main.sendMessage({ interaction, text: 'No characters found please use /character to setup' });
        return;
    }
    Object.keys(characterStatus).forEach(characterName => {
        if (characterStatus[characterName][type]) {
            Object.keys(characterStatus[characterName][type]).forEach(name => {
                list.push({
                    name: characterName,
                    [type]: name,
                    value: characterStatus[characterName][type][name]
                });
            });
        }
    });
    list.sort((a, b) => a.value - b.value);
    let roll = dice(100);
    let target = 0;
    let total = 0;
    list.forEach(name => total += name.value);
    main.sendMessage({ interaction, text: `The total group ${type} is ${total}. The ${type} roll is ${roll}.` });

    if (roll > total) {
        main.sendMessage({ interaction, text: `No ${type} triggered` });
        return;
    }

    for (let i = 0; i < list.length; i++) {
        target += list[i].value;
        if (target > roll) {
            main.sendMessage({ interaction, text: `${list[i].name}'s ${list[i][type]} ${type} has been triggered.` });
            break;
        }
    }
};

module.exports = trigger;

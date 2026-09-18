const { dice, emoji, readData, writeData, asMessageRef } = require('../');
const { diceFaces } = require('./');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, Colors
} = require('discord.js');

//the pool builder (for Add) and the result display both reuse /roll's building blocks instead of
//duplicating them - see modules/SW.GENESYS/roll.js
const swRoll = require('./roll');
const {
    rollCore, rollDice, countSymbols, buildResultText, buildRollResultEmbed, buildDiceOrder,
    DIE_TYPES, SYMBOL_TYPES, ALL_TYPES, LABELS, MAX_COUNT, poolIcon, safeUpdate
} = swRoll;

const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

const readDiceResult = async (client, messageRef) => {
    const roll = await readData(client, messageRef, 'diceResult');
    if (!roll || Object.keys(roll).length === 0) return null;
    return { roll, results: {} };
};

const noRollScreen = () => ({ content: '', embeds: [textEmbed('No previous roll to modify - use /roll first.')], components: [] });

//---------------------------------------------------------------- menu

const statusEmbed = (diceResult, channelEmoji, note) => {
    countSymbols(diceResult);
    const { faces, response } = buildResultText(diceResult, channelEmoji);
    const resultsLine = faces ? (response.length > 0 ? response : 'All dice have cancelled out') : undefined;
    return buildRollResultEmbed(note || 'Reroll', faces || 'No dice rolled.', resultsLine);
};

const backRow = (customId = 'reroll:menu') => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Back').setStyle(ButtonStyle.Secondary)
);

const buildMenu = (diceResult, channelEmoji, note) => ({
    content: '',
    embeds: [statusEmbed(diceResult, channelEmoji, note)],
    components: [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('reroll:add').setLabel('Add').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('reroll:same').setLabel('Same').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('reroll:removeScreen').setLabel('Remove').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('reroll:selectScreen').setLabel('Select').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('reroll:fortuneScreen').setLabel('Fortune').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('reroll:done').setLabel('Done').setStyle(ButtonStyle.Primary)
        )
    ]
});

//Slash command entry point - handlers.js has already deferred the reply
const reroll = async ({ interaction, client, channelEmoji }) => {
    const messageRef = asMessageRef(interaction);
    const diceResult = await readDiceResult(client, messageRef);
    await interaction.editReply(diceResult ? buildMenu(diceResult, channelEmoji) : noRollScreen());
};

//---------------------------------------------------------------- add (button pool builder)

//the channel's system rides along here too (single-character coded, same scheme as
//modules/SW.GENESYS/roll.js's encodeState) so it's fetched once - when the "Add" button first
//opens this pool (see onComponent's 'add' case below) - instead of on every subsequent click
const CHANNEL_CODES = { swrpg: 's', genesys: 'g', l5r: 'l' };
const CHANNEL_CODES_REVERSE = { s: 'swrpg', g: 'genesys', l: 'l5r' };

const encodeAddState = (counts, channelEmoji) => `${ALL_TYPES.map(type => counts[type] || 0).join(',')}|${CHANNEL_CODES[channelEmoji] || ''}`;

const decodeAddState = (str) => {
    const [countsPart, channelCode] = (str || '').split('|');
    const counts = {};
    (countsPart || '').split(',').forEach((n, i) => { if (ALL_TYPES[i]) counts[ALL_TYPES[i]] = Math.min(+n || 0, MAX_COUNT); });
    return { counts, channelEmoji: CHANNEL_CODES_REVERSE[channelCode] };
};

const poolButton = (type, s, iconsOk, channelEmoji) => {
    const button = new ButtonBuilder().setCustomId(`reroll:addPoolAdd-${type}:${s}`).setStyle(ButtonStyle.Secondary);
    const icon = poolIcon(type, iconsOk, channelEmoji);
    return icon ? button.setEmoji(icon) : button.setLabel(LABELS[type]);
};

const buildAddPoolSummary = (counts, iconsOk, channelEmoji, prefix = 'Adding') => {
    const parts = ALL_TYPES.filter(type => counts[type] > 0).map(type => {
        const icon = poolIcon(type, iconsOk, channelEmoji);
        return icon ? `${counts[type]}${icon}` : `${counts[type]} ${LABELS[type]}`;
    });
    return parts.length ? `${prefix}: ${parts.join(' ')}` : `${prefix}: nothing selected`;
};

const buildAddPoolMainScreen = (counts, iconsOk = true, channelEmoji) => {
    const s = encodeAddState(counts, channelEmoji);
    return {
        content: '',
        embeds: [textEmbed(buildAddPoolSummary(counts, iconsOk, channelEmoji))],
        components: [
            new ActionRowBuilder().addComponents(DIE_TYPES.slice(0, 5).map(type => poolButton(type, s, iconsOk, channelEmoji))),
            new ActionRowBuilder().addComponents(DIE_TYPES.slice(5).map(type => poolButton(type, s, iconsOk, channelEmoji))),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`reroll:addPoolSymbols:${s}`).setLabel('Symbols').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`reroll:addPoolRoll:${s}`).setLabel('Add').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reroll:addPoolCancel:${s}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
};

const buildAddPoolSymbolsScreen = (counts, iconsOk = true, channelEmoji) => {
    const s = encodeAddState(counts, channelEmoji);
    return {
        content: '',
        embeds: [textEmbed(buildAddPoolSummary(counts, iconsOk, channelEmoji))],
        components: [
            new ActionRowBuilder().addComponents(SYMBOL_TYPES.slice(0, 5).map(type => poolButton(type, s, iconsOk, channelEmoji))),
            new ActionRowBuilder().addComponents(SYMBOL_TYPES.slice(5).map(type => poolButton(type, s, iconsOk, channelEmoji))),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`reroll:addPoolMain:${s}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
};

//---------------------------------------------------------------- remove

//removal is random within a type rather than a specific die, so these use the button-shape
//poolIcon (like Add's buttons) instead of any one face's emoji
const removeButton = (type, count, iconsOk, channelEmoji) => {
    const button = new ButtonBuilder().setCustomId(`reroll:removeColor-${type}`).setStyle(ButtonStyle.Danger);
    const icon = poolIcon(type, iconsOk, channelEmoji);
    if (icon) button.setEmoji(icon);
    button.setLabel(icon ? `${count}` : `${LABELS[type]} (${count})`);
    return button;
};

const buildRemoveScreen = (diceResult, channelEmoji, note, iconsOk = true) => {
    const present = ALL_TYPES.filter(type => (diceResult.roll[type] || []).length > 0);
    if (present.length === 0) {
        return {
            content: '',
            embeds: [statusEmbed(diceResult, channelEmoji, note || 'No dice left to remove')],
            components: [backRow()]
        };
    }
    const rows = [];
    for (let i = 0; i < present.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            present.slice(i, i + 5).map(type => removeButton(type, diceResult.roll[type].length, iconsOk, channelEmoji))
        ));
    }
    rows.push(backRow());
    return {
        content: '',
        embeds: [statusEmbed(diceResult, channelEmoji, note || 'Pick a die color to remove one at random')],
        components: rows.slice(0, 5)
    };
};

//---------------------------------------------------------------- select (reroll a specific die)

//lists every individual die across the given types as its own button, e.g. "Yellow #2" -
//capped at 20 like char.js's picker lists, to stay within Discord's 5 rows of 5 buttons
const buildDieEntries = (diceResult, types) => {
    const entries = [];
    types.forEach(type => (diceResult.roll[type] || []).forEach((_, index) => entries.push({ type, index })));
    return entries;
};

//the per-channel result emoji (e.g. "yellowss") is a different set from poolIcon's button
//shapes, so it needs its own custom-emoji validation - same idea as roll.js's resolvedEmoji()
const CUSTOM_EMOJI_PATTERN = /^<a?:\w+:\d+>$/;
const dieFaceIcon = (type, face, channelEmoji, iconsOk) => {
    if (!iconsOk) return null;
    const key = SYMBOL_TYPES.includes(type) ? type : `${type}${diceFaces[type][face].face}`;
    const icon = emoji(key, channelEmoji);
    return CUSTOM_EMOJI_PATTERN.test(icon || '') ? icon : null;
};

//for result-message text (not buttons), so no iconsOk/retry needed - an unresolved emoji just
//falls back to the plain type label instead of risking Discord rejecting an invalid button emoji
const dieFaceLabel = (type, face, channelEmoji) => dieFaceIcon(type, face, channelEmoji, true) || LABELS[type];

const selectDieButton = (diceResult, channelEmoji, type, index, iconsOk) => {
    const button = new ButtonBuilder().setCustomId(`reroll:selectDie-${type}-${index}`).setStyle(ButtonStyle.Primary);
    const icon = dieFaceIcon(type, diceResult.roll[type][index], channelEmoji, iconsOk);
    return icon ? button.setEmoji(icon) : button.setLabel(`${LABELS[type]} #${index + 1}`);
};

const buildSelectScreen = (diceResult, channelEmoji, note, iconsOk = true) => {
    const entries = buildDieEntries(diceResult, ALL_TYPES).slice(0, 20);
    if (entries.length === 0) {
        return { content: '', embeds: [statusEmbed(diceResult, channelEmoji, note || 'No dice to reroll')], components: [backRow()] };
    }
    const rows = [];
    for (let i = 0; i < entries.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            entries.slice(i, i + 5).map(({ type, index }) => selectDieButton(diceResult, channelEmoji, type, index, iconsOk))
        ));
    }
    rows.push(backRow());
    return {
        content: '',
        embeds: [statusEmbed(diceResult, channelEmoji, note || 'Pick a die to reroll')],
        components: rows.slice(0, 5)
    };
};

//---------------------------------------------------------------- fortune (flip to an adjacent face)

//only real dice have meaningful adjacent faces - symbol "dice" are a single fixed face (see
//modules/SW.GENESYS/dice.js), so they're left out of this list entirely
const fortuneDieButton = (diceResult, channelEmoji, type, index, iconsOk) => {
    const button = new ButtonBuilder().setCustomId(`reroll:fortuneDie-${type}-${index}`).setStyle(ButtonStyle.Secondary);
    const icon = dieFaceIcon(type, diceResult.roll[type][index], channelEmoji, iconsOk);
    return icon ? button.setEmoji(icon) : button.setLabel(`${LABELS[type]} #${index + 1}`);
};

const buildFortuneScreen = (diceResult, channelEmoji, note, iconsOk = true) => {
    const entries = buildDieEntries(diceResult, DIE_TYPES).slice(0, 20);
    if (entries.length === 0) {
        return { content: '', embeds: [statusEmbed(diceResult, channelEmoji, note || 'No dice to flip')], components: [backRow()] };
    }
    const rows = [];
    for (let i = 0; i < entries.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            entries.slice(i, i + 5).map(({ type, index }) => fortuneDieButton(diceResult, channelEmoji, type, index, iconsOk))
        ));
    }
    rows.push(backRow());
    return {
        content: '',
        embeds: [statusEmbed(diceResult, channelEmoji, note || 'Pick a die to flip to an adjacent side')],
        components: rows.slice(0, 5)
    };
};

//shows the die's current face plus every adjacent face it could flip to (a Force/Destiny point
//"fortune" flip) - numbered buttons below apply the swap, each carrying the resulting face's emoji
const buildFortuneOptionsScreen = (diceResult, channelEmoji, type, index, iconsOk = true) => {
    const currentFace = diceResult.roll[type][index];
    const options = diceFaces[type][currentFace].adjacentposition;

    let text = `${LABELS[type]} #${index + 1} - current: ${emoji(`${type}${diceFaces[type][currentFace].face}`, channelEmoji)}\n\nOptions:\n`;
    options.forEach((optionFace, i) => {
        text += `${i + 1}: ${emoji(`${type}${diceFaces[type][optionFace].face}`, channelEmoji)}  `;
    });

    const buttons = options.map((optionFace, i) => {
        const button = new ButtonBuilder().setCustomId(`reroll:fortuneSwap-${type}-${index}-${i}`).setStyle(ButtonStyle.Secondary);
        const icon = dieFaceIcon(type, optionFace, channelEmoji, iconsOk);
        if (icon) button.setEmoji(icon);
        button.setLabel(`${i + 1}`);
        return button;
    });

    return {
        content: '',
        embeds: [textEmbed(text)],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            backRow('reroll:fortuneScreen')
        ]
    };
};

//---------------------------------------------------------------- router

const onComponent = async ({ interaction, client }) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const messageRef = asMessageRef(interaction);

    //---- add (pool builder) ----
    //only 'add' (the entry point) needs a Firestore read for channelEmoji - it's then carried in
    //the encoded state (see encodeAddState/decodeAddState above) for every click after this one.
    //These all use safeUpdate (a single interaction.update() call) rather than
    //deferUpdate()+editReply(), since every screen here builds synchronously (or, for 'add' and
    //'addPoolRoll', after only a quick Firestore read) - see modules/SW.GENESYS/roll.js's safeUpdate.
    if (action === 'add') {
        const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
        await safeUpdate(interaction, (iconsOk) => buildAddPoolMainScreen({}, iconsOk, channelEmoji));
        return;
    }
    if (action.startsWith('addPoolAdd-')) {
        const { counts, channelEmoji } = decodeAddState(parts[2]);
        const type = action.slice('addPoolAdd-'.length);
        counts[type] = Math.min((counts[type] || 0) + 1, MAX_COUNT);
        await safeUpdate(interaction, (iconsOk) => SYMBOL_TYPES.includes(type) ? buildAddPoolSymbolsScreen(counts, iconsOk, channelEmoji) : buildAddPoolMainScreen(counts, iconsOk, channelEmoji));
        return;
    }
    if (action === 'addPoolSymbols') {
        const { counts, channelEmoji } = decodeAddState(parts[2]);
        await safeUpdate(interaction, (iconsOk) => buildAddPoolSymbolsScreen(counts, iconsOk, channelEmoji));
        return;
    }
    if (action === 'addPoolMain') {
        const { counts, channelEmoji } = decodeAddState(parts[2]);
        await safeUpdate(interaction, (iconsOk) => buildAddPoolMainScreen(counts, iconsOk, channelEmoji));
        return;
    }
    if (action === 'addPoolCancel') {
        const { channelEmoji } = decodeAddState(parts[2]);
        const diceResult = await readDiceResult(client, messageRef);
        await interaction.update(diceResult ? buildMenu(diceResult, channelEmoji) : noRollScreen());
        return;
    }
    if (action === 'addPoolRoll') {
        const { counts, channelEmoji } = decodeAddState(parts[2]);
        const diceOrder = buildDiceOrder(counts);
        if (!diceOrder.length) {
            await safeUpdate(interaction, (iconsOk) => {
                const screen = buildAddPoolMainScreen(counts, iconsOk, channelEmoji);
                screen.embeds = [textEmbed(`Pick some dice to add first.\n\n${buildAddPoolSummary(counts, iconsOk, channelEmoji)}`)];
                return screen;
            });
            return;
        }

        const previousRoll = await readData(client, messageRef, 'diceResult');
        const rolled = rollCore({ diceOrder, channelEmoji, diceResult: { roll: { ...previousRoll } } });
        if (rolled.error) {
            await interaction.update({ content: '', embeds: [textEmbed(rolled.error)], components: [] });
            return;
        }
        writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);
        //the menu itself is ephemeral (see handlers.js), so it can only ever be edited back to
        //another private message - the actual change has to go out as a fresh public followUp()
        //instead, with the private message just closing out to confirm. The note names what was
        //added using the same button-shape icons shown on the pool screen.
        await interaction.update({ content: '', embeds: [textEmbed('Added!')], components: [] });
        await interaction.followUp({ embeds: [statusEmbed(rolled.diceResult, channelEmoji, buildAddPoolSummary(counts, true, channelEmoji, 'Added'))] });
        await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
        return;
    }

    //two Firestore reads, not Discord calls, so they still finish well within Discord's response
    //window before the single interaction.update()/safeUpdate() call each branch below ends with
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const diceResult = await readDiceResult(client, messageRef);
    if (!diceResult) {
        await interaction.update(noRollScreen());
        return;
    }

    switch (action) {
        case 'menu':
            await interaction.update(buildMenu(diceResult, channelEmoji));
            return;

        case 'done':
            await interaction.update({ content: '', embeds: [statusEmbed(diceResult, channelEmoji)], components: [] });
            return;

        case 'same': {
            const rebuilt = [];
            Object.keys(diceResult.roll).forEach(type => diceResult.roll[type].forEach(() => rebuilt.push(type)));
            const rolled = rollCore({ diceOrder: rebuilt, channelEmoji });
            if (rolled.error) {
                await interaction.update(buildMenu(diceResult, channelEmoji, rolled.error));
                return;
            }
            writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);
            //the menu is ephemeral - close it privately and announce the reroll publicly
            await interaction.update({ content: '', embeds: [textEmbed('Rerolled!')], components: [] });
            await interaction.followUp({ embeds: [statusEmbed(rolled.diceResult, channelEmoji, 'Rerolled the same pool')] });
            await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
            return;
        }

        case 'removeScreen':
            await safeUpdate(interaction, (iconsOk) => buildRemoveScreen(diceResult, channelEmoji, undefined, iconsOk));
            return;

        case 'selectScreen':
            await safeUpdate(interaction, (iconsOk) => buildSelectScreen(diceResult, channelEmoji, undefined, iconsOk));
            return;

        case 'fortuneScreen':
            await safeUpdate(interaction, (iconsOk) => buildFortuneScreen(diceResult, channelEmoji, undefined, iconsOk));
            return;

        default:
            break;
    }

    //remove/select/fortune actions carry the die type (and, for select/fortune, its index) in the
    //action string itself (e.g. "selectDie-yellow-2"), so they're matched by prefix instead of by
    //enumerating every possible die/symbol type as its own exact case
    if (action.startsWith('removeColor-')) {
        const type = action.slice('removeColor-'.length);
        if (!diceResult.roll[type] || diceResult.roll[type].length === 0) {
            await safeUpdate(interaction, (iconsOk) => buildRemoveScreen(diceResult, channelEmoji, `No more ${LABELS[type]} dice to remove`, iconsOk));
            return;
        }
        const randomIndex = dice(diceResult.roll[type].length) - 1;
        const removedFace = diceResult.roll[type][randomIndex];
        diceResult.roll[type].splice(randomIndex, 1);
        writeData(client, messageRef, 'diceResult', diceResult.roll);
        //the menu is ephemeral - close it privately and announce the removal publicly
        await interaction.update({ content: '', embeds: [textEmbed('Removed!')], components: [] });
        await interaction.followUp({ embeds: [statusEmbed(diceResult, channelEmoji, `Removed 1 ${dieFaceLabel(type, removedFace, channelEmoji)}`)] });
        await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
        return;
    }

    if (action.startsWith('selectDie-')) {
        const [type, indexStr] = action.slice('selectDie-'.length).split('-');
        const index = +indexStr;
        if (!diceResult.roll[type] || !diceResult.roll[type][index]) {
            await safeUpdate(interaction, (iconsOk) => buildSelectScreen(diceResult, channelEmoji, `There is no ${LABELS[type]} #${index + 1} to reroll`, iconsOk));
            return;
        }
        const newFace = rollDice(type);
        diceResult.roll[type][index] = newFace;
        writeData(client, messageRef, 'diceResult', diceResult.roll);
        //the menu is ephemeral - close it privately and announce the reroll publicly
        await interaction.update({ content: '', embeds: [textEmbed('Rerolled!')], components: [] });
        await interaction.followUp({ embeds: [statusEmbed(diceResult, channelEmoji, `Rerolled ${dieFaceLabel(type, newFace, channelEmoji)} #${index + 1}`)] });
        await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
        return;
    }

    if (action.startsWith('fortuneDie-')) {
        const [type, indexStr] = action.slice('fortuneDie-'.length).split('-');
        const index = +indexStr;
        if (!diceResult.roll[type] || !diceResult.roll[type][index]) {
            await safeUpdate(interaction, (iconsOk) => buildFortuneScreen(diceResult, channelEmoji, `There is no ${LABELS[type]} #${index + 1} to flip`, iconsOk));
            return;
        }
        await safeUpdate(interaction, (iconsOk) => buildFortuneOptionsScreen(diceResult, channelEmoji, type, index, iconsOk));
        return;
    }

    if (action.startsWith('fortuneSwap-')) {
        const [type, indexStr, optionStr] = action.slice('fortuneSwap-'.length).split('-');
        const index = +indexStr;
        const optionIndex = +optionStr;
        const currentFace = diceResult.roll[type] && diceResult.roll[type][index];
        const newFace = currentFace && diceFaces[type][currentFace].adjacentposition[optionIndex];
        if (!newFace) {
            await safeUpdate(interaction, (iconsOk) => buildFortuneScreen(diceResult, channelEmoji, `There is no option ${optionIndex + 1} for ${LABELS[type]} #${index + 1}`, iconsOk));
            return;
        }
        diceResult.roll[type][index] = newFace;
        writeData(client, messageRef, 'diceResult', diceResult.roll);
        //the menu is ephemeral - close it privately and announce the flip publicly. Both faces
        //show as emoji instead of the "[type] #[position]" identifier used while still picking a die
        await interaction.update({ content: '', embeds: [textEmbed('Flipped!')], components: [] });
        await interaction.followUp({ embeds: [statusEmbed(diceResult, channelEmoji, `Flipped ${dieFaceLabel(type, currentFace, channelEmoji)} to ${dieFaceLabel(type, newFace, channelEmoji)}`)] });
        await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
    }
};

exports.reroll = reroll;
exports.onComponent = onComponent;

const { readData, writeData, asMessageRef } = require('../');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    EmbedBuilder, Colors
} = require('discord.js');

//the roll pool builder reuses /roll's dice/symbol buttons and icon-fallback behavior instead of
//duplicating it - see modules/SW.GENESYS/roll.js
const swRoll = require('./roll');
const { DIE_TYPES, SYMBOL_TYPES, ALL_TYPES, LABELS, MAX_COUNT, poolIcon, safeEditReply } = swRoll;

const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

//initializeInitOrder
const initializeInitOrder = () => {
    return {
        turn: 1,
        round: 1,
        slots: [],
        newslots: []
    };
};

const readInitiativeOrder = async (client, messageRef) => {
    let initiativeOrder = await readData(client, messageRef, 'initiativeOrder');
    if (Object.keys(initiativeOrder).length === 0) initiativeOrder = initializeInitOrder();
    if (!initiativeOrder.newslots) initiativeOrder.newslots = [];
    if (!initiativeOrder.slots) initiativeOrder.slots = [];
    return initiativeOrder;
};

//Adds a roll to the order and sorts it
const sortInitiativeOrder = (initiativeOrder) => {
    initiativeOrder.slots.sort((a, b) => {
        let nameA = a.type;
        let nameB = b.type;
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });

    ['triumph', 'advantage', 'success'].forEach((symbol) => {
        initiativeOrder.slots.sort((a, b) => {
            if (a[symbol] < b[symbol]) return -1;
            if (a[symbol] > b[symbol]) return 1;
            return 0;
        });
    });
    initiativeOrder.slots.reverse();
    return initiativeOrder;
};

const getFace = (type) => {
    switch (type) {
        case 'npc': // non-playable character
            return ':smiling_imp:';
        case 'pc': // playable character
            return ':slight_smile:';
        default:
            return ''; // Always return a string. Even an empty one.
    }
};

//builds the "Round: X Turn: Y Initiative Order" text - pure, no Discord I/O
const buildStatusText = (initiativeOrder) => {
    if (!initiativeOrder.slots[0]) return 'No initiative order is set!';
    let ordered = initiativeOrder;
    if (Object.keys(ordered.slots[0]).length > 1) ordered = sortInitiativeOrder(ordered);
    let faces = '';
    for (let i = ordered.turn - 1; i < ordered.slots.length; i++) faces += getFace(ordered.slots[i].type);
    faces += ':repeat:';
    for (let i = 0; i < ordered.turn - 1; i++) faces += getFace(ordered.slots[i].type);
    if (faces.length > 1500) faces = 'Initiative order too long to display.';
    return `Round: ${ordered.round} Turn: ${ordered.turn}\nInitiative Order: \n${faces}`;
};

//parses a manually-typed order string (e.g. "nppnn") into slots
const parseOrderString = (order) => {
    const slots = [];
    for (let i = 0; i < order.length; i++) {
        switch (order[i]) {
            case 'n':
                slots.push({ type: 'npc' });
                break;
            case 'p':
                slots.push({ type: 'pc' });
                break;
            default:
                break;
        }
    }
    return slots;
};

//---------------------------------------------------------------- menu

//Next/Previous/Reset/Modify only make sense once an order exists - Roll and Set are the only
//ways to create one, so they're the only buttons shown until then.
const buildMenu = (initiativeOrder, note) => {
    let text = buildStatusText(initiativeOrder);
    if (note) text = `${note}\n\n${text}`;
    const hasOrder = initiativeOrder.slots.length > 0;

    const rows = [];
    if (hasOrder) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('init:next').setLabel('Next').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('init:previous').setLabel('Previous').setStyle(ButtonStyle.Secondary)
        ));
    }

    const manageButtons = [
        new ButtonBuilder().setCustomId('init:roll').setLabel('Roll').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('init:set').setLabel('Set').setStyle(ButtonStyle.Secondary)
    ];
    if (hasOrder) {
        manageButtons.push(
            new ButtonBuilder().setCustomId('init:reset').setLabel('Reset').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('init:modify').setLabel('Modify').setStyle(ButtonStyle.Secondary)
        );
    }
    rows.push(new ActionRowBuilder().addComponents(manageButtons));

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('init:done').setLabel('Done').setStyle(ButtonStyle.Primary)
    ));

    return { content: '', embeds: [textEmbed(text)], components: rows };
};

//Slash command entry point - handlers.js has already deferred the reply
const initiative = async ({ interaction, client }) => {
    const messageRef = asMessageRef(interaction);
    const initiativeOrder = await readInitiativeOrder(client, messageRef);
    await interaction.editReply(buildMenu(initiativeOrder));
};

//---------------------------------------------------------------- roll (button pool builder)

//NPC/PC is required (rather than optional, like a die color) because every slot needs a type to
//sort and display - the two toggle buttons in buildPoolMainScreen() double as that selection.
const emptyPoolState = () => ({ counts: {}, type: '' });

const encodePoolState = (state) => `${ALL_TYPES.map(type => state.counts[type] || 0).join(',')}|${state.type || ''}`;

const decodePoolState = (str) => {
    const [countsPart, type] = (str || '').split('|');
    const counts = {};
    (countsPart || '').split(',').forEach((n, i) => { if (ALL_TYPES[i]) counts[ALL_TYPES[i]] = Math.min(+n || 0, MAX_COUNT); });
    return { counts, type: type === 'npc' || type === 'pc' ? type : '' };
};

const buildPoolDiceOrder = (counts) => ALL_TYPES.reduce((diceOrder, type) => diceOrder.concat(Array(counts[type] || 0).fill(type)), []);

const poolButton = (type, s, iconsOk) => {
    const button = new ButtonBuilder().setCustomId(`init:poolAdd-${type}:${s}`).setStyle(ButtonStyle.Secondary);
    const icon = poolIcon(type, iconsOk);
    return icon ? button.setEmoji(icon) : button.setLabel(LABELS[type]);
};

const buildPoolSummary = (state, iconsOk) => {
    const parts = ALL_TYPES.filter(type => state.counts[type] > 0).map(type => {
        const icon = poolIcon(type, iconsOk);
        return icon ? `${state.counts[type]}${icon}` : `${state.counts[type]} ${LABELS[type]}`;
    });
    const pool = parts.length ? `Pool: ${parts.join(' ')}` : 'Pool: empty';
    const type = state.type ? (state.type === 'npc' ? 'NPC' : 'PC') : 'not selected';
    return `Type: ${type}\n${pool}`;
};

const buildPoolMainScreen = (state, iconsOk = true) => {
    const s = encodePoolState(state);
    return {
        content: '',
        embeds: [textEmbed(buildPoolSummary(state, iconsOk))],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`init:poolType-npc:${s}`).setLabel('NPC').setStyle(state.type === 'npc' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`init:poolType-pc:${s}`).setLabel('PC').setStyle(state.type === 'pc' ? ButtonStyle.Success : ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(DIE_TYPES.slice(0, 5).map(type => poolButton(type, s, iconsOk))),
            new ActionRowBuilder().addComponents(DIE_TYPES.slice(5).map(type => poolButton(type, s, iconsOk))),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`init:poolSymbols:${s}`).setLabel('Symbols').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`init:poolRoll:${s}`).setLabel('Roll').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`init:poolCancel:${s}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
};

const buildPoolSymbolsScreen = (state, iconsOk = true) => {
    const s = encodePoolState(state);
    return {
        content: '',
        embeds: [textEmbed(buildPoolSummary(state, iconsOk))],
        components: [
            new ActionRowBuilder().addComponents(SYMBOL_TYPES.slice(0, 5).map(type => poolButton(type, s, iconsOk))),
            new ActionRowBuilder().addComponents(SYMBOL_TYPES.slice(5).map(type => poolButton(type, s, iconsOk))),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`init:poolMain:${s}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
};

const rollInitiativePool = async ({ interaction, client, state }) => {
    const messageRef = asMessageRef(interaction);
    const initiativeOrder = await readInitiativeOrder(client, messageRef);

    if (!state.type) {
        await safeEditReply(interaction, (iconsOk) => {
            const screen = buildPoolMainScreen(state, iconsOk);
            screen.embeds = [textEmbed(`Select NPC or PC before rolling.\n\n${buildPoolSummary(state, iconsOk)}`)];
            return screen;
        });
        return;
    }

    const diceOrder = buildPoolDiceOrder(state.counts);
    if (!diceOrder.length) {
        await safeEditReply(interaction, (iconsOk) => {
            const screen = buildPoolMainScreen(state, iconsOk);
            screen.embeds = [textEmbed(`No dice in the pool - add some first.\n\n${buildPoolSummary(state, iconsOk)}`)];
            return screen;
        });
        return;
    }

    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const rolled = swRoll.rollCore({ diceOrder, channelEmoji });
    if (rolled.error) {
        await interaction.editReply({ content: '', embeds: [textEmbed(rolled.error)], components: [] });
        return;
    }
    writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);

    const diceResult = rolled.diceResult.results;
    const rollResult = { success: diceResult.success, advantage: diceResult.advantage, triumph: diceResult.triumph, type: state.type };

    let note = rolled.faces;
    if (initiativeOrder.turn !== 1) {
        initiativeOrder.newslots.push(rollResult);
        note += `\n${getFace(state.type)} will be added to the initiative order in the next round`;
    } else {
        initiativeOrder.slots.push(rollResult);
    }

    writeData(client, messageRef, 'initiativeOrder', initiativeOrder, true);
    await interaction.editReply(buildMenu(initiativeOrder, note));
};

//---------------------------------------------------------------- set / modify

//Set replaces the order and restarts the round/turn count; Modify replaces just the slot list,
//leaving the current round/turn where they are - see the two onComponent cases below.
const buildOrderModal = (customId, title) => {
    const orderInput = new TextInputBuilder().setCustomId('order').setLabel('Order (n/p sequence)').setStyle(TextInputStyle.Short)
        .setRequired(true).setPlaceholder('e.g. nppnn');
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
        new ActionRowBuilder().addComponents(orderInput)
    );
};

const showSetModal = (interaction) => interaction.showModal(buildOrderModal('init:setModal', 'Set Initiative Order'));
const showModifyModal = (interaction) => interaction.showModal(buildOrderModal('init:modifyModal', 'Modify Initiative Order'));

const submitSetModal = async ({ interaction, client }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const order = interaction.fields.getTextInputValue('order').toLowerCase().trim();

    const initiativeOrder = initializeInitOrder();
    initiativeOrder.slots = parseOrderString(order);
    writeData(client, messageRef, 'initiativeOrder', initiativeOrder);
    await interaction.editReply(buildMenu(initiativeOrder));
};

const submitModifyModal = async ({ interaction, client }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const initiativeOrder = await readInitiativeOrder(client, messageRef);
    const order = interaction.fields.getTextInputValue('order').toLowerCase().trim();

    initiativeOrder.slots = parseOrderString(order);
    writeData(client, messageRef, 'initiativeOrder', initiativeOrder);
    await interaction.editReply(buildMenu(initiativeOrder));
};

//---------------------------------------------------------------- router

const onComponent = async ({ interaction, client }) => {
    const parts = interaction.customId.split(':');
    const action = parts[1];

    if (interaction.isModalSubmit()) {
        if (action === 'setModal') await submitSetModal({ interaction, client });
        else if (action === 'modifyModal') await submitModifyModal({ interaction, client });
        return;
    }

    if (action === 'set') {
        await showSetModal(interaction);
        return;
    }
    if (action === 'modify') {
        await showModifyModal(interaction);
        return;
    }

    //---- roll pool builder ----
    if (action === 'roll') {
        await interaction.deferUpdate();
        await safeEditReply(interaction, (iconsOk) => buildPoolMainScreen(emptyPoolState(), iconsOk));
        return;
    }
    if (action.startsWith('poolAdd-')) {
        const state = decodePoolState(parts[2]);
        const type = action.slice('poolAdd-'.length);
        state.counts[type] = Math.min((state.counts[type] || 0) + 1, MAX_COUNT);
        await interaction.deferUpdate();
        await safeEditReply(interaction, (iconsOk) => SYMBOL_TYPES.includes(type) ? buildPoolSymbolsScreen(state, iconsOk) : buildPoolMainScreen(state, iconsOk));
        return;
    }
    if (action === 'poolSymbols') {
        const state = decodePoolState(parts[2]);
        await interaction.deferUpdate();
        await safeEditReply(interaction, (iconsOk) => buildPoolSymbolsScreen(state, iconsOk));
        return;
    }
    if (action === 'poolMain') {
        const state = decodePoolState(parts[2]);
        await interaction.deferUpdate();
        await safeEditReply(interaction, (iconsOk) => buildPoolMainScreen(state, iconsOk));
        return;
    }
    if (action === 'poolType-npc' || action === 'poolType-pc') {
        const state = decodePoolState(parts[2]);
        state.type = action === 'poolType-npc' ? 'npc' : 'pc';
        await interaction.deferUpdate();
        await safeEditReply(interaction, (iconsOk) => buildPoolMainScreen(state, iconsOk));
        return;
    }
    if (action === 'poolCancel') {
        await interaction.deferUpdate();
        const messageRef = asMessageRef(interaction);
        const initiativeOrder = await readInitiativeOrder(client, messageRef);
        await interaction.editReply(buildMenu(initiativeOrder));
        return;
    }
    if (action === 'poolRoll') {
        const state = decodePoolState(parts[2]);
        await interaction.deferUpdate();
        await rollInitiativePool({ interaction, client, state });
        return;
    }

    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    let initiativeOrder = await readInitiativeOrder(client, messageRef);

    //Done just closes the menu and shows the current order with no further buttons
    if (action === 'done') {
        await interaction.editReply({ content: '', embeds: [textEmbed(buildStatusText(initiativeOrder))], components: [] });
        return;
    }

    let note;
    switch (action) {
        case 'next':
            if (initiativeOrder.turn + 1 > initiativeOrder.slots.length) {
                initiativeOrder.turn = 1;
                initiativeOrder.round++;
                note = 'New Round!';
                if (initiativeOrder.newslots.length > 0) {
                    initiativeOrder.slots = initiativeOrder.slots.concat(initiativeOrder.newslots);
                    initiativeOrder.newslots = [];
                }
            } else initiativeOrder.turn++;
            break;
        case 'previous':
            if (initiativeOrder.turn === 1 && initiativeOrder.round === 1) {
                note = 'Initiative is already at the starting turn!';
            } else if (initiativeOrder.turn - 1 < 1) {
                initiativeOrder.turn = initiativeOrder.slots.length;
                initiativeOrder.round--;
                note = 'Previous Round!';
            } else initiativeOrder.turn--;
            break;
        case 'reset':
            initiativeOrder = initializeInitOrder();
            note = 'Initiative Order has been reset.';
            break;
        default:
            return;
    }

    writeData(client, messageRef, 'initiativeOrder', initiativeOrder);
    await interaction.editReply(buildMenu(initiativeOrder, note));
};

exports.initiative = initiative;
exports.onComponent = onComponent;

const { readData, writeData } = require('../data');
const { upperFirst } = require('lodash');
const { asMessageRef, dice } = require('../');
const functions = require('./');
const {
    EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

// All of this feature's message components share the "char:" customId prefix so
// handlers.js can route button/modal interactions here without knowing the details -
// see onComponent() at the bottom. Pending wound/strain adjustments in the Modify flow
// are encoded directly in the button customIds (rather than kept in memory), since this
// bot runs across multiple shard processes and a button click can't rely on in-memory
// state left over from an earlier interaction.

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toInt = (value) => parseInt(String(value ?? '').replace(/[^-\d]/g, ''), 10) || 0;
const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

//the channel-specific server nickname reads better than the bare Discord username -
//interaction.member is absent in DMs, so fall back to the username there
const displayName = (interaction) => interaction.member?.displayName || interaction.user.username;

//the whole menu is ephemeral (see handlers.js), so only the person managing characters can see
//it - every action that actually writes a change also posts this plain, button-free
//announcement as a public followUp() so the rest of the table knows what happened
const announce = (interaction, text) => interaction.followUp({ embeds: [textEmbed(text)] });

const readCharacters = (client, messageRef) => readData(client, messageRef, 'characterStatus');
const writeCharacters = (client, messageRef, characterStatus) => writeData(client, messageRef, 'characterStatus', characterStatus);

const critName = (number) => functions.critName(number);

const buildCharacterStatus = (name, character) => {
    let text = `__**${name}**__`;
    if (character.maxWound > 0) text += `\nWounds: \`${character.currentWound} / ${character.maxWound}\``;
    if (character.maxStrain > 0) text += `\nStrain: \`${character.currentStrain} / ${character.maxStrain}\``;
    if (character.credits > 0) text += `\nCredits: \`${character.credits}\``;
    if (character.crit && character.crit.length > 0) {
        text += `\nCrits: ${character.crit.slice().sort((a, b) => a - b).map(n => `${critName(n)} (${n})`).join(', ')}`;
    }
    ['obligation', 'duty', 'morality', 'inventory', 'misc'].forEach(type => {
        if (character[type]) {
            if (Object.keys(character[type]).length > 0) {
                text += `\n${upperFirst(type)}: \``;
                Object.keys(character[type]).forEach(name => {
                    text += `${name}: ${character[type][name]}  `;
                });
                text += '\`';
            }
        }
    });
    if ((character.maxWound < character.currentWound && character.maxWound > 0) ||
        (character.maxStrain < character.currentStrain && character.maxStrain)) {
        text += `\n\`INCAPACITATED\``;
    }
    return text;
};

const applyWoundDelta = (character, delta) => {
    if (delta) character.currentWound = clamp(+character.currentWound + delta, 0, 2 * +character.maxWound);
    return character;
};
const applyStrainDelta = (character, delta) => {
    if (delta) character.currentStrain = clamp(+character.currentStrain + delta, 0, 1 + +character.maxStrain);
    return character;
};

//Done exits the interactive menu. With a character in context it shows that character's final
//status with no further buttons; without one (e.g. a picker list, the main menu) there's nothing
//to report, so it just deletes the message - see the 'done' case in onComponent().
const doneButton = (characterName) => new ButtonBuilder()
    .setCustomId(`char:done:${characterName || ''}`)
    .setLabel('Done')
    .setStyle(ButtonStyle.Primary);

const backAndDoneRow = (characterName) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('char:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    doneButton(characterName)
);

//---------------------------------------------------------------- main menu

const buildMenu = () => ({
    content: null,
    embeds: [new EmbedBuilder().setColor(Colors.DarkNavy).setTitle('Character Manager').setDescription('Choose an action:')],
    components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('char:add').setLabel('Add').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('char:remove').setLabel('Remove').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('char:modify').setLabel('Modify').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('char:list').setLabel('List').setStyle(ButtonStyle.Secondary),
        doneButton()
    )]
});

//slash command entry point - handlers.js has already deferred the reply
const character = async ({ interaction }) => {
    await interaction.editReply(buildMenu());
};

//---------------------------------------------------------------- add

const buildAddModal = () => {
    const nameInput = new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);
    const maxWoundInput = new TextInputBuilder().setCustomId('max_wound').setLabel('Max Wounds').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 12');
    const maxStrainInput = new TextInputBuilder().setCustomId('max_strain').setLabel('Max Strain').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 10');
    const creditsInput = new TextInputBuilder().setCustomId('credits').setLabel('Credits').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. 500');

    return new ModalBuilder().setCustomId('char:addModal').setTitle('Add Character').addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(maxWoundInput),
        new ActionRowBuilder().addComponents(maxStrainInput),
        new ActionRowBuilder().addComponents(creditsInput)
    );
};

//showModal() must be the interaction's first and only response, so this can't go through
//the deferUpdate()+editReply() flow the rest of the component router uses
const showAddModal = (interaction) => interaction.showModal(buildAddModal());

const submitAddModal = async ({ interaction, client }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);

    const name = interaction.fields.getTextInputValue('name').trim().toUpperCase();
    if (!name) {
        await interaction.editReply({ content: '', embeds: [textEmbed('A name is required.')], components: [backAndDoneRow()] });
        return;
    }
    if (name.includes(':')) {
        await interaction.editReply({ content: '', embeds: [textEmbed('Character names cannot contain ":".')], components: [backAndDoneRow()] });
        return;
    }

    const characterStatus = await readCharacters(client, messageRef);
    if (characterStatus[name]) {
        await interaction.editReply({ content: '', embeds: [textEmbed(`${name} already exists!`)], components: [backAndDoneRow(name)] });
        return;
    }

    const character = {
        maxWound: toInt(interaction.fields.getTextInputValue('max_wound')),
        maxStrain: toInt(interaction.fields.getTextInputValue('max_strain')),
        currentWound: 0,
        currentStrain: 0,
        credits: toInt(interaction.fields.getTextInputValue('credits')),
        crit: [],
        obligation: {},
        duty: {},
        morality: {},
        inventory: {}
    };
    characterStatus[name] = character;
    writeCharacters(client, messageRef, characterStatus);

    await interaction.editReply({ content: '', embeds: [textEmbed(buildCharacterStatus(name, character))], components: [backAndDoneRow(name)] });
    await announce(interaction, `${displayName(interaction)} adds a new character:\n\n${buildCharacterStatus(name, character)}`);
};

//---------------------------------------------------------------- shared: character picker

//Discord allows at most 5 action rows of 5 buttons; keep a row free for Back+Done
const buildCharacterButtons = (characterStatus, customId, style) => {
    const names = Object.keys(characterStatus).sort().slice(0, 20);
    const rows = [];
    for (let i = 0; i < names.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            names.slice(i, i + 5).map(name => new ButtonBuilder().setCustomId(customId(name)).setLabel(name).setStyle(style))
        ));
    }
    rows.push(backAndDoneRow());
    return rows;
};

//---------------------------------------------------------------- remove

const buildRemoveList = (characterStatus) => {
    const names = Object.keys(characterStatus);
    if (names.length === 0) return { content: '', embeds: [textEmbed('No characters.')], components: [backAndDoneRow()] };
    return {
        content: '',
        embeds: [textEmbed('Select a character to remove:')],
        components: buildCharacterButtons(characterStatus, name => `char:removeAsk:${name}`, ButtonStyle.Danger)
    };
};

const buildConfirmRemove = (name) => ({
    content: '',
    embeds: [textEmbed(`Are you sure you want to remove **${name}**?`)],
    components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`char:removeConfirm:${name}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('char:remove').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        doneButton(name)
    )]
});

//---------------------------------------------------------------- modify: crit

const buildCritModal = (name, wDelta, sDelta) => {
    const numberInput = new TextInputBuilder().setCustomId('number').setLabel('Critical Injury #').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 47');
    return new ModalBuilder().setCustomId(`char:critModal:${name}:${wDelta}:${sDelta}`).setTitle('Add Critical Injury').addComponents(
        new ActionRowBuilder().addComponents(numberInput)
    );
};

const showCritModal = (interaction, name, wDelta, sDelta) => interaction.showModal(buildCritModal(name, wDelta, sDelta));

const addCrit = (client, messageRef, characterStatus, name, number) => {
    const target = characterStatus[name];
    if (!target) return null;
    if (!target.crit) target.crit = [];
    target.crit.push(number);
    characterStatus[name] = target;
    writeCharacters(client, messageRef, characterStatus);
    return target;
};

const submitCritModal = async ({ interaction, client, name, wDelta, sDelta }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const characterStatus = await readCharacters(client, messageRef).catch(() => ({}));

    const number = toInt(interaction.fields.getTextInputValue('number'));
    if (number <= 0) {
        await interaction.editReply({ content: '', embeds: [textEmbed('Enter a valid critical injury number.')], components: [backAndDoneRow(name)] });
        return;
    }

    const target = addCrit(client, messageRef, characterStatus, name, number);
    if (!target) {
        await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
        return;
    }
    await interaction.editReply(buildModifyScreen(name, target, wDelta, sDelta));
    await announce(interaction, `${displayName(interaction)} adds ${critName(number)} (${number}) to ${name}`);
};

//shows each of the character's current crits as its own Remove button, so the user picks one
//to remove rather than typing its number. Removal is by position in `character.crit` (fixed at
//screen-build time) since crit numbers can repeat and aren't unique keys.
const buildCritRemoveScreen = (name, character, wDelta, sDelta) => {
    const entries = (character.crit || []).map((number, index) => ({ number, index })).sort((a, b) => a.number - b.number);

    let content = `__**${name} - Critical Injuries**__`;
    if (entries.length === 0) content += '\nNo critical injuries.';
    else entries.forEach(({ number }) => content += `\n${critName(number)} (${number})`);
    if (content.length > 1900) content = `__**${name} - Critical Injuries**__\nToo many entries to display.`;

    const rows = [];
    const removable = entries.slice(0, 20);
    for (let i = 0; i < removable.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            removable.slice(i, i + 5).map(({ number, index }) => new ButtonBuilder()
                .setCustomId(`char:critRemove:${name}:${index}:${wDelta}:${sDelta}`)
                .setLabel(`${critName(number)} (${number})`.slice(0, 80))
                .setStyle(ButtonStyle.Danger))
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta}:${sDelta}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
    ));

    return { content: '', embeds: [textEmbed(content)], components: rows.slice(0, 5) };
};

//removes the crit at `index` in `character.crit` (as it stood when the removal screen was built)
const removeCritAt = (client, messageRef, characterStatus, name, index) => {
    const target = characterStatus[name];
    if (!target) return { target: null, removed: null };
    if (!target.crit) target.crit = [];
    let removed = null;
    if (index >= 0 && index < target.crit.length) {
        removed = target.crit[index];
        target.crit.splice(index, 1);
    }
    characterStatus[name] = target;
    writeCharacters(client, messageRef, characterStatus);
    return { target, removed };
};

//---------------------------------------------------------------- modify: credits

const buildCreditsModal = (name, wDelta, sDelta) => {
    const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Credit change (+/-)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 100 or -50');
    return new ModalBuilder().setCustomId(`char:creditsModal:${name}:${wDelta}:${sDelta}`).setTitle('Adjust Credits').addComponents(
        new ActionRowBuilder().addComponents(amountInput)
    );
};

const showCreditsModal = (interaction, name, wDelta, sDelta) => interaction.showModal(buildCreditsModal(name, wDelta, sDelta));

const submitCreditsModal = async ({ interaction, client, name, wDelta, sDelta }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const characterStatus = await readCharacters(client, messageRef).catch(() => ({}));

    const amount = toInt(interaction.fields.getTextInputValue('amount'));
    if (!amount) {
        await interaction.editReply({ content: '', embeds: [textEmbed('Enter a non-zero amount.')], components: [backAndDoneRow(name)] });
        return;
    }

    const target = characterStatus[name];
    if (!target) {
        await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
        return;
    }
    target.credits = Math.max(0, +target.credits + amount);
    characterStatus[name] = target;
    writeCharacters(client, messageRef, characterStatus);

    await interaction.editReply(buildModifyScreen(name, target, wDelta, sDelta, `Credits ${amount >= 0 ? '+' : ''}${amount} → ${target.credits}`));
    await announce(interaction, `${displayName(interaction)} changes ${name}'s credits by ${amount >= 0 ? '+' : ''}${amount} (now ${target.credits})`);
};

//---------------------------------------------------------------- modify: obligation/duty/morality/inventory

const TRACKED_TYPES = ['obligation', 'duty', 'morality', 'inventory'];

//shows the entries for one tracked type (obligation/duty/morality/inventory), each with its own Remove
//button, plus a way to add a new one. Entries are removed by position (in a freshly-sorted list)
//rather than by name in the customId, since names are free text and could contain ":" or run
//long - an index is short, safe, and always resolved against the current data at click-time.
const buildTrackedTypeScreen = (name, character, type, wDelta, sDelta) => {
    const entries = character[type] || {};
    const entryNames = Object.keys(entries).sort();

    let content = `__**${name} - ${upperFirst(type)}**__`;
    if (entryNames.length === 0) content += `\nNo ${type} entries.`;
    else entryNames.forEach(entryName => content += `\n${entryName}: ${entries[entryName]}`);
    if (content.length > 1900) content = `__**${name} - ${upperFirst(type)}**__\nToo many entries to display.`;

    const rows = [];
    const removable = entryNames.slice(0, 20);
    for (let i = 0; i < removable.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            removable.slice(i, i + 5).map((entryName, j) => new ButtonBuilder()
                .setCustomId(`char:trackRemove:${type}:${name}:${i + j}:${wDelta}:${sDelta}`)
                .setLabel(`Remove ${entryName}`.slice(0, 80))
                .setStyle(ButtonStyle.Danger))
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`char:trackAdd:${type}:${name}:${wDelta}:${sDelta}`).setLabel(`Add ${upperFirst(type)}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta}:${sDelta}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
    ));

    return { content: '', embeds: [textEmbed(content)], components: rows.slice(0, 5) };
};

const buildTrackAddModal = (type, name, wDelta, sDelta) => {
    const labelInput = new TextInputBuilder().setCustomId('label').setLabel(`${upperFirst(type)} name`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
    const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 5');
    return new ModalBuilder().setCustomId(`char:trackAddModal:${type}:${name}:${wDelta}:${sDelta}`).setTitle(`Add ${upperFirst(type)}`).addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(amountInput)
    );
};

const showTrackAddModal = (interaction, type, name, wDelta, sDelta) => interaction.showModal(buildTrackAddModal(type, name, wDelta, sDelta));

const submitTrackAddModal = async ({ interaction, client, type, name, wDelta, sDelta }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const characterStatus = await readCharacters(client, messageRef).catch(() => ({}));

    const label = interaction.fields.getTextInputValue('label').trim().toUpperCase();
    const amount = toInt(interaction.fields.getTextInputValue('amount'));

    if (!label) {
        await interaction.editReply({ content: '', embeds: [textEmbed('Enter a name for this entry.')], components: [backAndDoneRow(name)] });
        return;
    }
    if (!amount) {
        await interaction.editReply({ content: '', embeds: [textEmbed('Enter a non-zero amount.')], components: [backAndDoneRow(name)] });
        return;
    }

    const target = characterStatus[name];
    if (!target) {
        await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
        return;
    }
    if (!target[type]) target[type] = {};
    target[type][label] = (target[type][label] || 0) + amount;
    characterStatus[name] = target;
    writeCharacters(client, messageRef, characterStatus);

    await interaction.editReply(buildTrackedTypeScreen(name, target, type, wDelta, sDelta));
    await announce(interaction, `${displayName(interaction)} adds ${upperFirst(type)} "${label}: ${amount}" to ${name}`);
};

//removes the entry at `index` in the alphabetically-sorted list of the type's current entries
const removeTrackedEntry = (client, messageRef, characterStatus, name, type, index) => {
    const target = characterStatus[name];
    if (!target) return null;
    if (!target[type]) target[type] = {};
    const entryNames = Object.keys(target[type]).sort();
    const entryName = entryNames[index];
    if (entryName !== undefined) delete target[type][entryName];
    characterStatus[name] = target;
    writeCharacters(client, messageRef, characterStatus);
    return target;
};

//---------------------------------------------------------------- modify

const buildModifyList = (characterStatus) => {
    const names = Object.keys(characterStatus);
    if (names.length === 0) return { content: '', embeds: [textEmbed('No characters.')], components: [backAndDoneRow()] };
    return {
        content: '',
        embeds: [textEmbed('Select a character to modify:')],
        components: buildCharacterButtons(characterStatus, name => `char:mod:${name}:0:0`, ButtonStyle.Primary)
    };
};

const buildModifyScreen = (name, character, wDelta, sDelta, prefix) => {
    const preview = applyStrainDelta(applyWoundDelta({ ...character }, wDelta), sDelta);
    let content = prefix ? `${prefix}\n\n` : '';
    content += buildCharacterStatus(name, preview);
    if (wDelta || sDelta) {
        content += `\n\nPending: Wound ${wDelta >= 0 ? '+' : ''}${wDelta}, Strain ${sDelta >= 0 ? '+' : ''}${sDelta}`;
    }

    const woundButtons = [];
    if (preview.currentWound > 0) {
        woundButtons.push(new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta - 1}:${sDelta}`).setLabel('Wound -1').setStyle(ButtonStyle.Success));
    }
    woundButtons.push(new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta + 1}:${sDelta}`).setLabel('Wound +1').setStyle(ButtonStyle.Danger));
    const woundRow = new ActionRowBuilder().addComponents(woundButtons);

    const strainButtons = [];
    if (preview.currentStrain > 0) {
        strainButtons.push(new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta}:${sDelta - 1}`).setLabel('Strain -1').setStyle(ButtonStyle.Success));
    }
    strainButtons.push(new ButtonBuilder().setCustomId(`char:mod:${name}:${wDelta}:${sDelta + 1}`).setLabel('Strain +1').setStyle(ButtonStyle.Danger));
    const strainRow = new ActionRowBuilder().addComponents(strainButtons);
    const critButtons = [
        new ButtonBuilder().setCustomId(`char:critRoll:${name}:${wDelta}:${sDelta}`).setLabel('Roll Crit').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`char:critAsk:${name}:${wDelta}:${sDelta}`).setLabel('Add Crit #').setStyle(ButtonStyle.Secondary)
    ];
    if (character.crit && character.crit.length > 0) {
        critButtons.push(new ButtonBuilder().setCustomId(`char:critRemoveAsk:${name}:${wDelta}:${sDelta}`).setLabel('Remove Crit').setStyle(ButtonStyle.Secondary));
    }
    const critRow = new ActionRowBuilder().addComponents(critButtons);
    const trackedRow = new ActionRowBuilder().addComponents(
        TRACKED_TYPES.map(type => new ButtonBuilder()
            .setCustomId(`char:track:${type}:${name}:${wDelta}:${sDelta}`)
            .setLabel(upperFirst(type))
            .setStyle(ButtonStyle.Secondary))
            .concat(new ButtonBuilder().setCustomId(`char:creditsAsk:${name}:${wDelta}:${sDelta}`).setLabel('Credits').setStyle(ButtonStyle.Secondary))
    );
    //Done always shows here - applying a delta of 0/0 is a harmless no-op, and it's the one
    //button guaranteed to finalize this character (commit any pending change) and exit cleanly
    const finalRowButtons = [
        new ButtonBuilder().setCustomId('char:modify').setLabel('Back').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`char:modApply:${name}:${wDelta}:${sDelta}`).setLabel('Done').setStyle(ButtonStyle.Primary)
    ];

    return { content: '', embeds: [textEmbed(content)], components: [woundRow, strainRow, critRow, trackedRow, new ActionRowBuilder().addComponents(finalRowButtons)] };
};

//---------------------------------------------------------------- list

const buildList = (characterStatus) => {
    const names = Object.keys(characterStatus).sort();
    if (names.length === 0) return { content: '', embeds: [textEmbed('No characters.')], components: [backAndDoneRow()] };
    let content = names.map(name => buildCharacterStatus(name, characterStatus[name])).join('\n\n');
    if (content.length > 1900) content = 'Too many characters to display.';
    return { content: '', embeds: [textEmbed(content)], components: [backAndDoneRow()] };
};

//---------------------------------------------------------------- router

const onComponent = async ({ interaction, client }) => {
    const parts = interaction.customId.split(':');
    const action = parts[1];

    if (interaction.isModalSubmit()) {
        if (action === 'addModal') await submitAddModal({ interaction, client });
        else if (action === 'critModal') await submitCritModal({ interaction, client, name: parts[2], wDelta: +parts[3], sDelta: +parts[4] });
        else if (action === 'creditsModal') await submitCreditsModal({ interaction, client, name: parts[2], wDelta: +parts[3], sDelta: +parts[4] });
        else if (action === 'trackAddModal') await submitTrackAddModal({ interaction, client, type: parts[2], name: parts[3], wDelta: +parts[4], sDelta: +parts[5] });
        return;
    }

    if (action === 'add') {
        await showAddModal(interaction);
        return;
    }
    if (action === 'critAsk') {
        await showCritModal(interaction, parts[2], +parts[3], +parts[4]);
        return;
    }
    if (action === 'creditsAsk') {
        await showCreditsModal(interaction, parts[2], +parts[3], +parts[4]);
        return;
    }
    if (action === 'trackAdd') {
        await showTrackAddModal(interaction, parts[2], parts[3], +parts[4], +parts[5]);
        return;
    }

    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const characterStatus = await readCharacters(client, messageRef).catch(() => ({}));

    switch (action) {
        case 'back':
            await interaction.editReply(buildMenu());
            break;

        case 'remove':
            await interaction.editReply(buildRemoveList(characterStatus));
            break;
        case 'removeAsk':
            await interaction.editReply(buildConfirmRemove(parts[2]));
            break;
        case 'removeConfirm': {
            const name = parts[2];
            delete characterStatus[name];
            writeCharacters(client, messageRef, characterStatus);
            await interaction.editReply({ content: '', embeds: [textEmbed(`${name} has been removed.`)], components: [backAndDoneRow()] });
            await announce(interaction, `${displayName(interaction)} removes character ${name}`);
            break;
        }

        case 'modify':
            await interaction.editReply(buildModifyList(characterStatus));
            break;
        case 'mod': {
            const [name, wDelta, sDelta] = [parts[2], +parts[3], +parts[4]];
            const target = characterStatus[name];
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            await interaction.editReply(buildModifyScreen(name, target, wDelta, sDelta));
            break;
        }
        case 'track': {
            const [type, name, wDelta, sDelta] = [parts[2], parts[3], +parts[4], +parts[5]];
            const target = characterStatus[name];
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            await interaction.editReply(buildTrackedTypeScreen(name, target, type, wDelta, sDelta));
            break;
        }
        case 'trackRemove': {
            const [type, name, index, wDelta, sDelta] = [parts[2], parts[3], +parts[4], +parts[5], +parts[6]];
            const target = removeTrackedEntry(client, messageRef, characterStatus, name, type, index);
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            await interaction.editReply(buildTrackedTypeScreen(name, target, type, wDelta, sDelta));
            await announce(interaction, `${displayName(interaction)} removes a ${type} entry from ${name}`);
            break;
        }
        case 'critRemoveAsk': {
            const [name, wDelta, sDelta] = [parts[2], +parts[3], +parts[4]];
            const target = characterStatus[name];
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            await interaction.editReply(buildCritRemoveScreen(name, target, wDelta, sDelta));
            break;
        }
        case 'critRemove': {
            const [name, index, wDelta, sDelta] = [parts[2], +parts[3], +parts[4], +parts[5]];
            const { target, removed } = removeCritAt(client, messageRef, characterStatus, name, index);
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            const prefix = removed !== null ? `Removed ${critName(removed)} (${removed})` : undefined;
            await interaction.editReply(buildModifyScreen(name, target, wDelta, sDelta, prefix));
            if (removed !== null) await announce(interaction, `${displayName(interaction)} removes ${critName(removed)} (${removed}) from ${name}`);
            break;
        }
        case 'critRoll': {
            const [name, wDelta, sDelta] = [parts[2], +parts[3], +parts[4]];
            const roll = dice(100);
            const target = addCrit(client, messageRef, characterStatus, name, roll);
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            await interaction.editReply(buildModifyScreen(name, target, wDelta, sDelta, `Rolled ${roll} → ${critName(roll)}`));
            await announce(interaction, `${displayName(interaction)} rolls a critical injury for ${name}: ${roll} → ${critName(roll)}`);
            break;
        }
        case 'modApply': {
            const [name, wDelta, sDelta] = [parts[2], +parts[3], +parts[4]];
            const target = characterStatus[name];
            if (!target) {
                await interaction.editReply({ content: '', embeds: [textEmbed(`${name} no longer exists.`)], components: [backAndDoneRow()] });
                break;
            }
            applyWoundDelta(target, wDelta);
            applyStrainDelta(target, sDelta);
            characterStatus[name] = target;
            writeCharacters(client, messageRef, characterStatus);
            await interaction.editReply({ content: '', embeds: [textEmbed(buildCharacterStatus(name, target))], components: [] });
            //0/0 is a harmless no-op (see buildModifyScreen's comment) - nothing changed at this
            //step, so there's nothing new to announce (any earlier credits/crit/track changes in
            //this session were already announced individually as they happened)
            if (wDelta || sDelta) {
                await announce(interaction, `${displayName(interaction)} updates ${name}\n\n${buildCharacterStatus(name, target)}`);
                await interaction.deleteReply().catch(console.error);
            }
            break;
        }

        case 'list':
            await interaction.editReply(buildList(characterStatus));
            break;

        case 'done': {
            const name = parts[2];
            const target = name && characterStatus[name];
            if (!target) {
                await interaction.deleteReply().catch(console.error);
                break;
            }
            await interaction.editReply({ content: '', embeds: [textEmbed(buildCharacterStatus(name, target))], components: [] });
            break;
        }

        default:
            break;
    }
};

exports.character = character;
exports.onComponent = onComponent;

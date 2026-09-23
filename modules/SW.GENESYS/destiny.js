const functions = require('./');
const { emoji, asMessageRef } = require('../');
const { readData, writeData } = require('../data');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    EmbedBuilder, Colors
} = require('discord.js');

const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

const toInt = (value) => parseInt(String(value ?? '').replace(/[^-\d]/g, ''), 10) || 0;

//the channel-specific server nickname reads better in a shared pool than the bare Discord
//username - interaction.member is absent in DMs, so fall back to the username there
const displayName = (interaction) => interaction.member?.displayName || interaction.user.username;

const initDestinyBalance = () => ({ light: 0, dark: 0, face: '' });

const readBalance = async (client, messageRef) => {
    const destinyBalance = await readData(client, messageRef, 'destinyBalance');
    return Object.keys(destinyBalance).length === 0 ? initDestinyBalance() : destinyBalance;
};
const writeBalance = (client, messageRef, destinyBalance) => writeData(client, messageRef, 'destinyBalance', destinyBalance);

//Genesys channels call this the Story pool (Player/GM); SWRPG channels call it the Destiny
//pool (Lightside/Darkside) - same data, different labels.
const namesFor = (channelEmoji) => channelEmoji === 'genesys'
    ? { type: 'Story', light: 'Player', dark: 'GM' }
    : { type: 'Destiny', light: 'Lightside', dark: 'Darkside' };

const buildPoolText = (destinyBalance, channelEmoji, names) => {
    let face = '';
    for (let i = 0; i < destinyBalance.light; i++) face += emoji('lightside', channelEmoji);
    for (let i = 0; i < destinyBalance.dark; i++) face += emoji('darkside', channelEmoji);
    if (face.length > 1500) face = 'Too many points to display.';
    return `${names.type} Points: ${face || 'none'}`;
};

const buildMenu = (destinyBalance, channelEmoji) => {
    const names = namesFor(channelEmoji);
    return {
        content: '',
        embeds: [textEmbed(buildPoolText(destinyBalance, channelEmoji, names))],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('destiny:roll').setLabel('Roll').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('destiny:light').setLabel(names.light).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('destiny:dark').setLabel(names.dark).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('destiny:setAsk').setLabel('Set').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('destiny:reset').setLabel('Reset').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('destiny:done').setLabel('Done').setStyle(ButtonStyle.Primary)
            )
        ]
    };
};

//Roll/Light/Dark/Set/Reset/Done all remove the private ephemeral menu once they've posted the
//public readout - deferUpdate() acknowledges the click without touching the menu message, then
//deleteReply() removes it after followUp() has the public post out. Re-running /destiny opens a
//fresh menu.
const closeEphemeralMenu = async (interaction, message) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    await interaction.deferUpdate();
    await interaction.followUp({ embeds: [textEmbed(message)] });
    await interaction.deleteReply().catch((error) => main.logError('destiny onComponent', error));
};

//slash command entry point - handlers.js has already deferred the reply
const destiny = async ({ client, interaction, channelEmoji }) => {
    const messageRef = asMessageRef(interaction);
    const destinyBalance = await readBalance(client, messageRef);
    await interaction.editReply(buildMenu(destinyBalance, channelEmoji));
};

//---------------------------------------------------------------- set

const buildSetModal = () => {
    const lightInput = new TextInputBuilder().setCustomId('light').setLabel('Light/Player points').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. 3');
    const darkInput = new TextInputBuilder().setCustomId('dark').setLabel('Dark/GM points').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. 2');
    return new ModalBuilder().setCustomId('destiny:setModal').setTitle('Set Point Pool').addComponents(
        new ActionRowBuilder().addComponents(lightInput),
        new ActionRowBuilder().addComponents(darkInput)
    );
};

//showModal() must be the interaction's first and only response, so this can't go through
//the deferUpdate()+editReply() flow the rest of the component router uses
const showSetModal = (interaction) => interaction.showModal(buildSetModal());

//this modal is only ever shown from a button (see showSetModal above), so the submission can use
//deferUpdate()/deleteReply() on that same message via closeEphemeralMenu()
const submitSetModal = async ({ interaction, client }) => {
    const messageRef = asMessageRef(interaction);
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const names = namesFor(channelEmoji);

    const destinyBalance = initDestinyBalance();
    destinyBalance.light = toInt(interaction.fields.getTextInputValue('light'));
    destinyBalance.dark = toInt(interaction.fields.getTextInputValue('dark'));
    writeBalance(client, messageRef, destinyBalance);

    await closeEphemeralMenu(interaction, `${displayName(interaction)} sets the ${names.type} Points\n\n${buildPoolText(destinyBalance, channelEmoji, names)}`);
};

//---------------------------------------------------------------- router

//Each button press performs its action immediately and closes the menu (no components left on
//the reply) so the result is unambiguous about who did what - re-run /destiny to act again.
const onComponent = async ({ interaction, client }) => {
    const action = interaction.customId.split(':')[1];

    if (interaction.isModalSubmit()) {
        if (action === 'setModal') await submitSetModal({ interaction, client });
        return;
    }

    if (action === 'setAsk') {
        await showSetModal(interaction);
        return;
    }

    //readData/readBalance are Firestore reads, not Discord calls, so they still finish well within
    //Discord's response window before the closeEphemeralMenu() call below
    const messageRef = asMessageRef(interaction);
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const names = namesFor(channelEmoji);
    let destinyBalance = await readBalance(client, messageRef);

    //Done doesn't change the pool, but still posts a public readout of who wrapped up and the
    //final pool, then removes the private menu - same as every other action below
    if (action === 'done') {
        await closeEphemeralMenu(interaction, `${displayName(interaction)} finishes with the ${names.type} Points\n\n${buildPoolText(destinyBalance, channelEmoji, names)}`);
        return;
    }

    let message;
    let changed = true;
    switch (action) {
        case 'roll': {
            const rolled = functions.rollCore({ params: ['w'], channelEmoji });
            if (rolled.error) {
                message = 'No dice rolled.';
                changed = false;
                break;
            }
            destinyBalance.light = +destinyBalance.light + +rolled.diceResult.results.lightpip;
            destinyBalance.dark = +destinyBalance.dark + +rolled.diceResult.results.darkpip;
            writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);
            message = `${displayName(interaction)} rolls the ${names.type} dice\n${rolled.faces}`;
            break;
        }
        case 'light':
            if (destinyBalance.light <= 0) {
                message = `No ${names.light} points available, request will be ignored`;
                changed = false;
            } else {
                destinyBalance.light--;
                destinyBalance.dark++;
                message = `${displayName(interaction)} uses a ${names.light} point`;
            }
            break;
        case 'dark':
            if (destinyBalance.dark <= 0) {
                message = `No ${names.dark} points available, request will be ignored`;
                changed = false;
            } else {
                destinyBalance.dark--;
                destinyBalance.light++;
                message = `${displayName(interaction)} uses a ${names.dark} point`;
            }
            break;
        case 'reset':
            destinyBalance = initDestinyBalance();
            message = `${displayName(interaction)} resets the ${names.type} Points`;
            break;
        default:
            return;
    }

    //an error/no-op (no dice rolled, no points available) stays private - nothing actually
    //happened, so there's nothing worth telling the rest of the table
    if (!changed) {
        await interaction.update({ content: '', embeds: [textEmbed(message)], components: [] });
        return;
    }

    writeBalance(client, messageRef, destinyBalance);
    //announce the change publicly, then remove the private control panel
    await closeEphemeralMenu(interaction, `${message}\n\n${buildPoolText(destinyBalance, channelEmoji, names)}`);
};

exports.destiny = destiny;
exports.onComponent = onComponent;

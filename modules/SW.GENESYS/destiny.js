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

const submitSetModal = async ({ interaction, client }) => {
    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const names = namesFor(channelEmoji);

    const destinyBalance = initDestinyBalance();
    destinyBalance.light = toInt(interaction.fields.getTextInputValue('light'));
    destinyBalance.dark = toInt(interaction.fields.getTextInputValue('dark'));
    writeBalance(client, messageRef, destinyBalance);

    await interaction.editReply({
        content: '',
        embeds: [textEmbed(`${displayName(interaction)} sets the ${names.type} Points\n\n${buildPoolText(destinyBalance, channelEmoji, names)}`)],
        components: []
    });
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

    await interaction.deferUpdate();
    const messageRef = asMessageRef(interaction);
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
    const names = namesFor(channelEmoji);
    let destinyBalance = await readBalance(client, messageRef);

    //Done just closes the menu - it doesn't change the pool, so it skips the write+message flow below
    if (action === 'done') {
        await interaction.editReply({ content: '', embeds: [textEmbed(buildPoolText(destinyBalance, channelEmoji, names))], components: [] });
        return;
    }

    let message;
    switch (action) {
        case 'roll': {
            const rolled = functions.rollCore({ params: ['w'], channelEmoji });
            if (rolled.error) {
                message = 'No dice rolled.';
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
            } else {
                destinyBalance.light--;
                destinyBalance.dark++;
                message = `${displayName(interaction)} uses a ${names.light} point`;
            }
            break;
        case 'dark':
            if (destinyBalance.dark <= 0) {
                message = `No ${names.dark} points available, request will be ignored`;
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

    writeBalance(client, messageRef, destinyBalance);
    await interaction.editReply({
        content: '',
        embeds: [textEmbed(`${message}\n\n${buildPoolText(destinyBalance, channelEmoji, names)}`)],
        components: []
    });
};

exports.destiny = destiny;
exports.onComponent = onComponent;

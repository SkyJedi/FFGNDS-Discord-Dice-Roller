const { ActionRowBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

//one Google Form serves every bot and site; /feedback posts straight to it so users never leave Discord
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSedneM-ImrTrMm92VgBKOThjvEsf2Jq95HiesN7pxh_8wWg-w/';
const ENTRY = { bot: 'entry.1736849516', server: 'entry.1282692316', user: 'entry.1722619971', feedback: 'entry.1440311554' };
const MODAL_ID = 'feedback:modal';
const TEXT_ID = 'feedback:text';

const fields = ({ bot, server, user, feedback }) => {
    const params = new URLSearchParams({ [ENTRY.bot]: bot, [ENTRY.server]: server, [ENTRY.user]: user });
    if (feedback !== undefined) params.set(ENTRY.feedback, feedback);
    return params;
};

//pre-filled form link, the fallback when Google refuses a submit
//(URLSearchParams also encodes ( and ), which would otherwise end a [here](...) markdown link early)
const feedbackUrl = (answers) => `${FORM}viewform?usp=pp_url&${fields(answers)}`;

const feedbackModal = () => new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Feedback')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(TEXT_ID)
        .setLabel('Feedback (sent with your Discord name)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)));

//Google answers 200 on a saved response; a redirect means sign-in is required, 400 a missing required answer
const sendFeedback = async (answers) => {
    const response = await fetch(`${FORM}formResponse`, {
        method: 'POST', body: fields(answers), redirect: 'manual', signal: AbortSignal.timeout(10000)
    });
    await response.body?.cancel(); //the page Google sends back isn't needed; free the connection
    if (response.status !== 200) throw new Error(`Google Form answered ${response.status}`);
};

const onFeedbackSubmit = async (interaction, bot) => {
    const answers = {
        bot,
        server: interaction.guild?.name ?? 'Direct message',
        user: interaction.user.username,
        feedback: interaction.fields.getTextInputValue(TEXT_ID)
    };
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        await sendFeedback(answers);
    } catch (error) {
        console.error('Feedback form post failed:', error);
        //their text is quoted back (an embed holds 4096 characters) so nothing typed is lost
        return interaction.editReply({
            content: `Sorry, your feedback couldn't be sent. Please copy it below and send it [here](${feedbackUrl({ ...answers, feedback: undefined })}) instead.`,
            embeds: [new EmbedBuilder().setDescription(answers.feedback)]
        });
    }
    await interaction.editReply('Thanks, your feedback was sent.');
};

exports.MODAL_ID = MODAL_ID;
exports.feedbackModal = feedbackModal;
exports.feedbackUrl = feedbackUrl;
exports.onFeedbackSubmit = onFeedbackSubmit;
exports.sendFeedback = sendFeedback;

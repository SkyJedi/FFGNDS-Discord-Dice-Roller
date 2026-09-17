const { dice, emoji, readData, writeData, asMessageRef } = require('../');
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle,
	EmbedBuilder, Colors
} = require('discord.js');

//the pool builder (for Add) and the result display both reuse /roll's building blocks instead of
//duplicating them - see modules/L5R/roll.js and modules/SW.GENESYS/reroll.js (same pattern there)
const l5rRoll = require('./roll');
const {
	rollCore, rollOneDie, countSymbols, buildResultText, buildRollResultEmbed, buildDiceOrder, initDiceResult,
	DIE_TYPES, SYMBOL_TYPES, ALL_TYPES, LABELS, MAX_COUNT
} = l5rRoll;

const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

//L5R has no button-shape icon set (see modules/L5R/roll.js's pool builder), but its per-channel
//emoji set does have a face emoji for every die/symbol result - Select's buttons use those
const CUSTOM_EMOJI_PATTERN = /^<a?:\w+:\d+>$/;
const dieFaceIcon = (type, face, channelEmoji, iconsOk) => {
	if (!iconsOk) return null;
	const key = SYMBOL_TYPES.includes(type) ? type : `${type}${face}`;
	const icon = emoji(key, channelEmoji);
	return CUSTOM_EMOJI_PATTERN.test(icon || '') ? icon : null;
};

//for result-message text (not buttons), so no iconsOk/retry needed - an unresolved emoji just
//falls back to the plain type label instead of risking Discord rejecting an invalid button emoji
const dieFaceLabel = (type, face, channelEmoji) => dieFaceIcon(type, face, channelEmoji, true) || LABELS[type];

//once Discord has rejected a face emoji on a button, remember it for the life of this process and
//skip straight to text labels afterward - same idea as roll.js's safeEditReply (SWRPG/Genesys)
const hasInvalidEmojiError = (error) => /INVALID_EMOJI/i.test(JSON.stringify(error?.rawError ?? error?.message ?? ''));
let iconsKnownBad = false;
//buildScreen may be async (buildSelectScreen awaits buildResultText), so its result is always
//awaited before being handed to editReply - unlike SWRPG/Genesys's synchronous equivalent
const safeEditReply = async (interaction, buildScreen) => {
	if (iconsKnownBad) {
		await interaction.editReply(await buildScreen(false));
		return;
	}
	try {
		await interaction.editReply(await buildScreen(true));
	} catch (error) {
		if (!hasInvalidEmojiError(error)) throw error;
		iconsKnownBad = true;
		console.error('L5R reroll: emoji.json has a stale/invalid emoji id, falling back to text labels for the rest of this run', error);
		await interaction.editReply(await buildScreen(false));
	}
};

const readDiceResult = async (client, messageRef) => {
	const roll = await readData(client, messageRef, 'diceResult');
	if (!roll || Object.keys(roll).length === 0) return null;
	return { roll, results: {} };
};

const noRollScreen = () => ({ content: '', embeds: [textEmbed('No previous roll to modify - use /roll first.')], components: [] });

//---------------------------------------------------------------- menu

const statusEmbed = async (diceResult, channelEmoji, note) => {
	countSymbols(diceResult);
	const { faces, response } = await buildResultText(diceResult, channelEmoji);
	const resultsLine = faces ? (response.trim().length > 0 ? response : 'No symbols rolled') : undefined;
	return buildRollResultEmbed(note || 'Reroll', faces || 'No dice rolled.', resultsLine);
};

const backRow = (customId = 'l5rreroll:menu') => new ActionRowBuilder().addComponents(
	new ButtonBuilder().setCustomId(customId).setLabel('Back').setStyle(ButtonStyle.Secondary)
);

const buildMenu = async (diceResult, channelEmoji, note) => ({
	content: '',
	embeds: [await statusEmbed(diceResult, channelEmoji, note)],
	components: [
		new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('l5rreroll:add').setLabel('Add').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId('l5rreroll:same').setLabel('Same').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('l5rreroll:removeScreen').setLabel('Remove').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('l5rreroll:selectScreen').setLabel('Select').setStyle(ButtonStyle.Primary)
		),
		new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('l5rreroll:done').setLabel('Done').setStyle(ButtonStyle.Primary)
		)
	]
});

//Slash command entry point - handlers.js has already deferred the reply
const reroll = async ({ interaction, client, channelEmoji }) => {
	const messageRef = asMessageRef(interaction);
	const diceResult = await readDiceResult(client, messageRef);
	await interaction.editReply(diceResult ? await buildMenu(diceResult, channelEmoji) : noRollScreen());
};

//---------------------------------------------------------------- add (button pool builder)

//L5R has no button-shape icon set either, so - like modules/L5R/roll.js's own pool builder -
//these buttons use text labels only
const encodeAddState = (counts) => ALL_TYPES.map(type => counts[type] || 0).join(',');

const decodeAddState = (str) => {
	const counts = {};
	(str || '').split(',').forEach((n, i) => { if (ALL_TYPES[i]) counts[ALL_TYPES[i]] = Math.min(+n || 0, MAX_COUNT); });
	return counts;
};

const poolButton = (type, s) => new ButtonBuilder().setCustomId(`l5rreroll:addPoolAdd-${type}:${s}`).setLabel(LABELS[type]).setStyle(ButtonStyle.Secondary);

const buildAddPoolSummary = (counts, prefix = 'Adding') => {
	const parts = ALL_TYPES.filter(type => counts[type] > 0).map(type => `${counts[type]} ${LABELS[type]}`);
	return parts.length ? `${prefix}: ${parts.join(', ')}` : `${prefix}: nothing selected`;
};

const buildAddPoolMainScreen = (counts) => {
	const s = encodeAddState(counts);
	return {
		content: '',
		embeds: [textEmbed(buildAddPoolSummary(counts))],
		components: [
			new ActionRowBuilder().addComponents(DIE_TYPES.map(type => poolButton(type, s))),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`l5rreroll:addPoolSymbols:${s}`).setLabel('Symbols').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId(`l5rreroll:addPoolRoll:${s}`).setLabel('Add').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId(`l5rreroll:addPoolCancel:${s}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
			)
		]
	};
};

const buildAddPoolSymbolsScreen = (counts) => {
	const s = encodeAddState(counts);
	return {
		content: '',
		embeds: [textEmbed(buildAddPoolSummary(counts))],
		components: [
			new ActionRowBuilder().addComponents(SYMBOL_TYPES.map(type => poolButton(type, s))),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`l5rreroll:addPoolMain:${s}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
			)
		]
	};
};

//---------------------------------------------------------------- remove

const buildRemoveScreen = async (diceResult, channelEmoji, note) => {
	const present = ALL_TYPES.filter(type => (diceResult.roll[type] || []).length > 0);
	if (present.length === 0) {
		return {
			content: '',
			embeds: [await statusEmbed(diceResult, channelEmoji, note || 'No dice left to remove')],
			components: [backRow()]
		};
	}
	const rows = [];
	for (let i = 0; i < present.length; i += 5) {
		rows.push(new ActionRowBuilder().addComponents(
			present.slice(i, i + 5).map(type => new ButtonBuilder()
				.setCustomId(`l5rreroll:removeType-${type}`)
				.setLabel(`${LABELS[type]} (${diceResult.roll[type].length})`)
				.setStyle(ButtonStyle.Danger))
		));
	}
	rows.push(backRow());
	return {
		content: '',
		embeds: [await statusEmbed(diceResult, channelEmoji, note || 'Pick a die type to remove one at random')],
		components: rows.slice(0, 5)
	};
};

//---------------------------------------------------------------- select (reroll a specific die)

//lists every individual die across all types as its own button, e.g. its current face - capped
//at 20 like char.js's picker lists, to stay within Discord's 5 rows of 5 buttons
const buildDieEntries = (diceResult) => {
	const entries = [];
	ALL_TYPES.forEach(type => (diceResult.roll[type] || []).forEach((_, index) => entries.push({ type, index })));
	return entries;
};

const selectDieButton = (diceResult, channelEmoji, type, index, iconsOk) => {
	const button = new ButtonBuilder().setCustomId(`l5rreroll:selectDie-${type}-${index}`).setStyle(ButtonStyle.Primary);
	const icon = dieFaceIcon(type, diceResult.roll[type][index], channelEmoji, iconsOk);
	return icon ? button.setEmoji(icon) : button.setLabel(`${LABELS[type]} #${index + 1}`);
};

const buildSelectScreen = async (diceResult, channelEmoji, note, iconsOk = true) => {
	const entries = buildDieEntries(diceResult).slice(0, 20);
	if (entries.length === 0) {
		return { content: '', embeds: [await statusEmbed(diceResult, channelEmoji, note || 'No dice to reroll')], components: [backRow()] };
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
		embeds: [await statusEmbed(diceResult, channelEmoji, note || 'Pick a die to reroll')],
		components: rows.slice(0, 5)
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
	if (action === 'add') {
		await interaction.deferUpdate();
		await interaction.editReply(buildAddPoolMainScreen({}));
		return;
	}
	if (action.startsWith('addPoolAdd-')) {
		const counts = decodeAddState(parts[2]);
		const type = action.slice('addPoolAdd-'.length);
		counts[type] = Math.min((counts[type] || 0) + 1, MAX_COUNT);
		await interaction.deferUpdate();
		await interaction.editReply(SYMBOL_TYPES.includes(type) ? buildAddPoolSymbolsScreen(counts) : buildAddPoolMainScreen(counts));
		return;
	}
	if (action === 'addPoolSymbols') {
		const counts = decodeAddState(parts[2]);
		await interaction.deferUpdate();
		await interaction.editReply(buildAddPoolSymbolsScreen(counts));
		return;
	}
	if (action === 'addPoolMain') {
		const counts = decodeAddState(parts[2]);
		await interaction.deferUpdate();
		await interaction.editReply(buildAddPoolMainScreen(counts));
		return;
	}
	if (action === 'addPoolCancel') {
		await interaction.deferUpdate();
		const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
		const diceResult = await readDiceResult(client, messageRef);
		await interaction.editReply(diceResult ? await buildMenu(diceResult, channelEmoji) : noRollScreen());
		return;
	}
	if (action === 'addPoolRoll') {
		const counts = decodeAddState(parts[2]);
		await interaction.deferUpdate();
		const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
		const diceOrder = buildDiceOrder(counts);
		if (!diceOrder.length) {
			const screen = buildAddPoolMainScreen(counts);
			screen.embeds = [textEmbed(`Pick some dice to add first.\n\n${buildAddPoolSummary(counts)}`)];
			await interaction.editReply(screen);
			return;
		}

		const previousRoll = await readData(client, messageRef, 'diceResult');
		const rolled = await rollCore({ diceOrder, channelEmoji, diceResult: { roll: { ...initDiceResult().roll, ...previousRoll } } });
		if (rolled.error) {
			await interaction.editReply({ content: '', embeds: [textEmbed(rolled.error)], components: [] });
			return;
		}
		writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);
		//the menu itself is ephemeral (see handlers.js), so it can only ever be edited back to
		//another private message - the actual change has to go out as a fresh public followUp()
		//instead, with the private message just closing out to confirm
		await interaction.editReply({ content: '', embeds: [textEmbed('Added!')], components: [] });
		await interaction.followUp({ embeds: [await statusEmbed(rolled.diceResult, channelEmoji, buildAddPoolSummary(counts, 'Added'))] });
		await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
		return;
	}

	await interaction.deferUpdate();
	const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => null);
	const diceResult = await readDiceResult(client, messageRef);
	if (!diceResult) {
		await interaction.editReply(noRollScreen());
		return;
	}

	switch (action) {
		case 'menu':
			await interaction.editReply(await buildMenu(diceResult, channelEmoji));
			return;

		case 'done':
			await interaction.editReply({ content: '', embeds: [await statusEmbed(diceResult, channelEmoji)], components: [] });
			return;

		case 'same': {
			const rebuilt = [];
			Object.keys(diceResult.roll).forEach(type => diceResult.roll[type].forEach(() => rebuilt.push(type)));
			const rolled = await rollCore({ diceOrder: rebuilt, channelEmoji });
			if (rolled.error) {
				await interaction.editReply(await buildMenu(diceResult, channelEmoji, rolled.error));
				return;
			}
			writeData(client, messageRef, 'diceResult', rolled.diceResult.roll);
			//the menu is ephemeral - close it privately and announce the reroll publicly
			await interaction.editReply({ content: '', embeds: [textEmbed('Rerolled!')], components: [] });
			await interaction.followUp({ embeds: [await statusEmbed(rolled.diceResult, channelEmoji, 'Rerolled the same pool')] });
			await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
			return;
		}

		case 'removeScreen':
			await interaction.editReply(await buildRemoveScreen(diceResult, channelEmoji));
			return;

		case 'selectScreen':
			await safeEditReply(interaction, (iconsOk) => buildSelectScreen(diceResult, channelEmoji, undefined, iconsOk));
			return;

		default:
			break;
	}

	//remove/select actions carry the die type (and, for select, its index) in the action string
	//itself (e.g. "selectDie-white-2"), so they're matched by prefix instead of by enumerating
	//every possible die/symbol type as its own exact case
	if (action.startsWith('removeType-')) {
		const type = action.slice('removeType-'.length);
		if (!diceResult.roll[type] || diceResult.roll[type].length === 0) {
			await interaction.editReply(await buildRemoveScreen(diceResult, channelEmoji, `No more ${LABELS[type]} dice to remove`));
			return;
		}
		const randomIndex = dice(diceResult.roll[type].length) - 1;
		const removedFace = diceResult.roll[type][randomIndex];
		diceResult.roll[type].splice(randomIndex, 1);
		writeData(client, messageRef, 'diceResult', diceResult.roll);
		//the menu is ephemeral - close it privately and announce the removal publicly
		await interaction.editReply({ content: '', embeds: [textEmbed('Removed!')], components: [] });
		await interaction.followUp({ embeds: [await statusEmbed(diceResult, channelEmoji, `Removed 1 ${dieFaceLabel(type, removedFace, channelEmoji)}`)] });
		await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
		return;
	}

	if (action.startsWith('selectDie-')) {
		const [type, indexStr] = action.slice('selectDie-'.length).split('-');
		const index = +indexStr;
		if (!diceResult.roll[type] || diceResult.roll[type][index] === undefined) {
			await safeEditReply(interaction, (iconsOk) => buildSelectScreen(diceResult, channelEmoji, `There is no ${LABELS[type]} #${index + 1} to reroll`, iconsOk));
			return;
		}
		const newFace = rollOneDie(type);
		diceResult.roll[type][index] = newFace;
		writeData(client, messageRef, 'diceResult', diceResult.roll);
		//the menu is ephemeral - close it privately and announce the reroll publicly
		await interaction.editReply({ content: '', embeds: [textEmbed('Rerolled!')], components: [] });
		await interaction.followUp({ embeds: [await statusEmbed(diceResult, channelEmoji, `Rerolled ${dieFaceLabel(type, newFace, channelEmoji)} #${index + 1}`)] });
		await interaction.deleteReply().catch((error) => main.logError('reroll onComponent', error));
	}
};

exports.reroll = reroll;
exports.onComponent = onComponent;

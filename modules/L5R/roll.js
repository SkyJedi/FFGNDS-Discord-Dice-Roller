const config = require('../../config.json');
const emoji = require('../').emoji;
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle,
	EmbedBuilder, Colors
} = require('discord.js');
const { writeData, readData } = require('../data');
const dice = ['white', 'black', 'success', 'opportunity', 'strife', 'explosiveSuccess'];
const rollDice = require('../').dice;
const sleep = require('../').sleep;
const asyncForEach = require('../').asyncForEach;
const asMessageRef = require('../').asMessageRef;
const getParams = require('../').getParams;

const diceFaces = {
	black: ['', 's', 'st', 'et', 'o', 'ot'],
	white: ['', '', 's', 's', 'so', 'st', 'st', 'e', 'et', 'o', 'o', 'o'],
	success: ['s'],
	opportunity: ['o'],
	explosiveSuccess: ['e'],
	strife: ['t']
};

//rolls one die of the given type and returns its resulting face string - used by /reroll's
//Same/Select actions (see modules/L5R/reroll.js), which reroll individual dice directly instead
//of going through rollCore's free-text params
const rollOneDie = (type) => diceFaces[type][rollDice(diceFaces[type].length) - 1];

//init diceResult
function initDiceResult() {
	return {
		roll: {
			white: [],
			black: [],
			success: [],
			opportunity: [],
			strife: [],
			explosiveSuccess: []
		},
		results: {
			face: '',
			success: 0,
			opportunity: 0,
			strife: 0,
			explosiveSuccess: {
				white: 0,
				black: 0,
			}
		}
	};
}

//processes the params and give an array of the type of dice to roll - pure, no Discord I/O
function processType(params) {
	let diceOrder = [], finalOrder = [];
	if (params[0].match(/\d+/g)) {
		for (let i = 0; i < params.length; i++) {
			let diceQty = params[i].replace(/\D/g, "");
			let color = params[i].replace(/\d/g, "");
			for (let j = 0; j < diceQty; j++) diceOrder.push(color);
		}
	} else {
		params = params.join('');
		for (let i = 0; i < params.length; i++) diceOrder.push(params[i]);
	}

	diceOrder.forEach(die => {
		switch (die) {
			case 'black':
			case 'b':
			case 'blk':
			case 'ring':
			case 'r':
				finalOrder.push('black');
				break;
			case 'white':
			case 'w':
			case 'skill':
			case 's':
				finalOrder.push('white');
				break;
			case 'success':
			case 'suc':
			case '+':
				finalOrder.push('success');
				break;
			case 'strife':
			case 'str':
			case 't':
				finalOrder.push('strife');
				break;
			case 'opportunity':
			case 'o':
				finalOrder.push('opportunity');
				break;
			case 'explosiveSuccess':
			case 'e':
			case 'exp':
				finalOrder.push('explosiveSuccess');
				break;
			default:
				break;
		}
	});
	return finalOrder;
}

function countSymbols(diceResult) {
	diceResult.results = {
		face: '',
		success: 0,
		opportunity: 0,
		strife: 0,
		explosiveSuccess: {
			white: 0,
			black: 0,
		},
	};

	Object.keys(diceResult.roll).sort((a, b) => dice.indexOf(a) - dice.indexOf(b)).forEach(color => {
		diceResult.roll[color].forEach(face => {
			for (let i = 0; face.length > i; i++) {
				switch (face[i]) {
					case 'e':
						diceResult.results.explosiveSuccess[color]++;
						diceResult.results.success++;
						break;
					case 's':
						diceResult.results.success++;
						break;
					case 'o':
						diceResult.results.opportunity++;
						break;
					case 't':
						diceResult.results.strife++;
						break;
					default:
						break;
				}
			}
		});
	});
	return diceResult;
}

async function printAnimatedEmoji(diceOrder, channelEmoji) {
	let text = '';
	diceOrder.sort((a, b) => dice.indexOf(a) - dice.indexOf(b));
	await asyncForEach(diceOrder, die => {
		if (dice.slice(0, -4).includes(die)) text += emoji(`${die}gif`, channelEmoji);
		else text += emoji(die, channelEmoji);
	});
	if (text.length > 1500) text = 'Too many dice to display.';
	return text;
}

//builds the faces/response text for a diceResult - pure, no Discord I/O
async function buildResultText(diceResult, channelEmoji) {
	let roll = diceResult.roll, results = diceResult.results;
	await asyncForEach(Object.keys(roll).sort((a, b) => dice.indexOf(a) - dice.indexOf(b)), async color => {
		await asyncForEach(roll[color], face => {
			if (color === 'white' || color === 'black') results.face += emoji(`${color}${face}`, channelEmoji);
			else results.face += emoji(`${color}`, channelEmoji);
		});
	});
	if (results.face.length > 1500) results.face = 'Too many dice to display.';

	let symbolOrder = ['success', 'opportunity', 'strife'];
	let response = '';
	if (results.explosiveSuccess.white > 0 || results.explosiveSuccess.black > 0) {
		response += emoji('explosiveSuccess', channelEmoji) + '(';
		await asyncForEach(Object.keys(results.explosiveSuccess), color => {
			if (results.explosiveSuccess[color] > 0) {
				//the white/Skill die's hex-shaped pip icon is the same generic shape used for
				//SWRPG/Genesys's hex dice buttons, so it lives in the shared buttonEmoji set
				//instead of L5R's own (see /Emoji's buttonemoji-whitehex)
				const icon = color === 'white' ? emoji('whiteHex', 'buttonEmoji') : emoji(color, channelEmoji);
				response += `${icon} ${results.explosiveSuccess[color]} `;
			}
		});
		response += ') ';
	}
	await asyncForEach(symbolOrder, symbol => {
		if (results[symbol] !== 0) response += emoji(`${symbol}`, channelEmoji) + results[symbol] + ' ';
	});

	return { faces: results.face, response };
}

//interaction-based display, still used directly by keep()
async function printResults(diceResult, interaction, desc, channelEmoji, messageGif) {
	//required lazily to avoid a load-order-dependent circular require with ../../index
	//(see modules/functions.js for the full explanation)
	const main = require('../../index');
	const { faces, response } = await buildResultText(diceResult, channelEmoji);

	if (!faces) {
		main.respond(interaction, "No dice rolled.");
		return;
	}
	//edit via the interaction's webhook, not messageGif.edit() - a Message obtained from an
	//interaction reply/followUp can only be reliably edited through that interaction's webhook
	//token; editing it directly hits the bot's normal REST client, which can 403 with
	//"Missing Access" if the bot has no standing permissions in the channel beyond what the
	//interaction itself grants (see the roll.js /roll fix for the same issue)
	if (messageGif) interaction.webhook.editMessage(messageGif.id, { embeds: [main.textEmbed(faces)] }).catch((error) => main.logError('printResults', error));
	else main.respond(interaction, faces);

	main.respond(interaction, desc + " results:" + "\n\n\t" + response);
}

//pure dice-rolling core - no Discord I/O. Used by the /roll and /add command entry point below,
//and by the button builder's onComponent (which passes a precomputed diceOrder directly instead
//of free-text params - see SW.GENESYS/roll.js's rollCore for the same pattern).
async function rollCore({ params = [], diceResult, channelEmoji, diceOrder }) {
	if (!diceResult) diceResult = initDiceResult();

	if (!diceOrder) {
		if (!params[0] || !params.length) return { error: 'No dice rolled.' };
		if (params.some(param => +(param).replace(/\D/g, '') > +config.maxRollsPerDie)) {
			return { error: `Roll exceeds max roll per die limit of ${config.maxRollsPerDie}. Please try again.` };
		}
		diceOrder = processType(params);
	}
	if (!diceOrder || !diceOrder.length) return { error: 'No dice rolled.' };

	diceOrder.forEach(color => diceResult.roll[color].push(diceFaces[color][rollDice(diceFaces[color].length) - 1]));

	const textGif = await printAnimatedEmoji(diceOrder, channelEmoji);

	diceResult = countSymbols(diceResult);
	const { faces, response } = await buildResultText(diceResult, channelEmoji);
	if (!faces) return { error: 'No dice rolled.' };

	return { diceResult, textGif: textGif.length > 1500 ? 'Too many dice to display.' : textGif, faces, response };
}

//Slash command entry point for /roll and /add - reads options straight off the interaction and
//replies to it directly, instead of going through the message adapter.
async function roll({ interaction, client, channelEmoji, add }) {
	//required lazily to avoid a load-order-dependent circular require with ../../index
	//(see modules/functions.js for the full explanation)
	const main = require('../../index');
	const params = getParams(interaction);
	const desc = interaction.options.getString('text') || (add ? 'add' : 'roll');
	const messageRef = asMessageRef(interaction);

	let diceResult;
	if (add) {
		const previous = await readData(client, messageRef, 'diceResult');
		diceResult = { roll: { ...initDiceResult().roll, ...previous } };
	}

	try {
		const result = await rollCore({ params, diceResult, channelEmoji });
		if (result.error) {
			await interaction.editReply({ embeds: [main.textEmbed(result.error)] });
			return;
		}

		await interaction.editReply({ embeds: [main.textEmbed(result.textGif || result.faces)] });
		writeData(client, messageRef, 'diceResult', result.diceResult.roll);
		await sleep(1200);
		await interaction.editReply({ embeds: [main.textEmbed(result.faces)] });
		await interaction.followUp({ embeds: [main.textEmbed(`${desc} results:\n\n\t${result.response}`)] });
	} catch (error) {
		await interaction.editReply({ embeds: [main.textEmbed(`That's an Error! ${error}`)] });
	}
}

async function keep({ interaction, client, channelEmoji, reroll }) {
	//required lazily to avoid a load-order-dependent circular require with ../../index
	//(see modules/functions.js for the full explanation)
	const main = require('../../index');
	const messageRef = asMessageRef(interaction);
	let params = getParams(interaction);
	const desc = reroll ? 'reroll' : 'keep';

	try {
		let object = {black: [], white: [], success: [], opportunity: [], strife: [], explosiveSuccess: []};
		let diceResult = initDiceResult(), keeperResults = initDiceResult(), messageGif, textGif = '';
		let roll = {...diceResult.roll, ...await readData(client, messageRef, 'diceResult')};
		if (params.length === 1) params = params[0].split('');

		params.forEach(target => {
			switch (true) {
				case (roll.white.length >= target):
					object.white.push(target - 1);
					break;
				case (roll.black.length + roll.white.length >= target):
					object.black.push(target - roll.white.length - 1);
					break;
				case (roll.black.length + roll.white.length + roll.success.length >= target):
					object.success.push(target - (roll.black.length + roll.white.length) - 1);
					break;
				case (roll.black.length + roll.white.length + roll.success.length + roll.opportunity.length >= target):
					object.opportunity.push(target - (roll.black.length + roll.white.length + roll.success.length) - 1);
					break;
				case (roll.black.length + roll.white.length + roll.success.length + roll.opportunity.length + roll.strife.length >= target):
					object.strife.push(target - (roll.black.length + roll.white.length + roll.success.length + roll.opportunity.length) - 1);
					break;
				case (roll.black.length + roll.white.length + roll.success.length + roll.opportunity.length + roll.strife.length + roll.explosiveSuccess.length >= target):
					object.explosiveSuccess.push(target - (roll.black.length + roll.white.length + roll.success.length + roll.opportunity.length + roll.strife.length) - 1);
					break;
			}
		});

		if (reroll) {
			keeperResults.roll = {...roll};
			await asyncForEach(Object.keys(roll).sort((a, b) => dice.indexOf(a) - dice.indexOf(b)), async color => {
				await asyncForEach(roll[color], async (face, index) => {
					if (object[color].includes(index)) {
						keeperResults.roll[color].splice(index, 1, diceFaces[color][rollDice(diceFaces[color].length) - 1]);
						if (dice.slice(0, -4).includes(color)) textGif += emoji(`${color}gif`, channelEmoji);
						else textGif += emoji(color, channelEmoji);
					}
					else {
						if (color === 'white' || color === 'black') textGif += emoji(`${color}${face}`, channelEmoji);
						else textGif += emoji(color, channelEmoji);
					}
				});
			});
			messageGif = await main.respond(interaction, textGif);

			await sleep(1500);

		} else {
			await asyncForEach(Object.keys(roll).sort((a, b) => dice.indexOf(a) - dice.indexOf(b)), async color => {
				await asyncForEach(roll[color], async (face, index) => {
					if (object[color].includes(index)) {
						keeperResults.roll[color].push(roll[color][index]);
						textGif += emoji(color, channelEmoji);
					}
				});
			});
		}

		diceResult = countSymbols(keeperResults);
		await printResults(diceResult, interaction, desc, channelEmoji, messageGif);
		writeData(client, messageRef, 'diceResult', keeperResults.roll);
	} catch (error) {
		main.respond(interaction, `That's an Error! ${error}`);
	}
}

//---------------------------------------------------------------- roll builder (button UI)

const DIE_TYPES = ['white', 'black'];
const SYMBOL_TYPES = ['success', 'opportunity', 'strife', 'explosiveSuccess'];
const ALL_TYPES = DIE_TYPES.concat(SYMBOL_TYPES);

const LABELS = {
	white: 'Skill', black: 'Ring',
	success: 'Success', opportunity: 'Opportunity', strife: 'Strife', explosiveSuccess: 'Explosive Success'
};

//the channel-specific server nickname reads better than the bare Discord username -
//interaction.member is absent in DMs, so fall back to the username there
const displayName = (interaction) => interaction.member?.displayName || interaction.user.username;

const emptyState = (channelEmoji) => ({ counts: {}, channelEmoji });

//Pending pool state (counts per die/symbol + the channel's system, for icon lookups) rides along
//in every button's customId rather than in memory or Firestore, since this bot runs across
//multiple shard processes and a button click can't rely on state left over from an earlier
//interaction - see SW.GENESYS/roll.js for the same pattern, including why channelEmoji is carried
//here instead of re-read from Firestore on every click (it's fetched once, when /roll opens the
//menu - see rollMenu() below).
const MAX_COUNT = 9;

const encodeState = (state) => `${ALL_TYPES.map(type => state.counts[type] || 0).join(',')}|${state.channelEmoji || ''}`;

const decodeState = (str) => {
	const [countsPart, channelEmoji] = (str || '').split('|');
	const counts = {};
	(countsPart || '').split(',').forEach((n, i) => { if (ALL_TYPES[i]) counts[ALL_TYPES[i]] = Math.min(+n || 0, MAX_COUNT); });
	return { counts, channelEmoji: channelEmoji || undefined };
};

const buildDiceOrder = (counts) => ALL_TYPES.reduce((diceOrder, type) => diceOrder.concat(Array(counts[type] || 0).fill(type)), []);

//pool buttons are keyed by their type name directly (white/black/success/opportunity/strife/
//explosiveSuccess), same as L5R's per-die-face emoji in modules/L5R/reroll.js's dieFaceIcon -
//emoji() returns '' when modules/emoji.js has no application emoji cached under that name, so
//only accept a properly resolved <a?:name:id> reference, otherwise fall back to a text label
const CUSTOM_EMOJI_PATTERN = /^<a?:\w+:\d+>$/;
const poolIcon = (type, iconsOk, channelEmoji) => {
	if (!iconsOk) return null;
	const icon = emoji(type, channelEmoji);
	return CUSTOM_EMOJI_PATTERN.test(icon || '') ? icon : null;
};

const buildPoolSummary = (state, iconsOk, channelEmoji) => {
	const parts = ALL_TYPES.filter(type => state.counts[type] > 0).map(type => {
		const icon = poolIcon(type, iconsOk, channelEmoji);
		return icon ? `${state.counts[type]}${icon}` : `${state.counts[type]} ${LABELS[type]}`;
	});
	return parts.length ? `Pool: ${parts.join(' ')}` : 'Pool: empty';
};

const poolButton = (type, s, iconsOk, channelEmoji) => {
	const button = new ButtonBuilder().setCustomId(`l5rroll:add-${type}:${s}`).setStyle(ButtonStyle.Secondary);
	const icon = poolIcon(type, iconsOk, channelEmoji);
	return icon ? button.setEmoji(icon) : button.setLabel(LABELS[type]);
};

const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

const buildMainScreen = (state, iconsOk = true, channelEmoji) => {
	const s = encodeState(state);
	return {
		content: '',
		embeds: [textEmbed(buildPoolSummary(state, iconsOk, channelEmoji))],
		components: [
			new ActionRowBuilder().addComponents(DIE_TYPES.map(type => poolButton(type, s, iconsOk, channelEmoji))),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`l5rroll:symbols:${s}`).setLabel('Symbols').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId(`l5rroll:add:${s}`).setLabel('Add to Previous').setStyle(ButtonStyle.Primary)
			),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`l5rroll:roll:${s}`).setLabel('Roll').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId(`l5rroll:clear:${s}`).setLabel('Clear').setStyle(ButtonStyle.Danger)
			)
		]
	};
};

const buildSymbolsScreen = (state, iconsOk = true, channelEmoji) => {
	const s = encodeState(state);
	return {
		content: '',
		embeds: [textEmbed(buildPoolSummary(state, iconsOk, channelEmoji))],
		components: [
			new ActionRowBuilder().addComponents(SYMBOL_TYPES.map(type => poolButton(type, s, iconsOk, channelEmoji))),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`l5rroll:main:${s}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
			)
		]
	};
};

//Discord validates emoji ids at request time, so a stale/deleted application emoji id (e.g. one
//deleted and re-uploaded under the same NeoEmoji name since this shard's cache was last loaded -
//see modules/emoji.js's loadEmojis()) only surfaces as a "COMPONENT_INVALID_EMOJI" rejection when
//the message is actually sent - our own format check in poolIcon() can't catch that in advance.
//Retry once with icons disabled so the click still succeeds instead of crashing the interaction -
//same pattern as SW.GENESYS/roll.js's safeEditReply and this file's own reroll.js.
const hasInvalidEmojiError = (error) => /INVALID_EMOJI/i.test(JSON.stringify(error?.rawError ?? error?.message ?? ''));
let iconsKnownBad = false;

//used for the /roll slash command entry point, whose interaction is already deferred by
//handlers.js before it ever reaches this module - editReply() is the only valid way to complete it
const safeEditReply = async (interaction, buildScreen) => {
	if (iconsKnownBad) {
		await interaction.editReply(buildScreen(false));
		return;
	}
	try {
		await interaction.editReply(buildScreen(true));
	} catch (error) {
		if (!hasInvalidEmojiError(error)) throw error;
		iconsKnownBad = true;
		console.error('L5R roll builder: the application emoji cache has a stale/invalid emoji id, falling back to text labels for the rest of this run - run /build (or restart) to refresh it', error);
		await interaction.editReply(buildScreen(false));
	}
};

//used for button clicks (onComponent below), whose interaction arrives unacknowledged. Every
//pool-builder screen here builds synchronously (or, for 'roll'/'add', after only a quick Firestore
//read), so a single interaction.update() both acknowledges the click and edits the message in one
//Discord API round trip, instead of the slower deferUpdate()+editReply() pair - see
//modules/SW.GENESYS/roll.js's safeUpdate for the fuller explanation.
const safeUpdate = async (interaction, buildScreen) => {
	if (iconsKnownBad) {
		await interaction.update(buildScreen(false));
		return;
	}
	try {
		await interaction.update(buildScreen(true));
	} catch (error) {
		if (!hasInvalidEmojiError(error)) throw error;
		iconsKnownBad = true;
		console.error('L5R roll builder: the application emoji cache has a stale/invalid emoji id, falling back to text labels for the rest of this run - run /build (or restart) to refresh it', error);
		await interaction.deferUpdate();
		await interaction.editReply(buildScreen(false));
	}
};

//builds the embed shown for a rolled result - faces go in the description, with the
//success/opportunity/strife tally broken out as a field once it's available
const buildRollResultEmbed = (rollLine, faces, resultsLine) => {
	const embed = new EmbedBuilder().setColor(Colors.DarkNavy).setTitle(rollLine).setDescription(faces);
	if (resultsLine) embed.addFields({ name: 'Results', value: resultsLine });
	return embed;
};

//Slash command entry point for /roll (L5R channels) - opens the button-driven pool builder instead
//of reading the legacy "input" option (only /add still reads it - see roll() above).
const rollMenu = async ({ interaction, channelEmoji }) => {
	await safeEditReply(interaction, (iconsOk) => buildMainScreen(emptyState(channelEmoji), iconsOk, channelEmoji));
};

//Slash command entry point for /oldroll (L5R channels) - the pre-button-UI free-text dice code
//(e.g. "wwbb"), kept for players who'd rather type a code than click through the button pool
//builder that /roll opens today. /add still has its own free-text flow via roll() above.
const oldRoll = async ({ interaction, client, channelEmoji }) => {
	const params = getParams(interaction);
	const desc = interaction.options.getString('text');
	const messageRef = asMessageRef(interaction);

	const result = await rollCore({ params, channelEmoji });
	if (result.error) {
		await interaction.editReply({ embeds: [textEmbed(result.error)] });
		return;
	}

	writeData(client, messageRef, 'diceResult', result.diceResult.roll);
	const rollLine = `${displayName(interaction)} rolls${desc ? `: ${desc}` : ''}`;

	//show the animated gif faces first, then swap to the static faces once they've had a
	//moment to play - matches /roll's button-driven two-stage reveal
	await interaction.editReply({ embeds: [buildRollResultEmbed(rollLine, result.textGif || result.faces)] });
	await sleep(1200);
	const resultsLine = result.response && result.response.trim().length > 0 ? result.response : 'No symbols rolled';
	await interaction.editReply({ embeds: [buildRollResultEmbed(rollLine, result.faces, resultsLine)] });
};

//---------------------------------------------------------------- roll builder router

const onComponent = async ({ interaction, client }) => {
	//required lazily to avoid a load-order-dependent circular require with ../../index
	//(see modules/functions.js for the full explanation)
	const main = require('../../index');
	const parts = interaction.customId.split(':');
	const action = parts[1];
	const state = decodeState(parts[2]);
	//carried in the encoded state (see encodeState/decodeState above) rather than re-read from
	//Firestore on every click - it was fetched once, when /roll first opened this menu
	const channelEmoji = state.channelEmoji;

	const messageRef = asMessageRef(interaction);

	if (action.startsWith('add-')) {
		const type = action.slice(4);
		state.counts[type] = Math.min((state.counts[type] || 0) + 1, MAX_COUNT);
		await safeUpdate(interaction, (iconsOk) => SYMBOL_TYPES.includes(type) ? buildSymbolsScreen(state, iconsOk, channelEmoji) : buildMainScreen(state, iconsOk, channelEmoji));
		return;
	}

	switch (action) {
		case 'symbols':
			await safeUpdate(interaction, (iconsOk) => buildSymbolsScreen(state, iconsOk, channelEmoji));
			break;
		case 'main':
			await safeUpdate(interaction, (iconsOk) => buildMainScreen(state, iconsOk, channelEmoji));
			break;
		case 'clear':
			state.counts = {};
			await safeUpdate(interaction, (iconsOk) => buildMainScreen(state, iconsOk, channelEmoji));
			break;
		case 'roll':
		case 'add': {
			const diceOrder = buildDiceOrder(state.counts);
			if (!diceOrder.length) {
				await safeUpdate(interaction, (iconsOk) => {
					const screen = buildMainScreen(state, iconsOk, channelEmoji);
					screen.embeds = [textEmbed(`No dice in the pool - add some first.\n\n${buildPoolSummary(state, iconsOk, channelEmoji)}`)];
					return screen;
				});
				break;
			}

			let diceResult;
			if (action === 'add') {
				const previous = await readData(client, messageRef, 'diceResult');
				diceResult = { roll: { ...initDiceResult().roll, ...previous } };
			}

			const result = await rollCore({ diceOrder, diceResult, channelEmoji });
			if (result.error) {
				await interaction.update({ content: '', embeds: [textEmbed(result.error)], components: [] });
				break;
			}

			writeData(client, messageRef, 'diceResult', result.diceResult.roll);
			const rollLine = `${displayName(interaction)} ${action === 'add' ? 'adds' : 'rolls'}`;

			//the pool builder itself is an ephemeral message (see handlers.js), so it can only ever
			//be edited back to another ephemeral message - the actual result has to go out as a
			//fresh, public followUp() instead. Clear its buttons immediately so a click during the
			//reveal below can't trigger a second roll, then delete it once the public post is up.
			//update() (not deferUpdate()+editReply()) since this first response needs no async prep.
			await interaction.update({ content: '', embeds: [textEmbed('Rolled!')], components: [] });

			//show the animated gif faces first, then swap to the static faces once they've had a
			//moment to play - matches /roll's SWRPG/Genesys two-stage editReply.
			//the second edit goes through interaction.webhook (not publicMessage.edit()) because a
			//followUp is only guaranteed postable/editable via the interaction's own webhook token -
			//the bot's normal REST client can 403 with "Missing Access" editing it directly if the
			//bot has no standing permissions in the channel beyond what the interaction itself grants
			const publicMessage = await interaction.followUp({ embeds: [buildRollResultEmbed(rollLine, result.textGif || result.faces)] });
			await sleep(1200);
			const resultsLine = result.response && result.response.trim().length > 0 ? result.response : 'No symbols rolled';
			await interaction.webhook.editMessage(publicMessage.id, { embeds: [buildRollResultEmbed(rollLine, result.faces, resultsLine)] });
			await interaction.deleteReply().catch((error) => main.logError('roll onComponent', error));
			break;
		}
		default:
			break;
	}
};

exports.roll = roll;
exports.rollCore = rollCore;
exports.keep = keep;
exports.rollMenu = rollMenu;
exports.oldRoll = oldRoll;
exports.onComponent = onComponent;

//shared with modules/L5R/reroll.js so it gets the same pool builder and result display without
//duplicating them - see modules/SW.GENESYS/roll.js's equivalent exports
exports.initDiceResult = initDiceResult;
exports.countSymbols = countSymbols;
exports.buildResultText = buildResultText;
exports.buildRollResultEmbed = buildRollResultEmbed;
exports.buildDiceOrder = buildDiceOrder;
exports.rollOneDie = rollOneDie;
exports.DIE_TYPES = DIE_TYPES;
exports.SYMBOL_TYPES = SYMBOL_TYPES;
exports.ALL_TYPES = ALL_TYPES;
exports.LABELS = LABELS;
exports.MAX_COUNT = MAX_COUNT;

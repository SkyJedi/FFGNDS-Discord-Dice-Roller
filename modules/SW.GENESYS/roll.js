const config = require('../../config.json');
const { diceFaces, order, symbols } = require('./');
const { dice, emoji, sleep, writeData, asMessageRef, getParams } = require('../');
const { flatten } = require('lodash');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    EmbedBuilder, Colors
} = require('discord.js');
const finalText = (text) => text.length > 1500 ? 'Too many dice to display.' : text;

//maps a free-text identifier to its canonical die/symbol name
const mapDie = (die) => {
    switch (die) {
        case 'yellow': case 'y': case 'proficiency': case 'pro': return 'yellow';
        case 'green': case 'g': case 'ability': case 'a': return 'green';
        case 'blue': case 'b': case 'boost': case 'boo': return 'blue';
        case 'red': case 'r': case 'challenge': case 'c': return 'red';
        case 'purple': case 'p': case 'difficulty': case 'd': return 'purple';
        case 'black': case 'blk': case 'k': case 's': case 'sb': case 'setback': return 'black';
        case 'white': case 'w': case 'force': case 'f': return 'white';
        case 'success': case 'suc': case '*': return 'success';
        case 'advantage': case 'adv': case 'v': return 'advantage';
        case 'triumph': case 'tri': case '!': return 'triumph';
        case 'failure': case 'fail': case '-': return 'failure';
        case 'threat': case 'thr': case 't': return 'threat';
        case 'despair': case 'des': case '$': return 'despair';
        case 'lightside': case 'lightpip': case 'light': case 'l': return 'lightpip';
        case 'darkside': case 'darkpip': case 'dark': case 'n': return 'darkpip';
        default: return undefined;
    }
};

//splits raw params into per-die tokens, e.g. ['3pro'] -> ['pro','pro','pro'], or ['ggb'] -> ['g','g','b']
const tokenizeParams = (params) => {
    if (params[0].match(/\d+/g)) {
        return flatten(params.map(param => {
            const diceQty = +(param).replace(/\D/g, ''), color = param.replace(/\d/g, '');
            return [...Array(diceQty)].map(() => color);
        }));
    } else return params.join('').split('').map(type => type);
};

//processes the params and gives an array of the type of dice to roll (still interaction-based - used by reroll.js)
const processType = (interaction, params) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    if (0 >= params.length) {
        main.respond(interaction, 'No dice rolled.');
        return [];
    }
    if (params.some(param => +(param).replace(/\D/g, '') > +config.maxRollsPerDie)) {
        main.respond(interaction, 'Roll exceeds max roll per die limit of ' + config.maxRollsPerDie + ' . Please try again.');
        return [];
    }
    return tokenizeParams(params).map(mapDie).filter(Boolean).sort();
};

//rolls one die and returns the results in an array
const rollDice = (die) => {
    //roll dice and match them to a side and add that face to the message
    if (!die) return;
    return dice(Object.keys(diceFaces[die]).length);
};

//init diceResult
const initDiceResult = () => {
    return {
        roll: {},
        results: {
            face: '',
            success: 0,
            advantage: 0,
            triumph: 0,
            failure: 0,
            threat: 0,
            despair: 0,
            lightpip: 0,
            darkpip: 0
        }
    };
};

function countSymbols(diceResult) {
    diceResult.results = {
        face: '',
        success: 0,
        advantage: 0,
        triumph: 0,
        failure: 0,
        threat: 0,
        despair: 0,
        lightpip: 0,
        darkpip: 0
    };
    Object.keys(diceResult.roll).sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach(color => {
        diceResult.roll[color].forEach(number => {
            let face = diceFaces[color][number].face;
            for(let i = 0; i < face.length; i++) {
                switch(face[i]) {
                    case 's':
                        diceResult.results.success++;
                        break;
                    case 'a':
                        diceResult.results.advantage++;
                        break;
                    case 'r':
                        diceResult.results.triumph++;
                        diceResult.results.success++;
                        break;
                    case 'f':
                        diceResult.results.failure++;
                        break;
                    case 't':
                        diceResult.results.threat++;
                        break;
                    case 'd':
                        diceResult.results.despair++;
                        diceResult.results.failure++;
                        break;
                    case 'l':
                        diceResult.results.lightpip++;
                        break;
                    case 'n':
                        diceResult.results.darkpip++;
                        break;
                    default:
                        break;
                }
            }
        });
    });
    return diceResult;
}

const printAnimatedEmoji = (diceOrder, channelEmoji) => {
    const text = diceOrder
        .sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map(die => {
            if (order.slice(0, -8).includes(die)) return emoji(`${die}gif`, channelEmoji);
            return emoji(die, channelEmoji);
        });
    if (text.length > 1500) return 'Too many dice to display.';
    else return text.join('');
};

//builds the faces/response text for a rolled diceResult - pure, no Discord I/O
const buildResultText = ({ roll, results }, channelEmoji) => {
    //creates finalCount by cancelling results
    let finalCount = {};
    if (results.success > results.failure) finalCount.success = results.success - results.failure;
    if (results.failure > results.success) finalCount.failure = results.failure - results.success;
    if (results.advantage > results.threat) finalCount.advantage = results.advantage - results.threat;
    if (results.threat > results.advantage) finalCount.threat = results.threat - results.advantage;
    if (results.triumph > 0) finalCount.triumph = results.triumph;
    if (results.despair > 0) finalCount.despair = results.despair;
    if (results.lightpip > 0) finalCount.lightpip = results.lightpip;
    if (results.darkpip > 0) finalCount.darkpip = results.darkpip;

    const colors = Object.entries(roll)
                         .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
                         .filter(([, numbers]) => numbers.length > 0),
        facesList = flatten(colors.map(([color, numbers]) => numbers.map(number => `${color}${symbols.includes(color) ? '' : diceFaces[color][number].face}`))),
        faces = facesList.map(str => emoji(str, channelEmoji)).join(''),
        response = Object.keys(finalCount)
                         .map(symbol => `${finalCount[symbol]}${emoji(symbol, channelEmoji)}`)
                         .join(' • ');

    return { faces, response };
};

//interaction-based display - no longer called anywhere now that reroll.js has its own button
//menu, but kept exported for anything that still wants a plain roll+results announcement
const printResults = ({ roll, results }, interaction, desc, channelEmoji, messageGif) => {
    const main = require('../../index');
    const { faces, response } = buildResultText({ roll, results }, channelEmoji);

    if (0 >= faces.length) {
        main.respond(interaction, 'No dice rolled.');
        return;
    }
    //edit via the interaction's webhook, not messageGif.edit() - a Message obtained from an
    //interaction reply/followUp can only be reliably edited through that interaction's webhook
    //token; editing it directly hits the bot's normal REST client, which can 403 with
    //"Missing Access" if the bot has no standing permissions in the channel beyond what the
    //interaction itself grants (see the /roll fix for the same issue)
    if (messageGif) interaction.webhook.editMessage(messageGif.id, { embeds: [main.textEmbed(finalText(faces))] }).catch((error) => main.logError('printResults', error));
    else main.respond(interaction, finalText(faces));

    main.respond(interaction, `${desc} results: ${response.length > 0 ? response : 'All dice have cancelled out'}`);
};

//pure dice-rolling core - no Discord I/O. Reused by the /roll command below, destiny.js, and reroll.js.
const rollCore = ({ params = [], channelEmoji, diceResult, diceOrder }) => {
    if (!diceResult) diceResult = initDiceResult();

    if (!diceOrder) {
        if (!params[0]) return { error: 'No dice rolled.' };
        if (params.some(param => +(param).replace(/\D/g, '') > +config.maxRollsPerDie)) {
            return { error: `Roll exceeds max roll per die limit of ${config.maxRollsPerDie}. Please try again.` };
        }
        diceOrder = tokenizeParams(params).map(mapDie).filter(Boolean).sort();
    }
    if (!diceOrder.length) return { error: 'No dice rolled.' };

    //rolls each die and begins rollResults
    diceOrder.forEach(die => {
        if (!diceResult.roll[die]) diceResult.roll[die] = [];
        diceResult.roll[die] = diceResult.roll[die].concat(rollDice(die));
    });

    //counts the symbols rolled
    diceResult = countSymbols(diceResult);

    const textGif = printAnimatedEmoji(diceOrder, channelEmoji);
    const { faces, response } = buildResultText(diceResult, channelEmoji);
    if (!faces) return { error: 'No dice rolled.' };

    return { diceResult, textGif: finalText(textGif), faces: finalText(faces), response };
};

//---------------------------------------------------------------- roll builder (button UI)

//die types add to the pool by rolling; symbol types add a fixed result directly (no roll needed) -
//see dice.js. Fixed order here doubles as the encoding order for buildState()/parseState() below.
const DIE_TYPES = ['yellow', 'green', 'blue', 'red', 'purple', 'black', 'white'];
const SYMBOL_TYPES = ['success', 'advantage', 'triumph', 'failure', 'threat', 'despair', 'lightpip', 'darkpip'];
const ALL_TYPES = DIE_TYPES.concat(SYMBOL_TYPES);

const LABELS = {
    yellow: 'Proficiency', green: 'Ability', blue: 'Boost', red: 'Challenge',
    purple: 'Difficulty', black: 'Setback', white: 'Force',
    success: 'Success', advantage: 'Advantage', triumph: 'Triumph', failure: 'Failure',
    threat: 'Threat', despair: 'Despair', lightpip: 'Light Point', darkpip: 'Dark Point'
};

//the channel-specific server nickname reads better than the bare Discord username -
//interaction.member is absent in DMs, so fall back to the username there
const displayName = (interaction) => interaction.member?.displayName || interaction.user.username;

const emptyState = (channelEmoji) => ({ counts: {}, desc: '', channelEmoji });

//Pending pool state (counts per die/symbol + description + the channel's system, for icon lookups)
//rides along in every button's customId rather than in memory or Firestore, since this bot runs
//across multiple shard processes and a button click can't rely on state left over from an earlier
//interaction - see char.js for the same pattern applied to wound/strain deltas. This also means
//every click after the menu is first opened can build its screen with zero Firestore round trips
//(channelEmoji only needs fetching once, when /roll opens the menu - see roll() below), instead of
//re-reading it on every single click, which was visibly slow. Counts are capped at MAX_COUNT and
//the encoded description at MAX_ENCODED_DESC so a customId can never exceed Discord's 100-character
//limit, even in the worst case where every character of the description needs %-encoding.
const MAX_COUNT = 9;
const MAX_ENCODED_DESC = 48;

//encodeURIComponent can expand a character to a 3-char %XX escape, so a hard slice can land
//mid-escape - trim any dangling partial escape left at the cut point before it's used
const truncateEncoded = (encoded) => encoded.length <= MAX_ENCODED_DESC
    ? encoded
    : encoded.slice(0, MAX_ENCODED_DESC).replace(/%[0-9A-Fa-f]?$/, '');

//single-character codes keep the channel's system from meaningfully eating into the customId's
//100-character budget alongside the counts and description above
const CHANNEL_CODES = { swrpg: 's', genesys: 'g', l5r: 'l' };
const CHANNEL_CODES_REVERSE = { s: 'swrpg', g: 'genesys', l: 'l5r' };

const encodeState = (state) => `${ALL_TYPES.map(type => state.counts[type] || 0).join(',')}|${truncateEncoded(encodeURIComponent(state.desc || ''))}|${CHANNEL_CODES[state.channelEmoji] || ''}`;

const decodeState = (str) => {
    const [countsPart, descPart, channelCode] = str.split('|');
    const counts = {};
    (countsPart || '').split(',').forEach((n, i) => { if (ALL_TYPES[i]) counts[ALL_TYPES[i]] = Math.min(+n || 0, MAX_COUNT); });
    let desc;
    try { desc = decodeURIComponent(descPart || ''); } catch { desc = ''; }
    return { counts, desc, channelEmoji: CHANNEL_CODES_REVERSE[channelCode] };
};

const buildDiceOrder = (counts) => ALL_TYPES.reduce((diceOrder, type) => diceOrder.concat(Array(counts[type] || 0).fill(type)), []);

//die-shape icons (hex/diamond/square outlines) are generic flat shapes shared by every system -
//uploaded once as their own application emoji (see /Emoji's buttonemoji-* files and
//modules/emoji.js) - so they don't depend on which system/channel is active. Symbol icons
//(success/advantage/etc.) instead have their own swrpg-/genesys- artwork per system, so they need
//the channel's actual system to look up the right one; 'swrpg' is a harmless default for the
//handful of screens built before that's known yet (e.g. the very first /roll button screen),
//since both systems' symbol icons only differ in style, not meaning.
const BUTTON_EMOJI_SET = 'buttonEmoji';
const DIE_BUTTON_EMOJI = {
    yellow: 'YellowHex', green: 'GreenDiamond', blue: 'BlueSquare', red: 'RedHex',
    purple: 'PurpleDiamond', black: 'BlackSquare', white: 'WhiteHex'
};

//emoji() returns '' when modules/emoji.js has no application emoji cached under that name (not
//yet fetched at startup, or genuinely missing/not uploaded) - only accept a properly resolved
//<a?:name:id> reference, otherwise fall back to a text label rather than sending Discord a bogus emoji
const CUSTOM_EMOJI_PATTERN = /^<a?:\w+:\d+>$/;
const resolvedEmoji = (name, channelEmoji) => {
    const icon = emoji(name, channelEmoji);
    return CUSTOM_EMOJI_PATTERN.test(icon || '') ? icon : null;
};

//iconsOk=false forces every lookup to skip the emoji and use its text label instead - see
//safeEditReply() below, which sets this after Discord rejects an emoji id as invalid/stale.
const dieIcon = (type, iconsOk) => iconsOk ? resolvedEmoji(DIE_BUTTON_EMOJI[type], BUTTON_EMOJI_SET) : null;
const symbolIcon = (type, iconsOk, channelEmoji = 'swrpg') => iconsOk ? resolvedEmoji(type, channelEmoji) : null;
const poolIcon = (type, iconsOk, channelEmoji) => DIE_TYPES.includes(type) ? dieIcon(type, iconsOk) : symbolIcon(type, iconsOk, channelEmoji);

//wraps plain text in a simple embed, for the screens/messages below that don't need the fuller
//buildRollResultEmbed layout (title + results field)
const textEmbed = (text) => new EmbedBuilder().setColor(Colors.DarkNavy).setDescription(text);

//shows each pool entry as "<count><icon>" to match the buttons that add them; falls back to
//"<count> <name>" for any type whose icon isn't resolved yet
const buildPoolSummary = (state, iconsOk, channelEmoji) => {
    const parts = ALL_TYPES.filter(type => state.counts[type] > 0).map(type => {
        const icon = poolIcon(type, iconsOk, channelEmoji);
        return icon ? `${state.counts[type]}${icon}` : `${state.counts[type]} ${LABELS[type]}`;
    });
    let text = parts.length ? `Pool: ${parts.join(' ')}` : 'Pool: empty';
    if (state.desc) text += `\nDescription: ${state.desc}`;
    return text;
};

const dieButton = (type, s, iconsOk) => {
    const button = new ButtonBuilder().setCustomId(`roll:add-${type}:${s}`).setStyle(ButtonStyle.Secondary);
    const icon = dieIcon(type, iconsOk);
    return icon ? button.setEmoji(icon) : button.setLabel(LABELS[type]);
};

const symbolButton = (type, s, iconsOk, channelEmoji) => {
    const button = new ButtonBuilder().setCustomId(`roll:add-${type}:${s}`).setStyle(ButtonStyle.Secondary);
    const icon = symbolIcon(type, iconsOk, channelEmoji);
    return icon ? button.setEmoji(icon) : button.setLabel(LABELS[type]);
};

const buildMainScreen = (state, iconsOk = true, channelEmoji) => {
    const s = encodeState(state);
    return {
        content: '',
        embeds: [textEmbed(buildPoolSummary(state, iconsOk, channelEmoji))],
        components: [
            new ActionRowBuilder().addComponents(
                DIE_TYPES.slice(0, 5).map(type => dieButton(type, s, iconsOk))
            ),
            new ActionRowBuilder().addComponents(
                DIE_TYPES.slice(5).map(type => dieButton(type, s, iconsOk))
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`roll:symbols:${s}`).setLabel('Symbols').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`roll:descAsk:${s}`).setLabel('Description').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`roll:roll:${s}`).setLabel('Roll').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`roll:clear:${s}`).setLabel('Clear').setStyle(ButtonStyle.Danger)
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
            new ActionRowBuilder().addComponents(
                SYMBOL_TYPES.slice(0, 5).map(type => symbolButton(type, s, iconsOk, channelEmoji))
            ),
            new ActionRowBuilder().addComponents(
                SYMBOL_TYPES.slice(5).map(type => symbolButton(type, s, iconsOk, channelEmoji))
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`roll:main:${s}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
};

//builds the embed shown for a rolled result - faces go in the description, with the
//success/advantage/etc. tally broken out as a field once it's available
const buildRollResultEmbed = (rollLine, faces, resultsLine) => {
    const embed = new EmbedBuilder().setColor(Colors.DarkNavy).setTitle(rollLine).setDescription(faces);
    if (resultsLine) embed.addFields({ name: 'Results', value: resultsLine });
    return embed;
};

//Discord validates emoji ids at request time, so a stale/deleted application emoji id (e.g. one
//deleted and re-uploaded under the same NeoEmoji name since this shard's cache was last loaded -
//see modules/emoji.js's loadEmojis()) only surfaces as a "COMPONENT_INVALID_EMOJI" rejection when
//the message is actually sent - our own format check in resolvedEmoji() can't catch that in
//advance. Retry once with icons disabled so the click still succeeds instead of crashing the interaction.
const hasInvalidEmojiError = (error) => /INVALID_EMOJI/i.test(JSON.stringify(error?.rawError ?? error?.message ?? ''));

//once Discord has rejected an emoji id, every further click would otherwise pay for a second,
//doomed-to-fail API round trip (try with icons, get rejected, retry without) - that's the "lag"
//adding dice to the pool. Remember the failure for the life of this process and skip straight to
//text labels afterward; a fresh /build + redeploy restarts the process and clears this.
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
        console.error('roll builder: the application emoji cache has a stale/invalid emoji id, falling back to text labels for the rest of this run - run /build (or restart) to refresh it', error);
        await interaction.editReply(buildScreen(false));
    }
};

//used for button clicks (onComponent below), whose interaction arrives unacknowledged. Every
//pool-builder screen can now be built synchronously (channelEmoji rides along in the encoded
//state - see decodeState above), so a single interaction.update() both acknowledges the click and
//edits the message in one Discord API round trip, instead of the slower deferUpdate()+editReply()
//pair - that extra round trip was the main source of the per-click delay building a pool. If
//Discord rejects a stale/invalid emoji id, the update() call fails before Discord has accepted any
//response for this interaction, so it's still safe to fall back to deferUpdate()+editReply().
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
        console.error('roll builder: the application emoji cache has a stale/invalid emoji id, falling back to text labels for the rest of this run - run /build (or restart) to refresh it', error);
        await interaction.deferUpdate();
        await interaction.editReply(buildScreen(false));
    }
};

const buildDescModal = (state) => {
    const input = new TextInputBuilder().setCustomId('description').setLabel('Roll description').setStyle(TextInputStyle.Short)
        .setRequired(false).setMaxLength(30).setValue(state.desc || '');
    return new ModalBuilder().setCustomId(`roll:descModal:${encodeState(state)}`).setTitle('Roll Description').addComponents(
        new ActionRowBuilder().addComponents(input)
    );
};

//showModal() must be the interaction's first and only response, so this can't go through
//the deferUpdate()+editReply() flow the rest of the component router uses
const showDescModal = (interaction, state) => interaction.showModal(buildDescModal(state));

//Slash command entry point for /roll (SWRPG/Genesys channels) - opens the button-driven pool
//builder. L5R channels open their own button builder too - see modules/L5R/roll.js.
const roll = async ({ interaction, channelEmoji }) => {
    await safeEditReply(interaction, (iconsOk) => buildMainScreen(emptyState(channelEmoji), iconsOk, channelEmoji));
};

//Slash command entry point for /oldroll (SWRPG/Genesys channels) - the pre-button-UI free-text
//dice code (e.g. "yygggrrpp"), kept for players who'd rather type a code than click through the
//button pool builder that /roll opens today.
const oldRoll = async ({ interaction, client, channelEmoji }) => {
    const params = getParams(interaction);
    const desc = interaction.options.getString('text');
    const messageRef = asMessageRef(interaction);

    const result = rollCore({ params, channelEmoji });
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
    const resultsLine = result.response.length > 0 ? result.response : 'All dice have cancelled out';
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
    const messageRef = asMessageRef(interaction);
    //carried in the encoded state (see encodeState/decodeState above) rather than re-read from
    //Firestore on every click - it was fetched once, when /roll first opened this menu
    const channelEmoji = state.channelEmoji;

    if (interaction.isModalSubmit()) {
        if (action === 'descModal') {
            //this modal is only ever shown from a button (see showDescModal below), so the
            //submission can use update() to edit that same message in one round trip, same as a
            //plain button click - see safeUpdate above
            state.desc = interaction.fields.getTextInputValue('description').trim();
            await safeUpdate(interaction, (iconsOk) => buildMainScreen(state, iconsOk, channelEmoji));
        }
        return;
    }

    if (action === 'descAsk') {
        await showDescModal(interaction, state);
        return;
    }

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
        case 'roll': {
            const diceOrder = buildDiceOrder(state.counts);
            if (!diceOrder.length) {
                await safeUpdate(interaction, (iconsOk) => {
                    const screen = buildMainScreen(state, iconsOk, channelEmoji);
                    screen.embeds = [textEmbed(`No dice in the pool - add some first.\n\n${buildPoolSummary(state, iconsOk, channelEmoji)}`)];
                    return screen;
                });
                break;
            }

            const result = rollCore({ diceOrder, channelEmoji });
            if (result.error) {
                await interaction.update({ content: '', embeds: [textEmbed(result.error)], components: [] });
                break;
            }

            writeData(client, messageRef, 'diceResult', result.diceResult.roll);
            const rollLine = `${displayName(interaction)} rolls${state.desc ? `: ${state.desc}` : ''}`;

            //the pool builder itself is an ephemeral message (see handlers.js), so it can only ever
            //be edited back to another ephemeral message - the actual result has to go out as a
            //fresh, public followUp() instead. Clear its buttons immediately so a click during the
            //reveal below can't trigger a second roll, then delete it once the public post is up.
            //update() (not deferUpdate()+editReply()) since this first response needs no async prep.
            await interaction.update({ content: '', embeds: [textEmbed('Rolled!')], components: [] });

            //show the animated gif faces first, then swap to the static faces once they've had a
            //moment to play - matches the old text-based /roll's two-stage editReply.
            //the second edit goes through interaction.webhook (not publicMessage.edit()) because a
            //followUp is only guaranteed postable/editable via the interaction's own webhook token -
            //the bot's normal REST client can 403 with "Missing Access" editing it directly if the
            //bot has no standing permissions in the channel beyond what the interaction itself grants
            const publicMessage = await interaction.followUp({ embeds: [buildRollResultEmbed(rollLine, result.textGif || result.faces)] });
            await sleep(1200);
            const resultsLine = result.response.length > 0 ? result.response : 'All dice have cancelled out';
            await interaction.webhook.editMessage(publicMessage.id, { embeds: [buildRollResultEmbed(rollLine, result.faces, resultsLine)] });
            await interaction.deleteReply().catch((error) => main.logError('roll onComponent', error));
            break;
        }
        default:
            break;
    }
};

exports.roll = roll;
exports.oldRoll = oldRoll;
exports.onComponent = onComponent;
exports.rollCore = rollCore;
exports.processType = processType;
exports.rollDice = rollDice;
exports.countSymbols = countSymbols;
exports.printResults = printResults;
exports.buildResultText = buildResultText;
exports.buildRollResultEmbed = buildRollResultEmbed;

//shared with other button-driven pool builders (see modules/SW.GENESYS/initiative.js and
//modules/SW.GENESYS/reroll.js) so they get the same dice/symbol buttons, pool-to-diceOrder
//conversion, and icon-fallback behavior without duplicating it
exports.DIE_TYPES = DIE_TYPES;
exports.SYMBOL_TYPES = SYMBOL_TYPES;
exports.ALL_TYPES = ALL_TYPES;
exports.LABELS = LABELS;
exports.MAX_COUNT = MAX_COUNT;
exports.buildDiceOrder = buildDiceOrder;
exports.dieIcon = dieIcon;
exports.symbolIcon = symbolIcon;
exports.poolIcon = poolIcon;
exports.safeEditReply = safeEditReply;
exports.safeUpdate = safeUpdate;

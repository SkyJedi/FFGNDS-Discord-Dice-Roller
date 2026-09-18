//Every die/symbol icon is a Discord "application emoji" - uploaded once to the bot's own
//application (Developer Portal) rather than any particular guild, so it renders in every server
//the bot is in with no per-guild setup and no server-emoji-slot cost. See /Emoji for the
//uploaded source images and index.js's clientReady handler for where loadEmojis() below gets called.
//
//Application emoji names share one flat namespace across the whole bot (unlike guild emoji,
//which only need to be unique per guild), so each NeoEmoji file is named "<system>-<key>", e.g.
//swrpg-yellow vs genesys-yellow, to keep the systems' otherwise-identical die names from
//colliding. The handful of animated gif faces get an extra leading "a" (e.g. aswrpg-yellow)
//since the static and animated versions of the same die also can't share a name. Discord's emoji
//names don't allow hyphens, so the uploaded application emoji drop them entirely (verified
//against the live application emoji list) - "swrpg-yellow" was uploaded as "swrpgyellow".
let cache = new Map();

const TYPE_SLUGS = { swrpg: 'swrpg', genesys: 'genesys', l5r: 'l5r', buttonEmoji: 'buttonemoji' };

const neoEmojiName = (type, key) => {
    const slug = TYPE_SLUGS[type] || TYPE_SLUGS.swrpg;
    const animated = /^(.+)gif$/.exec(key);
    return animated ? `a${slug}${animated[1].toLowerCase()}` : `${slug}${key.toLowerCase()}`;
};

//Fetches the bot's full application emoji list once and caches it in memory for this process -
//each shard is its own process, so this is called per-shard (see index.js's clientReady handler).
//A stale cache after uploading new/renamed application emoji is refreshed with /restart (which
//respawns every shard) rather than by re-fetching mid-run.
const loadEmojis = async (client) => {
    const emojis = await client.application.emojis.fetch();
    cache = new Map(emojis.map((appEmoji) => [appEmoji.name, `<${appEmoji.animated ? 'a' : ''}:${appEmoji.name}:${appEmoji.id}>`]));
    return cache.size;
};

//falls back to '' rather than undefined so a not-yet-loaded or genuinely missing icon (e.g. a
//NeoEmoji name with no matching application emoji uploaded yet) never prints the literal text
//"undefined" into a Discord message - every call site already treats a falsy result as "no icon"
const emoji = (string, type = 'swrpg') => cache.get(neoEmojiName(type || 'swrpg', string)) || '';

emoji.loadEmojis = loadEmojis;

module.exports = emoji;

#!/usr/bin/env node
'use strict';
// One-off helper: replaces a bot's Discord *application emoji* with the images in a folder.
// Not part of the running bot; the bot only reads the list (modules/emoji.js).
//
//   node tools/upload-emoji.js --env /path/.env --dir Emoji                      (dry run: changes nothing)
//   node tools/upload-emoji.js --env /path/.env --dir Emoji --backup ~/emoji-backup --apply --only 'swrpgyellow*'
//   node tools/upload-emoji.js --env /path/.env --restore ~/emoji-backup [--apply]
//
// No dependency: plain REST calls with Node's built-in fetch (Node 18+). Run it against the LIVE
// application: the test bot's token belongs to another application with its own emoji list.
//
// Token: DISCORD_TOKEN from the environment, else from --env <file> (a .env), else "token" in
// --config <json>. It is never printed or written anywhere.
//
// How a replace works (the old emoji stays until the new one exists):
//   1. create the new image under the temporary name zz_<name>
//   2. delete the old emoji
//   3. rename zz_<name> to <name>
// A failure at step 1 leaves the old emoji untouched. Progress is kept in <backup>/progress.json,
// so a run that stopped (rate limit, network) is finished by running the same command again.
// Emoji ids change, so the bot must restart afterwards (modules/emoji.js caches ids at startup).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 256 * 1024;
const CAP = 2000;
const TMP = 'zz_';
const NAME_RULE = /^[A-Za-z0-9_]{2,32}$/;
// modules/emoji.js builds "<a?><system><key lowercased>" with these system slugs:
const CODE_NAME = /^a?(swrpg|genesys|l5r|buttonemoji)[a-z0-9]+$/;

const HELP = `Replace a bot's Discord application emoji with the images in a folder.
  --env <file>       .env holding DISCORD_TOKEN (or set DISCORD_TOKEN, or --config <json> with "token")
  --dir <folder>     images: <name>.png|gif; hyphens drop out of the name (swrpg-yellow.png -> swrpgyellow)
  --backup <folder>  where the old list and images are saved (outside the repo and any git folder); needed for --apply
  --apply            do the work (default is a dry run that changes nothing)
  --only <pattern>   only emoji whose name matches (* = anything), e.g. 'swrpgyellow*'; commas separate several
  --restore <folder> put the emoji of an earlier backup back (dry run unless --apply); --prune also deletes emoji the backup didn't have
  --delay <ms>       pause between changes (default 600); --max-wait <s> stop instead of waiting longer on a rate limit (default 180)
Run the same command again after any stop: finished emoji are skipped.`;

const parseArgs = (argv) => {
    const o = { apply: false, delay: 600, api: 'https://discord.com/api/v10', cdn: 'https://cdn.discordapp.com/emojis', maxWait: 180 };
    const val = (i) => { if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`); return argv[i + 1]; };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') o.apply = true;
        else if (a === '--prune') o.prune = true;
        else if (a === '--help' || a === '-h') o.help = true;
        else if (a === '--env') o.env = val(i++);
        else if (a === '--config') o.config = val(i++);
        else if (a === '--dir') o.dir = val(i++);
        else if (a === '--backup') o.backup = val(i++);
        else if (a === '--restore') o.restore = val(i++);
        else if (a === '--only') o.only = val(i++);
        else if (a === '--delay') o.delay = Number(val(i++));
        else if (a === '--max-wait') o.maxWait = Number(val(i++));
        else if (a === '--api') o.api = val(i++);
        else if (a === '--cdn') o.cdn = val(i++);
        else throw new Error(`Unknown option ${a}`);
    }
    return o;
};

const readEnvFile = (file) => {
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (line.trim().startsWith('#')) continue;
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2];
        if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
        out[m[1]] = v;
    }
    return out;
};

const getToken = (o) => {
    let token = process.env.DISCORD_TOKEN;
    if (o.env) token = readEnvFile(o.env).DISCORD_TOKEN || token;
    if (!token && o.config) token = JSON.parse(fs.readFileSync(o.config, 'utf8')).token;
    if (!token) throw new Error('No token: set DISCORD_TOKEN, or pass --env <.env file> or --config <json with "token">');
    return token;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const globToRe = (pattern) => new RegExp('^(?:' + pattern.split(',').map((p) => p.trim().split('*').map(esc).join('.*')).join('|') + ')$', 'i');

// ---- Discord ------------------------------------------------------------------------------

class Api {
    constructor(token, base, cdn, maxWait, log) {
        this.token = token; this.base = base.replace(/\/$/, ''); this.cdn = cdn.replace(/\/$/, ''); this.maxWait = maxWait; this.log = log;
    }

    // method + url; auth only for the Discord API (the CDN needs none); raw = bytes back
    async request(method, url, { body, auth = true, raw = false } = {}) {
        for (let attempt = 0; ; attempt++) {
            let res;
            try {
                res = await fetch(url, {
                    method,
                    headers: { ...(auth ? { Authorization: `Bot ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'D1-C3 upload-emoji (one-off script)' },
                    body: body ? JSON.stringify(body) : undefined,
                });
            } catch (err) {
                if (attempt < 4) { await sleep(2000 * (attempt + 1)); continue; }
                throw new Error(`${method} ${auth ? url.replace(this.base, '') : 'cdn'}: network error ${(err.cause && err.cause.code) || err.message}`);
            }
            const where = auth ? url.replace(this.base, '') : url.replace(this.cdn, 'cdn');
            if (res.status === 429) {
                let wait = Number(res.headers.get('retry-after'));
                try { const j = await res.json(); if (j && j.retry_after !== undefined) wait = Number(j.retry_after); } catch { /* header only */ }
                if (!(wait >= 0)) wait = 5;
                if (wait > this.maxWait || attempt >= 8) {
                    const e = new Error(`${method} ${where}: rate limited, Discord says wait ${Math.ceil(wait)} s. Nothing is lost: run the same command again later.`);
                    e.rateLimited = true;
                    throw e;
                }
                this.log(`  rate limited, waiting ${Math.ceil(wait)} s`);
                await sleep(wait * 1000 + 250);
                continue;
            }
            if (res.status >= 500 && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
            if (!res.ok) {
                let text = '';
                try { text = (await res.text()).slice(0, 300); } catch { /* ignore */ }
                throw new Error(`${method} ${where}: HTTP ${res.status} ${text}`);
            }
            if (raw) return Buffer.from(await res.arrayBuffer());
            return res.status === 204 ? null : res.json();
        }
    }

    discord(method, route, body) { return this.request(method, this.base + route, { body }); }
    download(id, animated) { return this.request('GET', `${this.cdn}/${id}.${animated ? 'gif' : 'png'}`, { auth: false, raw: true }); }
}

const dataUri = (f) => `data:image/${f.animated ? 'gif' : 'png'};base64,${f.data.toString('base64')}`;

// ---- local images -------------------------------------------------------------------------

const nameOf = (file) => path.basename(file, path.extname(file)).replace(/-/g, '');

const scanLocal = (dir) => {
    const files = [];
    const skippedDirs = [];
    const skippedFiles = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (ent.isDirectory()) { skippedDirs.push(ent.name); continue; }
        const e = path.extname(ent.name).toLowerCase();
        if (e !== '.png' && e !== '.gif') { skippedFiles.push(ent.name); continue; }
        const data = fs.readFileSync(path.join(dir, ent.name));
        const stem = path.basename(ent.name, path.extname(ent.name));
        const name = nameOf(ent.name);
        const f = { file: ent.name, name, animated: e === '.gif', data, sha: sha(data), problems: [], notes: [] };
        if (!NAME_RULE.test(name)) f.problems.push('name must be 2-32 letters, digits or underscore');
        if (data.length > MAX_BYTES) f.problems.push(`over 256 KB (${Math.round(data.length / 1024)} KB)`);
        if (!CODE_NAME.test(name)) f.notes.push('not a name modules/emoji.js can build');
        else if (f.animated !== /^a(swrpg|genesys|l5r)/.test(name)) f.notes.push(f.animated ? 'gif without the leading a (the code asks for a<system><key> for gifs)' : 'png with a leading a (the code treats that name as a gif)');
        if ((stem.match(/-/g) || []).length > 1) f.notes.push('key has a second hyphen: the code looks names up with the hyphen kept, so no caller finds it');
        files.push(f);
    }
    const seen = new Map();
    for (const f of files) {
        if (seen.has(f.name)) f.problems.push(`same name as ${seen.get(f.name)}`);
        else seen.set(f.name, f.file);
    }
    return { files, skippedDirs, skippedFiles };
};

const scanBackup = (dir) => {
    const list = JSON.parse(fs.readFileSync(path.join(dir, 'list.json'), 'utf8'));
    const files = [];
    for (const e of list) {
        const file = `${e.name}.${e.animated ? 'gif' : 'png'}`;
        const full = path.join(dir, 'images', file);
        if (!fs.existsSync(full)) throw new Error(`Backup is missing images/${file}`);
        const data = fs.readFileSync(full);
        files.push({ file, name: e.name, animated: !!e.animated, data, sha: sha(data), problems: [], notes: [] });
    }
    return { files, skippedDirs: [], skippedFiles: [] };
};

// ---- backup folder ------------------------------------------------------------------------

const gitRoot = (dir) => {
    let d = path.resolve(dir);
    while (!fs.existsSync(d)) d = path.dirname(d);
    for (;;) {
        if (fs.existsSync(path.join(d, '.git'))) return d;
        const up = path.dirname(d);
        if (up === d) return null;
        d = up;
    }
};

const backupPlace = (dir) => {
    const abs = path.resolve(dir);
    const repo = gitRoot(abs);
    if (repo) throw new Error(`Backup folder ${abs} is inside a git folder (${repo}). Use one outside any repo, e.g. ~/emoji-backup/<date>.`);
    return abs;
};

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => { fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1)); fs.renameSync(file + '.tmp', file); };

// Saves the whole current list and every image. Keeps an existing backup untouched (it is the original).
const saveBackup = async (api, appId, live, dir, log) => {
    const listFile = path.join(dir, 'list.json');
    fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
    if (fs.existsSync(listFile)) {
        log(`Backup already in ${dir}: keeping it as the original.`);
        return readJson(listFile, []);
    }
    const list = [];
    for (const e of live) {
        const file = path.join(dir, 'images', `${e.name}.${e.animated ? 'gif' : 'png'}`);
        if (!fs.existsSync(file)) {
            const data = await api.download(e.id, e.animated);
            if (!data.length) throw new Error(`Empty image for ${e.name}: backup stopped, nothing was changed.`);
            fs.writeFileSync(file, data);
        }
        list.push({ name: e.name, id: e.id, animated: !!e.animated, url: `${api.cdn}/${e.id}.${e.animated ? 'gif' : 'png'}` });
    }
    // the list goes last: its presence means the images are all there
    writeJson(listFile, list);
    log(`Backup saved: ${list.length} emoji, list.json + images/ in ${dir}`);
    return list;
};

// ---- plan ---------------------------------------------------------------------------------

const fetchLive = async (api, appId) => {
    const r = await api.discord('GET', `/applications/${appId}/emojis`);
    return (r.items || r).map((e) => ({ id: String(e.id), name: e.name, animated: !!e.animated }));
};

const buildPlan = async ({ api, files, live, progress, only }) => {
    const byName = new Map(live.map((e) => [e.name, e]));
    const inScope = (name) => !only || only.test(name);
    const actions = [];
    const skipped = [];
    const unchanged = [];
    for (const f of files) {
        if (!inScope(f.name)) continue;
        if (f.problems.length) { skipped.push(`${f.file}: ${f.problems.join('; ')}`); continue; }
        const cur = byName.get(f.name);
        const tmp = byName.get(TMP + f.name);
        if (!cur) { actions.push({ kind: 'new', f, tmp }); continue; }
        const done = progress.done[f.name];
        if (done && done.sha === f.sha && done.id === cur.id) { unchanged.push(f.name); continue; }
        if (cur.animated !== f.animated) { actions.push({ kind: 'replace', f, cur, tmp, why: 'type changes' }); continue; }
        const same = sha(await api.download(cur.id, cur.animated)) === f.sha;
        if (same) unchanged.push(f.name);
        else actions.push({ kind: 'replace', f, cur, tmp });
    }
    const localNames = new Set(files.map((f) => f.name));
    const discordOnly = live.filter((e) => !e.name.startsWith(TMP) && !localNames.has(e.name)).map((e) => e.name);
    // temporary copies of other names (outside --only) are left for the run that covers them
    const leftovers = live.filter((e) => e.name.startsWith(TMP) && inScope(e.name.slice(TMP.length)));
    return { actions, skipped, unchanged, discordOnly, leftovers };
};

// ---- apply --------------------------------------------------------------------------------

const applyActions = async ({ api, appId, plan, live, progressFile, progress, delay, log }) => {
    const byName = new Map(live.map((e) => [e.name, e]));
    let changed = 0;
    // a leftover temp is kept only if the progress file says it holds the exact image we still want
    for (const t of plan.leftovers) {
        const base = t.name.slice(TMP.length);
        const rec = progress.tmp[base];
        const want = plan.actions.find((a) => a.f.name === base);
        if (rec && want && rec.id === t.id && rec.sha === want.f.sha) continue;
        log(`  removing leftover temporary emoji ${t.name}`);
        await api.discord('DELETE', `/applications/${appId}/emojis/${t.id}`);
        byName.delete(t.name);
        for (const a of plan.actions) if (a.f.name === base) a.tmp = undefined;
        delete progress.tmp[base];
        writeJson(progressFile, progress);
        await sleep(delay);
    }
    for (const a of plan.actions) {
        const { f } = a;
        if (a.kind === 'new' && !a.tmp) {
            const made = await api.discord('POST', `/applications/${appId}/emojis`, { name: f.name, image: dataUri(f) });
            progress.done[f.name] = { sha: f.sha, id: String(made.id) };
            writeJson(progressFile, progress);
            log(`  new      ${f.name}`);
            changed++;
            await sleep(delay);
            continue;
        }
        let tmp = a.tmp;
        if (!tmp) {
            const made = await api.discord('POST', `/applications/${appId}/emojis`, { name: TMP + f.name, image: dataUri(f) });
            tmp = { id: String(made.id), name: TMP + f.name };
            progress.tmp[f.name] = { id: tmp.id, sha: f.sha };
            writeJson(progressFile, progress);
            await sleep(delay);
        }
        const old = byName.get(f.name);
        if (old && old.id !== tmp.id) {
            await api.discord('DELETE', `/applications/${appId}/emojis/${old.id}`);
            byName.delete(f.name);
            await sleep(delay);
        }
        await api.discord('PATCH', `/applications/${appId}/emojis/${tmp.id}`, { name: f.name });
        progress.done[f.name] = { sha: f.sha, id: tmp.id };
        delete progress.tmp[f.name];
        writeJson(progressFile, progress);
        log(`  replaced ${f.name}`);
        changed++;
        await sleep(delay);
    }
    return changed;
};

// ---- main ---------------------------------------------------------------------------------

// Any error leaving run() has the token blanked out, whichever way the token was supplied.
const run = async (argv, io = {}) => {
    const o = parseArgs(argv);
    if (o.help) { (io.log || console.log)(HELP); return { help: true }; }
    const token = getToken(o);
    try {
        return await runWith(o, token, io);
    } catch (err) {
        err.message = String(err.message).split(token).join('***');
        throw err;
    }
};

const runWith = async (o, token, io) => {
    const out = io.log || ((s) => console.log(s));

    const log = (s) => out(String(s).split(token).join('***'));
    const restoring = !!o.restore;
    if (!restoring && !o.dir) throw new Error('--dir <image folder> is needed (or --restore <backup folder>)');
    if (o.apply && !restoring && !o.backup) throw new Error('--apply needs --backup <folder> (outside the repo): the old emoji are saved there first');

    const api = new Api(token, o.api, o.cdn, o.maxWait, log);
    const me = await api.discord('GET', '/applications/@me');
    const appId = String(me.id);
    log(`${o.apply ? 'APPLY' : 'DRY RUN (nothing is changed)'}${restoring ? ' - restore' : ''}: application "${me.name}" (${appId})`);

    const source = restoring ? scanBackup(backupPlace(o.restore)) : scanLocal(o.dir);
    const only = o.only ? globToRe(o.only) : null;
    const live = await fetchLive(api, appId);

    const backupDir = restoring ? backupPlace(o.restore) : o.backup ? backupPlace(o.backup) : null;
    const progressFile = backupDir ? path.join(backupDir, restoring ? 'restore-progress.json' : 'progress.json') : null;
    const progress = (progressFile && readJson(progressFile, null)) || { done: {}, tmp: {} };
    progress.done = progress.done || {}; progress.tmp = progress.tmp || {};

    const plan = await buildPlan({ api, files: source.files, live, progress, only });

    // restore --prune: emoji the backup never had (the new ones)
    let prune = [];
    if (restoring && o.prune) prune = live.filter((e) => !e.name.startsWith(TMP) && !source.files.some((f) => f.name === e.name) && (!only || only.test(e.name)));

    for (const a of plan.actions) log(`  ${a.kind === 'new' ? 'new      ' : 'replace  '} ${a.f.name}${a.why ? ` (${a.why})` : ''}${a.tmp ? ' (temporary copy already there: finishing)' : ''}`);
    const newCount = plan.actions.filter((a) => a.kind === 'new').length;
    const afterCount = live.length - plan.leftovers.length + newCount - prune.length;
    const peak = live.length + (plan.actions.some((a) => a.kind === 'replace') ? 1 : 0) + newCount;
    const summary = {
        app: me.name, appId, mode: o.apply ? 'apply' : 'dry run', liveNow: live.length, liveAnimated: live.filter((e) => e.animated).length,
        files: source.files.length, new: newCount, replace: plan.actions.length - newCount, unchanged: plan.unchanged.length,
        skipped: plan.skipped, discordOnly: plan.discordOnly, notAskedFor: source.files.filter((f) => f.notes.length && (!only || only.test(f.name))).map((f) => `${f.file}: ${f.notes.join('; ')}`),
        folders: source.skippedDirs, otherFiles: source.skippedFiles, leftovers: plan.leftovers.map((e) => e.name), prune: prune.map((e) => e.name), afterCount, cap: CAP,
    };
    if (peak > CAP) throw new Error(`Would reach ${peak} application emoji, over Discord's ${CAP} limit. Nothing was changed.`);

    if (o.apply) {
        if (restoring) {
            // the backup is the source of truth: nothing to save first
        } else {
            await saveBackup(api, appId, live, backupDir, log);
        }
        if (backupDir) fs.mkdirSync(backupDir, { recursive: true });
        let changed = 0;
        try {
            changed = await applyActions({ api, appId, plan, live, progressFile, progress, delay: o.delay, log });
            for (const e of prune) {
                await api.discord('DELETE', `/applications/${appId}/emojis/${e.id}`);
                log(`  deleted  ${e.name}`);
                changed++;
                await sleep(o.delay);
            }
        } catch (err) {
            summary.stopped = err.message;
            printSummary(log, summary);
            err.summary = summary;
            throw err;
        }
        summary.changed = changed;
    }
    printSummary(log, summary);
    return summary;
};

const list = (items) => (items.length ? `${items.length}\n      ${items.join('\n      ')}` : '0');

const printSummary = (log, s) => {
    log('');
    log('SUMMARY (paste this back)');
    log(`  mode: ${s.mode}   app: ${s.app} (${s.appId})`);
    log(`  Discord now: ${s.liveNow} emoji (${s.liveAnimated} animated)   local files: ${s.files}`);
    log(`  new: ${s.new}   replace: ${s.replace}   unchanged: ${s.unchanged}   skipped: ${s.skipped.length}${s.changed !== undefined ? `   changed this run: ${s.changed}` : ''}`);
    if (s.skipped.length) log(`  skipped (over 256 KB or bad name): ${list(s.skipped)}`);
    log(`  on Discord, no local file (left alone): ${list(s.discordOnly)}`);
    log(`  local files the code never asks for: ${list(s.notAskedFor)}`);
    if (s.folders.length) log(`  sub-folders ignored: ${s.folders.join(', ')}`);
    if (s.otherFiles.length) log(`  other files ignored: ${s.otherFiles.join(', ')}`);
    if (s.leftovers.length) log(`  leftover temporary emoji (zz_...) from an earlier stop: ${s.leftovers.join(', ')}`);
    if (s.prune.length) log(`  restore --prune would delete: ${list(s.prune)}`);
    log(`  emoji after: ${s.afterCount} of ${s.cap}`);
    if (s.stopped) log(`  STOPPED: ${s.stopped}`);
};

module.exports = { run, parseArgs, globToRe, scanLocal, nameOf, backupPlace, CODE_NAME, TMP, MAX_BYTES, CAP };

if (require.main === module) {
    run(process.argv.slice(2)).catch((err) => {
        console.error(`ERROR: ${err.message}`); // run() already blanked the token out of it
        process.exit(1);
    });
}

'use strict';
// Offline test of tools/upload-emoji.js against a local fake of the Discord application-emoji API.
// Run: npm test   (node tools/upload-emoji.test.js)
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./upload-emoji');

const TOKEN = 'fake-token-DO-NOT-PRINT-123';
const APP = '900';

const startFake = async (initial) => {
    const st = { emojis: new Map(), images: new Map(), next: 1000, fail: {}, calls: [], rate: 0 };
    const add = (name, animated, bytes) => { const id = String(st.next++); st.emojis.set(id, { id, name, animated }); st.images.set(id, bytes); return id; };
    for (const e of initial) add(e.name, !!e.animated, Buffer.from(e.bytes));
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
            const url = req.url;
            const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
            const cdn = /^\/cdn\/(\d+)\.(png|gif)$/.exec(url);
            if (cdn) { const b = st.images.get(cdn[1]); if (!b) return send(404, {}); res.writeHead(200); return res.end(b); }
            if (req.headers.authorization !== `Bot ${TOKEN}`) return send(401, { message: '401: Unauthorized' });
            st.calls.push(`${req.method} ${url}`);
            const key = `${req.method} ${url.replace(/\d+$/, ':id')}`;
            if (st.fail[key] > 0) { st.fail[key]--; return send(400, { message: 'injected failure' }); }
            if (req.method === 'POST' && st.rate > 0) { st.rate--; res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '0.05' }); return res.end(JSON.stringify({ retry_after: 0.05 })); }
            if (url === '/api/applications/@me') return send(200, { id: APP, name: 'Fake Dice Bot' });
            if (url === `/api/applications/${APP}/emojis` && req.method === 'GET') return send(200, { items: [...st.emojis.values()] });
            if (url === `/api/applications/${APP}/emojis` && req.method === 'POST') {
                const m = /^data:image\/(png|gif);base64,(.*)$/.exec(body.image);
                if (!m) return send(400, { message: 'bad image' });
                if (st.emojis.size >= 2000) return send(400, { message: 'cap' });
                const id = add(body.name, m[1] === 'gif', Buffer.from(m[2], 'base64'));
                return send(201, st.emojis.get(id));
            }
            const one = new RegExp(`^/api/applications/${APP}/emojis/(\\d+)$`).exec(url);
            if (one && req.method === 'DELETE') { if (!st.emojis.delete(one[1])) return send(404, {}); st.images.delete(one[1]); return send(204); }
            if (one && req.method === 'PATCH') { const e = st.emojis.get(one[1]); if (!e) return send(404, {}); e.name = body.name; return send(200, e); }
            return send(404, { message: 'no route' });
        });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    return { st, add, port, close: () => new Promise((r) => server.close(r)), base: `http://127.0.0.1:${port}/api`, cdn: `http://127.0.0.1:${port}/cdn` };
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'emojitest-'));
const names = (st) => [...st.emojis.values()].map((e) => e.name).sort();
const bytesOf = (st, name) => st.images.get([...st.emojis.values()].find((e) => e.name === name).id).toString();

const setup = async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'swrpg-yellow.png'), 'NEW-yellow');
    fs.writeFileSync(path.join(dir, 'swrpg-blue.png'), 'same-blue');
    fs.writeFileSync(path.join(dir, 'swrpg-red.png'), 'NEW-red');
    fs.writeFileSync(path.join(dir, 'aswrpg-green.gif'), 'NEW-gif');
    fs.writeFileSync(path.join(dir, 'swrpg-brandnew.png'), 'brand-new');
    fs.writeFileSync(path.join(dir, 'swrpg-despair-white.png'), 'dw');
    fs.writeFileSync(path.join(dir, 'swrpg-huge.png'), Buffer.alloc(300 * 1024, 1));
    fs.mkdirSync(path.join(dir, 'zzZEmoji'));
    fs.writeFileSync(path.join(dir, 'zzZEmoji', 'x.png'), 'x');
    const fake = await startFake([
        { name: 'swrpgyellow', bytes: 'old-yellow' },
        { name: 'swrpgblue', bytes: 'same-blue' },
        { name: 'swrpgred', bytes: 'old-red' },
        { name: 'aswrpggreen', animated: true, bytes: 'old-gif' },
        { name: 'swrpghuge', bytes: 'old-huge' },
        { name: 'discordonly', bytes: 'keep-me' },
    ]);
    const common = ['--dir', dir, '--api', fake.base, '--cdn', fake.cdn, '--delay', '0'];
    return { dir, fake, common };
};

const capture = () => { const lines = []; return { lines, log: (s) => lines.push(s) }; };
const env = () => { process.env.DISCORD_TOKEN = TOKEN; };

test('dry run changes nothing and reports everything', async () => {
    env();
    const { fake, common } = await setup();
    const c = capture();
    const before = names(fake.st);
    const s = await run(common, { log: c.log });
    assert.deepStrictEqual(names(fake.st), before);
    assert.ok(!fake.st.calls.some((x) => /^(POST|DELETE|PATCH)/.test(x)), 'no writes');
    assert.strictEqual(s.new, 2);
    assert.strictEqual(s.replace, 3);
    assert.strictEqual(s.unchanged, 1);
    assert.deepStrictEqual(s.discordOnly, ['discordonly']);
    assert.deepStrictEqual(s.folders, ['zzZEmoji']);
    assert.strictEqual(s.skipped.length, 1);
    assert.match(s.skipped[0], /over 256 KB/);
    assert.ok(s.notAskedFor.some((x) => /despair-white/.test(x) && /second hyphen/.test(x)));
    assert.ok(!c.lines.join('\n').includes(TOKEN));
    await fake.close();
});

test('apply: saves the backup first, swaps with no leftovers, never prints the token, second run is a no-op', async () => {
    env();
    const { fake, common } = await setup();
    const backup = path.join(tmp(), 'bk');
    const c = capture();
    const oldIds = new Map([...fake.st.emojis.values()].map((e) => [e.name, e.id]));
    const s = await run([...common, '--apply', '--backup', backup], { log: c.log });
    assert.strictEqual(s.changed, 5);
    assert.deepStrictEqual(names(fake.st), ['aswrpggreen', 'discordonly', 'swrpgblue', 'swrpgbrandnew', 'swrpgdespairwhite', 'swrpghuge', 'swrpgred', 'swrpgyellow'].sort());
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow');
    assert.strictEqual(bytesOf(fake.st, 'swrpgblue'), 'same-blue');
    assert.strictEqual(bytesOf(fake.st, 'discordonly'), 'keep-me');
    assert.strictEqual(bytesOf(fake.st, 'swrpghuge'), 'old-huge', 'oversize file is skipped, old stays');
    assert.ok(!names(fake.st).some((n) => n.startsWith('zz_')));
    // backup holds the ORIGINAL list and images
    const list = JSON.parse(fs.readFileSync(path.join(backup, 'list.json'), 'utf8'));
    assert.strictEqual(list.length, 6);
    assert.strictEqual(fs.readFileSync(path.join(backup, 'images', 'swrpgyellow.png'), 'utf8'), 'old-yellow');
    assert.strictEqual(fs.readFileSync(path.join(backup, 'images', 'aswrpggreen.gif'), 'utf8'), 'old-gif');
    assert.strictEqual(list.find((e) => e.name === 'swrpgred').id, oldIds.get('swrpgred'));
    // the backup was complete before the first write
    const firstWrite = fake.st.calls.findIndex((x) => /^(POST|DELETE|PATCH)/.test(x));
    assert.ok(firstWrite > 0);
    assert.ok(!c.lines.join('\n').includes(TOKEN));
    assert.ok(!fs.readdirSync(backup).some((f) => f.endsWith('.tmp')));
    // run again: nothing to do, even though the ids changed
    const calls = fake.st.calls.length;
    const again = await run([...common, '--apply', '--backup', backup], { log: c.log });
    assert.strictEqual(again.changed, 0);
    assert.strictEqual(again.new + again.replace, 0);
    assert.ok(!fake.st.calls.slice(calls).some((x) => /^(POST|DELETE|PATCH)/.test(x)));
    await fake.close();
});

test('--only limits the run to matching names', async () => {
    env();
    const { fake, common } = await setup();
    const backup = path.join(tmp(), 'bk');
    const s = await run([...common, '--apply', '--backup', backup, '--only', 'swrpgyellow,swrpgred'], { log: () => {} });
    assert.strictEqual(s.changed, 2);
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow');
    assert.strictEqual(bytesOf(fake.st, 'swrpgred'), 'NEW-red');
    assert.strictEqual(bytesOf(fake.st, 'aswrpggreen'), 'old-gif');
    await fake.close();
});

test('a rate limit (429) is waited out', async () => {
    env();
    const { fake, common } = await setup();
    fake.st.rate = 2;
    const s = await run([...common, '--apply', '--backup', path.join(tmp(), 'bk'), '--only', 'swrpgyellow'], { log: () => {} });
    assert.strictEqual(s.changed, 1);
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow');
    await fake.close();
});

test('a failed create leaves the old emoji in place; a rename that fails after the delete is finished by running again', async () => {
    env();
    const { fake, common } = await setup();
    const backup = path.join(tmp(), 'bk');
    fake.st.fail['POST /api/applications/900/emojis'] = 1;
    await assert.rejects(run([...common, '--apply', '--backup', backup, '--only', 'swrpgyellow'], { log: () => {} }), /injected failure/);
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'old-yellow');
    // now let the create work but fail the rename
    fake.st.fail['PATCH /api/applications/900/emojis/:id'] = 1;
    await assert.rejects(run([...common, '--apply', '--backup', backup, '--only', 'swrpgyellow'], { log: () => {} }), /injected failure/);
    assert.ok(names(fake.st).includes('zz_swrpgyellow'));
    assert.ok(!names(fake.st).includes('swrpgyellow'), 'old one already deleted');
    const s = await run([...common, '--apply', '--backup', backup, '--only', 'swrpgyellow'], { log: () => {} });
    assert.strictEqual(s.changed, 1);
    assert.ok(!names(fake.st).some((n) => n.startsWith('zz_')));
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow');
    assert.strictEqual(names(fake.st).filter((n) => n === 'swrpgyellow').length, 1);
    await fake.close();
});

test('a later --only run does not delete another name\'s temporary copy; a token from --env never shows in an error', async () => {
    delete process.env.DISCORD_TOKEN;
    const { fake, common } = await setup();
    const envFile = path.join(tmp(), '.env');
    fs.writeFileSync(envFile, `OTHER=1\nDISCORD_TOKEN="${TOKEN}"\n`);
    const backup = path.join(tmp(), 'bk');
    fake.st.fail['PATCH /api/applications/900/emojis/:id'] = 1;
    await assert.rejects(run([...common, '--env', envFile, '--apply', '--backup', backup, '--only', 'swrpgyellow'], { log: () => {} }), (e) => /injected failure/.test(e.message) && !e.message.includes(TOKEN));
    await run([...common, '--env', envFile, '--apply', '--backup', backup, '--only', 'swrpgred'], { log: () => {} });
    assert.ok(names(fake.st).includes('zz_swrpgyellow'), 'yellow temp copy kept');
    await run([...common, '--env', envFile, '--apply', '--backup', backup, '--only', 'swrpgyellow'], { log: () => {} });
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow');
    await fake.close();
});

test('--restore puts the old images back; --prune removes emoji the backup did not have', async () => {
    env();
    const { fake, common } = await setup();
    const backup = path.join(tmp(), 'bk');
    await run([...common, '--apply', '--backup', backup], { log: () => {} });
    assert.ok(names(fake.st).includes('swrpgbrandnew'));
    const dry = await run(['--restore', backup, '--api', fake.base, '--cdn', fake.cdn, '--delay', '0'], { log: () => {} });
    assert.strictEqual(dry.mode, 'dry run');
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'NEW-yellow', 'dry restore changes nothing');
    const s = await run(['--restore', backup, '--apply', '--prune', '--api', fake.base, '--cdn', fake.cdn, '--delay', '0'], { log: () => {} });
    assert.strictEqual(bytesOf(fake.st, 'swrpgyellow'), 'old-yellow');
    assert.strictEqual(bytesOf(fake.st, 'swrpgred'), 'old-red');
    assert.strictEqual(bytesOf(fake.st, 'aswrpggreen'), 'old-gif');
    assert.ok(!names(fake.st).includes('swrpgbrandnew'));
    assert.ok(s.changed >= 5);
    await fake.close();
});

test('a backup folder inside a git folder is refused, and --apply needs --backup', async () => {
    env();
    const { fake, common } = await setup();
    const repo = tmp();
    fs.mkdirSync(path.join(repo, '.git'));
    await assert.rejects(run([...common, '--apply', '--backup', path.join(repo, 'bk')], { log: () => {} }), /inside a git folder/);
    await assert.rejects(run([...common, '--apply'], { log: () => {} }), /needs --backup/);
    await fake.close();
});

test('the 2000 limit stops a run before any change', async () => {
    env();
    const { fake, common } = await setup();
    for (let i = 0; i < 1995; i++) fake.add(`filler${i}`, false, Buffer.from('f'));
    const before = names(fake.st);
    await assert.rejects(run([...common, '--apply', '--backup', path.join(tmp(), 'bk')], { log: () => {} }), /2000 limit/);
    assert.deepStrictEqual(names(fake.st), before);
    await fake.close();
});

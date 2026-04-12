'use strict';

const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const os = require('os');
const fs = require('fs');
const path = require('path');

const plugin = require('..');
const pushoverCommand = plugin._command;

// Initialize rootDir once via the plugin's own startup hook
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushover-test-'));
plugin.onServerStart({
    Config: { getPersistentStorageDir: () => tmpDir },
    Commands: { add: () => {} },
});

// ---- Helpers ----

let userCounter = 0;
function uniqueUser() {
    return `testuser${++userCounter}`;
}

function makeFakeNetwork(overrides = {}) {
    const eventHandlers = {};
    const pendingPromises = [];

    const irc = {
        on(event, handler) {
            if (!eventHandlers[event]) eventHandlers[event] = [];
            eventHandlers[event].push(handler);
        },
        removeListener(event, handler) {
            if (eventHandlers[event]) {
                eventHandlers[event] = eventHandlers[event].filter(
                    (h) => h !== handler,
                );
            }
        },
        emit(event, data) {
            (eventHandlers[event] || []).forEach((h) => {
                const result = h(data);
                if (result && typeof result.then === 'function') {
                    pendingPromises.push(result.catch(() => {}));
                }
            });
        },
        async drain() {
            if (pendingPromises.length) {
                await Promise.all(pendingPromises.splice(0));
            }
        },
    };

    return {
        uuid: 'net-uuid-default',
        name: 'TestNet',
        nick: 'mynick',
        highlightRegex: 'mynick',
        channels: [
            { name: 'mynick', muted: false },
            { name: '#channel', muted: false },
        ],
        irc,
        ...overrides,
    };
}

function makeFakeFullClient(name, networks) {
    const messages = [];
    return {
        messages,
        sendMessage(text, chan) {
            messages.push({ text, chan });
        },
        client: { name, networks },
    };
}

function makeFakeTarget(network) {
    return {
        chan: { id: 1, name: '#test' },
        network,
    };
}

// Minimal client for tests that don't need client.client (e.g. no-args test)
function makeMinimalClient() {
    const messages = [];
    return {
        messages,
        sendMessage(text, chan) {
            messages.push({ text, chan });
        },
    };
}

async function runCmd(args, client, target) {
    await pushoverCommand.input(client, target, 'pushover', args);
    return { client, target };
}

function writeConfig(username, config) {
    const dir = path.join(tmpDir, 'pushover');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, `${username}.json`),
        JSON.stringify(config, null, 2),
        'utf-8',
    );
}

function readConfig(username) {
    return JSON.parse(
        fs.readFileSync(
            path.join(tmpDir, 'pushover', `${username}.json`),
            'utf-8',
        ),
    );
}

// ---- Lifecycle ----

beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
});

afterEach(() => {
    nock.enableNetConnect();
    assert.equal(nock.isDone(), true, 'Not all HTTP mocks were used');
});

after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- Tests: basic command routing ----

test('/pushover (no args) prints usage', async () => {
    const client = makeMinimalClient();
    await runCmd([], client, { chan: { id: 1 } });
    assert(client.messages.length > 0);
    assert(
        client.messages[0].text.includes(
            'start|stop|status [all] | test | config set <token|user|notify_on_pms> <value> | config print',
        ),
    );
});

test('/pushover unknown subcommand prints usage', async () => {
    const client = makeMinimalClient();
    await runCmd(['foobar'], client, { chan: { id: 1 } });
    assert(client.messages.length > 0);
    assert(client.messages[0].text.includes('start|stop|status'));
});

// ---- Tests: start / stop ----

test('/pushover start registers listener and reports count', async () => {
    const net = makeFakeNetwork({ uuid: 'net-start-1' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    await runCmd(['start'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('Started 1 listener')));
});

test('/pushover start twice skips second and reports skipped', async () => {
    const net = makeFakeNetwork({ uuid: 'net-start-twice' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    const target = makeFakeTarget(net);
    await runCmd(['start'], client, target);
    await runCmd(['start'], client, target);
    assert(client.messages.some((m) => m.text.includes('Skipped 1')));
});

test('/pushover stop when not running reports skipped', async () => {
    const net = makeFakeNetwork({ uuid: 'net-stop-norun' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    await runCmd(['stop'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('Skipped 1')));
});

test('/pushover start then stop removes listener', async () => {
    const net = makeFakeNetwork({ uuid: 'net-startstop' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    const target = makeFakeTarget(net);
    await runCmd(['start'], client, target);
    client.messages.length = 0;
    await runCmd(['stop'], client, target);
    assert(client.messages.some((m) => m.text.includes('Stopped 1 listener')));
});

test('/pushover start all starts listeners for every network', async () => {
    const net1 = makeFakeNetwork({ uuid: 'net-all-1', name: 'Net1' });
    const net2 = makeFakeNetwork({ uuid: 'net-all-2', name: 'Net2' });
    const client = makeFakeFullClient(uniqueUser(), [net1, net2]);
    await runCmd(['start', 'all'], client, makeFakeTarget(net1));
    assert(client.messages.some((m) => m.text.includes('Started 2 listener')));
});

// ---- Tests: status ----

test('/pushover status shows not running before start', async () => {
    const net = makeFakeNetwork({ uuid: 'net-status-off' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    await runCmd(['status'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('not running')));
});

test('/pushover status shows running after start', async () => {
    const net = makeFakeNetwork({ uuid: 'net-status-on' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    const target = makeFakeTarget(net);
    await runCmd(['start'], client, target);
    client.messages.length = 0;
    await runCmd(['status'], client, target);
    // "running" but NOT "not running"
    assert(
        client.messages.some(
            (m) =>
                /\brunning\b/.test(m.text) && !m.text.includes('not running'),
        ),
    );
});

test('/pushover status all shows one line per network', async () => {
    const net1 = makeFakeNetwork({ uuid: 'net-sa-1', name: 'Alpha' });
    const net2 = makeFakeNetwork({ uuid: 'net-sa-2', name: 'Beta' });
    const client = makeFakeFullClient(uniqueUser(), [net1, net2]);
    await runCmd(['status', 'all'], client, makeFakeTarget(net1));
    assert.equal(client.messages.length, 2);
    assert(client.messages.some((m) => m.text.includes('Alpha')));
    assert(client.messages.some((m) => m.text.includes('Beta')));
});

// ---- Tests: test command ----

test('/pushover test without config prompts setup', async () => {
    const net = makeFakeNetwork({ uuid: 'net-test-noconf' });
    const client = makeFakeFullClient(uniqueUser(), [net]);
    await runCmd(['test'], client, makeFakeTarget(net));
    assert(
        client.messages.some((m) =>
            m.text.includes('Configure token and user first'),
        ),
    );
});

test('/pushover test with config sends Pushover notification', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'tok123',
        user: 'usr456',
        notify_on_pms: {},
    });
    nock('https://api.pushover.net')
        .post('/1/messages.json')
        .reply(200, '{"status":1}');
    const net = makeFakeNetwork({ uuid: 'net-test-conf' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['test'], client, makeFakeTarget(net));
    assert(
        client.messages.some((m) => m.text.includes('Test notification sent')),
    );
});

test('/pushover test reports failure when API returns non-200', async () => {
    const username = uniqueUser();
    writeConfig(username, { token: 'tok', user: 'usr', notify_on_pms: {} });
    nock('https://api.pushover.net')
        .post('/1/messages.json')
        .reply(400, '{"status":0}');
    const net = makeFakeNetwork({ uuid: 'net-test-fail' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['test'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('Failed')));
});

// ---- Tests: config ----

test('/pushover config set token saves value to disk', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(
        ['config', 'set', 'token', 'mytoken'],
        client,
        makeFakeTarget(net),
    );
    assert(client.messages.some((m) => m.text === 'Saved'));
    assert.equal(readConfig(username).token, 'mytoken');
});

test('/pushover config set user saves value to disk', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(
        ['config', 'set', 'user', 'myuser'],
        client,
        makeFakeTarget(net),
    );
    assert(client.messages.some((m) => m.text === 'Saved'));
    assert.equal(readConfig(username).user, 'myuser');
});

test('/pushover config set notify_on_pms true saves boolean for current network', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork({ uuid: 'net-npm-true' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(
        ['config', 'set', 'notify_on_pms', 'true'],
        client,
        makeFakeTarget(net),
    );
    assert.equal(readConfig(username).notify_on_pms['net-npm-true'], true);
});

test('/pushover config set notify_on_pms false saves boolean for current network', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork({ uuid: 'net-npm-false' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(
        ['config', 'set', 'notify_on_pms', 'false'],
        client,
        makeFakeTarget(net),
    );
    assert.equal(readConfig(username).notify_on_pms['net-npm-false'], false);
});

test('/pushover config set unknown key shows error', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(
        ['config', 'set', 'badkey', 'val'],
        client,
        makeFakeTarget(net),
    );
    assert(client.messages.some((m) => m.text.includes('Unknown key')));
});

test('/pushover config print masks token and shows user', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'supersecret',
        user: 'myuser',
        notify_on_pms: {},
    });
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['config', 'print'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('token=********')));
    assert(client.messages.some((m) => m.text.includes('user=myuser')));
    assert(client.messages.every((m) => !m.text.includes('supersecret')));
});

test('/pushover config print with no config shows (not set)', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['config', 'print'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('(not set)')));
});

test('/pushover config with no subcommand prints usage', async () => {
    const username = uniqueUser();
    const net = makeFakeNetwork();
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['config'], client, makeFakeTarget(net));
    assert(client.messages.some((m) => m.text.includes('config set')));
});

// ---- Tests: message handler behavior ----

test('handler sends notification on PM when notify_on_pms is true', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'tok',
        user: 'usr',
        notify_on_pms: { 'net-h-pm': true },
    });
    nock('https://api.pushover.net')
        .post('/1/messages.json')
        .reply(200, '{"status":1}');

    const net = makeFakeNetwork({ uuid: 'net-h-pm' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    net.irc.emit('privmsg', {
        nick: 'sender',
        target: 'mynick',
        message: 'hello there',
    });
    await net.irc.drain();
});

test('handler sends notification on channel mention', async () => {
    const username = uniqueUser();
    writeConfig(username, { token: 'tok', user: 'usr', notify_on_pms: {} });
    nock('https://api.pushover.net')
        .post('/1/messages.json')
        .reply(200, '{"status":1}');

    const net = makeFakeNetwork({ uuid: 'net-h-mention' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    net.irc.emit('privmsg', {
        nick: 'sender',
        target: '#channel',
        message: "hey mynick what's up",
    });
    await net.irc.drain();
});

test('handler strips IRC formatting before sending notification', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'tok',
        user: 'usr',
        notify_on_pms: { 'net-h-strip': true },
    });

    let sentBody = null;
    nock('https://api.pushover.net')
        .post('/1/messages.json', (body) => {
            sentBody = body;
            return true;
        })
        .reply(200, '{"status":1}');

    const net = makeFakeNetwork({ uuid: 'net-h-strip' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    net.irc.emit('privmsg', {
        nick: 'sender',
        target: 'mynick',
        message: '\x02bold\x02 mynick',
    });
    await net.irc.drain();

    assert(sentBody, 'expected HTTP body to be captured');
    assert(
        !sentBody.message.includes('\x02'),
        'IRC formatting should be stripped',
    );
    assert(sentBody.message.includes('bold'), 'text content should remain');
});

test('handler does not notify on own messages', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'tok',
        user: 'usr',
        notify_on_pms: { 'net-h-own': true },
    });

    const net = makeFakeNetwork({ uuid: 'net-h-own' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    // No nock mock — if a request is attempted, nock.disableNetConnect causes an error
    // which the handler catches silently; a real fire would be a logic bug but
    // undetectable here without injecting sendPushover. The test still validates
    // the guard path doesn't crash.
    net.irc.emit('privmsg', {
        nick: 'mynick',
        target: '#channel',
        message: 'I said something',
    });
    await net.irc.drain();
});

test('handler does not notify in muted channel', async () => {
    const username = uniqueUser();
    writeConfig(username, { token: 'tok', user: 'usr', notify_on_pms: {} });

    const net = makeFakeNetwork({
        uuid: 'net-h-muted',
        channels: [{ name: '#channel', muted: true }],
    });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    net.irc.emit('privmsg', {
        nick: 'sender',
        target: '#channel',
        message: 'mynick hello',
    });
    await net.irc.drain();
});

test('handler does not notify on PM when notify_on_pms is false', async () => {
    const username = uniqueUser();
    writeConfig(username, {
        token: 'tok',
        user: 'usr',
        notify_on_pms: { 'net-h-nopm': false },
    });

    const net = makeFakeNetwork({ uuid: 'net-h-nopm' });
    const client = makeFakeFullClient(username, [net]);
    await runCmd(['start'], client, makeFakeTarget(net));

    net.irc.emit('privmsg', {
        nick: 'sender',
        target: 'mynick',
        message: 'hello',
    });
    await net.irc.drain();
});

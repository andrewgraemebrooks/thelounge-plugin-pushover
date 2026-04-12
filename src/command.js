'use strict';

const { loadConfig, saveConfig } = require('./config');
const { sendPushover } = require('./pushover');
const { activeListeners, createHandler } = require('./handler');

function getUserListeners(clientName) {
    if (!activeListeners.has(clientName)) {
        activeListeners.set(clientName, new Map());
    }
    return activeListeners.get(clientName);
}

function startListeners(client, networks, say) {
    const userListeners = getUserListeners(client.client.name);
    let changed = 0,
        skipped = 0;
    for (const net of networks) {
        if (userListeners.has(net.uuid)) {
            skipped++;
            continue;
        }
        const handler = createHandler(client, net);
        net.irc.on('privmsg', handler);
        userListeners.set(net.uuid, handler);
        changed++;
    }
    if (changed) say(`Started ${changed} listener${changed !== 1 ? 's' : ''}`);
    if (skipped) say(`Skipped ${skipped} (already running)`);
}

function stopListeners(client, networks, say) {
    const userListeners = getUserListeners(client.client.name);
    let changed = 0,
        skipped = 0;
    for (const net of networks) {
        if (!userListeners.has(net.uuid)) {
            skipped++;
            continue;
        }
        net.irc.removeListener('privmsg', userListeners.get(net.uuid));
        userListeners.delete(net.uuid);
        changed++;
    }
    if (changed) say(`Stopped ${changed} listener${changed !== 1 ? 's' : ''}`);
    if (skipped) say(`Skipped ${skipped} (not running)`);
}

const pushoverCommand = {
    input: async (client, target, command, args) => {
        const say = (msg) => client.sendMessage(msg, target.chan);
        const network = target.network;

        if (!args.length || typeof args[0] !== 'string') {
            say(
                `/${command} start|stop|status [all] | test | config set <token|user|notify_on_pms> <value> | config print`,
            );
            return;
        }

        switch (args[0].toLowerCase()) {
            case 'start': {
                const networks =
                    args[1]?.toLowerCase() === 'all'
                        ? client.client.networks
                        : [network];
                startListeners(client, networks, say);
                break;
            }

            case 'stop': {
                const networks =
                    args[1]?.toLowerCase() === 'all'
                        ? client.client.networks
                        : [network];
                stopListeners(client, networks, say);
                break;
            }

            case 'status': {
                const all = args[1]?.toLowerCase() === 'all';
                const userListeners =
                    activeListeners.get(client.client.name) || new Map();

                if (all) {
                    for (const net of client.client.networks) {
                        say(
                            `${net.name}: ${userListeners.has(net.uuid) ? 'running' : 'not running'}`,
                        );
                    }
                } else {
                    say(
                        `Listener is ${userListeners.has(network.uuid) ? '' : 'not '}running for this network`,
                    );
                }
                break;
            }

            case 'test': {
                const config = loadConfig(client.client.name);
                if (!config.token || !config.user) {
                    say(
                        'Configure token and user first: /pushover config set token <value>',
                    );
                    return;
                }
                try {
                    await sendPushover(
                        config.token,
                        config.user,
                        'Test from The Lounge',
                        `Hello, ${client.client.name}!`,
                    );
                    say('Test notification sent');
                } catch (e) {
                    say(`Failed: ${e.message}`);
                }
                break;
            }

            case 'config': {
                const sub = args[1]?.toLowerCase();

                if (sub === 'set' && args[2] && args[3]) {
                    const key = args[2].toLowerCase();
                    const value = args.slice(3).join(' ');
                    const allowed = new Set(['token', 'user', 'notify_on_pms']);

                    if (!allowed.has(key)) {
                        say(
                            `Unknown key. Allowed: ${Array.from(allowed).join(', ')}`,
                        );
                        return;
                    }

                    const config = loadConfig(client.client.name);

                    if (key === 'notify_on_pms') {
                        config.notify_on_pms[network.uuid] =
                            value.toLowerCase() === 'true';
                    } else {
                        config[key] = value;
                    }

                    saveConfig(client.client.name, config);
                    say('Saved');
                } else if (sub === 'print') {
                    const config = loadConfig(client.client.name);
                    say(`token=${config.token ? '********' : '(not set)'}`);
                    say(`user=${config.user || '(not set)'}`);
                    say(
                        `notify_on_pms (this network)=${config.notify_on_pms[network.uuid] ?? '(not set)'}`,
                    );
                } else {
                    say(
                        `/${command} config set <token|user|notify_on_pms> <value>`,
                    );
                    say(`/${command} config print`);
                }
                break;
            }

            default:
                say(
                    `/${command} start|stop|status [all] | test | config set <token|user|notify_on_pms> <value> | config print`,
                );
        }
    },
    allowDisconnected: true,
};

module.exports = { pushoverCommand };

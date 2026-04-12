'use strict';

const { loadConfig } = require('./config');
const { sendPushover, stripIrcFormatting } = require('./pushover');

const activeListeners = new Map();

function createHandler(client, network) {
    return async (data) => {
        if (data.nick === network.nick) return;

        const isPM = data.target === network.nick;
        const channel = isPM
            ? network.channels.find((c) => c.name === data.nick)
            : network.channels.find(
                  (c) => c.name.toLowerCase() === data.target.toLowerCase(),
              );

        if (channel?.muted) return;

        const config = loadConfig(client.client.name);
        if (!config.token || !config.user) return;

        const mentioned = new RegExp(network.highlightRegex, 'i').test(
            data.message || '',
        );
        if (!isPM && !mentioned) return;
        if (isPM && !config.notify_on_pms[network.uuid]) return;

        const title = isPM
            ? `${network.name}: ${data.nick}`
            : `${network.name} ${data.target}: ${data.nick}`;

        try {
            await sendPushover(
                config.token,
                config.user,
                title,
                stripIrcFormatting(data.message || ''),
            );
        } catch {
            // silently fail
        }
    };
}

module.exports = { activeListeners, createHandler };

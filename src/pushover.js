'use strict';

const https = require('https');

function sendPushover(token, user, title, message) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ token, user, title, message });
        const req = https.request(
            {
                hostname: 'api.pushover.net',
                path: '/1/messages.json',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (res) => {
                res.on('data', () => {});
                res.on('end', () => {
                    if (res.statusCode === 200) resolve();
                    else
                        reject(
                            new Error(
                                `Pushover returned HTTP ${res.statusCode}`,
                            ),
                        );
                });
            },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function stripIrcFormatting(message) {
    return message.replace(
        // eslint-disable-next-line no-control-regex
        /[\x02\x0F\x16\x1D\x1F]|(?:\x03(?:\d{1,2}(?:,\d{1,2})?)?)/g,
        '',
    );
}

module.exports = { sendPushover, stripIrcFormatting };

'use strict';

const fs = require('fs');
const path = require('path');

let rootDir = null;

function setRootDir(dir) {
    rootDir = dir;
}

function getConfigPath(username) {
    return path.join(rootDir, 'pushover', `${username}.json`);
}

function loadConfig(username) {
    const configPath = getConfigPath(username);
    if (!fs.existsSync(configPath)) {
        return { token: null, user: null, notify_on_pms: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
        return { token: null, user: null, notify_on_pms: {} };
    }
}

function saveConfig(username, config) {
    const configPath = getConfigPath(username);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

module.exports = { setRootDir, loadConfig, saveConfig };

'use strict';

const { setRootDir } = require('./src/config');
const { pushoverCommand } = require('./src/command');

module.exports = {
    onServerStart(api) {
        setRootDir(api.Config.getPersistentStorageDir());
        api.Commands.add('pushover', pushoverCommand);
    },
    // For tests
    _command: pushoverCommand,
};

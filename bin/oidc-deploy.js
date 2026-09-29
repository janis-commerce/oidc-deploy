#!/usr/bin/env node

'use strict';

const run = require('../lib/cli');

// exitCode instead of process.exit(): the exports printed to stdout must be flushed before the process ends
run(process.argv.slice(2)).then(exitCode => {
	process.exitCode = exitCode;
});

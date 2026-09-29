'use strict';

const env = require('./env');
const publishDeployed = require('./publish-deployed');

const USAGE = 'Usage: oidc-deploy <env|publish-deployed [--env beta|qa|prod]>';

/**
 * @typedef {object} Output
 * @property {{ write: function(string): * }} stdout
 * @property {{ write: function(string): * }} stderr
 */

/**
 * Runs an oidc-deploy command
 *
 * @param {string[]} args The command line arguments: the command and its options
 * @param {Output} [output] Where the command writes. Defaults to the process streams
 * @returns {Promise<number>} The exit code
 */
module.exports = async (args, output = process) => {

	const [command, ...options] = args;

	if(command === 'env')
		return env(options, output);

	if(command === 'publish-deployed')
		return publishDeployed(options, output);

	output.stderr.write(`${USAGE}\n`);
	return 1;
};

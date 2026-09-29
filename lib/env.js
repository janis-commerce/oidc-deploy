'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TOKEN_FILE_NAME = 'oidc-deploy-web-identity-token';

/**
 * @param {string} name
 * @param {string} value
 * @returns {string} The export with the value single quoted for the shell
 */
const exportLine = (name, value) => `export ${name}='${value.replaceAll('\'', '\'\\\'\'')}'`;

/**
 * @param {{ write: function(string): * }} stderr
 * @returns {string[]}
 */
const getExportLines = stderr => {

	const {
		BITBUCKET_DEPLOYMENT_ENVIRONMENT,
		AWS_DEPLOY_ROLE_ARN,
		BITBUCKET_STEP_OIDC_TOKEN,
		BITBUCKET_REPO_SLUG = '',
		BITBUCKET_BUILD_NUMBER = '0'
	} = process.env;

	if(!BITBUCKET_DEPLOYMENT_ENVIRONMENT)
		throw new Error('The step has no deployment: add deployment: to the deploy step so Bitbucket injects AWS_DEPLOY_ROLE_ARN');

	if(!AWS_DEPLOY_ROLE_ARN)
		throw new Error('AWS_DEPLOY_ROLE_ARN is not published in this deployment environment');

	if(!BITBUCKET_STEP_OIDC_TOKEN)
		throw new Error('BITBUCKET_STEP_OIDC_TOKEN not found. Add oidc: true to the deploy step');

	const tokenFile = path.join(os.tmpdir(), TOKEN_FILE_NAME);

	fs.writeFileSync(tokenFile, BITBUCKET_STEP_OIDC_TOKEN, { mode: 0o600 });

	stderr.write(`oidc-deploy: Deploying with the OIDC role ${AWS_DEPLOY_ROLE_ARN}\n`);

	return [
		exportLine('AWS_ROLE_ARN', AWS_DEPLOY_ROLE_ARN),
		exportLine('AWS_WEB_IDENTITY_TOKEN_FILE', tokenFile),
		exportLine('AWS_ROLE_SESSION_NAME', `${BITBUCKET_REPO_SLUG.slice(0, 50)}-${BITBUCKET_BUILD_NUMBER}`)
	];
};

/**
 * Prints the exports to evaluate in the deploy step: the web identity variables of the OIDC role.
 * Human messages go to stderr
 *
 * @param {string[]} options The command options (unused: the command does not depend on the environment)
 * @param {import('./cli').Output} output
 * @returns {number} The exit code
 */
module.exports = (options, { stdout, stderr }) => {

	try {

		const exportLines = getExportLines(stderr);

		stdout.write(`${exportLines.join('\n')}\n`);

		return 0;

	} catch(error) {
		stderr.write(`oidc-deploy: ${error.message}\n`);
		return 1;
	}
};

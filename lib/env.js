'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const getEnvironment = require('./environment');

const TOKEN_FILE_NAME = 'oidc-deploy-web-identity-token';

/**
 * @param {string} name
 * @param {string} value
 * @returns {string} The export with the value single quoted for the shell
 */
const exportLine = (name, value) => `export ${name}='${value.replaceAll('\'', '\'\\\'\'')}'`;

/**
 * @param {string} environment
 * @param {{ write: function(string): * }} stderr
 * @returns {string[]}
 */
const getExportLines = (environment, stderr) => {

	const {
		AWS_DEPLOY_ROLE_ARN,
		BITBUCKET_STEP_OIDC_TOKEN,
		BITBUCKET_REPO_SLUG = '',
		BITBUCKET_BUILD_NUMBER = '0'
	} = process.env;

	if(AWS_DEPLOY_ROLE_ARN) {

		if(!BITBUCKET_STEP_OIDC_TOKEN)
			throw new Error('BITBUCKET_STEP_OIDC_TOKEN not found. Add oidc: true to the deploy step');

		const tokenFile = path.join(os.tmpdir(), TOKEN_FILE_NAME);

		fs.writeFileSync(tokenFile, BITBUCKET_STEP_OIDC_TOKEN, { mode: 0o600 });

		stderr.write(`oidc-deploy: Deploying to ${environment} with the OIDC role ${AWS_DEPLOY_ROLE_ARN}\n`);

		return [
			exportLine('AWS_ROLE_ARN', AWS_DEPLOY_ROLE_ARN),
			exportLine('AWS_WEB_IDENTITY_TOKEN_FILE', tokenFile),
			exportLine('AWS_ROLE_SESSION_NAME', `${BITBUCKET_REPO_SLUG.slice(0, 50)}-${BITBUCKET_BUILD_NUMBER}`)
		];
	}

	if(environment !== 'prod')
		throw new Error('AWS_DEPLOY_ROLE_ARN is not published in this deployment environment');

	// Temporary until prod is migrated to OIDC. The values are referenced, never printed, so no secret reaches the output
	if(!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY)
		throw new Error('AWS_DEPLOY_ROLE_ARN, AWS_ACCESS_KEY and AWS_SECRET_KEY not found. There are no credentials to deploy');

	stderr.write('oidc-deploy: WARNING Deploying to prod with the static keys. Temporary until prod is migrated to OIDC\n');

	return [
		'export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"',
		'export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"'
	];
};

/**
 * Prints the exports to evaluate in the deploy step: the web identity variables of the OIDC role,
 * or the static keys of prod while it is not migrated. Human messages go to stderr
 *
 * @param {string[]} options The command options
 * @param {import('./cli').Output} output
 * @returns {number} The exit code
 */
module.exports = (options, { stdout, stderr }) => {

	try {

		const exportLines = getExportLines(getEnvironment(options), stderr);

		stdout.write(`${exportLines.join('\n')}\n`);

		return 0;

	} catch(error) {
		stderr.write(`oidc-deploy: ${error.message}\n`);
		return 1;
	}
};

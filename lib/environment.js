'use strict';

const ENVIRONMENTS = new Set(['beta', 'qa', 'prod']);

const ENVIRONMENTS_BY_DEPLOYMENT = {
	test: 'beta',
	staging: 'qa',
	production: 'prod'
};

/**
 * Resolves the Janis environment from the `--env` option or from the Bitbucket deployment environment
 *
 * @param {string[]} options The command options
 * @returns {string} beta, qa or prod
 */
module.exports = options => {

	const envOptionIndex = options.indexOf('--env');

	if(envOptionIndex !== -1) {

		const environment = options[envOptionIndex + 1];

		if(!ENVIRONMENTS.has(environment))
			throw new Error(`Invalid --env ${environment}: use beta, qa or prod`);

		return environment;
	}

	const { BITBUCKET_DEPLOYMENT_ENVIRONMENT } = process.env;

	const environment = ENVIRONMENTS_BY_DEPLOYMENT[BITBUCKET_DEPLOYMENT_ENVIRONMENT];

	if(!environment)
		throw new Error(`Unknown deployment environment ${BITBUCKET_DEPLOYMENT_ENVIRONMENT}: use test, staging or production, or pass --env beta|qa|prod`);

	return environment;
};

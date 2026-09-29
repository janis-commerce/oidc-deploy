'use strict';

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const { version } = require('../package.json');

const getEnvironment = require('./environment');

/**
 * @param {string} environment
 * @returns {Promise<string>} The authMethod of the deploy
 */
const publish = async environment => {

	const accountIdVariable = `DEVOPS_ACCOUNT_ID_${environment.toUpperCase()}`;

	const devopsAccountId = process.env.DEVOPS_ACCOUNT_ID || process.env[accountIdVariable];

	if(!devopsAccountId)
		throw new Error(`DEVOPS_ACCOUNT_ID and ${accountIdVariable} not found`);

	const authMethod = process.env.AWS_ROLE_ARN || process.env.AWS_DEPLOY_ROLE_ARN ? 'oidc' : 'keys';

	// Every value is a string and an unset variable is '', like the jq --arg of the pipe
	const variable = name => process.env[name] || '';

	const message = {
		service: variable('SERVICE_CODE'),
		repository: variable('BITBUCKET_REPO_SLUG'),
		environment,
		branch: variable('BITBUCKET_BRANCH'),
		commit: variable('BITBUCKET_COMMIT'),
		pipelineUuid: variable('BITBUCKET_PIPELINE_UUID'),
		buildNumber: variable('BITBUCKET_BUILD_NUMBER'),
		authMethod,
		pipeVersion: `oidc-deploy@${version}`,
		dateDeployed: new Date().toISOString()
	};

	await new SNSClient({ region: 'us-east-1' }).send(new PublishCommand({
		TopicArn: `arn:aws:sns:us-east-1:${devopsAccountId}:serviceDeployed`,
		Message: JSON.stringify(message),
		MessageAttributes: {
			authMethod: { DataType: 'String', StringValue: authMethod }
		}
	}));

	return authMethod;
};

/**
 * Publishes the serviceDeployed event to the Devops topic, with the same contract as the ci-cd-back pipe.
 * Best effort: any error is a warning and never fails the deploy
 *
 * @param {string[]} options The command options
 * @param {import('./cli').Output} output
 * @returns {Promise<number>} Always 0
 */
module.exports = async (options, { stderr }) => {

	try {

		const authMethod = await publish(getEnvironment(options));

		stderr.write(`oidc-deploy: serviceDeployed event published (authMethod: ${authMethod})\n`);

	} catch(error) {
		stderr.write(`oidc-deploy: WARNING Could not publish the serviceDeployed event: ${error.message}\n`);
	}

	return 0;
};

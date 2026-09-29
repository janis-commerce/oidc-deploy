'use strict';

const assert = require('assert');
const sinon = require('sinon');

const { mockClient } = require('aws-sdk-client-mock');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const { version } = require('../package.json');

const publishDeployed = require('../lib/publish-deployed');

const DEVOPS_ACCOUNT_ID = '123456789012';
const NOW = new Date('2026-09-29T15:30:00.000Z');

const bitbucketVariables = {
	SERVICE_CODE: 'catalog',
	BITBUCKET_REPO_SLUG: 'janis-catalog-service',
	BITBUCKET_BRANCH: 'master',
	BITBUCKET_COMMIT: '3f1d80523e0457be5f8cd2e48bcdf12181e1883b',
	BITBUCKET_PIPELINE_UUID: '{5d1b8c2e-4f0a-4b7e-9c3d-2a6f1e8b9c0d}',
	BITBUCKET_BUILD_NUMBER: '127'
};

describe('Publish deployed', () => {

	let snsMock;
	let output;

	const setEnv = variables => sinon.stub(process, 'env').value(variables);

	const getStderr = () => output.stderr.write.args.map(([text]) => text).join('');

	const getPublishInput = () => {
		const [call] = snsMock.commandCalls(PublishCommand);
		return call.args[0].input;
	};

	beforeEach(() => {
		snsMock = mockClient(SNSClient);
		snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123456' });
		output = { stdout: { write: sinon.spy() }, stderr: { write: sinon.spy() } };
		sinon.useFakeTimers(NOW);
	});

	afterEach(() => {
		sinon.restore();
		snsMock.restore();
	});

	it('Should publish the serviceDeployed event of an OIDC deploy', async () => {

		setEnv({
			...bitbucketVariables,
			BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test',
			DEVOPS_ACCOUNT_ID_BETA: DEVOPS_ACCOUNT_ID,
			AWS_ROLE_ARN: 'arn:aws:iam::210987654321:role/JanisOidcDeployRole'
		});

		assert.strictEqual(await publishDeployed([], output), 0);

		assert.strictEqual(snsMock.commandCalls(PublishCommand).length, 1);

		const { Message, ...input } = getPublishInput();

		assert.deepStrictEqual(input, {
			TopicArn: `arn:aws:sns:us-east-1:${DEVOPS_ACCOUNT_ID}:serviceDeployed`,
			MessageAttributes: {
				authMethod: { DataType: 'String', StringValue: 'oidc' }
			}
		});

		assert.deepStrictEqual(JSON.parse(Message), {
			service: 'catalog',
			repository: 'janis-catalog-service',
			environment: 'beta',
			branch: 'master',
			commit: '3f1d80523e0457be5f8cd2e48bcdf12181e1883b',
			pipelineUuid: '{5d1b8c2e-4f0a-4b7e-9c3d-2a6f1e8b9c0d}',
			buildNumber: '127',
			authMethod: 'oidc',
			pipeVersion: `oidc-deploy@${version}`,
			dateDeployed: '2026-09-29T15:30:00.000Z'
		});

		assert.strictEqual(await snsMock.call(0).thisValue.config.region(), 'us-east-1');
		assert.strictEqual(getStderr(), 'oidc-deploy: serviceDeployed event published (authMethod: oidc)\n');
		sinon.assert.notCalled(output.stdout.write);
	});

	it('Should report the oidc authMethod with only AWS_DEPLOY_ROLE_ARN', async () => {

		setEnv({ ...bitbucketVariables, DEVOPS_ACCOUNT_ID, AWS_DEPLOY_ROLE_ARN: 'arn:aws:iam::210987654321:role/JanisOidcDeployRole' });

		assert.strictEqual(await publishDeployed(['--env', 'qa'], output), 0);

		assert.strictEqual(getPublishInput().MessageAttributes.authMethod.StringValue, 'oidc');
		assert.strictEqual(JSON.parse(getPublishInput().Message).authMethod, 'oidc');
	});

	it('Should report the keys authMethod without OIDC role and send the unset variables as empty strings', async () => {

		setEnv({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'production', BITBUCKET_REPO_SLUG: 'janis-catalog-service', DEVOPS_ACCOUNT_ID_PROD: DEVOPS_ACCOUNT_ID });

		assert.strictEqual(await publishDeployed([], output), 0);

		const { TopicArn, Message, MessageAttributes } = getPublishInput();

		assert.strictEqual(TopicArn, `arn:aws:sns:us-east-1:${DEVOPS_ACCOUNT_ID}:serviceDeployed`);
		assert.deepStrictEqual(MessageAttributes, { authMethod: { DataType: 'String', StringValue: 'keys' } });

		assert.deepStrictEqual(JSON.parse(Message), {
			service: '',
			repository: 'janis-catalog-service',
			environment: 'prod',
			branch: '',
			commit: '',
			pipelineUuid: '',
			buildNumber: '',
			authMethod: 'keys',
			pipeVersion: `oidc-deploy@${version}`,
			dateDeployed: '2026-09-29T15:30:00.000Z'
		});
	});

	it('Should use the generic DEVOPS_ACCOUNT_ID over the environment one', async () => {

		setEnv({ ...bitbucketVariables, DEVOPS_ACCOUNT_ID, DEVOPS_ACCOUNT_ID_BETA: '999999999999' });

		assert.strictEqual(await publishDeployed(['--env', 'beta'], output), 0);
		assert.strictEqual(getPublishInput().TopicArn, `arn:aws:sns:us-east-1:${DEVOPS_ACCOUNT_ID}:serviceDeployed`);
	});

	it('Should not use the account id of another environment', async () => {

		setEnv({ ...bitbucketVariables, BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'staging', DEVOPS_ACCOUNT_ID_BETA: DEVOPS_ACCOUNT_ID });

		assert.strictEqual(await publishDeployed([], output), 0);

		assert.strictEqual(snsMock.commandCalls(PublishCommand).length, 0);
		assert.strictEqual(getStderr(),
			'oidc-deploy: WARNING Could not publish the serviceDeployed event: DEVOPS_ACCOUNT_ID and DEVOPS_ACCOUNT_ID_QA not found\n');
	});

	it('Should warn and exit 0 when SNS fails', async () => {

		snsMock.on(PublishCommand).rejects(new Error('Could not load credentials from any providers'));

		setEnv({ ...bitbucketVariables, BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test', DEVOPS_ACCOUNT_ID });

		assert.strictEqual(await publishDeployed([], output), 0);
		assert.strictEqual(getStderr(),
			'oidc-deploy: WARNING Could not publish the serviceDeployed event: Could not load credentials from any providers\n');
	});

	it('Should warn and exit 0 when the environment cannot be resolved', async () => {

		setEnv({ ...bitbucketVariables, DEVOPS_ACCOUNT_ID });

		assert.strictEqual(await publishDeployed([], output), 0);

		assert.strictEqual(snsMock.commandCalls(PublishCommand).length, 0);
		assert(getStderr().startsWith('oidc-deploy: WARNING Could not publish the serviceDeployed event: Unknown deployment environment undefined'));
	});
});

'use strict';

const assert = require('assert');
const sinon = require('sinon');

const { mockClient } = require('aws-sdk-client-mock');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const run = require('../lib/cli');

describe('CLI', () => {

	let output;

	beforeEach(() => {
		output = { stdout: { write: sinon.spy() }, stderr: { write: sinon.spy() } };
	});

	afterEach(() => sinon.restore());

	it('Should run the env command', async () => {

		sinon.stub(process, 'env').value({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test' });

		assert.strictEqual(await run(['env'], output), 1);
		sinon.assert.calledOnceWithExactly(output.stderr.write, 'oidc-deploy: AWS_DEPLOY_ROLE_ARN is not published in this deployment environment\n');
	});

	it('Should run the publish-deployed command', async () => {

		const snsMock = mockClient(SNSClient);
		snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123456' });

		sinon.stub(process, 'env').value({ DEVOPS_ACCOUNT_ID: '123456789012', BITBUCKET_REPO_SLUG: 'janis-catalog-service' });

		assert.strictEqual(await run(['publish-deployed', '--env', 'beta'], output), 0);
		assert.strictEqual(snsMock.commandCalls(PublishCommand).length, 1);

		snsMock.restore();
	});

	[[], ['deploy']].forEach(args => {
		it(`Should print the usage and exit 1 for the arguments [${args}]`, async () => {
			assert.strictEqual(await run(args, output), 1);
			sinon.assert.calledOnceWithExactly(output.stderr.write, 'Usage: oidc-deploy <env|publish-deployed> [--env beta|qa|prod]\n');
			sinon.assert.notCalled(output.stdout.write);
		});
	});

	it('Should write to the process streams by default', async () => {

		const stderrWrite = sinon.stub(process.stderr, 'write');

		const exitCode = await run([]);

		stderrWrite.restore();

		assert.strictEqual(exitCode, 1);
		sinon.assert.calledOnce(stderrWrite);
	});
});

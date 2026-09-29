'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');

const env = require('../lib/env');

const ROLE_ARN = 'arn:aws:iam::123456789012:role/JanisOidcDeployRole';
const OIDC_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.oidc-token.signature';

describe('Env', () => {

	let output;
	let tmpDir;

	const setEnv = variables => sinon.stub(process, 'env').value(variables);

	const getStdout = () => output.stdout.write.args.map(([text]) => text).join('');
	const getStderr = () => output.stderr.write.args.map(([text]) => text).join('');

	beforeEach(() => {
		output = { stdout: { write: sinon.spy() }, stderr: { write: sinon.spy() } };
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oidc-deploy-test-'));
		sinon.stub(os, 'tmpdir').returns(tmpDir);
	});

	afterEach(() => {
		sinon.restore();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	context('With the OIDC role', () => {

		it('Should write the token file and print the web identity exports', () => {

			setEnv({
				BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test',
				AWS_DEPLOY_ROLE_ARN: ROLE_ARN,
				BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN,
				BITBUCKET_REPO_SLUG: 'janis-catalog-service',
				BITBUCKET_BUILD_NUMBER: '127'
			});

			const tokenFile = path.join(tmpDir, 'oidc-deploy-web-identity-token');

			assert.strictEqual(env([], output), 0);

			assert.strictEqual(getStdout(), [
				`export AWS_ROLE_ARN='${ROLE_ARN}'`,
				`export AWS_WEB_IDENTITY_TOKEN_FILE='${tokenFile}'`,
				'export AWS_ROLE_SESSION_NAME=\'janis-catalog-service-127\'',
				''
			].join('\n'));

			assert.strictEqual(fs.readFileSync(tokenFile, 'utf8'), OIDC_TOKEN);
			assert.strictEqual(fs.statSync(tokenFile).mode & 0o777, 0o600);

			assert.strictEqual(getStderr(), `oidc-deploy: Deploying with the OIDC role ${ROLE_ARN}\n`);
			assert(!getStdout().includes(OIDC_TOKEN));
		});

		it('Should cut the repo slug to 50 characters and default the build number to 0', () => {

			setEnv({
				BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'staging',
				AWS_DEPLOY_ROLE_ARN: ROLE_ARN,
				BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN,
				BITBUCKET_REPO_SLUG: 'a'.repeat(60)
			});

			assert.strictEqual(env([], output), 0);
			assert(getStdout().includes(`export AWS_ROLE_SESSION_NAME='${'a'.repeat(50)}-0'\n`));
		});

		it('Should escape the single quotes of the values', () => {

			setEnv({
				BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test',
				AWS_DEPLOY_ROLE_ARN: 'arn:it\'s',
				BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN,
				BITBUCKET_REPO_SLUG: 'janis-catalog-service'
			});

			assert.strictEqual(env(['--env', 'prod'], output), 0);
			assert(getStdout().startsWith('export AWS_ROLE_ARN=\'arn:it\'\\\'\'s\'\n'));
		});

		it('Should fail when the step has no OIDC token', () => {

			setEnv({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'production', AWS_DEPLOY_ROLE_ARN: ROLE_ARN });

			assert.strictEqual(env([], output), 1);
			assert.strictEqual(getStderr(), 'oidc-deploy: BITBUCKET_STEP_OIDC_TOKEN not found. Add oidc: true to the deploy step\n');
			sinon.assert.notCalled(output.stdout.write);
			assert.deepStrictEqual(fs.readdirSync(tmpDir), []);
		});
	});

	it('Should fail when the step has no deployment', () => {

		setEnv({ AWS_DEPLOY_ROLE_ARN: ROLE_ARN, BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN });

		assert.strictEqual(env([], output), 1);
		assert.strictEqual(getStderr(),
			'oidc-deploy: The step has no deployment: add deployment: to the deploy step so Bitbucket injects AWS_DEPLOY_ROLE_ARN\n');
		sinon.assert.notCalled(output.stdout.write);
		assert.deepStrictEqual(fs.readdirSync(tmpDir), []);
	});

	it('Should fail when AWS_DEPLOY_ROLE_ARN is not published in the deployment environment', () => {

		setEnv({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'test', BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN });

		assert.strictEqual(env([], output), 1);
		assert.strictEqual(getStderr(), 'oidc-deploy: AWS_DEPLOY_ROLE_ARN is not published in this deployment environment\n');
		sinon.assert.notCalled(output.stdout.write);
		assert.deepStrictEqual(fs.readdirSync(tmpDir), []);
	});
});

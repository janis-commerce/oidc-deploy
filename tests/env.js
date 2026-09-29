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

			assert.strictEqual(getStderr(), `oidc-deploy: Deploying to beta with the OIDC role ${ROLE_ARN}\n`);
			assert(!getStdout().includes(OIDC_TOKEN));
		});

		it('Should cut the repo slug to 50 characters and default the build number to 0', () => {

			setEnv({
				AWS_DEPLOY_ROLE_ARN: ROLE_ARN,
				BITBUCKET_STEP_OIDC_TOKEN: OIDC_TOKEN,
				BITBUCKET_REPO_SLUG: 'a'.repeat(60)
			});

			assert.strictEqual(env(['--env', 'qa'], output), 0);
			assert(getStdout().includes(`export AWS_ROLE_SESSION_NAME='${'a'.repeat(50)}-0'\n`));
		});

		it('Should escape the single quotes of the values', () => {

			setEnv({
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

	context('Without the OIDC role', () => {

		it('Should print the static keys references in prod, never their values', () => {

			setEnv({
				BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'production',
				AWS_ACCESS_KEY: 'AKIAFAKEACCESSKEY',
				AWS_SECRET_KEY: 'fake-secret-key-value'
			});

			assert.strictEqual(env([], output), 0);

			assert.strictEqual(getStdout(), 'export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"\nexport AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"\n');
			assert(!getStdout().includes('AKIAFAKEACCESSKEY'));
			assert(!getStdout().includes('fake-secret-key-value'));
			assert(!getStderr().includes('fake-secret-key-value'));
			assert(getStderr().includes('WARNING Deploying to prod with the static keys'));
		});

		[
			{ AWS_SECRET_KEY: 'fake-secret-key-value' },
			{ AWS_ACCESS_KEY: 'AKIAFAKEACCESSKEY' }
		].forEach(keys => {
			it(`Should fail in prod when only ${Object.keys(keys)} is set`, () => {

				setEnv({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: 'production', ...keys });

				assert.strictEqual(env([], output), 1);
				assert.strictEqual(getStderr(),
					'oidc-deploy: AWS_DEPLOY_ROLE_ARN, AWS_ACCESS_KEY and AWS_SECRET_KEY not found. There are no credentials to deploy\n');
				sinon.assert.notCalled(output.stdout.write);
			});
		});

		['test', 'staging'].forEach(deploymentEnvironment => {
			it(`Should fail in the ${deploymentEnvironment} deployment environment even with static keys`, () => {

				setEnv({
					BITBUCKET_DEPLOYMENT_ENVIRONMENT: deploymentEnvironment,
					AWS_ACCESS_KEY: 'AKIAFAKEACCESSKEY',
					AWS_SECRET_KEY: 'fake-secret-key-value'
				});

				assert.strictEqual(env([], output), 1);
				assert.strictEqual(getStderr(), 'oidc-deploy: AWS_DEPLOY_ROLE_ARN is not published in this deployment environment\n');
				sinon.assert.notCalled(output.stdout.write);
			});
		});
	});

	it('Should fail when the environment cannot be resolved', () => {

		setEnv({});

		assert.strictEqual(env(['--env', 'dev'], output), 1);
		assert.strictEqual(getStderr(), 'oidc-deploy: Invalid --env dev: use beta, qa or prod\n');
		sinon.assert.notCalled(output.stdout.write);
	});
});

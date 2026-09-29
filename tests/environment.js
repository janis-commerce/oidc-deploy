'use strict';

const assert = require('assert');
const sinon = require('sinon');

const getEnvironment = require('../lib/environment');

describe('Environment', () => {

	const setDeploymentEnvironment = deploymentEnvironment => {
		sinon.stub(process, 'env').value({ BITBUCKET_DEPLOYMENT_ENVIRONMENT: deploymentEnvironment });
	};

	afterEach(() => sinon.restore());

	[
		['test', 'beta'],
		['staging', 'qa'],
		['production', 'prod']
	].forEach(([deploymentEnvironment, environment]) => {
		it(`Should map the ${deploymentEnvironment} deployment environment to ${environment}`, () => {
			setDeploymentEnvironment(deploymentEnvironment);
			assert.strictEqual(getEnvironment([]), environment);
		});
	});

	['beta', 'qa', 'prod'].forEach(environment => {
		it(`Should prefer the --env ${environment} option over the deployment environment`, () => {
			setDeploymentEnvironment('production');
			assert.strictEqual(getEnvironment(['--env', environment]), environment);
		});
	});

	it('Should throw when the --env option is invalid', () => {
		setDeploymentEnvironment('test');
		assert.throws(() => getEnvironment(['--env', 'dev']), { message: 'Invalid --env dev: use beta, qa or prod' });
	});

	it('Should throw when the --env option has no value', () => {
		setDeploymentEnvironment('test');
		assert.throws(() => getEnvironment(['--env']), { message: 'Invalid --env undefined: use beta, qa or prod' });
	});

	it('Should throw when the deployment environment is unknown', () => {
		setDeploymentEnvironment('custom');
		assert.throws(() => getEnvironment([]), /^Error: Unknown deployment environment custom/);
	});

	it('Should throw when there is no deployment environment', () => {
		setDeploymentEnvironment(undefined);
		assert.throws(() => getEnvironment([]), /^Error: Unknown deployment environment undefined/);
	});
});

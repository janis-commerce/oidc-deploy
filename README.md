# OIDC Deploy

![Build Status](https://github.com/janis-commerce/oidc-deploy/workflows/Build%20Status/badge.svg?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/oidc-deploy/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/oidc-deploy?branch=master)
[![npm version](https://badge.fury.io/js/%40janiscommerce%2Foidc-deploy.svg)](https://www.npmjs.com/package/@janiscommerce/oidc-deploy)

CLI for the Bitbucket Pipelines that deploy with their own script instead of the `janiscommerce/ci-cd-back` pipe.

It replaces the shell block that assumes the OIDC deploy role in every deploy step, and publishes the `serviceDeployed` event like the pipe does.

## Usage

```yaml
- step:
    name: Deploy
    deployment: test
    oidc: true
    script:
      - OIDC_ENV=$(npx -y @janiscommerce/oidc-deploy@1 env) && eval "$OIDC_ENV"
      - npm install
      - npx sls deploy ...
      - npx -y @janiscommerce/oidc-deploy@1 publish-deployed
```

`publish-deployed` accepts `--env beta|qa|prod` to override the environment resolved from the deployment. To keep deploying with static keys in some environment, just don't call `env` in that step.

## `env`

Prints only `export` lines to stdout, to be evaluated by the step. Every human message goes to stderr.

Writes the step OIDC token to a file (mode `0600`) and exports `AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE` and `AWS_ROLE_SESSION_NAME`. Serverless, the AWS SDK and the AWS CLI assume the role by themselves (`AssumeRoleWithWebIdentity`).

It exits with code `1`, and the step fails, when:
- `AWS_DEPLOY_ROLE_ARN` is not published in the deployment environment.
- The step has no `oidc: true`.

## `publish-deployed`

Publishes the `serviceDeployed` event to the `serviceDeployed` SNS topic of the Devops account (`us-east-1`), with the credentials of the step. The message has the same contract as the pipe, and the `authMethod` (`oidc` or `keys`) is also sent as a message attribute.

It is best effort: any error, such as a missing account id or a publish failure, is a warning and it always exits with code `0`.

## Variables

| Variable | Command | Description |
|---|---|---|
| `BITBUCKET_DEPLOYMENT_ENVIRONMENT` | `publish-deployed` | `test` → beta, `staging` → qa, `production` → prod |
| `AWS_DEPLOY_ROLE_ARN` | both | The OIDC deploy role of the deployment environment |
| `BITBUCKET_STEP_OIDC_TOKEN` | `env` | Set by Bitbucket with `oidc: true` |
| `BITBUCKET_REPO_SLUG`, `BITBUCKET_BUILD_NUMBER` | both | Role session name and event data |
| `DEVOPS_ACCOUNT_ID` or `DEVOPS_ACCOUNT_ID_<BETA\|QA\|PROD>` | `publish-deployed` | The Devops account of the topic |
| `AWS_ROLE_ARN` | `publish-deployed` | Exported by `env`. Sets the `oidc` authMethod |
| `SERVICE_CODE`, `BITBUCKET_BRANCH`, `BITBUCKET_COMMIT`, `BITBUCKET_PIPELINE_UUID` | `publish-deployed` | Event data. Unset variables are sent as empty strings |

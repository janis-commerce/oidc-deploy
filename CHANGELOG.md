# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `oidc-deploy env` command to print the web identity exports of the OIDC deploy role, with a temporary static keys fallback for prod
- `oidc-deploy publish-deployed` command to publish the `serviceDeployed` event to Devops

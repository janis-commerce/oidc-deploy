---
description: Por qué los repos con script de deploy propio usan un package npm y no shared pipelines, por qué asume el rol vía web identity del SDK, por qué exige Node ≥ 20 y por qué no decide nada por ambiente.
---

# Decisiones de diseño de `@janiscommerce/oidc-deploy`

Audiencia: Claude / devs. Lo que no se deduce del código ni del README.

## Package npm, no shared pipelines

Los repos que deployan sin el pipe `ci-cd-back` tienen stages y steps distintos entre sí. Las shared pipelines de Bitbucket no importan steps sueltos, así que no cubren ese caso. Un CLI por `npx` entra en cualquier step con Node.

Copiar el bloque de canje en cada yml se descartó: es deuda que nadie mantiene.

## Web identity del SDK, no canje con la CLI

`env` escribe el token a un archivo y exporta `AWS_ROLE_ARN` + `AWS_WEB_IDENTITY_TOKEN_FILE`. El SDK, la CLI y Serverless asumen el rol solos. No hace falta `aws-cli` ni `curl` en la imagen: anda en `node:*-alpine`. El pipe `ci-cd-back`, en cambio, hace el canje con la CLI porque la tiene en su imagen.

## Node ≥ 20 y nada más

Es el mínimo del AWS SDK v3. Se descartó soportar Node 16/18 y un `oidc-deploy.sh` para steps sin Node. Un repo con un step sin Node (por ejemplo, python) usa ahí el bloque de web identity inline, y el `publish-deployed` va en un step final con `node:22-alpine`.

## No decide por ambiente

El package no sabe qué ambientes de un repo siguen con claves. Si un ambiente sigue con claves, ese step no llama a `env`. No hay fallback a claves ni rama especial para prod: un step que llama a `env` sin `deployment:`, sin `oidc: true` o sin `AWS_DEPLOY_ROLE_ARN` publicado falla.

## Antes del primer `publish-deployed`

El primer evento `oidc` borra las claves del deployment environment, no de la branch. Revisar también las otras branches del repo que usan el mismo `deployment:` (ver `janis-devops-service/docs/internal/oidc-deploy-role.md` §Consumidores que devops no ve).

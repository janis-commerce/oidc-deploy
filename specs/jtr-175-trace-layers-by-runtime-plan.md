# Plan: Layer trace: distribución por runtime

> Spec: `specs/jtr-175-trace-layers-by-runtime.md` · Branch: `JTR-175-trace-layers-by-runtime` en los 5 repos · Ticket: [JTR-175](https://janiscommerce.atlassian.net/browse/JTR-175)

Un batch por repo, en serie. El orden sigue el orden de salida: primero lo que no tiene efecto sin la layer nueva.

## 1. oidc-deploy

- [x] `lib/publish-deployed.js`: sumar `service` y `repository` a `MessageAttributes`, solo si no están vacíos.
- [x] `tests/publish-deployed.js`: casos con y sin `SERVICE_CODE` y `BITBUCKET_REPO_SLUG`.
- [x] `README.md`: sección `publish-deployed`.
- Verificación: `npm test` y `npm run lint`.

## 2. janis-ci-cd-service

- [x] `pipe/pipe.sh`: `unset JANIS_TRACE_LAYERS` con `USES_TRACE_LAYER=false`. Debug: informar si está seteada, sin el valor.
- [x] `pipe/pipe-steps/publish-service-deployed.sh`: attributes `service` y `repository`, con el mismo patrón condicional que `architecture` y `runtime`.
- [x] `README.md`: fila de `JANIS_TRACE_LAYERS`. `docs/internal/` donde se describe el evento.
- Verificación: `bash -n` y correr el bloque `jq` de attributes con y sin valores.

## 3. janis-devops-service

- [ ] `infra/cross-account-roles/devops-service-remote-role.yml`: `lambda:ListLayers`.
- [ ] `src/lib/aws/lambda.js`: `listLayers` con paginación por `Marker`.
- [ ] `src/helpers/trace-layers.js`: cuenta `Trace` desde `Account`, assume role, filtro `trace-node`, mapa por runtime, conflicto de runtime, merge de `JANIS_TRACE_LAYERS` como string JSON en `/shared/<env>/ci-cd`.
- [ ] Cola `syncTraceLayers` (`serverless/queues/service/`) con `filterPolicy: { repository: ['janis-trace-lambda-layer'] }` y su consumer.
- [ ] Endpoint de resincronización, con su serverless y su schema.
- [ ] Tests: lib, helper, consumer, endpoint y hooks de la cola.
- [ ] `docs/internal/trace-layers.md`, `INDEX.md` y `logging-core-shielding.md`.
- Verificación: `npm test` y `npm run lint`.

## 4. sls-helper-plugin-janis

- [ ] `lib/utils/trace-layer.js`: leer y validar `JANIS_TRACE_LAYERS`. Sin fallback a `JANIS_TRACE_EXTENSION_VERSION` ni `TRACE_ACCOUNT_ID`.
- [ ] `lib/service/base.js`: `custom.janisTraceLayers`, layer con `${param:runtime}` o con el ARN de `nodejs22.x`, validación del runtime declarado.
- [ ] `lib/utils/parse-function-layers.js`: `skipTraceLayer` con el ARN nuevo.
- [ ] Tests en `tests/unit/hooks/base.js` y `tests/unit/hooks/api-base.js`.
- [ ] Verificar con `sls print` en un service de prueba que `${self:custom.janisTraceLayers.${param:runtime}}` resuelve una clave con punto.
- [ ] `README.md`: sección "Trace Lambda Layer".
- Verificación: `npm test` y `npm run lint`.

## 5. janis-trace-lambda-layer

- [ ] `lines/node18/` y `lines/node20/`: `package.json` y lock. `overrides` de `@aws-sdk` por debajo de 3.970 en la línea Node 18.
- [ ] `scripts/build-layers.sh`: arma `build/trace/` y `build/trace-node20/`.
- [ ] `serverless.yml`: layers `trace` y `traceNode20`.
- [ ] `package.json`, `.gitignore` y `bitbucket-pipelines.yml`.
- [ ] Tests contra las dos líneas.
- [ ] `README.md`.
- Verificación: `npm test`, `npm run lint` y contenido de cada `build/`.

## Salida (después del desarrollo)

1. Release de oidc-deploy (minor) y de ci-cd v3.
2. devops en beta, QA y prod: rol remoto y después el consumer. Sin `trace-node20` no tiene efecto.
3. Layer a beta. Validación en beta con un service de prueba que use el plugin desde la branch.
4. Layer a QA y prod. Verificar `JANIS_TRACE_LAYERS` en cada ambiente.
5. Release del plugin, después de JCN-562. Requiere los pasos 1 a 4 en los tres ambientes: antes, un service que actualice el plugin deployaría sin layer trace.

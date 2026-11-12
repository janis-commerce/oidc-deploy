# Layer trace: distribución por runtime con la última versión de cada línea

> Repos: `services/janis-trace-lambda-layer` · `packages/oidc-deploy` · `services/janis-devops-service` · `services/janis-ci-cd-service` · `packages/sls-helper-plugin-janis` · Branch: `JTR-175-trace-layers-by-runtime` · Ticket: [JTR-175](https://janiscommerce.atlassian.net/browse/JTR-175)
> Estado: aprobado · Creado: 2026-11-12

## Objetivo

Cada service con `sls-helper-plugin-janis` 11 toma, al deployar, la última versión de la layer trace compatible con su runtime. Publicar una versión nueva de la layer actualiza el mapa sin intervención manual. Los repos en Node 18 siguen con la layer `trace` sin cambios.

## Contexto

- Hoy la versión de la layer es un número en `/shared/<env>/ci-cd` (`JANIS_TRACE_EXTENSION_VERSION` y `_NEW`). Lo bumpea devops a mano. Las dos líneas (Node 18 y Node 22) publican a la misma layer `trace`, con números intercalados.
- La API de Lambda exige un ARN versionado: no hay alias ni `latest` para layers.
- JTR-169 (Node 24 y 26, express reemplazado por `node:http`, dependencias actualizadas) no se publica sola. Esta branch parte de la suya y se valida todo junto en beta.
- JCN-562 suma el parámetro `runtime` a `janis.base` (`nodejs22.x`, `nodejs24.x`, `nodejs26.x`). Hoy el plugin conoce el runtime solo a nivel `provider`: no existe runtime por función.

## Alcance

✅ Incluye:

**janis-trace-lambda-layer**
- `master` publica dos líneas en el stack actual, con el mismo código de `src/`:
  - `trace`: línea Node 18 (`compatibleRuntimes` 14.x y 18.x), con `@janiscommerce/log` 5.1.x y `@aws-sdk` fijado por debajo de 3.970 con `overrides`.
  - `trace-node20`: línea Node 20 a 26, con las dependencias de JTR-169.
- `package.json` y lock por línea en `lines/<línea>/`. Un script arma `build/<layer>/` por línea: copia `src/` e instala las dependencias de producción de esa línea.
- Los tests corren contra cada línea.
- El pipeline arma las dos líneas antes del deploy.

**@janiscommerce/oidc-deploy**
- `publish-deployed` manda `service` y `repository` como message attributes, solo si no están vacíos.

**janis-devops-service**
- Cola `syncTraceLayers` suscripta a `serviceDeployed` con `filterPolicy: { repository: ['janis-trace-lambda-layer'] }`.
- Consumer que asume `JanisDevOpsServiceRemote` en la cuenta `Trace` del ambiente, lista las layers y mergea `JANIS_TRACE_LAYERS` en `/shared/<env>/ci-cd`.
- Endpoint de admin para resincronizar a mano, con la misma lógica que el consumer.
- `lambda:ListLayers` en el rol `JanisDevOpsServiceRemote`.

**janis-ci-cd-service (v3)**
- `USES_TRACE_LAYER=false` hace `unset` también de `JANIS_TRACE_LAYERS`.
- `publish-service-deployed.sh` manda `service` y `repository` como message attributes, solo si no están vacíos.
- Debug: informar si `JANIS_TRACE_LAYERS` está seteada, sin imprimir el valor.

**sls-helper-plugin-janis (11)**
- Con `JANIS_TRACE_LAYERS` y `TRACE_ACCOUNT_ID`, la layer trace es el ARN del runtime del service en cada stage.
- Sin `JANIS_TRACE_LAYERS`, se mantiene la construcción actual (`trace:${JANIS_TRACE_EXTENSION_VERSION}`).

❌ NO incluye:
- Repos en Node 18: siguen tomando `trace` con `JANIS_TRACE_EXTENSION_VERSION`, que devops bumpea a mano.
- Archivar `master-node18`, `beta-node18`, `QA-node18` y los tags `release-node18-*`. Se hace aparte, después de validar `trace` desde `master` en prod.
- Sumar `trace` al mapa `JANIS_TRACE_LAYERS`.
- Runtime por función en el plugin.
- Borrar el override de `JANIS_TRACE_EXTENSION_VERSION_NEW` en ci-cd v3, ni dejar de exportar `JANIS_TRACE_EXTENSION_VERSION`.
- Cambios en `check-compatibility-errors/trace-layer.js`: sigue validando contra `JANIS_TRACE_EXTENSION_VERSION`.
- Cambios en la pantalla de Views del parámetro de ci-cd.

## Criterios de aceptación

**Layer**
- [ ] Un deploy de `master` a beta publica una versión de `trace-node20` con `compatibleRuntimes` 20.x, 22.x, 24.x y 26.x.
- [ ] El mismo deploy publica una versión de `trace` con `compatibleRuntimes` 14.x y 18.x.
- [ ] El zip de `trace` trae `@janiscommerce/log` 5.1.x y `@aws-sdk` por debajo de 3.970. El de `trace-node20` trae las versiones de JTR-169.
- [ ] La descripción de cada layer dice su rango de Node y la versión de `@janiscommerce/log` que trae.
- [ ] `npm test` corre la suite contra las dos líneas.
- [ ] Una función `nodejs18.x` con la versión nueva de `trace` registra la extension, manda logs a trace y hace flush en `/end` y en SHUTDOWN.

**oidc-deploy y ci-cd**
- [ ] El evento `serviceDeployed` del deploy de la layer trae los attributes `authMethod` y `repository`.
- [ ] Un deploy con ci-cd v3 manda `service` y `repository` como attributes, además de los actuales.
- [ ] Si `SERVICE_CODE` o `BITBUCKET_REPO_SLUG` están vacíos, el evento se publica sin ese attribute.
- [ ] Con `USES_TRACE_LAYER=false`, ni `JANIS_TRACE_EXTENSION_VERSION` ni `JANIS_TRACE_LAYERS` llegan al deploy.

**devops**
- [ ] Después del deploy de la layer, `JANIS_TRACE_LAYERS` en `/shared/beta/ci-cd` tiene una entrada por runtime con el ARN de la última versión de `trace-node20`.
- [ ] `JANIS_TRACE_LAYERS` se guarda como string JSON. El resto de las claves del parámetro queda igual.
- [ ] Un `serviceDeployed` de otro repository no dispara la cola.
- [ ] Si dos layers `trace-node*` declaran el mismo runtime, el parámetro no cambia, se loguea el conflicto y el mensaje no se reintenta.
- [ ] Si falla `ListLayers` o la escritura del parámetro, el mensaje vuelve a la cola.
- [ ] El endpoint de resincronización deja el mismo mapa que el consumer.
- [ ] Ni el consumer ni el endpoint loguean el valor del parámetro.

**Plugin**
- [ ] Con `JANIS_TRACE_LAYERS` seteada, un service `nodejs26.x` deploya con el ARN de la entrada `nodejs26.x`.
- [ ] Un service `nodejs22.x` con `params.beta.runtime: 'nodejs26.x'` deploya en beta con el ARN de `nodejs26.x` y en QA con el de `nodejs22.x`.
- [ ] Un service sin parámetro `runtime` deploya con el ARN de `nodejs22.x`.
- [ ] Si el runtime declarado en `janis.base` no está en el mapa, el deploy falla con un mensaje que nombra el runtime y los runtimes disponibles.
- [ ] Si el runtime de un stage no está en el mapa, el deploy de ese stage falla (error de resolución de Serverless).
- [ ] Si `JANIS_TRACE_LAYERS` no es JSON válido, el deploy falla con un mensaje claro.
- [ ] Sin `JANIS_TRACE_LAYERS`, la configuración generada queda igual que hoy.
- [ ] `skipTraceLayer` sigue sacando la layer trace también cuando el ARN sale del mapa.

**Validación en beta**
- [ ] Una función `nodejs26.x` y una `nodejs22.x` con `trace-node20` registran la extension, mandan logs a trace y hacen flush en `/end` y en SHUTDOWN.
- [ ] `Init Duration` comparado contra la versión actual de `trace`.
- [ ] Un service con `JANIS_TRACE_LAYERS` como variable del repo usa ese valor en vez del del parámetro (rollback por repo).

## Plan de archivos

**janis-trace-lambda-layer**
- `lines/node18/package.json` y lock (nuevos): línea `trace`.
- `lines/node20/package.json` y lock (nuevos): línea `trace-node20`. Reemplazan a `src/trace-extension/package.json` y su lock.
- `scripts/build-layers.sh` (nuevo): arma `build/trace/` y `build/trace-node20/`.
- `serverless.yml` (edit): layers `trace` y `traceNode20` (`name: trace-node20`), cada una con su `path` en `build/`.
- `package.json` (edit): `postinstall` y `test` por línea.
- `bitbucket-pipelines.yml` (edit): build de las líneas antes de lint, tests y deploy.
- `tests/resources/log-stub.js` y `tests/trace-extension/index.js` (edit): `@janiscommerce/log` y el código de la línea bajo test.
- `.gitignore` (edit): `build/`.
- `README.md` (edit): líneas, build y publicación.

**oidc-deploy**
- `lib/publish-deployed.js` (edit): attributes `service` y `repository`.
- `tests/publish-deployed.js` (edit).
- `README.md` (edit): sección `publish-deployed`.

**janis-devops-service**
- `serverless/queues/service/sync-trace-layers.js` (nuevo) y `serverless/queues/service/index.js` (edit).
- `src/sqs-consumer/service/sync-trace-layers-consumer.js` (nuevo).
- `src/helpers/trace-layers.js` (nuevo): lista las layers, arma el mapa y mergea el parámetro. Lo usan el consumer y el endpoint.
- `src/lib/aws/lambda.js` (edit): `listLayers` con paginación por `Marker`.
- `src/api/trace-layers/sync/post.js` (nuevo), `serverless/trace-layers.json` (nuevo), `schemas/src/public/api/...` (nuevo).
- `infra/cross-account-roles/devops-service-remote-role.yml` (edit): `lambda:ListLayers`.
- Tests: consumer, helper, `listLayers`, endpoint y hooks de la cola.
- `docs/internal/trace-layers.md` (nuevo), `INDEX.md` y `logging-core-shielding.md` (edit).

**janis-ci-cd-service**
- `pipe/pipe.sh` (edit): `unset` y debug.
- `pipe/pipe-steps/publish-service-deployed.sh` (edit): attributes.
- `README.md` (edit): variable `JANIS_TRACE_LAYERS`. `docs/internal/` (edit) si aplica.

**sls-helper-plugin-janis**
- `lib/utils/trace-layer.js` (edit): resolución por runtime.
- `lib/service/base.js` (edit): `custom.janisTraceLayers`, layer con `${param:runtime}` y validación del runtime declarado.
- `lib/utils/parse-function-layers.js` (edit) si el ARN deja de ser constante.
- `tests/unit/hooks/base.js` y `tests/unit/hooks/api-base.js` (edit).
- `README.md` (edit): sección "Trace Lambda Layer".

## Decisiones

- **Las dos líneas salen de `master`, en el stack actual.** `master-node18` deja de deployar: si siguiera, cada deploy de una branch sacaría del template la layer de la otra. El código de `src/` es el mismo para las dos líneas: solo cambian las dependencias. La API de `@janiscommerce/log` que usa la extension (`sendToTrace`) existe en 5.1.5.
- **`trace` queda fuera del mapa.** La última versión de `trace` declara `nodejs20.x` y `nodejs22.x` (la línea Node 22 publicada desde `master` hasta hoy). Sumarla chocaría con `trace-node20` hasta publicar la primera versión Node 18. El consumer filtra por prefijo `trace-node`.
- **`JANIS_TRACE_LAYERS` como string JSON.** La pantalla del parámetro edita `data` con `ObjectCreator`, clave contra valor. Un objeto anidado se rompería al editarlo. `pipe.sh` exporta el string tal cual.
- **Mapa por runtime, no por nombre de layer.** El plugin no sabe nada de nombres, cuentas ni versiones.
- **El consumer arma el mapa con `ListLayers`** (`LatestMatchingVersion`), filtrando por prefijo `trace-node`. Rollback global: borrar la versión con `DeleteLayerVersion` y resincronizar.
- **La cuenta de trace sale del modelo `Account`** (`name: 'Trace'`), igual que `PublishWorkspaceVariables`.
- **Attributes en los dos publishers.** El filtro de la cola usa el attribute `repository`. La layer deploya con oidc-deploy, así que oidc-deploy sale antes que la layer.
- **La branch del plugin parte de `JCN-562-runtime-parameter`**: usa el parámetro `runtime`.
- **El plugin resuelve la layer en el deploy con variables de Serverless.** Un service puede pisar `runtime` por stage con `params.<stage>.runtime`, y `provider.runtime` queda `${param:runtime}`. La layer se declara como `${self:custom.janisTraceLayers.${param:runtime}}`, así cada stage toma la layer de su runtime real. El plugin carga el mapa en `custom.janisTraceLayers` con una forma que resuelva claves con punto (`nodejs26.x`). Sin parámetro `runtime`, usa el ARN de `nodejs22.x` directo. Además, valida antes el runtime declarado en `janis.base` contra el mapa, para dar un error claro en el caso común.

## Abiertas

—

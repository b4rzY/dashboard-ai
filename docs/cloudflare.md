# Cloudflare Workers + Neon PostgreSQL

El dashboard completo se despliega con OpenNext, incluyendo login, APIs y sincronización. El HTML estático es una captura independiente.

## Configuración

- Repositorio: `b4rzY/dashboard-ai`, rama `main`, raíz `/`.
- Worker: `dashboard-ai`, cuenta `7f5fef68042d3f953dbd43101b6211ab`.
- Build command en Workers Builds: `npm run cloudflare:build`.
- Deploy command: `npm run cloudflare:deploy`.
- Node: 24, instalar dependencias de desarrollo durante el build.
- URL prevista: `https://dashboard-ai.gbozzo.workers.dev`.

Las variables públicas de configuración están en `wrangler.jsonc`: `APP_URL`, `DEMO_MODE=false` y `CLOUDFLARE_WORKER=true`. Cambia `APP_URL` al agregar un dominio y verifica que coincida con el origen del login. No habilites previews con el mismo origen/base de producción.

Guarda en Secrets del Worker: `DATABASE_URL` (URL pooled de Neon con TLS), `CRON_SECRET` (aleatorio, al menos 32 caracteres), `FINTOC_SECRET_KEY`, `CREDENTIAL_ENCRYPTION_KEY` (32 bytes codificados en base64), los `FINTOC_LINK_*` completos y `FINTOC_WEBHOOK_SECRET`. La API Fintoc siempre se consulta en el servidor. Los administradores pueden reemplazar un link token desde Conexiones; el valor se cifra en PostgreSQL y nunca vuelve al navegador. Sin credenciales Fintoc el dashboard muestra conexiones pendientes y cero cuentas/movimientos reales.

Opcionalmente crea Hyperdrive con la URL directa de Neon, desactiva query caching para evitar saldos o sesiones obsoletos y agrega el binding `HYPERDRIVE` a `wrangler.jsonc`. Su `connectionString` tiene prioridad sobre `DATABASE_URL` para el Worker. Las migraciones administrativas siguen usando una URL real de Neon, no la URL interna de Hyperdrive.

## Inicializar una base nueva

En un entorno administrativo carga las variables privadas de Neon, `DEMO_MODE=false`, `ADMIN_EMAIL` y un `ADMIN_PASSWORD` aleatorio de al menos 14 caracteres. No pases secretos como argumentos de shell ni los guardes en Git.

```sh
npm run db:migrate
npm run db:bootstrap
```

Bootstrap registra el holding, 10 empresas, 13 conexiones y crea el administrador si no existe. No cambia contraseñas existentes ni inserta movimientos demo. `ADMIN_PASSWORD` solo se necesita en la inicialización: no se configura en el Worker. Configura el webhook de Fintoc en `/api/webhooks/fintoc`.

## Compilar, probar y publicar

```sh
npm run cloudflare:build
npm run cloudflare:preview
npm run cloudflare:deploy
```

Para preview local usa un `.dev.vars` ignorado por Git con una base local separada, `APP_URL=http://localhost:8787`, `CLOUDFLARE_WORKER=true`, `DEMO_MODE=false` y `CRON_SECRET`. `cloudflare-clean.mjs` elimina los valores copiados por OpenNext desde `.env*` y comprueba que el bundle no contenga credenciales locales. No publiques mediante un comando que omita esta comprobación.

El adaptador PostgreSQL usa el motor JavaScript de Prisma y conexiones por solicitud/evento. Conserva la conexión hasta terminar un response stream y luego la cierra. Las pruebas de integración comprueban aislamiento entre transacciones concurrentes. Los cron triggers llaman internamente a `/api/cron` cada cuatro horas y `/api/jobs` cada diez minutos con autorización; no publican secretos ni usan peticiones externas al propio sitio.

Workers Builds queda conectado cuando la cuenta autoriza GitHub y selecciona el repositorio. La configuración en Git no crea por sí sola el proyecto remoto ni una base Neon. La puesta en producción se confirma únicamente después de comprobar el deploy remoto y el login contra Neon.

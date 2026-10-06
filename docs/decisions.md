# Decisiones y límites

- Repositorio inicial vacío. Se conserva el stack solicitado: Next.js y PostgreSQL, compatible con Vercel. No se usa hosting estático para datos privados.
- La lista e imagen incluyen 10 empresas y 13 conexiones identificables. Bootstrap representa esa referencia; demo aislada usa 9 empresas y 24 cuentas. RUT y nombres jurídicos requieren confirmación de Finanzas.
- Sesiones internas administradas en PostgreSQL permiten revocación inmediata. No se implementa auto-registro. El administrador inicial y la creación de usuarios se manejan por scripts del servidor.
- Todos los saldos son actuales; el período delimita movimientos y evolución. La vista de cuenta conserva su moneda y scope. Las monedas se consolidan por separado.
- Movimientos usan fecha contable (`postingDate`) en reportes y filtros, y conservan también fecha de operación. Las fechas contables se interpretan como fecha bancaria UTC; la hora de sincronización se presenta en America/Santiago. SQL castea límites explícitamente a timestamp UTC para evitar desplazamientos por zona horaria del servidor.
- La comparación de caja exige snapshots completos al inicio. No hay interpolación ni porcentajes fabricados. Las cuentas removidas conservan su historia, pero no aportan caja actual.
- Sync es atómica por conexión: un fallo de cualquier cuenta conserva el estado financiero anterior. Un lease con token evita sobrescrituras de workers vencidos. Se registran fallos sin secretos. En cada job se valida la institución para impedir asignación accidental a otro banco.
- Tokens Fintoc en variables de entorno, referenciados por nombre desde DB. El servidor debe proteger acceso administrativo a estas variables. No existe UI para pegar credenciales.
- Webhooks encolan trabajos durables, sin guardar el payload sensible ni llamar Fintoc antes de responder. El worker recurrente procesa y reintenta. Primer sync guarda el ID del link para correlacionar eventos.
- Los reportes son por holding autenticado. Categorías aparecen en filtros, pero la edición y reglas de categorización son una próxima iteración.
- Se preparan entidades ERP y reglas de alertas sin simular resultados de Odoo, forecast o automatizaciones inexistentes. Importador MANUAL para Global66 queda como extensión de BankingProvider.
- No se afirma conexión real verificada sin API key y tokens completos. Tampoco se afirma despliegue Vercel por publicar GitHub.
- Operación real requiere primer sync cotejado, scheduler compatible, TLS y backups PostgreSQL. El tiempo/volumen de backfill varía por banco; para historiales grandes puede limitarse `FINTOC_HISTORY_SINCE` y ampliarse con un worker dedicado.
- La exportación transmite en lotes y congela la fecha de creación de registros, aunque un movimiento podría modificarse mientras se exporta. Para exports contables auditables conviene materializar un reporte con snapshot transaccional y retención propia en una siguiente iteración.

# Contrato Fintoc verificado

Revisado el 6 de octubre de 2026 sobre la documentación oficial. Se utiliza el producto **Movements API**, separado de Business Accounts API v2.

| Operación                  | Endpoint / origen                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descubrir links            | `GET https://api.fintoc.com/v1/links`, `per_page`, `page`                                                                                         |
| Obtener conexión y cuentas | `GET https://api.fintoc.com/v1/links/{link_token}`                                                                                                |
| Institución y balances     | Objetos `institution` y `accounts[].balance` del Link                                                                                             |
| Movimientos                | `GET https://api.fintoc.com/v1/accounts/{id}/movements` con `link_token`, `since`, `until`, `updated_since`, `per_page`, `page`, `confirmed_only` |
| Auth                       | Header `Authorization` con la API key secreta                                                                                                     |
| Firma webhook              | `Fintoc-Signature: t=timestamp,v1=hex`; HMAC SHA-256 de `timestamp.rawBody`                                                                       |

La lista de links devuelve `accounts` y `link_token` nulos: no sirve para recuperar credenciales perdidas. Las cuentas y balances se leen desde el Link individual. `per_page` admite hasta 300 movimientos y `page` comienza en 1. Importes negativos corresponden a egresos; CLP no tiene fracción. La firma se compara en tiempo constante y se rechazan timestamps fuera de 5 minutos.

Fuentes oficiales:

- [Bienvenida Fintoc](https://docs.fintoc.com/es/guides/home/welcome)
- [Listado de links](https://docs.fintoc.com/api/movements-api/links/links-list)
- [Link y cuentas](https://docs.fintoc.com/api/movements-api/links/link-object)
- [Get Link](https://docs.fintoc.com/reference/links-retrieve)
- [Objeto Account](https://docs.fintoc.com/api/movements-api/accounts/accounts-object)
- [Listado de movimientos](https://docs.fintoc.com/api/movements-api/movements/movements-list)
- [Objeto Movement](https://docs.fintoc.com/api/movements-api/movements/movements-object)
- [Validación de firmas](https://docs.fintoc.com/guides/resources/webhooks-walkthrough/webhooks-validating)
- [Eventos de cambios en movimientos](https://docs.fintoc.com/changelog/webhook-de-cambios-en-los-movimientos)

El adaptador no ejecuta transferencias, pagos ni refresh intents bajo demanda. El único tráfico externo de datos va al origen fijo `api.fintoc.com`; no se siguen links de paginación remotos ni se admite una base URL desde input del usuario. Los errores de validación del proveedor no persisten el payload remoto.

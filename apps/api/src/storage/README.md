# storage

Subida de media de tickets a un bucket S3-compatible (MinIO en dev) — RF-B09.

## Por qué se sube antes de crear el ticket

Las URLs de media del proveedor (Meta, Telegram) expiran en minutos, y el ticket
puede crearse en **otro request** —el de la confirmación de RF-B06—. El único
momento en que los bytes existen es cuando llega el mensaje, así que se sube ahí
y en la sesión del bot viaja solo la referencia, no los megabytes.

## Deuda conocida, con dueño

**1. `storage_url` no puede exponerse sin URL firmada.**
El servicio guarda la URL cruda del bucket, sin presigning ni expiración. Hoy
**ningún endpoint devuelve ese campo** —verificado sobre `me/`, `tickets/` y
`conducta/`— así que no hay camino de fuga por la API. Pero el diseño es público
por construcción.

> **Regla:** el primer endpoint que devuelva `storage_url` tiene como
> prerrequisito bloqueante las URLs firmadas más un endpoint que medie el
> acceso. No es un ítem suelto de backlog: sin eso, la foto del interior de la
> casa de un residente queda accesible a cualquiera con el link.

El bucket de dev ya se creó con `mc anonymous set none` para que el entorno
enseñe el hábito correcto.

**2. Objetos huérfanos.**
La media se sube antes de la confirmación, así que queda sin fila en `media`
cuando el residente responde "no", cuando la sesión expira (15 min) o cuando el
estado de sesión se corrompe. Al corregir el texto **sí** se arrastra.

Un objeto sin fila en `media` es invisible para el sistema: ningún barrido que
recorra la tabla lo va a encontrar, así que no hay forma de borrarlo. Si mañana
alguien ejerce su derecho de supresión, los huérfanos quedan.

**Cierre pendiente:** subir a un prefijo `pendiente/` con una regla de lifecycle
de 24 h y mover al prefijo definitivo al asociar. No requiere presigning y es la
opción más barata de las dos evaluadas (la otra era insertar la fila con
`ticket_id` NULL, que hoy es NOT NULL y necesitaría migración).

# GoCafe Frontend

Primer prototipo del sistema de producción de GoCafe.

## Requisitos
- Node.js 20 o superior
- VS Code

## Ejecutar
```bash
npm install
npm run dev
```

Abre la URL que Vite muestre en la terminal (normalmente http://localhost:5173).

## Qué incluye
- Dashboard administrativo
- Menú lateral preparado para módulos futuros
- Clientes
- Nueva orden de trabajo
- Flujo Pergamino/Natural
- Trillado o Limpieza según tipo de café
- Distribución de tuestes con máximo 15 lb
- Campos del control de tueste de la hoja física
- Cálculo de bolsas de 350 g y merma
- Resumen previo a facturación

El backend, PostgreSQL, PDF, QR y empaquetado como aplicación de escritorio se harán en fases posteriores.

## Fase 1.1 - correcciones de validación
- Preparación no permite avanzar si el peso supera al peso inicial.
- Un tueste mayor a 15 lb no descuenta el pendiente ni permite agregar otro tueste.
- Un tueste no puede superar las libras pendientes; al llegar a 0 lb ya no se agregan más tuestes.
- Empaque permite registrar el resultado real, incluyendo bolsas completas y una bolsa incompleta.
- Las bolsas completas se pueden distribuir entre varios tipos de empaque y la bolsa incompleta puede asignarse a un tipo específico.


## Cambios Fase 1.2

- Flujo Natural corregido: Recepción → Limpieza → Trillado → Tuestes.
- Logo oficial integrado en el menú lateral sobre fondo blanco circular.
- Teléfono limitado a 8 dígitos y mostrado en formato 4-4.
- Número de orden generado automáticamente en el frontend.
- Se mantienen las validaciones de pesos, tuestes y distribución de empaques de la Fase 1.1.

> Nota: el número de orden actual se genera localmente con fecha y hora. Cuando se conecte PostgreSQL, se reemplazará por un consecutivo persistente de base de datos.

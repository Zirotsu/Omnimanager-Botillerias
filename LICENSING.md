# Licenciamiento comercial de OmniManager Botillerías

OmniManager valida licencias comerciales offline mediante firmas Ed25519.

## Regla de seguridad

- `build/license-public-key.pem` es pública y se empaqueta dentro del ejecutable.
- `license-private-key.pem` es secreta. **Nunca debe subirse a GitHub, enviarse al cliente ni incluirse dentro del instalador.**
- Si la llave privada se pierde, las instalaciones existentes seguirán validando sus licencias ya emitidas, pero no será posible emitir nuevas licencias compatibles con esta clave pública.

## Emitir una licencia

El cliente entrega el código de su PC mostrado en la pantalla de licencia, por ejemplo `OMB-0123456789AB`.

Desde una copia administrativa del repositorio:

```bash
npm run license:issue -- --private-key /ruta/segura/license-private-key.pem --machine OMB-0123456789AB --plan monthly --customer "Nombre cliente"
```

Para una licencia anual:

```bash
npm run license:issue -- --private-key /ruta/segura/license-private-key.pem --machine OMB-0123456789AB --plan annual --customer "Nombre cliente"
```

Duraciones predeterminadas:

- `monthly`: 30 días.
- `annual`: 365 días.

Se puede usar `--days N` para una duración especial y `--not-before ISO` para definir una fecha futura de inicio.

El comando devuelve JSON con `licenseId`, vencimiento y `token`. Solo el `token` debe entregarse al cliente para pegarlo en OmniManager.

## Vinculación al equipo

Cada token incluye el `machineId` del PC. Una licencia emitida para un equipo no puede activarse en otro equipo con un código distinto.

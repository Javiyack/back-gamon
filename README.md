# Pip — Backgammon Club

Aplicación web de backgammon responsive, creada como MVP del documento
`SDD_Backgammon_Online.md`.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm test
npm run build
```

## Alcance de esta versión

- Motor puro de reglas: posición inicial, tirada de apertura, movimientos legales,
  uso máximo de dados, dobles, barra, golpes, bear-off, cubo de doblaje y Crawford.
- Partidas contra IA en tres niveles, con tablero interactivo por ratón, táctil y teclado.
- Partidas a 1, 3, 5 o 7 puntos, opción Jacoby y dados generados con Web Crypto.
- Historial y rating estimado guardados localmente, exportación de datos, reglas,
  alto contraste e interfaz en español e inglés.

Esta versión funciona en un solo navegador. El servidor autoritativo, cuentas,
multijugador en tiempo real, matchmaking global y verificación commit–reveal
necesitan los servicios online descritos en el SDD y todavía no están conectados.

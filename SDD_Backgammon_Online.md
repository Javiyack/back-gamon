# Spec-Driven Development (SDD) — Backgammon Online

**Versión:** 1.0 · **Fecha:** 8 de noviembre de 2026 · **Estado:** Borrador para revisión

---

## 1. Visión y objetivos

Construir una plataforma web (responsive, jugable en móvil) de backgammon online que permita partidas 1 contra 1 en tiempo real, partidas contra IA y competición con ranking, respetando las reglas oficiales del backgammon y garantizando dados justos y verificables.

**Objetivos medibles**

| Objetivo | Métrica | Meta |
|---|---|---:|
| Latencia de movimiento | p95 servidor→cliente | < 150 ms |
| Tiempo de emparejamiento | p50 en hora pico | < 20 s |
| Disponibilidad | mensual | 99,5 % |
| Integridad de reglas | movimientos ilegales aceptados | 0 |
| Retención | D7 | ≥ 25 % |

**Fuera de alcance (v1):** apuestas con dinero real, torneos con premios, variantes (Nackgammon, Hypergammon), apps nativas.

---

## 2. Glosario

- **Punto (point):** cada uno de los 24 triángulos del tablero.
- **Barra (bar):** zona central donde van las fichas golpeadas.
- **Blot:** punto con una sola ficha, vulnerable a ser golpeado.
- **Bear-off:** sacar fichas del tablero cuando todas están en el cuadrante propio.
- **Cubo de doblaje:** dado con valores 2–64 que multiplica la apuesta.
- **Gammon / Backgammon:** victoria por 2x / 3x.
- **Match:** serie de partidas a N puntos.
- **Regla Crawford:** en la partida en que un jugador queda a 1 punto de ganar el match, no se permite doblar.

---

## 3. Actores y roles

| Actor | Descripción |
|---|---|
| Invitado | Juega contra IA sin registro; no aparece en ranking |
| Jugador registrado | Juega ranked/casual, tiene perfil, historial y ELO |
| Moderador | Gestiona reportes, silencia o banea usuarios |
| Sistema (motor) | Valida reglas, genera dados, controla relojes |

---

## 4. Requisitos funcionales (con criterios de aceptación)

Formato: **ID — Historia** seguido de criterios en Gherkin.

### 4.1 Cuenta y perfil

**RF-01 — Registro e inicio de sesión.** Como jugador quiero crear cuenta con email/contraseña o Google para guardar mi progreso.
```gherkin
Escenario: Registro exitoso
  Dado un email no registrado y una contraseña de ≥ 8 caracteres
  Cuando envío el formulario de registro
  Entonces se crea la cuenta con ELO inicial 1500
  Y quedo autenticado
```

**RF-02 — Perfil.** Alias único (3–20 caracteres), avatar, país, estadísticas (partidas, % victorias, gammons, ELO, historial).

### 4.2 Motor de reglas

**RF-10 — Posición inicial.** Cada jugador: 2 fichas en su punto 24, 5 en el 13, 3 en el 8 y 5 en el 6.

**RF-11 — Tirada inicial.** Cada jugador tira un dado; el mayor empieza usando ambos valores. Empate → se repite.

**RF-12 — Movimiento legal.** El motor genera la lista completa de jugadas legales para cada tirada y rechaza cualquier otra.
```gherkin
Escenario: Uso obligatorio de ambos dados
  Dado que es posible usar ambos dados
  Cuando el jugador intenta jugar solo uno
  Entonces la jugada se rechaza con error ILLEGAL_MOVE

Escenario: Solo un dado utilizable
  Dado que solo puede usarse uno de los dos dados
  Y ambos son utilizables por separado
  Entonces el jugador debe usar el de mayor valor
```

**RF-13 — Dobles.** Una tirada doble otorga 4 movimientos del valor.

**RF-14 — Barra.** Con fichas en la barra, el jugador debe reingresarlas antes de cualquier otro movimiento; si no puede, pierde el turno automáticamente.

**RF-15 — Golpe.** Caer en un blot rival envía esa ficha a la barra. No se puede caer en puntos con ≥ 2 fichas rivales.

**RF-16 — Bear-off.** Solo con las 15 fichas en el cuadrante propio. Se permite usar un dado mayor que la distancia si no hay fichas en puntos más altos.

**RF-17 — Sin movimientos.** Si no existe jugada legal, el turno pasa automáticamente tras mostrar la tirada (1,5 s).

**RF-18 — Fin de partida.** Victoria simple (1x), gammon (2x, rival sin fichas sacadas), backgammon (3x, rival sin sacar y con ficha en barra o cuadrante del ganador). Multiplicado por el cubo.

### 4.3 Cubo de doblaje

**RF-20 — Doblar.** Antes de tirar, el jugador con acceso al cubo puede ofrecer doblar. El rival acepta (toma el cubo, valor x2) o rechaza (pierde al valor actual).

**RF-21 — Crawford.** Respetar regla Crawford en matches; post-Crawford doblar está permitido.

**RF-22 — Opciones.** Reglas Jacoby (partidas sueltas) y beavers configurables al crear partida privada.

### 4.4 Dados justos

**RF-30 — RNG del servidor.** Los dados se generan solo en servidor con CSPRNG.

**RF-31 — Verificabilidad (commit-reveal).** Al iniciar la partida el servidor publica `hash(seed_servidor)`; el cliente aporta `seed_cliente`. Al terminar se revela la semilla y cualquier jugador puede recalcular todas las tiradas.
```gherkin
Escenario: Verificación de dados
  Dada una partida finalizada
  Cuando el jugador abre "Verificar dados"
  Entonces ve seed_servidor, seed_cliente y el hash original
  Y las tiradas recalculadas coinciden con el historial
```

### 4.5 Modos de juego

**RF-40 — Matchmaking ranked.** Cola por ELO (rango inicial ±100, se amplía ±50 cada 10 s, máx ±400). Match a 3, 5 o 7 puntos.

**RF-41 — Casual.** Sin efecto en ELO.

**RF-42 — Partida privada.** Enlace de invitación con configuración (puntos, reloj, Jacoby, beavers).

**RF-43 — Contra IA.** Niveles Principiante, Intermedio, Experto. Disponible para invitados.

**RF-44 — Espectador.** Ver partidas públicas en curso con retardo de 1 turno.

### 4.6 Tiempo y desconexión

**RF-50 — Reloj.** Delay por movimiento (12 s) + banco de tiempo por match (2 min por punto del match). Agotado el banco → pierde el match.

**RF-51 — Reconexión.** Si un jugador se desconecta, su reloj sigue corriendo; puede reconectarse y recuperar el estado exacto. Ausente > 60 s con reloj agotado → derrota.

**RF-52 — Abandono.** Abandonar una partida ranked cuenta como derrota del match y penaliza la cola 5 min tras 3 abandonos en 24 h.

### 4.7 Social y ranking

**RF-60 — Chat en partida** con frases rápidas predefinidas y texto libre filtrado; opción de silenciar.

**RF-61 — Amigos** (añadir, ver en línea, invitar).

**RF-62 — Ranking ELO** global y por país; ajuste K=32 (<30 partidas), K=16 después, ponderado por longitud del match.

**RF-63 — Reportes** de conducta; cola de moderación.

### 4.8 Historial y análisis

**RF-70 — Historial** de partidas con repetición movimiento a movimiento.

**RF-71 — Exportación** en formato estándar de match (.mat / texto GNU Backgammon).

**RF-72 — Análisis post-partida (v2)** con IA: errores marcados y equidad perdida.

---

## 5. Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Rendimiento | p95 de validación de movimiento < 20 ms en servidor |
| RNF-02 | Escalabilidad | 10.000 partidas simultáneas con escalado horizontal |
| RNF-03 | Disponibilidad | 99,5 %; despliegues sin cortar partidas activas |
| RNF-04 | Seguridad | Servidor autoritativo; TLS; contraseñas con Argon2; rate limiting |
| RNF-05 | Anti-trampas | Detección de uso de bots (correlación con IA fuerte > umbral) para revisión manual |
| RNF-06 | Privacidad | Cumplimiento RGPD: exportar y borrar cuenta |
| RNF-07 | Accesibilidad | WCAG 2.1 AA; modo alto contraste; movimientos por teclado |
| RNF-08 | i18n | Español e inglés en v1 |
| RNF-09 | Compatibilidad | Últimas 2 versiones de Chrome, Safari, Firefox, Edge; móvil ≥ 360 px |
| RNF-10 | Observabilidad | Logs estructurados, métricas, trazas; alertas de latencia y errores |

---

## 6. Arquitectura propuesta

```
[Cliente Web (Next.js + Canvas/SVG)]
        │  HTTPS (REST)        │ WebSocket
        ▼                      ▼
   [API Gateway] ──────► [Game Server (autoritativo)]
        │                      │        │
   [Servicio Usuarios]   [Motor de reglas (lib pura)]
   [Servicio Ranking]          │
   [Matchmaking] ◄──► [Redis: colas, estado vivo, pub/sub]
        │
   [PostgreSQL: usuarios, partidas, movimientos, ELO]
   [Worker IA (motor de evaluación/red neuronal)]
```

**Decisiones clave**

1. **Motor de reglas como librería pura y determinista** (`applyMove(state, move) → state`, `legalMoves(state, dice)`), compartida entre servidor (autoridad) y cliente (resaltado de jugadas). Sin efectos secundarios: facilita pruebas por propiedades.
2. **Servidor autoritativo**: el cliente solo envía intenciones; el servidor valida y difunde.
3. **Estado vivo en Redis** con snapshot en PostgreSQL al final de cada turno para tolerar caída de nodo.
4. **Afinidad de partida**: cada partida asignada a un nodo; pub/sub de Redis para espectadores y reconexión entre nodos.

---

## 7. Modelo de datos

```sql
users(id PK, email UNIQUE, alias UNIQUE, password_hash, country, elo INT DEFAULT 1500,
      games_played INT, created_at, banned_until)

matches(id PK, type ENUM('ranked','casual','private','ai'), target_points INT,
        player_white FK users, player_black FK users, ai_level NULL,
        score_white INT, score_black INT, winner FK NULL, status ENUM('waiting','active','finished','aborted'),
        server_seed_hash, server_seed NULL, client_seed, options JSONB,
        started_at, finished_at)

games(id PK, match_id FK, game_number INT, cube_value INT, cube_owner ENUM('white','black','center'),
      is_crawford BOOL, result ENUM('single','gammon','backgammon','dropped'), points INT, winner)

moves(id PK, game_id FK, turn_number INT, player, dice SMALLINT[2],
      action ENUM('move','double','take','drop','pass'), checker_moves JSONB, created_at)

elo_history(id PK, user_id FK, match_id FK, elo_before, elo_after, created_at)
friendships(user_id, friend_id, status, created_at)
reports(id PK, reporter_id, reported_id, match_id, reason, status, created_at)
```

**Estado de juego (en memoria)**
```ts
type GameState = {
  board: number[];        // 24 posiciones, + blancas / − negras
  bar: { white: number; black: number };
  off: { white: number; black: number };
  turn: 'white' | 'black';
  dice: [number, number] | null;
  remainingDice: number[];
  cube: { value: number; owner: 'white' | 'black' | 'center' };
  phase: GamePhase;
  isCrawford: boolean;
};
```

---

## 8. Máquina de estados de la partida

```
WAITING_PLAYERS → OPENING_ROLL → TURN_START
TURN_START ──(puede doblar y dobla)──► DOUBLE_OFFERED
DOUBLE_OFFERED ──take──► TURN_START (cubo x2, dueño = rival)
DOUBLE_OFFERED ──drop──► GAME_OVER
TURN_START ──roll──► MOVING
MOVING ──sin jugadas──► TURN_END
MOVING ──jugada completa confirmada──► TURN_END
TURN_END ──15 fichas fuera──► GAME_OVER ; si no ► TURN_START (cambia turno)
GAME_OVER ──match no terminado──► OPENING_ROLL (siguiente partida)
GAME_OVER ──match terminado──► MATCH_OVER
Cualquier estado ──reloj agotado / abandono──► MATCH_OVER
```

---

## 9. Contratos de API

### 9.1 REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | /api/auth/register | Registro |
| POST | /api/auth/login | Login → JWT |
| GET | /api/users/:id | Perfil y estadísticas |
| POST | /api/matches | Crear partida privada/IA |
| GET | /api/matches/:id | Estado o historial |
| GET | /api/matches/:id/verify | Semillas para verificar dados |
| GET | /api/leaderboard?country= | Ranking |
| POST | /api/reports | Reportar usuario |

### 9.2 WebSocket (`/ws`, autenticado por JWT)

**Cliente → Servidor**
```json
{ "type": "queue.join", "mode": "ranked", "points": 5 }
{ "type": "game.roll", "matchId": "..." }
{ "type": "game.move", "matchId": "...", "moves": [{"from":24,"to":18},{"from":13,"to":10}] }
{ "type": "game.double" } { "type": "game.take" } { "type": "game.drop" }
{ "type": "game.resign", "level": "single|gammon|backgammon" }
{ "type": "chat.send", "text": "gg" }
```

**Servidor → Cliente**
```json
{ "type": "match.found", "matchId": "...", "color": "white", "opponent": {...} }
{ "type": "game.state", "state": GameState, "clocks": {...}, "seq": 42 }
{ "type": "game.dice", "dice": [6,5], "legalMoves": [...] }
{ "type": "game.over", "result": "gammon", "points": 4 }
{ "type": "error", "code": "ILLEGAL_MOVE|NOT_YOUR_TURN|CUBE_NOT_ALLOWED", "message": "..." }
```
Cada mensaje de estado lleva `seq` incremental; el cliente que detecte huecos solicita `game.sync`.

---

## 10. Estrategia de pruebas

| Nivel | Alcance | Herramienta / técnica |
|---|---|---|
| Unitarias | Motor de reglas (cada RF-1x) | Casos de posiciones conocidas |
| Por propiedades | Invariantes: 15 fichas por jugador siempre; nunca dos colores en un punto; jugadas legales usan máximo de dados | Property-based testing con miles de partidas aleatorias |
| Referencia | Comparar `legalMoves` con motor de referencia (GNU Backgammon) en 100.000 posiciones | Diferencial |
| Integración | Flujo WebSocket completo, reconexión, relojes | Tests con clientes simulados |
| Carga | 10.000 partidas simultáneas | k6 / Artillery |
| E2E | Registro → cola → partida → ranking | Playwright |
| Seguridad | Mensajes forjados, replay, flood | Pentest + fuzzing |

**Definición de Hecho:** criterios de aceptación automatizados en verde, cobertura del motor ≥ 95 %, sin regresión de latencia, revisión de código aprobada.

---

## 11. Roadmap

| Fase | Duración | Entregables |
|---|---:|---|
| F0 — Motor | 3 sem | Librería de reglas + tests por propiedades |
| F1 — MVP | 5 sem | Cuentas, partida privada en tiempo real, IA básica, tablero responsive |
| F2 — Competitivo | 4 sem | Matchmaking, ELO, cubo + Crawford, relojes, dados verificables |
| F3 — Social | 3 sem | Amigos, chat, espectadores, reportes/moderación |
| F4 — Avanzado | 4 sem | Análisis post-partida, anti-bots, exportación, torneos sin premio |

---

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Desconfianza en los dados | Alto | Commit-reveal verificable (RF-31) |
| Uso de bots externos | Alto | Análisis estadístico de equidad, revisión manual |
| Errores sutiles de reglas | Alto | Pruebas diferenciales contra motor de referencia |
| Caída de nodo en partida | Medio | Snapshot por turno + reasignación |
| Baja liquidez en cola | Medio | Ampliación de rango ELO y oferta de partida vs IA |

---

## 13. Preguntas abiertas

1. ¿Monetización (suscripción, cosméticos, anuncios)?
2. ¿Torneos con premios en fases futuras (implica requisitos legales)?
3. ¿Apps móviles nativas tras validar la web?
4. ¿Proveedor de IA propio o integración con motor open-source existente?

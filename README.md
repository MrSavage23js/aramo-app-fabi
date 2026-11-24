# Control de Personal y Dotación · Grupo Aramo

Aplicación web para llevar el registro de empleados, su **dotación** (3 juegos de playera y botas) y sus **incidencias** (faltas, retardos, incapacidades, etc.), y para calcular automáticamente el **pedido al proveedor**.

**Tecnologías:** Node.js + Express · MySQL 8 / MariaDB · HTML/CSS/JS sin frameworks.

## Funciones

| Sección | Qué hace |
|---|---|
| **Empleados** | Alta, edición y baja; búsqueda y filtros por planta y departamento; exportar a CSV. |
| **Resumen para pedido** | Cuenta playeras por talla/color/forma/tipo y botas por número, por planta o juego. Se puede imprimir o exportar. |
| **Incidencias** | Registro por empleado y fecha, filtros por mes y planta, quién la registró, exportar a CSV. |
| **Pendientes** | Lista de empleados con datos incompletos para completarlos. |

**Usuarios y roles:** se entra con usuario y contraseña. El rol `admin` puede modificar todo; el rol `consulta` solo puede ver y exportar.

---

## Instalación rápida con Docker (recomendada)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone <URL-del-repositorio> aramo-app
cd aramo-app
cp .env.example .env
```

Edita `.env` y llena al menos:

- `DB_PASSWORD`: una contraseña para MySQL.
- `SESSION_SECRET`: genera una con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```bash
docker compose up -d --build
docker compose exec app node scripts/user.js add admin --rol admin
```

Abre <http://localhost:3000> y entra con el usuario que creaste.

## Instalación manual

Requisitos: Node.js 18.18 o más reciente, y MySQL 8 (o MariaDB 10.5 o más reciente).

```bash
npm install
cp .env.example .env          # pon tus datos de MySQL y un SESSION_SECRET
npm run db:init               # crea la base, las tablas y carga los datos iniciales
npm run user:add -- admin --rol admin
npm start                     # abre http://localhost:3000
```

Para desarrollo, `npm run dev` reinicia el servidor solo cuando cambia el código.

## Datos iniciales y privacidad

> ⚠️ **Los datos reales del personal nunca deben subirse al repositorio.**

`npm run db:init` solo importa datos si la tabla de empleados está vacía, y busca el archivo en este orden:

1. El archivo indicado en la variable `SEED_FILE` (`SEED_FILE=none` para no importar nada).
2. `scripts/seed.local.json`: **tus datos reales**. Está en `.gitignore` y `.dockerignore`, así que no se sube.
3. `scripts/seed.example.json`: 40 empleados **ficticios** de demostración.

Con Docker, para importar tus datos reales la primera vez, descomenta el bloque `volumes` del servicio `app` en `docker-compose.yml`.

## Gestión de usuarios

```bash
npm run user:add -- maria --rol consulta --nombre "María López"
npm run user:passwd -- maria       # cambiar la contraseña
npm run user:disable -- maria      # bloquear el acceso
npm run user:enable -- maria
npm run user:list
```

Con Docker, usa `docker compose exec app node scripts/user.js <comando> ...`.
La contraseña se pide en pantalla (mínimo 8 caracteres).

## Publicarla para otros usuarios

GitHub guarda el **código**, pero no puede ejecutar la app: esta necesita un servidor con Node.js y MySQL. Hay dos opciones:

- **Red interna (lo más seguro):** instálala en una PC o servidor de la oficina y los demás entran a `http://IP-DEL-SERVIDOR:3000`. Puede que tengas que permitir el puerto 3000 en el firewall de Windows.
- **Internet:** usa un VPS o un servicio como Railway, Render o Fly.io, con una base MySQL. En ese caso:
  - Sírvela **siempre por HTTPS** y pon `HTTPS_ONLY=true`.
  - Si va detrás de un proxy (como casi todos esos servicios), pon `TRUST_PROXY=true`.
  - Usa contraseñas fuertes y crea con rol `consulta` a quien solo necesita ver.

## Respaldos

```bash
# Manual
mysqldump -u root -p aramo_personal > respaldo_$(date +%F).sql
# Con Docker
docker compose exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" aramo_personal' > respaldo.sql
```

Los archivos `respaldo*.sql` están en `.gitignore`.

## Configuración (`.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `SESSION_SECRET` | — | **Obligatoria en producción.** Mínimo 32 caracteres. |
| `SESSION_HOURS` | `12` | Horas que dura una sesión |
| `HTTPS_ONLY` | `false` | `true` activa cookies seguras y HSTS (solo con HTTPS) |
| `TRUST_PROXY` | `false` | `true` si hay un proxy inverso delante |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | Servidor MySQL |
| `DB_USER` / `DB_PASSWORD` | `root` / vacío | Credenciales de MySQL |
| `DB_NAME` | `aramo_personal` | Nombre de la base de datos |

## Estructura

```
├── server.js              Arranque del servidor
├── src/
│   ├── app.js             Rutas de la API, sesión y seguridad
│   ├── auth.js            Contraseñas (scrypt), sesiones firmadas, límite de intentos
│   ├── validation.js      Validación de datos
│   ├── config.js          Lectura del .env
│   └── db.js              Conexión a MySQL
├── db/schema.sql          Tablas: empleados, dotacion, incidencias, usuarios
├── scripts/
│   ├── init-db.js         Crea/actualiza la base y carga datos iniciales
│   ├── user.js            Gestión de usuarios
│   └── seed.example.json  Datos ficticios de demostración
├── public/                Interfaz (index.html, login.html, css/, js/)
├── test/                  Pruebas (npm test)
├── Dockerfile, docker-compose.yml
└── .github/workflows/ci.yml   Pruebas automáticas en GitHub
```

## API

Todas las rutas (excepto `login` y `health`) requieren sesión. Las que modifican datos requieren el rol `admin`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/login` | `{usuario, password}` → abre la sesión con una cookie |
| `POST` | `/api/logout` | Cierra la sesión |
| `GET` | `/api/me` | Usuario actual |
| `GET` | `/api/health` | Estado del servidor y la base |
| `GET` | `/api/data` | Empleados (con sus 3 juegos) e incidencias |
| `POST` / `PUT` / `DELETE` | `/api/emps[/:id]` | Crear, editar y borrar empleados |
| `POST` / `DELETE` | `/api/inc[/:id]` | Registrar y borrar incidencias |

## Seguridad

- Contraseñas guardadas con scrypt y sal; sesiones con cookie `HttpOnly` + `SameSite=Strict` firmada con HMAC.
- Bloqueo temporal tras 10 intentos fallidos de login (15 minutos).
- Protección CSRF (verificación de origen, solo JSON), cabeceras de seguridad con Helmet y política de contenido (CSP).
- Todas las consultas SQL usan parámetros; todo el texto se escapa en la interfaz.
- Los CSV exportados neutralizan fórmulas para evitar inyección en Excel.

## Actualizar desde la versión 1

1. Ejecuta `npm install` y luego `npm run db:init`: agrega la tabla `usuarios` y las columnas nuevas sin borrar datos.
2. Crea tu usuario con `npm run user:add -- admin --rol admin`.
3. Opcional: corrige la talla mal escrita en la base:
   `UPDATE dotacion SET talla='EXTRA GRANDE' WHERE talla='EXTRA GRAND';`

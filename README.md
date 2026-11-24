# Control de Personal y Dotación · Grupo Aramo

Aplicación web para llevar el registro de empleados, su **dotación** (3 juegos de playera y botas) y sus **incidencias** (faltas, retardos, incapacidades, etc.), y para calcular automáticamente el **pedido al proveedor**.

- **Página:** <https://mrsavage23js.github.io/aramo-app-fabi/> (GitHub Pages, gratis)
- **Datos y login:** [Supabase](https://supabase.com) (plan gratuito, sin tarjeta)
- **Sin servidor propio:** HTML, CSS y JavaScript, sin frameworks ni compilación.

## Funciones

| Sección | Qué hace |
|---|---|
| **Empleados** | Alta, edición y baja; búsqueda y filtros por planta y departamento; exportar a CSV. |
| **Resumen para pedido** | Cuenta playeras por talla/color/forma/tipo y botas por número, por planta o juego. Se puede imprimir o exportar. |
| **Incidencias** | Registro por empleado y fecha, filtros por mes y planta, quién la registró, exportar a CSV. |
| **Pendientes** | Empleados con datos incompletos. |
| **Usuarios y datos** *(solo admin)* | Activar cuentas y asignar roles, descargar un respaldo e importar empleados. |

**Roles:** `admin` puede modificar todo; `consulta` solo puede ver y exportar. Las cuentas nuevas quedan **pendientes** hasta que un admin las activa.

---

## Puesta en marcha (una sola vez, unos 10 minutos)

### 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com>, crea una cuenta gratis y luego **New project**.
2. Ponle un nombre (por ejemplo `aramo`), elige una contraseña para la base de datos (guárdala) y la región más cercana (por ejemplo *East US*).
3. Espera a que termine de crearse (1 o 2 minutos).

### 2. Crear las tablas

1. En el menú izquierdo, abre **SQL Editor** y luego **New query**.
2. Copia **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql), pégalo y presiona **Run**.
   Debe decir *Success*.

### 3. Configurar el inicio de sesión

En **Authentication → URL Configuration**:

- **Site URL:** `https://mrsavage23js.github.io/aramo-app-fabi/`
- **Redirect URLs:** agrega `https://mrsavage23js.github.io/aramo-app-fabi/**`

Así funcionan los correos de confirmación y de "olvidé mi contraseña".

### 4. Conectar la página

1. En Supabase abre **Project Settings → API** (o el botón **Connect**) y copia:
   - **Project URL**, por ejemplo `https://abcdefgh.supabase.co`
   - La clave **anon public** o **publishable**, que empieza con `eyJ...` o `sb_publishable_...`
2. En GitHub abre [`js/config.js`](js/config.js), haz clic en el lápiz ✏️, pega los dos valores entre las comillas y presiona **Commit changes**:

   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_KEY: 'eyJhbGciOi...',
   };
   ```

   > Esa clave es **pública por diseño**; la seguridad la dan las reglas de la base de datos.
   > **Nunca** pongas la clave `service_role` o `secret`.

3. Espera 1 o 2 minutos a que GitHub Pages se actualice.

### 5. Crear el primer administrador

1. Abre la página, haz clic en **Crear cuenta** y regístrate.
   Si Supabase te manda un correo de confirmación, ábrelo.
2. Verás *"cuenta pendiente de activación"*. Ve a Supabase → **SQL Editor** y ejecuta, con **tu** correo:

   ```sql
   update public.perfiles set rol = 'admin', activo = true where email = 'tu-correo@ejemplo.com';
   ```

3. En la página, presiona **Ya me activaron**. Listo.

### 6. Cargar los empleados

En **Usuarios y datos → Importar empleados**, elige tu archivo `seed.local.json` (los datos reales que tienes en tu PC) y presiona **Importar**.

### 7. Agregar más usuarios

Cada persona entra a la página, usa **Crear cuenta**, y tú la activas en **Usuarios y datos**, eligiendo si es `admin` o `consulta`.

---

## Cosas importantes del plan gratis

- **Pausa por inactividad:** si nadie usa la app en **7 días**, Supabase pausa el proyecto. Para reactivarlo, entra a supabase.com y presiona **Restore project**; los datos no se pierden.
- **Límites:** 500 MB de base de datos y 50,000 usuarios al mes. Esta app usa una fracción mínima.
- **Respaldos:** el plan gratis no incluye respaldos automáticos descargables. Usa **Usuarios y datos → Descargar respaldo** con frecuencia y guarda el archivo en un lugar seguro.

## Privacidad

> ⚠️ Este repositorio es **público**. **Nunca** subas datos reales del personal.

- Los datos reales viven **solo en Supabase**, protegidos por login y por reglas de seguridad (Row Level Security).
- `.gitignore` bloquea `*.local.json` y `respaldo*.json`, para que tus archivos de datos y respaldos no se suban por accidente.
- `data/seed.example.json` contiene 40 empleados **ficticios** para pruebas.

## Seguridad

Toda la protección está en la base de datos ([`supabase/schema.sql`](supabase/schema.sql)), no en la página:

- Sin una cuenta **activada** no se puede leer ningún dato, aunque alguien tenga la clave pública.
- Solo `admin` puede crear, editar o borrar; un usuario no puede subirse de rol ni activarse a sí mismo.
- No se puede quitar al último administrador activo.
- El autor de cada incidencia se registra en el servidor y no se puede falsificar.
- La base valida los datos (plantas, botas, tipos de incidencia, longitudes).
- La página escapa todo el texto y los CSV neutralizan fórmulas de Excel.

## Desarrollo

```bash
npm test          # pruebas de la lógica (Node 18+)
npm run check     # revisión de sintaxis
npm run serve     # sirve la página en http://localhost:8080
```

## Estructura

```
├── index.html             Página única
├── css/app.css            Estilos
├── js/
│   ├── config.js          ← URL y clave pública de Supabase
│   ├── app.js             Interfaz y conexión con Supabase
│   ├── logic.js           Validación y cálculos (con pruebas)
│   └── vendor/supabase.js Librería oficial supabase-js v2 (incluida, sin CDN)
├── supabase/schema.sql    Tablas, reglas de seguridad y triggers
├── data/seed.example.json Datos ficticios de demostración
├── test/                  Pruebas (npm test)
└── .github/workflows/     Pruebas automáticas en cada cambio
```

## Versión anterior

La versión con servidor propio (Node.js + MySQL + Docker) está guardada en la etiqueta [`v2-node`](https://github.com/MrSavage23js/aramo-app-fabi/tree/v2-node), por si algún día prefieres instalarla en un servidor de la oficina.

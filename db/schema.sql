-- Esquema de la base de datos. Lo aplica `npm run db:init` (y Docker al arrancar).
-- La base de datos se crea con el nombre definido en DB_NAME.

CREATE TABLE IF NOT EXISTS empleados (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL UNIQUE,
  planta      ENUM('ARAMO','VELADORAS','OBRA','VILAFLOR') NOT NULL DEFAULT 'VELADORAS',
  depto       VARCHAR(60)  NOT NULL DEFAULT '',
  puesto      VARCHAR(80)  NOT NULL DEFAULT '',
  genero      ENUM('','DAMA','CABALLERO') NOT NULL DEFAULT '',
  bota        VARCHAR(10)  NOT NULL DEFAULT '',      -- número, o N/A si no usa
  nota        VARCHAR(255) NOT NULL DEFAULT '',
  dot         TINYINT(1)   NOT NULL DEFAULT 1,       -- 1 = recibe dotación
  creado      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (planta), INDEX (depto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una fila por empleado y juego de playera (1, 2, 3)
CREATE TABLE IF NOT EXISTS dotacion (
  empleado_id INT NOT NULL,
  juego       TINYINT NOT NULL,
  talla       VARCHAR(20) NOT NULL DEFAULT '',
  color       VARCHAR(30) NOT NULL DEFAULT '',
  forma       VARCHAR(30) NOT NULL DEFAULT '',
  tipo        VARCHAR(20) NOT NULL DEFAULT '',
  PRIMARY KEY (empleado_id, juego),
  FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incidencias (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  empleado_id INT NOT NULL,
  fecha       DATE NOT NULL,
  tipo        VARCHAR(30) NOT NULL,
  obs         VARCHAR(255) NOT NULL DEFAULT '',
  creado_por  VARCHAR(50)  NOT NULL DEFAULT '',
  creado      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (fecha),
  FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuarios que pueden entrar a la app.
--   admin    = puede ver y modificar todo
--   consulta = solo lectura
CREATE TABLE IF NOT EXISTS usuarios (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  usuario  VARCHAR(50)  NOT NULL UNIQUE,
  nombre   VARCHAR(100) NOT NULL DEFAULT '',
  hash     VARCHAR(255) NOT NULL,
  rol      ENUM('admin','consulta') NOT NULL DEFAULT 'consulta',
  activo   TINYINT(1)   NOT NULL DEFAULT 1,
  creado   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

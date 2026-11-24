-- =====================================================================
--  Control de Personal y Dotación · Grupo Aramo — esquema para Supabase
--
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar más de una vez sin perder datos.
--
--  Seguridad: toda la protección está aquí (Row Level Security).
--  La clave pública del proyecto puede estar en la página sin riesgo:
--  sin una cuenta ACTIVADA por un administrador no se puede leer nada.
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

create table if not exists public.empleados (
  id          bigint generated always as identity primary key,
  nombre      text not null unique check (char_length(nombre) between 1 and 150),
  planta      text not null check (planta in ('ARAMO','VELADORAS','OBRA','VILAFLOR')),
  depto       text not null default '' check (char_length(depto) <= 60),
  puesto      text not null default '' check (char_length(puesto) <= 80),
  genero      text not null default '' check (genero in ('','DAMA','CABALLERO')),
  bota        text not null default '' check (bota in ('','N/A') or bota ~ '^[0-9]{1,2}(\.5)?$'),
  nota        text not null default '' check (char_length(nota) <= 255),
  dot         boolean not null default true,            -- recibe dotación
  -- 3 juegos de playera: [{talla,color,forma,tipo}, {...}, {...}]
  juegos      jsonb not null default '[{},{},{}]'
              check (jsonb_typeof(juegos) = 'array' and jsonb_array_length(juegos) = 3),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists empleados_planta_idx on public.empleados (planta);

create table if not exists public.incidencias (
  id          bigint generated always as identity primary key,
  empleado_id bigint not null references public.empleados(id) on delete cascade,
  fecha       date not null,
  tipo        text not null check (tipo in ('Falta','Retardo','Incapacidad','Permiso','Vacaciones','Suspensión','Otro')),
  obs         text not null default '' check (char_length(obs) <= 255),
  creado_por  text not null default '',
  creado      timestamptz not null default now()
);
create index if not exists incidencias_fecha_idx on public.incidencias (fecha);
create index if not exists incidencias_emp_idx on public.incidencias (empleado_id);

-- Un perfil por cada cuenta de Supabase Auth.
--   rol:    admin = puede modificar todo · consulta = solo lectura
--   activo: las cuentas nuevas quedan INACTIVAS hasta que un admin las activa
create table if not exists public.perfiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  email   text not null default '',
  nombre  text not null default '' check (char_length(nombre) <= 100),
  rol     text not null default 'consulta' check (rol in ('admin','consulta')),
  activo  boolean not null default false,
  creado  timestamptz not null default now()
);

-- ---------- Funciones y triggers --------------------------------------

-- Rol del usuario actual (null si no tiene perfil activo).
-- SECURITY DEFINER para poder leer perfiles sin caer en recursión de RLS.
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

-- Crea el perfil (inactivo) cuando alguien se registra
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data->>'nombre', ''), 100))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.crear_perfil();

-- Fecha de última modificación
create or replace function public.tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin new.actualizado := now(); return new; end $$;
drop trigger if exists empleados_actualizado on public.empleados;
create trigger empleados_actualizado before update on public.empleados
  for each row execute function public.tocar_actualizado();

-- Quién registró la incidencia (no se puede falsificar desde la página)
create or replace function public.firmar_incidencia()
returns trigger language plpgsql set search_path = '' as $$
begin new.creado_por := coalesce(auth.jwt()->>'email', ''); return new; end $$;
drop trigger if exists incidencias_firma on public.incidencias;
create trigger incidencias_firma before insert on public.incidencias
  for each row execute function public.firmar_incidencia();

-- Impide quedarse sin ningún administrador activo
create or replace function public.proteger_ultimo_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.rol = 'admin' and old.activo and not (new.rol = 'admin' and new.activo)
     and (select count(*) from public.perfiles where rol = 'admin' and activo and id <> old.id) = 0 then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_ultimo_admin on public.perfiles;
create trigger perfiles_ultimo_admin before update on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

-- ---------- Permisos ---------------------------------------------------

revoke all on public.empleados, public.incidencias, public.perfiles from anon;
revoke all on public.perfiles from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.empleados, public.incidencias to authenticated;
grant select on public.perfiles to authenticated;
grant update (nombre, rol, activo) on public.perfiles to authenticated;   -- nunca id ni email
revoke execute on function public.mi_rol() from anon, public;
grant execute on function public.mi_rol() to authenticated;

-- ---------- Row Level Security -----------------------------------------

alter table public.empleados   enable row level security;
alter table public.incidencias enable row level security;
alter table public.perfiles    enable row level security;

drop policy if exists "leer empleados"      on public.empleados;
drop policy if exists "admin empleados"     on public.empleados;
drop policy if exists "leer incidencias"    on public.incidencias;
drop policy if exists "admin incidencias"   on public.incidencias;
drop policy if exists "leer perfiles"       on public.perfiles;
drop policy if exists "admin perfiles"      on public.perfiles;

-- Cualquier usuario ACTIVO puede leer
create policy "leer empleados" on public.empleados
  for select to authenticated using (public.mi_rol() is not null);
create policy "leer incidencias" on public.incidencias
  for select to authenticated using (public.mi_rol() is not null);

-- Solo admin puede crear, editar y borrar
create policy "admin empleados" on public.empleados
  for all to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy "admin incidencias" on public.incidencias
  for all to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

-- Cada quien ve su propio perfil; el admin ve y edita todos
create policy "leer perfiles" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.mi_rol() = 'admin');
create policy "admin perfiles" on public.perfiles
  for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

-- Crea perfiles para cuentas que ya existían antes de correr este archivo
insert into public.perfiles (id, email)
  select id, coalesce(email, '') from auth.users
  on conflict (id) do nothing;

-- =====================================================================
--  PRIMER ADMINISTRADOR — después de crear tu cuenta en la página,
--  ejecuta esta línea con TU correo (solo se hace una vez):
--
--  update public.perfiles set rol = 'admin', activo = true where email = 'tu-correo@ejemplo.com';
-- =====================================================================

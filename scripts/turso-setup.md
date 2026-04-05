# Configurar Turso para producción (Vercel)

## 1. Crear cuenta y base de datos

```bash
# Instalar CLI de Turso
winget install turso   # Windows
# o: curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Crear la base de datos
turso db create alldatatennis

# Ver URL de conexión
turso db show alldatatennis
# → URL: libsql://alldatatennis-<usuario>.turso.io

# Crear token de acceso
turso db tokens create alldatatennis
# → eyJ... (guardar, solo se muestra una vez)
```

## 2. Variables de entorno

### Local (desarrollo)
Copiar `.env.local.example` a `.env.local`:
```
TURSO_DATABASE_URL=file:tennis.db
TURSO_AUTH_TOKEN=
```
Con `file:tennis.db` se usa el SQLite local — sin necesidad de Turso.

### Producción (Vercel)
En el dashboard de Vercel → Settings → Environment Variables:
```
TURSO_DATABASE_URL = libsql://alldatatennis-<usuario>.turso.io
TURSO_AUTH_TOKEN   = eyJ...
```

## 3. Migrar datos existentes (primera vez)

El esquema se crea automáticamente al primer request gracias a `runMigrations()`
en `instrumentation.ts`. No hay nada más que hacer para la estructura.

Para subir los datos históricos existentes (tennis.db local → Turso):
```bash
# Volcar datos locales
turso db shell alldatatennis < tennis.db   # NO funciona con binario

# Método recomendado: usar turso db push (embedded replica)
turso db shell alldatatennis ".read /ruta/tennis.db"

# O exportar a SQL y reimportar:
sqlite3 tennis.db .dump > tennis-dump.sql
turso db shell alldatatennis < tennis-dump.sql
```

## 4. Desplegar en Vercel

```bash
# Instalar Vercel CLI (opcional)
npm i -g vercel

# Deploy
vercel --prod
```

Vercel detecta Next.js automáticamente. Solo necesita las dos variables de entorno.

## 5. Verificar

Tras el deploy, visitar:
- `https://tu-dominio.vercel.app/api/admin/update-rankings` (GET) → debe responder JSON
- `https://tu-dominio.vercel.app/` → página principal

## Notas

- **Plan gratuito de Turso**: 500 bases de datos, 9 GB almacenamiento, 1 billón de filas leídas/mes.
  Más que suficiente para este proyecto.
- **Latencia**: Las llamadas HTTP a Turso añaden ~10-30ms por query vs SQLite local.
  Para las rutas de análisis (que hacen muchas queries) considerar usar
  [Turso Embedded Replicas](https://docs.turso.tech/features/embedded-replicas)
  en el futuro cuando el tráfico crezca.
- **daily-sync desde Vercel**: El Task Scheduler de Windows seguirá apuntando a
  `localhost:3000` (dev). Para producción, cambiar la URL del script a la URL de Vercel
  o usar Vercel Cron Jobs.

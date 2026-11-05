# Configurar Supabase (una sola vez, ~10 minutos)

Hasta que lo configures, la app funciona en **modo local**: las notas se guardan solo en ese
navegador.

## 1. Crear el proyecto

1. Entra en <https://supabase.com>, crea una cuenta y luego **New project** (plan Free).
   Región: `West EU (Ireland)` o `Central EU (Frankfurt)`.
2. Guarda la contraseña de la base de datos en tu gestor (la app no la necesita).

## 2. Crear las tablas

**SQL Editor → New query**, pega el contenido de [`schema.sql`](schema.sql) y pulsa **Run**.

## 3. Login solo para vosotros dos (email + contraseña)

No hace falta tocar las plantillas de email (en el plan gratuito no se pueden editar sin SMTP propio).

1. **Authentication → Sign In / Providers**:
   - **Allow new users to sign up**: desactivado. Así nadie más puede registrarse.
   - **Email**: activado.
2. **Authentication → Users → Add user → Create new user**: crea tu usuario y el de tu esposa con
   vuestro email y una contraseña, marcando **Auto Confirm User**. Guardad las contraseñas en el
   gestor de contraseñas: la app las recordará con el autocompletado del navegador.
3. Si alguien olvida la contraseña: en **Authentication → Users**, menú `⋯` del usuario, la cambias
   tú desde el panel.

## 4. Daros de alta como miembros

Edita los emails, nombres y colores de [`members.sql`](members.sql) y ejecútalo en el SQL Editor.
Debe devolver dos filas.

## 5. Conectar la app

**Project Settings → API**: copia **Project URL** y la clave **anon / publishable** en
[`../config.js`](../config.js).

Esa clave es pública por diseño (va en el navegador); lo que protege los datos son las políticas
RLS del paso 2. **Nunca** pongas ahí la `service_role` / secret key.

## 6. Copia privada de los textos

Así la lectura no depende de bolls.life: cada dispositivo descarga las Biblias una vez tras entrar y
después funciona sin conexión.

1. **SQL Editor**: ejecuta [`storage.sql`](storage.sql). Crea el bucket privado `biblia`, que solo
   pueden leer los miembros.
2. **Storage → biblia → Upload files**: sube los 7 archivos `*.json.gz` (RV1960, LBLA, NTV, BTX3, PDT,
   RV1909 y KJV) que genera [`../tools/build_texts.py`](../tools/build_texts.py). Tienen copyright:
   **no** van al repo.
3. Si algún día se regeneran, sube los nuevos encima y sube `TEXTS_REVISION` en `texts.js` para que
   los dispositivos los descarguen otra vez.

## Límites del plan gratuito que te afectan

- La sesión dura semanas: solo se escribe la contraseña al entrar en un dispositivo nuevo.
- El proyecto se **pausa tras 7 días sin uso**. Las notas no se pierden: se reactiva con un clic en
  el panel de Supabase. Mientras tanto la app sigue funcionando con la copia local y sincroniza
  después.

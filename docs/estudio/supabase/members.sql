-- Ejecutar DESPUÉS de crear los dos usuarios en Authentication → Users.
-- Cambia emails, nombres y colores. Se puede volver a ejecutar para actualizarlos.

insert into public.members (user_id, email, display_name, color)
select id, email, v.display_name, v.color
from auth.users
join (values
  ('TU_EMAIL@ejemplo.com',      'Jeison', '#8a4b2a'),
  ('EMAIL_DE_TU_ESPOSA@ejemplo.com', 'Nombre', '#2f6b5e')
) as v(email_in, display_name, color) on lower(auth.users.email) = lower(v.email_in)
on conflict (user_id) do update
  set display_name = excluded.display_name, color = excluded.color, email = excluded.email;

select * from public.members;

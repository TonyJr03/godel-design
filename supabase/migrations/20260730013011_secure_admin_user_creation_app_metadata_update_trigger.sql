drop trigger if exists on_auth_user_app_metadata_provision_internal_profile
on auth.users;

create trigger on_auth_user_app_metadata_provision_internal_profile
after update of raw_app_meta_data on auth.users
for each row
when (
  coalesce(
    jsonb_typeof(old.raw_app_meta_data -> 'godel_provisioning'),
    'null'
  ) = 'null'
  and
  coalesce(
    jsonb_typeof(new.raw_app_meta_data -> 'godel_provisioning'),
    'null'
  ) <> 'null'
)
execute function private.provision_internal_profile_from_auth_user();

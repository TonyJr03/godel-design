-- Safe to run repeatedly after an interrupted PPO-03A.2 local spike.
drop policy if exists godel_files_insert_ppo03a2_public_sign on storage.objects;
drop function if exists private.can_insert_ppo03a2_public_sign(text, text);

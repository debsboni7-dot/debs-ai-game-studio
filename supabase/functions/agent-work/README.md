# Moteur de missions persistantes

Ce changement ajoute la fondation durable d'exécution autonome.

## Inclus
- Sessions appartenant à l'utilisateur, échéance de 1 à 168 heures et limite d'étapes.
- File de tâches persistante et réservation atomique avec verrou temporaire.
- Checkpoints, journal d'événements, tentatives automatiques et délais exponentiels.
- Actions serveur create, status, pause, resume, cancel.
- Worker Supabase Edge Function qui exécute une étape IA courte par invocation.
- RLS : un utilisateur ne lit que ses propres missions, tâches et événements.

## Activation obligatoire avant toute exécution continue
1. Appliquer la migration SQL du dossier migrations.
2. Déployer la fonction Edge agent-work.
3. Définir les secrets de fonction : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY et AGENT_WORKER_SECRET (secret aléatoire long).
4. Configurer un scheduler fiable qui envoie chaque minute un POST avec le corps {"action":"worker"} et l'en-tête x-agent-worker-secret. Conserver le secret côté serveur, idéalement dans Vault.
5. L'interface /missions est ajoutée au projet et appelle les actions create/status/pause/resume/cancel avec la session Supabase de l'utilisateur connecté.

## Limites actuelles
- Le code de cette branche ne déploie pas la migration ni la fonction et ne configure pas le scheduler ou les secrets.
- Une invocation réalise une seule étape, avec un délai d'attente de 95 secondes. Le scheduler doit déclencher les étapes suivantes.
- La disponibilité dépend de Supabase, du scheduler, du fournisseur IA, de ses quotas et du réseau. Aucune disponibilité 24 h/24 absolue n'est garantie.
- Le worker n'a pas encore d'outils GitHub ou d'accès d'écriture au dépôt. Les modifications GitHub doivent être ajoutées séparément et soumises à confirmation explicite.

## Exemple de planification Supabase Cron (à exécuter après configuration)

La fonction utilise un en-tête secret personnalisé pour le worker. Déploie-la avec la vérification JWT désactivée **uniquement** parce que l'action worker valide elle-même `AGENT_WORKER_SECRET` :

```sh
supabase functions deploy agent-work --no-verify-jwt
```

Dans le SQL Editor Supabase, active/autorise les extensions `pg_cron`, `pg_net` et `vault`, puis stocke l'URL et le secret du worker dans Vault (ne les écris pas en clair dans une migration) :

```sql
select vault.create_secret(
  'https://gibwnsqrwoealtlcjifz.supabase.co/functions/v1/agent-work',
  'agent_work_function_url'
);
select vault.create_secret('REMPLACER_PAR_UN_SECRET_LONG_ALEATOIRE', 'agent_work_worker_secret');

select cron.schedule(
  'debs-agent-work-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'agent_work_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agent_work_worker_secret')
    ),
    body := jsonb_build_object('action', 'worker')
  );
  $$
);
```

Remplace l'URL si le projet Supabase est différent. Vérifie l'exécution dans les journaux Edge Functions et dans les tables `agent_work_events`. Pour désactiver le scheduler : `select cron.unschedule('debs-agent-work-every-minute');`.

**Important :** la fonction doit aussi recevoir `LOVABLE_API_KEY` comme secret Supabase Edge Function. Cette clé ne se transmet pas automatiquement depuis les secrets de l'application Lovable. Le service-role key reste strictement côté serveur.

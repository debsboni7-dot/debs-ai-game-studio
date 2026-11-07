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
3. Définir les secrets de fonction : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY, AGENT_WORKER_SECRET, GITHUB_TOKEN, GITHUB_REPOSITORY et GITHUB_BASE_BRANCH. Le jeton GitHub doit être limité au dépôt autorisé avec Contents: Read and write et Pull requests: Read and write. Ne jamais le placer dans le navigateur.
4. Configurer un scheduler fiable qui envoie chaque minute un POST avec le corps {"action":"worker"} et l'en-tête x-agent-worker-secret. Conserver le secret côté serveur, idéalement dans Vault.
5. L'interface /missions est ajoutée au projet et appelle les actions create/status/pause/resume/cancel avec la session Supabase de l'utilisateur connecté.

## Limites actuelles
- Le code de cette branche ne déploie pas la migration ni la fonction et ne configure pas le scheduler ou les secrets.
- Une invocation réalise une seule étape, avec un délai d'attente de 95 secondes. Le scheduler doit déclencher les étapes suivantes.
- La disponibilité dépend de Supabase, du scheduler, du fournisseur IA, de ses quotas et du réseau. Aucune disponibilité 24 h/24 absolue n'est garantie.
- Lorsque le modèle renvoie une liste de fichiers complète, le worker peut créer un commit sur une branche debs-ai/ isolée et ouvrir un Pull Request en brouillon. Il ne pousse jamais directement sur la branche cible et ne fusionne jamais le PR. Le worker lit jusqu'à 8 fichiers pertinents (60 Ko de texte maximum) et transmet les extraits au modèle. Les propositions sont limitées à 12 fichiers et 300 Ko au total, avec des contrôles contre plusieurs formats de secrets et l'interdiction de modifier .github/workflows. Après ouverture du PR, le serveur interroge les GitHub Check Runs pendant au plus 20 secondes. Si les contrôles sont encore en attente, une tâche dédiée les recontrôle chaque minute, jusqu'à 120 fois (environ 2 heures). Les résultats finaux et les résumés de diagnostic des contrôles sont enregistrés dans le journal et affichés dans l'interface. Une réussite clôt la mission ; un échec ou un délai de suivi dépassé la marque en échec. Les actions pause/annulation sont respectées pendant ce suivi. Ce mécanisme surveille et rapporte les échecs : il ne lit pas encore les logs détaillés des jobs et ne pousse pas automatiquement de correctif.

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

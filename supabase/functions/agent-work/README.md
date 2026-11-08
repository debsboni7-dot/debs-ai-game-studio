# Moteur de missions persistantes

Ce module fournit une file de missions persistantes pilotée par le serveur d’inférence auto-hébergé DEBS.

## Inclus
- Sessions appartenant à l'utilisateur, échéance de 1 à 168 heures et limite d'étapes.
- File de tâches persistante et réservation atomique avec verrou temporaire.
- Checkpoints, journal d'événements, tentatives automatiques et délais exponentiels.
- Actions serveur create, status, pause, resume, cancel.
- Worker Supabase Edge Function qui exécute une étape IA courte par invocation.
- RLS : un utilisateur ne lit que ses propres missions, tâches et événements ; les changements de statut/checkpoint passent par l'Edge Function de confiance.
- Le worker utilise exclusivement le contrat OpenAI-compatible du serveur DEBS : `POST /v1/chat/completions`. Il ne dépend pas d'une clé Lovable, Gemini, OpenAI ou d'un autre fournisseur de conversation.

## Activation obligatoire avant toute exécution continue
1. Dans le SQL Editor, exécuter d'abord `supabase/preflight-agent-work.sql`, puis appliquer `supabase/migrations/20261107000100_agent_work_sessions.sql`. Relancer le preflight : les trois tables, la fonction RPC et RLS doivent être présents.
2. Déployer la fonction Edge agent-work.
3. Définir les secrets Edge : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEBS_INFERENCE_BASE_URL`, `DEBS_INFERENCE_API_KEY`, `DEBS_MODEL` (facultatif, défaut `qwen2.5:3b`), `AGENT_WORKER_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY` et `GITHUB_BASE_BRANCH`. `DEBS_INFERENCE_BASE_URL` doit être une URL HTTPS accessible depuis Supabase Edge et se terminer par `/v1` (ex. `https://votre-hote-prive/v1`). La clé doit être la clé serveur de la gateway DEBS, jamais une clé de navigateur. Le jeton GitHub doit être limité au dépôt autorisé avec Contents: Read and write, Pull requests: Read and write et Checks: Read.
4. Configurer un scheduler fiable qui envoie chaque minute un POST avec le corps `{"action":"worker"}` et l'en-tête `x-agent-worker-secret`. Conserver le secret côté serveur, idéalement dans Vault.
5. L'interface /missions appelle les actions create/status/pause/resume/cancel avec la session Supabase de l'utilisateur connecté.

## Limites actuelles
- Le code ne déploie pas automatiquement la migration, la fonction Edge, les secrets ou le scheduler.
- Une invocation réalise une seule étape, avec un délai d'attente de 95 secondes. Le scheduler doit déclencher les étapes suivantes.
- La gateway DEBS doit être démarrée et joignable depuis Supabase Edge en HTTPS. Sans cela, le worker refuse la mission ; aucun fournisseur IA externe n'est utilisé comme secours.
- Le prompt de mission est borné à 19 000 caractères pour respecter la limite de la gateway. Le contexte GitHub transmis au modèle est limité à cinq fichiers et environ 9 Ko de contenu, en plus d'une liste d'arborescence raccourcie.
- Lorsque le modèle renvoie une liste de fichiers complète, le worker peut créer un commit sur une branche `debs-ai/` isolée et ouvrir un Pull Request en brouillon. Il ne pousse jamais directement sur la branche cible et ne fusionne jamais le PR. Les propositions sont limitées à 12 fichiers, 80 Ko par fichier et 300 Ko au total. Les validateurs serveur rejettent les chemins sensibles (dont .env, clés privées et .github/workflows), les doublons et plusieurs formats courants de secrets.
- Après ouverture du PR, le serveur interroge les GitHub Check Runs pendant au plus 20 secondes. Si les contrôles sont encore en attente, une tâche dédiée les recontrôle chaque minute, jusqu'à 120 fois (environ 2 heures). En cas d'échec CI, le worker récupère les annotations GitHub et peut demander au modèle un correctif minimal. Le correctif est validé et poussé comme nouveau commit sur la branche du PR existant. Le nombre de réparations automatiques est limité à deux.
- Le worker ne dispose pas encore d'une sandbox d'exécution du code généré. Les tests CI du dépôt vérifient le typage et le contrat de requête, pas une exécution réelle du modèle via Supabase Edge.

## Tests locaux
```sh
deno test supabase/functions/agent-work/debs-inference.test.ts
deno check supabase/functions/agent-work/index.ts
```

## Exemple de planification Supabase Cron

Déploie la fonction avec la vérification JWT désactivée uniquement parce que l'action worker valide elle-même `AGENT_WORKER_SECRET` :

```sh
supabase functions deploy agent-work --no-verify-jwt
```

Active `pg_cron`, `pg_net` et Vault dans le Dashboard Supabase, puis stocke l'URL et le secret du worker dans Vault :

```sql
select vault.create_secret(
  'https://VOTRE_PROJECT_REF.supabase.co/functions/v1/agent-work',
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

Vérifie l'exécution dans les journaux Edge Functions et dans `agent_work_events`. Pour désactiver le scheduler : `select cron.unschedule('debs-agent-work-every-minute');`.

**Sécurité :** les clients authentifiés ne disposent que d'un droit de lecture RLS sur leurs missions. La création, les transitions d'état, les tâches et les événements sont réservés au service role utilisé par l'Edge Function. Les secrets DEBS, Supabase et GitHub restent côté serveur.

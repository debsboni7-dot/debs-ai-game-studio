# Mise en service du moteur de missions DEBS AI

## État constaté le 8 novembre 2026

- Base cloud Supabase du projet Lovable : activée.
- Migration `20261107000100_agent_work_sessions.sql` : appliquée directement sur la base connectée par l'outil SQL Lovable.
- Migration `20261108100000_agent_work_review_gate.sql` : ajoutée au dépôt pour le flux de validation des diffs ; elle doit être appliquée après fusion avant d'utiliser les nouveaux statuts.
- Tables présentes : `agent_work_sessions`, `agent_work_tasks`, `agent_work_events`.
- RLS : activé sur les trois tables. Les utilisateurs authentifiés disposent uniquement de politiques SELECT sur leurs propres lignes. Les écritures applicatives sont réservées au rôle serveur.
- RPC `claim_agent_work_task(integer)` : présente ; EXECUTE accordé à `service_role`.
- Extensions constatées : `pgcrypto` seulement. `pg_cron` et `pg_net` ne sont pas activées.
- Edge Functions : leur déploiement n'a pas été confirmé.
- Secrets de fonctions : non vérifiés et non configurés par cette opération.
- Worker périodique : non programmé. Aucune exécution continue n'est active.

La migration est idempotente. Comme elle a été appliquée via SQL Lovable et non via Supabase CLI, vérifier la stratégie d'historique des migrations avant d'utiliser ultérieurement `supabase db push`.

## Secrets requis (Supabase Edge Functions)

Configurer dans Supabase Dashboard → Project Settings → Edge Functions → Secrets. Ne jamais committer ces valeurs, les mettre dans `.env` suivi par Git, ni les envoyer dans une conversation.

| Secret | Utilisation |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Vérification JWT / client utilisateur |
| `SUPABASE_SERVICE_ROLE_KEY` | Écritures serveur et réservation des tâches ; secret privilégié |
| `DEBS_INFERENCE_BASE_URL` | URL HTTPS de la gateway DEBS, terminée par `/v1` |
| `DEBS_INFERENCE_API_KEY` | Authentification de la gateway d'inférence DEBS |
| `DEBS_MODEL` | Modèle local chargé par DEBS, facultatif (défaut `qwen2.5:3b`) |
| `AGENT_WORKER_SECRET` | Authentification des appels planifiés au worker |
| `GITHUB_TOKEN` | Opérations GitHub du dépôt autorisé |
| `GITHUB_REPOSITORY` | Dépôt au format `owner/repository` |
| `GITHUB_BASE_BRANCH` | Branche de base, normalement `main` |

Le jeton GitHub doit être limité au seul dépôt requis, avec Contents: Read and write, Pull requests: Read and write et Checks: Read. Ne pas accorder d'administration de dépôt.

## Déploiement des fonctions

Depuis un environnement disposant de Supabase CLI et d'une session autorisée :

```bash
supabase link --project-ref gibwnsqrwoealtlcjifz
supabase functions deploy agent-work --no-verify-jwt
supabase functions deploy github-agent
```

La fonction `agent-work` vérifie elle-même les JWT des utilisateurs et le secret `x-agent-worker-secret` pour l'action worker ; `verify_jwt = false` est donc configuré pour cette fonction. `github-agent` vérifie le JWT utilisateur et doit conserver la vérification JWT côté plateforme.

Ne déployer qu'après configuration de tous les secrets. Vérifier ensuite les logs des deux fonctions et effectuer un test authentifié contrôlé.

## Worker périodique

Le worker doit être appelé par un scheduler toutes les minutes avec :
- méthode HTTP POST ;
- corps JSON `{"action":"worker"}` ;
- en-tête `x-agent-worker-secret: <AGENT_WORKER_SECRET>`.

Utiliser Supabase Cron/pg_cron + pg_net ou un scheduler externe fiable. Ne pas activer le scheduler avant un test manuel réussi. Surveiller les erreurs, les leases expirés, les coûts IA et le nombre de tâches en attente.

Le worker utilise exclusivement la gateway auto-hébergée DEBS ; aucun fallback Lovable, Gemini ou autre fournisseur conversationnel n'est utilisé. Pour une mission normale, il prépare d'abord un plan, puis un ensemble de fichiers et un diff basé sur un SHA immuable de la branche cible. Le statut passe à `awaiting_review` : aucun commit ni PR n'est créé avant l'action authentifiée `approve_changes`. L'action `reject_changes` clôt la proposition sans l'envoyer à GitHub. Au moment de l'approbation, le SHA de base est revalidé afin d'empêcher l'application d'un diff devenu obsolète.

Après approbation, le worker vérifie la CI GitHub jusqu'à 120 fois à intervalle d'environ une minute (environ deux heures), avec au plus deux tentatives de réparation par proposition. Cela ne constitue pas une promesse d'exécution illimitée ou de disponibilité permanente.

## Test d'acceptation minimal

1. Sans JWT, l'action `create` doit répondre 401.
2. Avec un JWT valide, une mission doit être créée avec `user_id` égal à l'identité du JWT, jamais à une valeur fournie par le client.
3. Un autre utilisateur ne doit pas pouvoir lire ni modifier cette mission.
4. L'utilisateur propriétaire peut lire la mission et ses événements, la mettre en pause, la reprendre avant l'échéance et l'annuler.
5. Un appel `worker` sans secret ou avec un secret incorrect doit répondre 401.
6. Un appel worker autorisé doit réserver une seule tâche via la RPC et produire un événement de progression.
7. Vérifier qu'une mission produit d'abord un plan, puis un diff visible et le statut `awaiting_review`, sans commit ni PR.
8. Vérifier que `approve_changes` crée une PR brouillon seulement après validation et refuse un SHA de base obsolète ; vérifier que `reject_changes` n'envoie rien à GitHub.
9. Vérifier les GitHub Checks et les éventuelles réparations dans un dépôt de test avant les missions réelles.

## Limites opérationnelles

- Les Edge Functions ne sont pas déclarées déployées par ce document.
- Aucun secret n'a été lu, affiché ou modifié.
- Aucun scheduler n'est actif.
- Le test CI du dépôt valide le type-check, les tests Vitest et le build de l'application ; il ne prouve pas qu'une fonction Edge est déployée ni qu'un worker fonctionne dans le cloud.

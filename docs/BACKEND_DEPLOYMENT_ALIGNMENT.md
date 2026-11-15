# Alignement du backend avant déploiement

## État constaté le 14 novembre 2026

- Le fichier `.env` suivi dans le dépôt contient une URL et un identifiant Supabase qui ne correspondent à aucun des deux projets visibles dans le compte Supabase actuellement connecté. L'identifiant et la clé publique ne sont pas reproduits ici.
- Le projet de production accessible, `DEBS AI Studio`, est `njleyzbzhvfqtmdtfjta`. Son schéma public contient actuellement les trois tables historiques `agent_work_sessions`, `agent_work_tasks` et `agent_work_events`.
- Le projet isolé de développement, `debs-ai-billing-dev`, est `qkxecdydyeknvgspvsff`. Il contient les migrations de l'historique, de l'authentification applicative et du portefeuille de crédits utilisées pour les validations.
- Le projet de développement contient les migrations wallet/billing et les tests SQL, mais aucun utilisateur, portefeuille, lot, mouvement, abonnement, facture ou tarif IA de test n'a été laissé dans la base.
- Les paramètres Auth hébergés (modèle OTP, confirmation, SMTP, durée de vie et URLs) ne sont pas exposés par les outils de gestion actuellement connectés et n'ont donc pas été modifiés.

## Règles de déploiement

1. Ne pas pointer le navigateur ou le serveur vers le projet de développement.
2. Ne pas remplacer l'URL Supabase du dépôt ou les variables d'environnement de production avant d'avoir confirmé le projet qui contient les comptes et conversations existants.
3. Avant un basculement vers le projet `DEBS AI Studio`, appliquer d'abord les migrations nécessaires dans une fenêtre de maintenance approuvée, sauvegarder et vérifier les données, puis configurer les variables publiques et serveur sur la même référence de projet.
4. Garder `SUPABASE_SERVICE_ROLE_KEY` exclusivement côté serveur. La clé publiable peut être exposée au navigateur.
5. Configurer et tester l'e-mail OTP et SMTP sur le projet réellement utilisé par l'application avant d'ouvrir les inscriptions.
6. Ne pas activer le débit du portefeuille, le checkout ou les renouvellements avant la validation des tarifs IA, des tests d'isolation entre utilisateurs et du parcours de paiement.

## Pourquoi aucun changement de variable n'a été effectué

Le projet référencé par le fichier `.env` n'est pas accessible dans le compte Supabase connecté, et le projet de production accessible ne contient pas encore le schéma complet de l'application. Changer la référence maintenant risquerait de casser la connexion, l'historique cloud ou l'authentification. Le mismatch est documenté pour être résolu avant le déploiement, sans exposer ni déplacer de données à l'aveugle.

# DEBS AI — état des intégrations

## Moteur d'intelligence DEBS

- Le chat utilise Lovable AI via la clé gérée `LOVABLE_API_KEY`, uniquement côté serveur, avec `openai/gpt-6-astra` sur Responses.
- L'ancienne configuration auto-hébergée DEBS reste un secours de configuration uniquement lorsque Lovable AI n'est pas configuré ; aucune erreur de requête ne déclenche un changement de fournisseur.
- Supabase reste un service de données et d'authentification, pas un moteur IA.
- Les erreurs et les réponses vides sont signalées explicitement ; aucune réponse n'est simulée.


## Recherche Internet auto-hébergée

- **SearXNG** : moteur de métarecherche auto-hébergé dans la pile Docker DEBS, sans API conversationnelle tierce.
- Le gateway expose `POST /v1/search` avec authentification DEBS ; le tool `web_search` est disponible au modèle local en mode chat-compatible.
- La pile doit être démarrée avec `SEARXNG_SECRET`. Les résultats sont des extraits et liens HTTPS ; ils ne prouvent pas qu'une page complète a été consultée.
- Avec Lovable AI, la recherche utilise l'outil natif de recherche Web du modèle, pas un endpoint `/search` supposé sur la gateway.

## Fonctionnel dans cette version

- **GitHub (lecture)** : connexion par jeton personnel finement limité ; validation du compte côté serveur ; liste des dépôts accessibles ; lecture de l'arborescence ; import de six fichiers texte maximum dans le contexte courant du chat.
- Le jeton GitHub reste dans l'état mémoire React. Il n'est pas stocké dans localStorage, dans Supabase, dans les conversations ni dans le prompt envoyé au modèle. Il disparaît au rechargement ou à la fermeture de l'application.
- Les fichiers importés sont un instantané en lecture seule. Les chemins secrets (fichiers .env, clés privées et extensions sensibles) sont exclus.
- **Spécialisations IA** : commandes /code, /github, /unity, /unreal, /godot, /blender et /threejs.
- **Fichiers de conversation** : outils serveur de création de fichiers et de téléchargement de fichiers individuels via la fonction Edge `chat-files` ; nécessite son déploiement et le bucket privé `chat-files`.

## Pas encore activé

- Écriture de fichiers dans un dépôt, création de branches, commits, pull requests et gestion des issues.
- Agent local/à distance pilotant Unity, Unreal, Godot ou Blender.
- Exécution de scripts, compilation, packaging et tests dans une sandbox isolée.
- OAuth GitHub persistant.

## Permissions GitHub recommandées

Pour cette version de lecture seule, crée un jeton d'accès personnel finement limité aux dépôts nécessaires avec :
- Metadata : Read-only
- Contents : Read-only

N'accorde pas de permission d'écriture tant que les actions de commit et pull request avec confirmation n'ont pas été mises en place.

## Sécurité

- Aucun jeton n'est envoyé au modèle IA.
- Les appels GitHub se font depuis les fonctions serveur et ne consignent pas le jeton dans les messages.
- Les actions d'écriture/exécution doivent rester désactivées tant que l'interface de confirmation et le backend d'autorisation correspondant ne sont pas en place.

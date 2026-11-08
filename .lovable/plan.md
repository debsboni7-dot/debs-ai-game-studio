# Import réel depuis le chat

## Correction
- Rendre `import_game_assets` disponible pour une demande explicite d’import, même sans commande spécialisée.
- Transmettre la session pour toutes les conversations et la vérifier côté serveur avant toute recherche/import.
- Utiliser les outils natifs Responses avec une continuation bornée, puis appeler la fonction `asset-import` existante sans jamais transmettre de secret GitHub au navigateur.
- Vérifier les données de licence et, pour Kenney, relire la page exacte officielle du pack et son indication CC0. Refuser les sources protégées ou non vérifiables.
- Afficher uniquement l’activité réellement observée, distinguer échec et succès, et montrer la branche et la PR brouillon confirmées.
- Préserver l’interface et l’historique ; mettre à jour la documentation et ajouter des tests ciblés.

## Configuration et vérification
Le backend lié au remix diffère de celui cité dans la demande et la liste actuelle des secrets ne contient pas `ai-game`. Ne pas modifier le lien du projet ni déployer une fonction sans autorisation. Vérifier le service existant en lecture seule et signaler les éléments manquants.

Aucun appel IA payant, achat, import GitHub réel ou déploiement pendant cette tâche. Les tests utiliseront des réponses simulées explicitement dans les tests, jamais dans l’application. Le parcours réel jusqu’à une PR restera non vérifié sans autorisation et configuration opérationnelle.

## Détails techniques
Action isolée dans `src/lib/integrations`, contrat provider conservé avec contexte serveur optionnel. Schéma strict, authentification `getUser`, lecture HTTPS bornée avec validation DNS et redirections. Tests Vitest et lint exécutés ; compilation vérifiée par le contrôle automatique du projet, sans lancer manuellement le build.
# Import réel depuis le chat

## Correction
- Rendre `import_game_assets` disponible pour une demande explicite d’import, même sans commande spécialisée.
- Transmettre la session pour toutes les conversations et la vérifier côté serveur avant toute recherche/import.
- Utiliser les outils natifs Responses avec une continuation bornée, puis appeler la fonction `asset-import` existante sans jamais transmettre de secret GitHub au navigateur.
- Corriger le cœur d’acquisition : téléchargement réel des octets côté serveur, découverte des liens publics sur des catalogues variés, limites de lecture avant mise en mémoire, inspection ZIP et conservation des chemins avant envoi GitHub. Corriger aussi le contrôle de profondeur actuellement vide dans le résolveur.
- Ajouter la prise en charge sécurisée des fichiers 3D individuels dans le code de la fonction existante si compatible avec ses protections, avec limites et validation du format. Tant que cette version n’est pas déployée avec autorisation, indiquer honnêtement que le service actif accepte seulement les ZIP.
- Vérifier les données de licence et, pour Kenney, relire la page exacte officielle du pack et son indication CC0. Refuser les sources protégées ou non vérifiables.
- Afficher uniquement l’activité réellement observée, distinguer échec et succès, et montrer la branche et la PR brouillon confirmées.
- Préserver l’interface et l’historique ; mettre à jour la documentation et ajouter des tests ciblés.

## Configuration et vérification
Le backend lié au remix diffère de celui cité dans la demande et la liste actuelle des secrets ne contient pas `ai-game`. Ne jamais remplacer manuellement les fichiers générés ni copier les clés d’un autre backend. Vérifier le service existant en lecture seule et déterminer la méthode de liaison gérée disponible ; si aucune méthode sûre n’est disponible, demander à l’utilisateur de rétablir la liaison depuis Lovable. Aucun changement de liaison ou déploiement n’est réalisé à l’aveugle.

Aucun appel IA payant, achat, import GitHub réel ou déploiement pendant cette tâche. Les tests utiliseront des réponses simulées explicitement dans les tests, jamais dans l’application. Le parcours réel jusqu’à une PR restera non vérifié sans autorisation et configuration opérationnelle.

## Détails techniques
Action isolée dans `src/lib/integrations`, contrat provider conservé avec contexte serveur optionnel. Schéma strict, authentification `getUser`, lecture HTTPS bornée avec validation DNS et redirections. Tests ciblés : routage, authentification, licence, catalogue/URL, redirections/DNS, limites ZIP, fichiers 3D individuels et échec réseau. Tests Vitest et lint exécutés ; compilation vérifiée par le contrôle automatique du projet, sans lancer manuellement le build. Les erreurs de compilation déjà présentes sont également corrigées sans refonte visuelle.
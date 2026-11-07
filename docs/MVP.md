# DEBS AI — état du MVP

## Ce qui fonctionne réellement
- Navigation mobile-first : accueil, chat, atelier, studio, intégrations, réglages.
- Chat : conversations multiples (stockées dans le navigateur), rendu Markdown, coloration, bouton copier, états de chargement/erreur. Les messages passent par une fonction serveur (`src/lib/ai/chat.functions.ts`) qui répond honnêtement « aucun fournisseur configuré ». Le fil « Exemple » est statique et étiqueté.
- Atelier : fichiers de démo, créer / renommer / supprimer / éditer, aperçu coloré, export ZIP. Aucun code n'est exécuté.
- Studio : formulaire → cahier des charges, structure et checklist générés par **modèle de document** (pas d'IA), notes, envoi de la structure vers l'atelier.
- Intégrations : statuts « prêt à connecter / connecté / à développer ». Aucune connexion simulée (0 connectée).
- Manifest d'installation (ajout à l'écran d'accueil). Pas de mode hors-ligne.

## À connecter
- Modèle IA : implémenter `CodeModelProvider` dans `src/lib/ai/registry.server.ts` (clé lue côté serveur).
- Comptes + base de données (historique synchronisé), OAuth GitHub, secrets serveur.
- Actions outils (`src/lib/integrations/registry.ts`) : confirmation utilisateur obligatoire avant écriture/exécution ; builds dans une sandbox isolée future.
- i18n : dictionnaire `src/lib/i18n` (navigation, statuts) ; les textes de page restent à migrer.
- APK Android (Capacitor) : non réalisé.

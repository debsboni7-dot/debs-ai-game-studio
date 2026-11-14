# DEBS AI — état du MVP

## Ce qui fonctionne réellement
- Navigation mobile-first : accueil, chat, atelier, studio, intégrations, réglages.
- Chat : conversations multiples, cache local isolé par compte Supabase, rendu Markdown, coloration, bouton copier et états de chargement/erreur. Les requêtes passent par `/api/chat-stream`, qui exige un jeton Supabase valide et une adresse e-mail confirmée. Le routeur serveur sélectionne le premier fournisseur configuré selon sa priorité interne ; il ne relance pas automatiquement une requête auprès d'un autre fournisseur après un échec. Le fil « Exemple » est statique et étiqueté.
- Atelier : fichiers de démo, créer / renommer / supprimer / éditer, aperçu coloré, export ZIP. Aucun code n'est exécuté.
- Studio : formulaire → cahier des charges, structure et checklist générés par **modèle de document** (pas d'IA), notes, envoi de la structure vers l'atelier.
- Intégrations : statuts « prêt à connecter / connecté / à développer ». Aucune connexion simulée (0 connectée).
- Manifest d'installation (ajout à l'écran d'accueil). Pas de mode hors-ligne.

## À connecter
- Studio IA : le formulaire reste un modèle de document déterministe ; seul le chat appelle un modèle IA. Les appels longs conservent la limite du transport final-only existant.
- Configuration hébergée de Supabase Auth : modèle d'e-mail OTP avec `{{ .Token }}`, confirmation obligatoire, durée de vie, limites de renvoi, SMTP et URL de redirection.
- Aligner les variables Supabase du déploiement sur le projet de production retenu. Le fichier `.env` suivi dans le dépôt référence un identifiant de projet qui n'est pas l'un des deux projets accessibles dans le compte Supabase connecté. Ne pas le remplacer à l'aveugle : le projet `DEBS AI Studio` accessible actuellement ne contient pas encore les migrations de l'historique cloud et du portefeuille. Le projet de développement isolé ne doit pas être utilisé par les utilisateurs finaux.
- Tests d'intégration avec deux vrais comptes authentifiés pour confirmer l'isolation RLS des conversations et des données de facturation.
- Actions outils (`src/lib/integrations/registry.ts`) : confirmation utilisateur obligatoire avant écriture/exécution ; builds dans une sandbox isolée future.
- i18n : dictionnaire `src/lib/i18n` (navigation, statuts) ; les textes de page restent à migrer.
- APK Android (Capacitor) : non réalisé.

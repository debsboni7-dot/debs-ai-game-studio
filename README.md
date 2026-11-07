# DEBS AI Game Studio

Crée le premier MVP de DEBS AI, une application web full-stack en français, mobile-first, destinée à devenir un assistant IA spécialisé en programmation et création de jeux vidéo, dans l'esprit d'un atelier de développement logiciel. L'utilisateur travaille principalement depuis un téléphone Android, donc l'interface doit être excellente sur petit écran.

IDENTITÉ / DESIGN
- Nom exact : DEBS AI.
- Identité visuelle premium, futuriste mais lisible : fond sombre graphite, accents cyan/bleu électrique et violet discrets, typographie nette, animations légères, pas de surcharge.
- Interface responsive, accessible, navigation mobile simple.
- Langue initiale : français, prévoir architecture i18n.
- Écrans : accueil/dashboard, conversation IA, atelier de code, projets de jeux, paramètres/intégrations.

FONCTIONNALITÉS MVP
1) Chat de programmation : conversations, historique local/compte selon architecture disponible, rendu Markdown, blocs de code avec coloration, bouton copier, affichage des erreurs et états de chargement. Ne prétends jamais qu'une réponse vient d'un vrai modèle si aucun fournisseur n'est configuré.
2) Atelier de code : éditeur de code intégré avec fichiers/arborescence de projet, aperçu des fichiers, création/renommage/suppression de fichiers de démonstration, export ZIP si réalisable dans la stack disponible. Ne jamais exécuter du code arbitraire côté serveur.
3) Studio de jeux : assistant de création de jeu avec formulaire guidé léger (nom du jeu, moteur cible Godot / Unity / Unreal / Three.js, genre, plateforme), génération de cahier des charges et structure de projet, checklist d'étapes, espace pour scripts et assets. Pour le MVP, les sorties peuvent être des exemples clairement étiquetés tant qu'aucun fournisseur IA n'est connecté.
4) Intégrations : page qui présente GitHub, Godot, Unity, Unreal Engine, Blender et fournisseurs de modèles IA comme connecteurs à configurer. Distinguer clairement « prêt à connecter », « connecté » et « à développer ». Ne pas simuler une connexion réelle. Prévoir OAuth GitHub et stockage serveur des secrets plus tard; jamais demander de coller des clés API dans le chat ou le frontend.
5) Paramètres : profil, langue, thème, gestion des clés/API avec champs secrets uniquement côté serveur quand l'intégration réelle sera mise en place.

ARCHITECTURE ET SÉCURITÉ
- Utilise la stack full-stack par défaut de Lovable et une architecture claire.
- Prépare une couche provider-agnostic pour brancher ultérieurement un modèle IA de code via une fonction backend sécurisée (interface/adaptateur), sans exposer de clés dans le navigateur.
- Prépare une couche d'intégrations/outils séparée du modèle de langage. Les actions GitHub/Godot/Unity/Unreal/Blender devront être autorisées explicitement par l'utilisateur et confirmées avant toute écriture ou exécution.
- N'exécute jamais des scripts arbitraires dans le navigateur ou le backend. Prévoir sandbox isolée future pour builds/tests.
- Prévoir auth et base de données uniquement si nécessaires et disponibles; pas de secrets fictifs.
- Ne pas inventer des résultats de tests, connexions, modèles, ni capacité de générer réellement un jeu complet.
- Ajoute un README interne expliquant ce qui fonctionne réellement dans ce premier MVP et ce qui reste à connecter.
- Priorité à une expérience mobile utilisable depuis Android. Préparer la structure pour PWA installable; APK Android viendra dans une phase ultérieure via un wrapper Capacitor ou une méthode équivalente, sans prétendre que l'APK existe déjà.

LIVRABLE
Construis une première interface réellement navigable et cohérente, avec données de démonstration clairement identifiées, composants réutilisables et états vides/erreurs. Ne bloque pas sur des clés API externes. Commence par l'expérience produit et l'architecture d'intégration; ne prétends pas qu'un LLM est déjà branché.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/737971ca-5625-49df-a1df-d36c83653892).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

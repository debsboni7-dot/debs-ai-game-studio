# DEBS AI

DEBS AI est un assistant IA mobile-first, en français, développé par **DEBS AI Studio** et créé par **Debs Boni**. Son premier modèle produit est **DEBS 1.1**.

L’application est conçue pour être utilisée depuis un navigateur Android : interface de conversation, historique, pièces jointes et outils de développement. Le numéro de version représente une version produit et ses capacités vérifiables ; DEBS 1.1 n’est pas un modèle de fondation entraîné indépendamment. Le dépôt commence maintenant la construction d’une pile d’inférence auto-hébergée DEBS, distincte des API de fournisseurs externes.

## DEBS Self-hosted Inference (prototype)

Le dossier `inference/` contient le premier serveur d'inférence auto-hébergé :
- Ollama exécute les poids du modèle sur le serveur contrôlé par DEBS.
- Une passerelle FastAPI protège l'API compatible OpenAI avec une clé serveur.
- Le modèle bootstrap par défaut est `qwen2.5:3b`, téléchargé sur le volume du serveur.
- Le routeur de chat de l'application donne la priorité à ce serveur quand `DEBS_INFERENCE_BASE_URL` et `DEBS_INFERENCE_API_KEY` sont configurées.

Ce bootstrap ne constitue pas encore un modèle de fondation entraîné par DEBS. Il établit l'infrastructure d'exécution auto-hébergée nécessaire avant les étapes de données, entraînement/ajustement, évaluation et versions propres du modèle. Voir [inference/README.md](inference/README.md). Aucun serveur GPU n'est provisionné par le dépôt ; le déploiement réel exige une machine/VM avec RAM, stockage et idéalement GPU. La clé d'inférence reste exclusivement côté serveur.

## Interface
- Interface claire sur fond blanc, avec contours lumineux rouges, adaptée aux petits écrans.
- Conversation centrale de type assistant, historique latéral recherchable, création de nouveaux chats et navigation mobile.
- Français comme langue active.
- Dictée vocale via les capacités vocales du navigateur et pièces jointes (images, PDF, texte et code) dans l’accueil et les conversations.
- Rendu Markdown et blocs de code ; les fichiers de code peuvent être présentés comme artefacts.

## Capacités de DEBS 1.1
- **Moteur IA** : le routeur serveur privilégie désormais DEBS Self-hosted lorsque `DEBS_INFERENCE_BASE_URL` et `DEBS_INFERENCE_API_KEY` sont configurées. Les adaptateurs Gemini et Lovable restent des solutions transitoires tant que le serveur DEBS n’est pas hébergé et vérifié.
- **Modes spécialisés** : discussion, code, développement de jeux, conception, débogage, revue, architecture, tests, sécurité, performance, API, DevOps et spécialités Unity, Unreal, Godot, Blender et Three.js.
- **Recherche Web** : mode /search qui demande l’outil de recherche Web au Gateway. Les sources et URL ne sont montrées que si l’outil renvoie effectivement des résultats.
- **Comptes et historique cloud** : authentification Supabase par e-mail et mot de passe ; les conversations peuvent être synchronisées avec les tables conversations et chat_messages si les migrations correspondantes sont appliquées et que Supabase est correctement configuré. Sans compte, l’historique reste local à l’appareil.
- **GitHub en lecture** : connexion par jeton personnel saisi dans l’écran Intégrations, vérification du compte, sélection du dépôt et import limité de fichiers en contexte de conversation. Le jeton de cette connexion reste en mémoire React et disparaît au rechargement.
- **Agent GitHub serveur** : une Edge Function distincte peut inspecter un dépôt autorisé et le moteur de missions contient un flux de propositions sur branche et PR brouillon. Il nécessite les secrets Supabase documentés et son déploiement ; ne pas confondre cette capacité avec l’import GitHub en lecture.
- **Génération 3D** : adaptateurs Meshy, Tripo et Rodin présents dans le code ; chaque fournisseur exige ses propres secrets serveur et une vérification réelle avant usage.
- **Missions longue durée** : interface et moteur durable (file de tâches, checkpoints, reprise, pause, annulation et vérifications GitHub) présents dans la branche de travail. Les migrations agent-work, Edge Functions, secrets et planificateur ne sont pas encore déployés/configurés : l’exécution autonome persistante n’est donc pas disponible tant que ces étapes ne sont pas réalisées.
- **Tests de jeux navigateur** : workflow GitHub Actions manuel pour tests déclaratifs Chromium desktop et émulation tactile mobile, captures et rapports JSON/Markdown. Il faut fournir un dossier de jeu et son fichier HTML d’entrée. Ce contrôle ne certifie ni FPS, ni WebGL avancé, ni multijoueur, ni appareil Android physique.

## État des intégrations
| Intégration | État réel |
| --- | --- |
| Lovable AI Gateway | Adaptateur serveur implémenté ; clé et exécution réelle requises |
| Supabase Auth / historique | Code et migrations présents ; configuration cloud requise |
| GitHub import | Lecture via jeton utilisateur, en mémoire |
| GitHub agent / PR brouillon | Code Edge Function présent ; secrets et déploiement requis |
| Meshy / Tripo / Rodin | Adaptateurs présents ; clés fournisseur requises |
| Unity / Unreal / Godot | Spécialisation IA ; aucun runner d’éditeur ou de build connecté |
| Blender | Spécialisation IA ; agent Blender local non fourni |
| APK Android | Non produit |
| Exécution arbitraire de code | Non fournie ; aucun faux résultat d’exécution |

Les connecteurs affichés dans l’écran Intégrations ne signifient pas automatiquement qu’un compte externe est connecté ou qu’un runner est installé.

## Sécurité et limites
- Les secrets fournisseurs doivent rester côté serveur, jamais dans le chat ou le bundle navigateur.
- Les fichiers de dépôt importés sont un instantané en lecture seule ; leur présence dans le contexte n’autorise aucune écriture GitHub.
- Les écritures GitHub du worker sont prévues sur une branche dédiée et en PR brouillon ; aucune fusion automatique vers main.
- Les actions de build/test ne sont considérées comme réussies que lorsqu’un runner renvoie des journaux réels.
- DEBS 1.1 est servi par un fournisseur externe via Gateway ; ce n’est pas un modèle de fondation entraîné par DEBS AI Studio.

## Développement
- Projet Lovable : https://lovable.dev/projects/737971ca-5625-49df-a1df-d36c83653892
- Dépôt : https://github.com/debsboni7-dot/debs-ai-game-studio
- Installation : bun install
- Démarrage : bun run dev

Vérifications CI : tests Vitest, vérification TypeScript des Edge Functions, build de production et validation syntaxique du runner Chromium. Consulte l’onglet GitHub Actions pour l’état du commit courant.

## Politique de version
Une version DEBS ne change que lorsqu’une amélioration technique mesurable est implémentée et testée. Voir docs/model-release-policy.md pour les critères de sortie de DEBS 1.2.
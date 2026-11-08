# DEBS AI Studio — architecture des capacités

Ce document fixe la direction produit : DEBS est un studio IA autonome, fortement orienté ingénierie logicielle et création numérique. Les outils sont des services contrôlés par DEBS ; ils ne doivent pas être confondus avec le modèle de langage lui-même.

## Priorité produit : expertise en code

DEBS doit être particulièrement performant pour :
- comprendre, explorer et modifier des projets existants ;
- concevoir des architectures et produire du code cohérent sur plusieurs fichiers ;
- maîtriser les langages, frameworks, API et moteurs de jeu (web, Python, TypeScript, C/C++, C#, Unity, Unreal, Godot, Blender, Three.js, backend et DevOps) ;
- diagnostiquer les erreurs, écrire des tests, lancer des compilations dans une sandbox, analyser les logs et corriger les régressions ;
- travailler avec Git : branches, commits, diffs et pull requests contrôlées ;
- expliquer les choix techniques et distinguer code proposé, code écrit, tests réellement exécutés et résultat vérifié.

Le runtime initial est Qwen 2.5 3B via Ollama. C'est un modèle open-weight de démarrage, pas un modèle fondamental entraîné par DEBS. La qualité de code devra être améliorée par un modèle coder adapté, des outils de dépôt, des tests et des évaluations reproductibles. Ne jamais présenter un prompt spécialisé comme un entraînement du modèle.

## Capacités et état réel

### 1. Recherche Internet
- Architecture : SearXNG auto-hébergé dans la pile Docker DEBS.
- Le gateway DEBS expose `POST /v1/search`, authentifié par la même clé serveur que l'inférence.
- Le chat expose le tool `web_search` au modèle, y compris en mode chat-compatible Ollama.
- Le worker de missions persistantes appelle désormais directement `DEBS_INFERENCE_BASE_URL/v1/chat/completions` avec `DEBS_INFERENCE_API_KEY`. Il n'utilise plus la passerelle conversationnelle Lovable. Il exige un endpoint HTTPS et échoue fermé si DEBS est indisponible.
- Les résultats fournissent titres, extraits et URL HTTPS. Un extrait de moteur de recherche n'est pas la preuve qu'une page complète a été lue.
- Les réponses doivent citer les sources retournées et signaler une recherche indisponible plutôt que d'inventer des résultats.
- Cette capacité devient opérationnelle sur un serveur lorsque la pile Compose est démarrée avec `SEARXNG_SECRET`. Le CI valide le contrat et la configuration ; il ne garantit pas la disponibilité des moteurs de recherche externes.

### 2. Recherche et acquisition d'assets
- Sources : tout site public pertinent, sans liste blanche limitée à Kenney, Quaternius, Poly Haven ou Pixabay.
- Le pipeline d'import inspecte les pages de catalogue publiques, suit un nombre borné de liens et redirections, valide HTTPS/DNS et refuse les réseaux privés.
- Formats autorisés : modèles 3D, textures, images, audio, vidéo, polices, shaders, scènes et fichiers de projet courants.
- Les fichiers individuels peuvent être téléchargés dans la conversation. Les packs destinés à un dépôt GitHub sont importés sur une branche dédiée et proposés dans une PR brouillon.
- La licence exacte doit être vérifiée sur la source officielle et enregistrée dans un manifeste. Ne jamais contourner connexion, paywall, DRM ou anti-bot.
- Limites : les liens de téléchargement générés uniquement par JavaScript, les contenus nécessitant une connexion et les formats qui exigent un convertisseur spécialisé ne sont pas pris en charge par le simple importateur.

### 3. Génération et fichiers
- Le tool `create_chat_file` permet de créer des fichiers réels et téléchargeables dans la conversation, sans exiger GitHub.
- Le tool `download_chat_file` permet de joindre un fichier public individuel depuis une URL HTTPS.
- Le stockage utilise la fonction Edge `chat-files` et le bucket privé `chat-files`, avec des liens signés temporaires.
- La disponibilité effective dépend du déploiement de la fonction Edge et de la configuration du bucket/secrets. Ne pas annoncer un fichier prêt sans URL signée retournée.
- Le modèle peut générer du code, des documents et des données en texte. Générer un binaire complexe exige un véritable générateur spécialisé, pas simplement du texte dans un prompt.

### 4. Génération d'images, audio et 3D
- Le dépôt possède des intégrations de génération 3D (Meshy, Tripo, Rodin) qui nécessitent leurs clés et peuvent dépendre de crédits ou services externes.
- L'objectif autonome est d'ajouter des modèles open-weight auto-hébergés, par exemple une pile ComfyUI avec un modèle de diffusion, pour la génération d'images.
- Cette pile image n'est pas encore installée ni validée. Elle nécessite une machine avec une mémoire GPU suffisante ; elle ne doit pas être déclarée gratuite ou opérationnelle tant qu'une cible matérielle gratuite et durable n'est pas vérifiée.
- La génération audio locale et la génération 3D locale restent des étapes séparées. Le fait de pouvoir stocker un fichier audio ou 3D ne signifie pas que DEBS sait déjà le générer.

### 5. Exécution et validation du code
- Objectif : environnement isolé, limité en CPU/RAM/disque/temps, sans secrets du serveur, sans accès réseau par défaut et avec traces de compilation/tests.
- Les agents doivent lire le dépôt avant de modifier, produire des diffs, tester, réparer dans des limites définies et proposer une PR.
- Aucun code fourni par un utilisateur ou un modèle ne doit être exécuté directement dans le processus web DEBS.
- Le worker de missions classe maintenant les fichiers du dépôt selon les mots-clés de l'objectif, les manifestes de projet et les annotations CI. Il transmet jusqu'à huit extraits pertinents dans une limite de contexte bornée ; cela améliore la sélection du contexte mais ne remplace pas une lecture exhaustive du dépôt.
- Pour les fichiers TypeScript/JavaScript sélectionnés, le worker résout aussi quelques imports relatifs vers des fichiers réellement présents dans le dépôt et les ajoute au contexte, dans les mêmes limites de taille. Les dépendances externes et les chemins inconnus sont ignorés.
- L'exécution de code dans une sandbox isolée n'est pas encore considérée comme activée.

## Principes non négociables

1. Le modèle conversationnel principal est servi par DEBS ; pas de fallback Gemini, ChatGPT, Claude ou Lovable.
2. Les outils Internet, fichiers, assets, GitHub, génération média et exécution sont des capacités séparées, contrôlées côté serveur.
3. Aucun secret n'est envoyé au modèle ou au navigateur.
4. Les ressources téléchargées sont accompagnées de leur provenance et de leur licence.
5. Les actions qui écrivent dans un dépôt restent auditées et passent par une PR brouillon ; pas de fusion silencieuse.
6. Gratuit d'abord : pas de carte bancaire, d'abonnement ou de service payant imposé. Un outil qui requiert un service payant doit être clairement signalé et ne doit pas être activé par défaut.
7. Un test CI, un test simulé et une véritable exécution sur une machine cible sont trois niveaux de preuve différents.

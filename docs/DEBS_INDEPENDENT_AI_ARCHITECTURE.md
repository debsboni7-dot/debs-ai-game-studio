# DEBS AI: architecture indépendante et apprentissage encadré

Statut : architecture de référence et première mise en œuvre du routage indépendant. Ce document ne signifie pas qu'un modèle DEBS a déjà été entraîné ni qu'un GPU distant est provisionné.

## Objectif produit

DEBS AI doit produire ses réponses avec un modèle dont les poids sont exécutés sur une infrastructure contrôlée par DEBS AI Studio. Les API de Gemini, Claude, OpenAI, Lovable AI et d'autres fournisseurs de modèles ne sont pas des dépendances de génération et ne sont jamais des solutions de secours.

L'indépendance du modèle n'interdit pas l'utilisation de services d'infrastructure (stockage objet, base de données, réseau, GPU loué). Les données, poids, adaptateurs, évaluations et versions du modèle doivent rester exportables afin de pouvoir changer d'hébergeur.

## Architecture logique

1. **DEBS Studio (interface)** : authentification, chat, paramètres, consentements et console d'administration.
2. **DEBS Core (API/orchestrateur)** : authentifie l'utilisateur, applique les quotas et les règles de sécurité, assemble le contexte, appelle le moteur DEBS et journalise les métadonnées d'exécution.
3. **DEBS Model Runtime** : serveur privé Ollama au stade bootstrap, derrière la passerelle FastAPI authentifiée du dossier `inference/`. Le runtime n'est jamais exposé directement à Internet.
4. **DEBS Memory** : stockage documentaire et recherche sémantique. Les résultats retrouvés sont des éléments de contexte, pas des instructions fiables.
5. **DEBS Learning Pipeline** : collecte consentie, nettoyage, déduplication, préparation de jeux de données, entraînement d'adaptateurs, évaluation, validation humaine et publication versionnée.
6. **DEBS Evaluation** : corpus de tests stable, tests de sécurité, tests de non-régression, comparaison de la nouvelle version à la version active et décision de promotion.
7. **DEBS Model Registry** : manifeste de chaque version, base model, empreinte des poids, adaptateurs, tokenizer, paramètres, données autorisées, métriques, approbation et cible de déploiement.

## Infrastructure cible

- **Cloudflare Workers** : API périphérique et orchestration légère. Ne pas exécuter un entraînement de modèle lourd dans un Worker.
- **Cloudflare R2** : artefacts de datasets expurgés, checkpoints, adaptateurs et rapports, avec chiffrement, règles de rétention et accès privé.
- **Cloudflare Queues** : tâches asynchrones d'import, de préparation, d'évaluation et de promotion.
- **Cloudflare Vectorize ou un moteur vectoriel portable** : index de recherche sémantique. Prévoir un export des documents sources et métadonnées.
- **GPU cloud dédié** : exécution du modèle et entraînement. Le fournisseur GPU est une couche remplaçable; aucun fournisseur de modèle tiers n'est appelé.
- **Supabase** : comptes, consentements, métadonnées applicatives et état des tâches. Ne jamais stocker les poids du modèle ou les secrets dans le navigateur.

Cloudflare AI Gateway / Workers AI ne doit pas devenir une dépendance de génération pour le mode indépendant. Le runtime DEBS appelle directement le serveur de modèle auto-hébergé.

## Choix du modèle de départ

Le dépôt utilise actuellement `qwen2.5:3b` comme modèle bootstrap dans Ollama. C'est un modèle à poids ouverts importé, pas un modèle de fondation créé ou entraîné depuis zéro par DEBS. Avant tout usage commercial, l'équipe doit vérifier la licence exacte du checkpoint et de ses composants, la provenance, les restrictions et les obligations de redistribution.

Le premier jalon vise un modèle spécialisé par fine-tuning (LoRA/QLoRA) sur un checkpoint dont la licence a été approuvée. La création d'un modèle de fondation depuis zéro est un programme distinct, avec corpus massif, budget GPU et équipe de recherche, et n'est pas promise par ce prototype.

## Apprentissage continu encadré

L'apprentissage est une chaîne de versions, pas une modification autonome du modèle en production.

1. Les conversations ne sont pas aspirées automatiquement pour l'entraînement. Seuls les exemples explicitement autorisés ou les données détenues/licenciées pour cet usage peuvent entrer dans le pipeline.
2. Les retours sont transformés en exemples structurés; les données personnelles et secrets sont supprimés ou exclus.
3. Les exemples sont dédupliqués, contrôlés contre les injections et séparés en ensembles train, validation et test. Les données de test restent gelées.
4. Un job GPU crée un adaptateur candidat et enregistre les paramètres et empreintes.
5. La suite d'évaluation compare candidat et version active : qualité en français/anglais, suivi d'instructions, programmation, factualité, latence, coût, robustesse et sécurité.
6. Un candidat qui régresse sur un seuil critique est rejeté automatiquement.
7. Un administrateur autorisé examine le rapport et approuve explicitement la promotion.
8. La promotion est progressive, avec health checks, métriques et rollback vers l'artefact précédent.
9. Toute action est auditée. Une version de production n'est jamais modifiée en place.

## Contrats et sécurité

- Aucun secret GPU, R2, Supabase service-role ou clé de passerelle dans le navigateur ou les données d'entraînement.
- Isolation des utilisateurs et vérification du consentement avant l'export d'une donnée.
- Provenance, licence, date, empreinte et finalité enregistrées pour chaque dataset.
- Les documents récupérés par la mémoire sont du contenu non fiable; ils ne peuvent pas modifier les politiques système.
- Les jobs d'entraînement sont isolés, limités en ressources, annulables et idempotents.
- Le modèle ne peut pas approuver son propre entraînement ni publier son propre checkpoint.
- Pas d'apprentissage en ligne sur les poids à chaque message utilisateur.
- Export complet des poids, adaptateurs, manifests et datasets autorisés pour préserver la portabilité.

## Jalons d'implémentation

### A0 - Indépendance de routage
- [x] Le routeur serveur sélectionne uniquement DEBS Self-hosted.
- [x] Une configuration manquante produit une erreur explicite, sans bascule externe.
- [ ] Test automatisé prouvant qu'aucun endpoint fournisseur externe n'est appelé.

### A1 - Runtime reproductible
- [x] Prototype Ollama + passerelle FastAPI dans `inference/`.
- [ ] Provisionner un hôte GPU privé.
- [ ] Configurer les secrets côté serveur et TLS.
- [ ] Vérifier un vrai chat de bout en bout et les limites de charge.

### A2 - Mémoire portable
- [ ] Schéma de consentement, provenance, rétention et suppression.
- [ ] Index vectoriel avec export/réindexation.
- [ ] Tests d'isolation des données utilisateurs.

### A3 - Apprentissage et registre
- [ ] Choisir un checkpoint commercialement compatible après revue de licence.
- [ ] Construire un dataset initial autorisé et un jeu de tests gelé.
- [ ] Ajouter un worker GPU LoRA/QLoRA, suivi de jobs et artefacts.
- [ ] Construire l'évaluation comparative et le registre de versions.
- [ ] Ajouter approbation humaine, canary, surveillance et rollback.

### A4 - Première version spécialisée DEBS
- [ ] Publier un adaptateur entraîné par DEBS AI Studio.
- [ ] Publier son rapport d'évaluation reproductible.
- [ ] Effectuer une validation de charge et sécurité avant toute activation utilisateur.

## Critères de vérité

Ne jamais appeler le modèle bootstrap « modèle entraîné par DEBS ». Ne jamais annoncer l'apprentissage continu comme actif avant la livraison du pipeline et la preuve d'un entraînement validé. Le statut doit distinguer clairement : conçu, codé, configuré, déployé et vérifié en production.


## Implémentation livrée dans le dépôt (15 novembre 2026)

- API d'administration `/api/ai-lab`, réservée aux sessions e-mail vérifiées avec `app_metadata.debs_role=admin`.
- Console mobile `/admin/ai-lab` pour créer des datasets, importer JSONL, confirmer les contrôles, placer des entraînements en file, consulter les jobs et examiner les versions candidates.
- Tables de développement : `debs_ai_datasets`, `debs_ai_dataset_items`, `debs_ai_training_jobs`, `debs_ai_model_releases`, `debs_ai_training_events`, `debs_knowledge_documents`.
- Fonction SQL atomique de réservation de job accessible uniquement au rôle `service_role`; promotion de version en état `approved` réservée aux administrateurs.
- Worker GPU séparé, préparation des jeux de données, contrôle de consentement/PII, entraînement LoRA/QLoRA, métriques de validation et test, upload des adaptateurs/manifests dans R2.
- Mémoire personnelle relue uniquement si la préférence existante de l'utilisateur est activée; connaissances partagées publiées recherchées en full-text. Les résultats sont traités comme des données non fiables.

## État réel et limites

Le schéma a été appliqué uniquement au projet Supabase de développement `debs-ai-billing-dev`. La production n'a pas été modifiée. Les migrations correspondantes sont dans `supabase/migrations/`.

Le worker et le conteneur GPU sont prêts dans le dépôt, mais aucun serveur GPU payant, bucket R2, abonnement R2 ou secret n'a été provisionné. Aucun entraînement réel n'a été exécuté. Le compte de développement n'a pas encore de compte utilisateur auquel attribuer le claim admin.

Le premier entraînement produit un adaptateur PEFT. L'approbation dans le registre n'active pas le modèle dans Ollama : la fusion/conversion du modèle, les tests de staging, le déploiement et le rollback restent une étape distincte.

La mémoire actuelle utilise le full-text search PostgreSQL. Elle n'est pas encore une recherche vectorielle/embedding sémantique. Les conversations ne sont pas ingérées automatiquement pour l'entraînement ou la mémoire.

# GitHub agent (serveur)

Cette fonction fournit au projet DEBS AI un accès GitHub **côté serveur**. Elle n'expose jamais le jeton GitHub au navigateur.

## Secrets Supabase Edge Function requis

Configurer dans Supabase > Edge Functions > Secrets :

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GITHUB_TOKEN` : jeton GitHub limité au dépôt cible, avec **Contents: Read and write** et **Pull requests: Read and write**. Ne pas utiliser un jeton administrateur global.
- `GITHUB_REPOSITORY` : dépôt autorisé au format `owner/repo`, par exemple `debsboni7-dot/debs-ai-game-studio`.
- `GITHUB_BASE_BRANCH` : branche de base, par exemple `main`.

Le jeton doit rester dans les secrets Supabase. Ne jamais le placer dans Lovable côté navigateur, dans le code source, dans une migration SQL ou dans une conversation.

## Déploiement

Après fusion ou checkout de cette branche, déployer :

```sh
supabase functions deploy github-agent
```

La fonction conserve la vérification JWT activée : chaque appel exige une session utilisateur Supabase valide.

## API

Appeler via `supabase.functions.invoke("github-agent", { body: ... })`.

### Lire l'arborescence autorisée

```json
{ "action": "inspect", "branch": "main" }
```

Retourne au maximum 500 chemins de fichiers et indique si GitHub a tronqué l'arborescence.

### Créer une proposition de code

```json
{
  "action": "propose",
  "title": "Améliorer le chargement",
  "summary": "Résumé des changements proposés.",
  "files": [
    { "path": "src/example.ts", "content": "export const example = true;\\n" }
  ]
}
```

La fonction crée un commit sur une branche isolée `debs-ai/*` puis ouvre un **Pull Request en brouillon** vers la branche configurée. Elle ne pousse jamais sur la branche principale et ne fusionne jamais le PR.

## Garde-fous

- Dépôt et branche de base imposés par les secrets serveur : l'appelant ne peut pas choisir un autre dépôt.
- Session Supabase obligatoire.
- 1 à 20 fichiers par proposition, 100 Ko maximum par fichier.
- Rejet des chemins absolus, segments `..`, chemins vides et chemins de secrets évidents.
- Les modifications sont présentées en PR brouillon pour revue humaine.
- Cette fonction ne lance pas les tests. Le statut CI du PR doit être vérifié séparément.
- Avant utilisation réelle, vérifier les permissions du jeton et tester avec un petit fichier sans importance.

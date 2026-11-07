# DEBS AI — acquisition de ressources de jeu

## Capacité ajoutée

La fonction Edge `asset-import` fournit un pipeline serveur authentifié pour importer une archive ZIP de ressources de jeu dans le dépôt configuré, sur une branche dédiée et via une Pull Request brouillon. Elle prend en charge les formats courants :
- Modèles : GLB, glTF, FBX, OBJ, STL, USD/USDZ, BLEND
- Textures et images : PNG, JPG/JPEG, WebP, TGA, HDR, EXR, KTX/KTX2
- Audio : WAV, OGG, MP3, FLAC
- Vidéo : MP4, WebM
- VFX et données : JSON, XML, GLSL, shaders, atlas et fichiers de données autorisés
- Documentation et matériaux : MTL, TXT, MD

Les archives ZIP doivent pointer directement vers un fichier téléchargeable. Les pages de catalogue HTML ne sont pas encore explorées automatiquement.

## Sources permises

Les domaines autorisés incluent Kenney, Quaternius, itch.io / itch.zone, Poly Haven, ambientCG, Catenarius/Cartenarius et les liens GitHub Releases. Le lien doit être HTTPS et rediriger uniquement vers un domaine autorisé. L'import ne contourne pas les pages de connexion, paywalls, DRM, protections anti-bot ni restrictions d'accès.

Kenney indique que ses ressources des pages d'assets sont sous CC0, y compris pour les projets commerciaux : https://kenney.nl/support
Quaternius publie actuellement la licence QAL v1.0 : https://quaternius.com/license.html. Elle permet l'intégration dans un produit, mais interdit la redistribution des fichiers d'assets en tant que tels. Vérifier la licence correspondant précisément au pack téléchargé.

## Sécurité et limites

- Authentification Supabase obligatoire ; l'identité est vérifiée côté serveur.
- Téléchargement limité à 12 Mo par archive, extraction à 18 Mo, 60 fichiers maximum et 5 Mo par fichier.
- Protection contre Zip Slip, chemins absolus, fichiers cachés, extensions exécutables et redirections vers des hôtes non autorisés.
- Les binaires sont envoyés directement à GitHub en blobs base64 ; ils ne transitent jamais par le navigateur.
- Le résultat est une branche `debs-ai/assets-...` et une PR brouillon. Aucun ajout à `main) ni déploiement automatique.
- L'utilisateur doit fournir le nom exact de la licence, son URL officielle et un extrait de preuve. Le système ne déduit jamais qu'un asset est libre.
- Les fichiers originaux et le manifeste `ASSET_MANIFEST.md` sont conservés ensemble. Une vérification humaine de la licence, des formats et de l'intégration reste requise.
- Ce service n'est pas un convertisseur de modèles, un outil de retopologie, un rigging automatique ou un importateur universel d'assets de moteur.

## Configuration serveur

Secrets Edge Functions requis :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`
- `GITHUB_BASE_BRANCH`

Le jeton GitHub doit être limité au dépôt ciblé, avec Contents: Read and write et Pull requests: Read and write. La fonction `asset-import` valide elle-même le JWT ; la configuration Supabase utilise donc `verify_jwt = false` et le contrôle d'identité dans le code est obligatoire.

## Appel de la fonction

Appeler `POST /functions/v1/asset-import` depuis un client connecté, avec son JWT Supabase dans l'en-tête Authorization et un corps JSON :

```json
{
  "pack_name": "Kenney Nature Kit",
  "source_url": "https://example.com/direct-download.zip",
  "license_name": "CC0 1.0",
  "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
  "license_evidence": "La page officielle du pack indique explicitement CC0."
}
```

La réponse donne le nombre de fichiers importés, le poids total, la branche et l'URL de la PR brouillon. L'URL d'exemple n'est pas une ressource réelle ; fournir le lien direct de téléchargement du pack choisi.

## État de déploiement

Le code et les tests sont proposés dans la PR de fonctionnalité. Cette fonction n'est pas réputée opérationnelle dans Supabase tant qu'elle n'a pas été déployée avec les secrets configurés et qu'un import de test n'a pas réussi.

# DEBS AI — acquisition de ressources de jeu

## Capacité ajoutée

La fonction Edge `asset-import` fournit un pipeline serveur authentifié pour importer une archive ZIP de ressources de jeu dans le dépôt configuré, sur une branche dédiée et via une Pull Request brouillon. Elle prend en charge les formats courants :
- Modèles : GLB, glTF, FBX, OBJ, STL, USD/USDZ, BLEND
- Textures et images : PNG, JPG/JPEG, WebP, TGA, HDR, EXR, KTX/KTX2
- Audio : WAV, OGG, MP3, FLAC
- Vidéo : MP4, WebM
- VFX et données : JSON, XML, GLSL/HLSL, shaders, shader graphs, atlas et fichiers de données autorisés\n- Formats moteur : scènes/prefabs Unity, ressources UAsset/UMap Unreal, scènes/ressources/shaders Godot, polices TTF/OTF/WOFF2
- Documentation et matériaux : MTL, TXT, MD

L'utilisateur ou DEBS peut fournir soit une URL directe, soit une page de catalogue HTML publique. Le résolveur inspecte les liens HTML pertinents, les classe, puis tente jusqu'à huit candidats sur deux niveaux maximum pour trouver une archive ZIP téléchargeable. Chaque redirection et chaque domaine candidat est soumis à la validation HTTPS/DNS.

## Sources permises

Aucune liste blanche de domaines : tout site public pertinent peut être une source (catalogues d'assets, marketplaces, dépôts GitHub, bibliothèques 3D/audio/VFX/textures, etc.). Kenney, Quaternius, Poly Haven et ambientCG ne sont que des exemples. Les URL doivent être HTTPS et les hôtes doivent résoudre vers des adresses publiques ; chaque redirection est revalidée. L'import ne contourne pas les pages de connexion, paywalls, DRM, protections anti-bot ni restrictions d'accès.

Kenney indique que ses ressources des pages d'assets sont sous CC0, y compris pour les projets commerciaux : https://kenney.nl/support
Quaternius publie actuellement la licence QAL v1.0 : https://quaternius.com/license.html. Elle permet l'intégration dans un produit, mais interdit la redistribution des fichiers d'assets en tant que tels. Vérifier la licence correspondant précisément au pack téléchargé.

## Sécurité et limites

- Authentification Supabase obligatoire ; l'identité est vérifiée côté serveur.
- Téléchargement limité à 12 Mo par archive, extraction à 18 Mo, 60 fichiers maximum et 5 Mo par fichier.
- Protection contre Zip Slip, chemins absolus, fichiers cachés, extensions exécutables et redirections vers des domaines locaux ou réseaux privés/réservés.
- Les binaires sont envoyés directement à GitHub en blobs base64 ; ils ne transitent jamais par le navigateur.
- Le résultat est une branche `debs-ai/assets-...` et une PR brouillon. Aucun ajout à `main` ni déploiement automatique.
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

## Intégration dans le chat DEBS AI\n\nLe chat spécialisé `/game-dev`, `/unity`, `/unreal`, `/godot`, `/blender` et `/threejs` expose le tool serveur `import_game_assets`. Lorsqu'un utilisateur demande explicitement de rechercher, télécharger ou intégrer des assets, le modèle peut lancer une recherche web, vérifier la source et la licence, puis appeler ce tool. Le navigateur transmet uniquement le JWT de session ; le jeton GitHub reste côté serveur. Le composer contient aussi un formulaire d'import manuel.\n\nLe tool accepte une page de catalogue publique ou une URL ZIP directe, sans liste blanche de sites, et exige une preuve de licence. Le serveur inspecte les liens de téléchargement statiques de la page, suit les redirections avec validation DNS et tente un maximum de huit liens. Il ne peut pas exécuter le JavaScript d'un site, résoudre les boutons créés uniquement côté navigateur, contourner une connexion, un paywall, un DRM ou un anti-bot. Il accepte actuellement les archives ZIP uniquement. Il prépare une PR brouillon et ne fusionne jamais automatiquement.\n\n## Appel de la fonction

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

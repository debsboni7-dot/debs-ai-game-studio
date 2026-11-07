export type ConnectorCategory = "3d" | "engines" | "code" | "ai" | "assets" | "design" | "audio" | "cloud" | "automation" | "productivity";
export type Connector = {
  id: string; name: string; category: ConnectorCategory; description: string;
  website: string; integration: "api" | "oauth" | "local-agent" | "import";
  priority?: boolean; note?: string;
};

export const connectorCategories: { id: ConnectorCategory; label: string }[] = [
  { id: "3d", label: "3D & modélisation" },
  { id: "engines", label: "Moteurs de jeu" },
  { id: "code", label: "Code & dépôts" },
  { id: "ai", label: "IA & modèles" },
  { id: "assets", label: "Assets & bibliothèques" },
  { id: "design", label: "Design & image" },
  { id: "audio", label: "Audio & voix" },
  { id: "cloud", label: "Cloud & stockage" },
  { id: "automation", label: "Automatisation" },
  { id: "productivity", label: "Organisation & collaboration" },
];

export const connectors: Connector[] = [
  { id:"meshy",name:"Meshy AI",category:"3d",description:"Génération 3D, textures, retopologie, rigging et exports.",website:"https://www.meshy.ai",integration:"api",priority:true,note:"Priorité — clé API Meshy requise" },
  { id:"tripo",name:"Tripo AI",category:"3d",description:"Text-to-3D, image-to-3D et génération d'assets.",website:"https://www.tripo3d.ai",integration:"api",priority:true },
  { id:"hyper3d",name:"Hyper3D / Rodin",category:"3d",description:"Génération de modèles 3D détaillés avec Rodin.",website:"https://hyper3d.ai",integration:"api",priority:true },
  { id:"blender",name:"Blender",category:"3d",description:"Création, modification et export via scripts Python et agent local.",website:"https://www.blender.org",integration:"local-agent" },
  { id:"mixamo",name:"Adobe Mixamo",category:"3d",description:"Rigging automatique et bibliothèque d'animations.",website:"https://www.mixamo.com",integration:"import" },
  { id:"sketchfab",name:"Sketchfab",category:"3d",description:"Recherche et import de modèles 3D selon leurs licences.",website:"https://sketchfab.com",integration:"api" },
  { id:"polyhaven",name:"Poly Haven",category:"3d",description:"HDRI, textures PBR et modèles 3D libres.",website:"https://polyhaven.com",integration:"api" },
  { id:"fab",name:"Fab",category:"3d",description:"Marketplace d'assets pour les moteurs de jeu.",website:"https://www.fab.com",integration:"import" },
  { id:"unity",name:"Unity",category:"engines",description:"Scripts C#, scènes, prefabs, packages et tests via agent éditeur.",website:"https://unity.com",integration:"local-agent" },
  { id:"unreal",name:"Unreal Engine",category:"engines",description:"C++, Blueprints, plugins, assets et builds.",website:"https://www.unrealengine.com",integration:"local-agent" },
  { id:"godot",name:"Godot",category:"engines",description:"Scènes, scripts GDScript/C# et exports.",website:"https://godotengine.org",integration:"local-agent" },
  { id:"threejs",name:"Three.js",category:"engines",description:"Jeux et expériences 3D web.",website:"https://threejs.org",integration:"import" },
  { id:"github",name:"GitHub",category:"code",description:"Dépôts, branches, issues, commits et pull requests.",website:"https://github.com",integration:"oauth",priority:true },
  { id:"gitlab",name:"GitLab",category:"code",description:"Dépôts Git, merge requests et pipelines CI/CD.",website:"https://gitlab.com",integration:"oauth" },
  { id:"bitbucket",name:"Bitbucket",category:"code",description:"Dépôts et workflows de développement.",website:"https://bitbucket.org",integration:"oauth" },
  { id:"huggingface",name:"Hugging Face",category:"ai",description:"Modèles, datasets, Spaces et endpoints d'inférence.",website:"https://huggingface.co",integration:"api" },
  { id:"openai",name:"OpenAI API",category:"ai",description:"Modèles IA, vision, outils et génération.",website:"https://platform.openai.com",integration:"api" },
  { id:"anthropic",name:"Anthropic Claude",category:"ai",description:"Modèles Claude et analyse de code.",website:"https://console.anthropic.com",integration:"api" },
  { id:"gemini",name:"Google Gemini",category:"ai",description:"Modèles multimodaux et outils Google AI.",website:"https://aistudio.google.com",integration:"api" },
  { id:"replicate",name:"Replicate",category:"ai",description:"Exécution de modèles d'image, vidéo, audio et 3D.",website:"https://replicate.com",integration:"api" },
  { id:"fal",name:"fal.ai",category:"ai",description:"API de génération d'image, vidéo et médias.",website:"https://fal.ai",integration:"api" },
  { id:"kenney",name:"Kenney",category:"assets",description:"Recherche et téléchargement d'assets de jeu libres selon les conditions de licence.",website:"https://kenney.nl/assets",integration:"import",priority:true,note:"Priorité — bibliothèque d'assets" },
  { id:"opengameart",name:"OpenGameArt",category:"assets",description:"Sprites, sons, textures et modèles avec licences variables.",website:"https://opengameart.org",integration:"import" },
  { id:"itch",name:"itch.io Assets",category:"assets",description:"Découverte de packs d'assets et ressources indépendantes.",website:"https://itch.io/game-assets",integration:"import" },
  { id:"figma",name:"Figma",category:"design",description:"Maquettes UI, composants et design systems.",website:"https://www.figma.com",integration:"oauth" },
  { id:"adobe",name:"Adobe Creative Cloud",category:"design",description:"Ressources graphiques et flux de création Adobe.",website:"https://www.adobe.com/creativecloud.html",integration:"oauth" },
  { id:"elevenlabs",name:"ElevenLabs",category:"audio",description:"Synthèse vocale, voix de personnages et effets audio.",website:"https://elevenlabs.io",integration:"api" },
  { id:"audacity",name:"Audacity",category:"audio",description:"Traitement audio via outils et scripts locaux.",website:"https://www.audacityteam.org",integration:"local-agent" },
  { id:"supabase",name:"Supabase",category:"cloud",description:"Base de données, authentification, stockage et fonctions.",website:"https://supabase.com",integration:"api" },
  { id:"firebase",name:"Firebase",category:"cloud",description:"Backend, authentification, données et hébergement.",website:"https://firebase.google.com",integration:"api" },
  { id:"cloudflare",name:"Cloudflare",category:"cloud",description:"Workers, stockage R2, déploiement et CDN.",website:"https://www.cloudflare.com",integration:"api" },
  { id:"google-drive",name:"Google Drive",category:"cloud",description:"Importer et organiser documents et ressources.",website:"https://drive.google.com",integration:"oauth" },
  { id:"dropbox",name:"Dropbox",category:"cloud",description:"Stockage et synchronisation de fichiers de projet.",website:"https://www.dropbox.com",integration:"oauth" },
  { id:"n8n",name:"n8n",category:"automation",description:"Workflows d'automatisation et webhooks.",website:"https://n8n.io",integration:"api" },
  { id:"zapier",name:"Zapier",category:"automation",description:"Automatisations entre applications.",website:"https://zapier.com",integration:"oauth" },
  { id:"make",name:"Make",category:"automation",description:"Scénarios d'automatisation visuels.",website:"https://www.make.com",integration:"api" },
  { id:"notion",name:"Notion",category:"productivity",description:"Documentation, cahiers des charges et bases de projet.",website:"https://www.notion.so",integration:"oauth" },
  { id:"linear",name:"Linear",category:"productivity",description:"Issues, tâches et suivi du développement.",website:"https://linear.app",integration:"oauth" },
  { id:"discord",name:"Discord",category:"productivity",description:"Notifications, communautés et bots de projet.",website:"https://discord.com",integration:"oauth" },
  { id:"slack",name:"Slack",category:"productivity",description:"Messages et notifications d'équipe.",website:"https://slack.com",integration:"oauth" },
];

export function connectorIntegrationLabel(type: Connector["integration"]) {
  return ({ api: "API à connecter", oauth: "OAuth à configurer", "local-agent": "Agent local requis", import: "Import / téléchargement" })[type];
}

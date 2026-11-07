/**
 * DEBS model release registry.
 *
 * A version is a product release backed by concrete capabilities and evidence.
 * Changing the version string alone is never a release.
 */
export const ACTIVE_MODEL_RELEASE = {
  version: "DEBS 1.1",
  status: "development",
  gatewayModel: "openai/gpt-6-astra",
  trainedInHouse: false,
  releaseNotes: [
    "Specialized coding and game-development task modes.",
    "Higher reasoning effort for engineering tasks.",
    "Explicit engineering workflow for playable vertical slices and quality checks.",
    "Transparent reporting: never claim execution or verification without runtime evidence.",
    "Manual GitHub Actions workflow for desktop/mobile Chromium checks, declarative interaction tests, screenshots, and JSON/Markdown evidence reports.",
    "Unified white-and-red mobile-first chat interface with searchable conversation history.",
    "Browser dictation and bounded image, PDF, text, and code attachments in both welcome and conversation composers.",
    "Consistent creator identity across model prompts, welcome screen, and account screen.",
  ],
  capabilities: {
    specializedGameDevelopment: true,
    browserVoiceDictation: true,
    fileAttachments: "images-pdf-text-code-with-size-and-count-limits",
    creatorIdentity: true,
    cloudConversationHistory: "implemented-but-cloud-runtime-not-verified",
    webSearch: "gateway-tool-configured-but-live-search-not-verified",
    repositoryContextRead: true,
    durableAgentJobs: "implemented-but-not-deployed",
    autonomousRepositoryWrites: "draft-pr-workflow-not-runtime-verified",
    remoteBuildAndExecution: false,
    unityBuildRunner: false,
    unrealBuildRunner: false,
    godotBuildRunner: false,
    browserGameRuntimeVerification: "manual-desktop-mobile-chromium-and-declarative-tests-workflow-not-runtime-verified",
  },
} as const;

export type ModelRelease = typeof ACTIVE_MODEL_RELEASE;

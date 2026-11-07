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
    "Manual GitHub Actions workflow for Chromium launch and rendering smoke checks of browser game projects.",
  ],
  capabilities: {
    specializedGameDevelopment: true,
    repositoryContextRead: true,
    durableAgentJobs: "implemented-but-not-deployed",
    autonomousRepositoryWrites: "draft-pr-workflow-not-runtime-verified",
    remoteBuildAndExecution: false,
    unityBuildRunner: false,
    unrealBuildRunner: false,
    godotBuildRunner: false,
    browserGameRuntimeVerification: "manual-chromium-smoke-workflow-not-runtime-verified",
  },
} as const;

export type ModelRelease = typeof ACTIVE_MODEL_RELEASE;

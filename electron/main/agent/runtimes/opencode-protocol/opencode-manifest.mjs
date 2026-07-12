export const OPENCODE_UPSTREAM = Object.freeze({
  repository: "https://github.com/anomalyco/opencode",
  commit: "9976269ab1accfc9f9dc98a4a688c516934de422",
  releaseCommit: "b8374b5a7c532e51aeb66b1dee9278de91526ef5",
  sourceVersion: "1.17.18",
  // The managed binary remains pinned exactly. User-installed OpenCode is
  // capability-probed through ACP instead of inheriting this release floor.
  protocolFloor: "1.17.18",
  license: "MIT",
  promptManifestVersion: 1,
});

export const OPENCODE_PROMPT_PROFILE = Object.freeze({
  id: "opencode-native-puppyone-main-v1",
  commit: "b8374b5a7c532e51aeb66b1dee9278de91526ef5",
  manifestSha256: "28ae2331636a9d9ba852953f00ee5cea1ca09fccd4dfff37d92b1cc70605406d",
});

export const OPENCODE_RELEASE_ARTIFACTS = Object.freeze({
  "darwin-arm64": Object.freeze({ archive: "opencode-darwin-arm64.zip", archiveSha256: "24327f89c103526c0518fc9b797767f318ab85ef3cee8636e722d6138f33aa3d" }),
  "darwin-x64": Object.freeze({ archive: "opencode-darwin-x64.zip", archiveSha256: "cebf209aad2c0bd998fbac3f8dd1b45eef35da1af18cd698e78b111b73c5fbb0" }),
  "linux-arm64": Object.freeze({ archive: "opencode-linux-arm64.tar.gz", archiveSha256: "db9b53eae485da969a0a855bca465f9901dd84676384f724f320e3ccc5a9b107" }),
  "linux-x64": Object.freeze({ archive: "opencode-linux-x64.tar.gz", archiveSha256: "e149d32ee5667c0cd5fb84d0bf8393b312e93782eeb4d74d29bbb0392de7133c" }),
  "win32-arm64": Object.freeze({ archive: "opencode-windows-arm64.zip", archiveSha256: "fcfbd7f82242f47ec7e98bc8819eeebe716654e9bce1fb1bd7f364e887cb95ab" }),
  "win32-x64": Object.freeze({ archive: "opencode-windows-x64.zip", archiveSha256: "7d489fd9b314e25bccf9c5dd2f17ef2774902c7b7db9aa34f46b0aab4715c70c" }),
});

export const OPENCODE_CAPABILITIES = Object.freeze({
  streamingText: true,
  structuredToolEvents: true,
  commandOutputStreaming: true,
  fileChangeEvents: true,
  manualApprovals: true,
  structuredQuestions: true,
  resume: true,
  fork: true,
  steer: false,
  queue: false,
  attachments: true,
  contextReferences: true,
  modelSelection: true,
  modeSelection: true,
  slashCommands: true,
  sessionHistory: true,
  usage: true,
  accountState: true,
  mcp: true,
  skills: true,
  compaction: true,
});

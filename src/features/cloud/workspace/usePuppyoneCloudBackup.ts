// Compatibility facade for integrations that have not migrated their import.
export { useCloudInitialization as usePuppyoneCloudBackup } from "../initialization/useCloudInitialization";
export type {
  CloudInitializationFailure as CloudPublishFailure,
  CloudInitializationNotice as CloudPublishNotice,
} from "../initialization/useCloudInitialization";

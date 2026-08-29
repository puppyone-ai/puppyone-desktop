/** Runtime-scoped routing state. Only PuppyOne-managed runtimes need provider/model fields. */
export type AgentRoutePreference = {
  providerId?: string;
  modelId?: string;
  variant?: string;
  effort?: string;
  mode?: string;
};

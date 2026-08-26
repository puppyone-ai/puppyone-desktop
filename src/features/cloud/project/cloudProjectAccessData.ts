import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudRepositoryView,
  DesktopCloudScope,
} from "../../../lib/cloudApi";
import type { CloudMessageDescriptor } from "../cloudPresentation";
import type { AccessPointRow } from "../access-points/model";

/** Route-local projection shared by the current Project Access and Automation UI. */
export type CloudProjectAccessData = {
  scopes: DesktopCloudScope[];
  scopeRows: DesktopCloudRepositoryView[];
  connectors: DesktopCloudConnector[];
  connectorsByTarget: Map<string, DesktopCloudConnector[]>;
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  mcpEndpointsByTarget: Map<string, DesktopCloudMcpEndpoint[]>;
  accessPointRows: AccessPointRow[];
  identity: DesktopCloudRepoIdentity | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
  warning: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
};

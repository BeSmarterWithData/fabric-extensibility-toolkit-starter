import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { FabricPlatformAPIClient } from "../../clients/FabricPlatformAPIClient";
import { Item, CreateItemRequest } from "../../clients/FabricPlatformTypes";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";

/**
 * Result of a deployment operation for a single resource
 */
export interface DeploymentResult {
  success: boolean;
  itemId?: string;
  itemName?: string;
  error?: string;
}

/**
 * Result of the full deployment (lakehouse + notebook + semantic model + report + pipeline)
 */
export interface FullDeploymentResult {
  lakehouse: DeploymentResult;
  notebook: DeploymentResult;
  semanticModel: DeploymentResult;
  report: DeploymentResult;
  pipeline: DeploymentResult;
}

/**
 * Current deployment status including item IDs for dependency resolution
 */
export interface DeploymentStatus {
  isLakehouseDeployed: boolean;
  isNotebookDeployed: boolean;
  isPipelineDeployed: boolean;
  isSemanticModelDeployed: boolean;
  isReportDeployed: boolean;
  lakehouseItemId?: string;
  notebookItemId?: string;
  pipelineItemId?: string;
  semanticModelItemId?: string;
  reportItemId?: string;
}

/**
 * A single part from a PBIP bundle file
 */
interface BundlePart {
  path: string;
  content: string;
  binary: boolean;
}

/**
 * Structure of a PBIP bundle JSON file
 */
interface PBIPBundle {
  format: string;
  parts: BundlePart[];
}

/**
 * Handles deploying ImpactIQ resources (Lakehouse, Notebook, Semantic Model, Report, Pipeline)
 * into the user's Fabric workspace using the Fabric Platform REST APIs.
 */
export class ImpactIQDeploymentService {
  private fabricApi: FabricPlatformAPIClient;
  private workloadClient: WorkloadClientAPI;

  constructor(workloadClient: WorkloadClientAPI) {
    this.workloadClient = workloadClient;
    this.fabricApi = FabricPlatformAPIClient.create(workloadClient);
  }

  /**
   * Deploy a Lakehouse into the workspace.
   */
  async deployLakehouse(workspaceId: string, displayName: string): Promise<DeploymentResult> {
    try {
      // Check if lakehouse already exists
      const existing = await this.findItemByName(workspaceId, displayName, "Lakehouse");
      if (existing) {
        return { success: true, itemId: existing.id, itemName: existing.displayName };
      }

      const request: CreateItemRequest = {
        displayName,
        type: "Lakehouse",
        description: "ImpactIQ governance metadata lakehouse - stores Power BI & Fabric metadata tables.",
      };

      const item = await this.fabricApi.items.createItem(workspaceId, request);
      return { success: true, itemId: item.id, itemName: item.displayName };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Deploy the GovernanceNotebook into the workspace.
   * Loads the .ipynb from bundled assets, injects user configuration into the
   * notebook's first cell, then uploads via the Fabric Create Item API.
   */
  async deployNotebook(
    workspaceId: string,
    displayName: string,
    definition: ImpactIQItemDefinition,
    lakehouseId?: string
  ): Promise<DeploymentResult> {
    try {
      // Check if notebook already exists
      const existing = await this.findItemByName(workspaceId, displayName, "Notebook");
      if (existing) {
        return { success: true, itemId: existing.id, itemName: existing.displayName };
      }

      // Load the notebook .ipynb from assets (bundled by CopyWebpackPlugin)
      const notebookJson = await this.loadNotebookFromAssets();

      // Inject user configuration into the notebook
      this.injectConfiguration(notebookJson, definition);

      // Attach the default lakehouse if provided
      if (lakehouseId) {
        this.attachLakehouse(notebookJson, workspaceId, lakehouseId, definition.lakehouseName || "PowerBIGovernance");
      }

      // Convert to base64
      const notebookContent = JSON.stringify(notebookJson);
      const base64Content = btoa(unescape(encodeURIComponent(notebookContent)));

      const request: CreateItemRequest = {
        displayName,
        type: "Notebook",
        description: "ImpactIQ governance extraction notebook - extracts Power BI & Fabric metadata into lakehouse tables.",
        definition: {
          format: "ipynb",
          parts: [
            {
              path: "notebook-content.ipynb",
              payload: base64Content,
              payloadType: "InlineBase64",
            },
          ],
        },
      };

      const item = await this.fabricApi.items.createItem(workspaceId, request);
      return { success: true, itemId: item.id, itemName: item.displayName };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Deploy the Semantic Model (TMDL) from the bundled PBIP assets.
   * Replaces the lakehouse connection parameters with the actual deployed lakehouse's SQL endpoint.
   */
  async deploySemanticModel(
    workspaceId: string,
    displayName: string,
    lakehouseId?: string,
    lakehouseName?: string,
    sqlEndpoint?: string
  ): Promise<DeploymentResult> {
    try {
      const existing = await this.findItemByName(workspaceId, displayName, "SemanticModel");
      if (existing) {
        return { success: true, itemId: existing.id, itemName: existing.displayName };
      }

      const bundle = await this.loadBundle("/assets/GovernanceModel.bundle.json");

      // Replace lakehouse connection parameters in expressions.tmdl
      if (sqlEndpoint || lakehouseName) {
        const exprPart = bundle.parts.find(p => p.path === "definition/expressions.tmdl");
        if (exprPart) {
          if (sqlEndpoint) {
            // Replace the old SQL endpoint with the new one
            exprPart.content = exprPart.content.replace(
              /expression 'Base Lakehouse SQL Connection' = ".*?" meta/,
              `expression 'Base Lakehouse SQL Connection' = "${sqlEndpoint}" meta`
            );
          }
          if (lakehouseName) {
            // Replace the old lakehouse name with the new one
            exprPart.content = exprPart.content.replace(
              /expression 'Base Lakehouse Name' = ".*?" meta/,
              `expression 'Base Lakehouse Name' = "${lakehouseName}" meta`
            );
          }
        }
      }

      // Build API parts from the bundle
      const parts = bundle.parts.map(p => ({
        path: p.path,
        payload: p.binary ? p.content : btoa(unescape(encodeURIComponent(p.content))),
        payloadType: "InlineBase64" as const,
      }));

      const request: CreateItemRequest = {
        displayName,
        type: "SemanticModel",
        description: "ImpactIQ Power BI Governance semantic model — connects to the governance lakehouse.",
        definition: {
          format: "TMDL",
          parts,
        },
      };

      const item = await this.fabricApi.items.createItem(workspaceId, request);
      return { success: true, itemId: item.id, itemName: item.displayName };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Deploy the Report (PBIR) from the bundled PBIP assets.
   * Updates the definition.pbir to reference the deployed semantic model by connection.
   */
  async deployReport(
    workspaceId: string,
    displayName: string,
    semanticModelId?: string
  ): Promise<DeploymentResult> {
    try {
      const existing = await this.findItemByName(workspaceId, displayName, "Report");
      if (existing) {
        return { success: true, itemId: existing.id, itemName: existing.displayName };
      }

      const bundle = await this.loadBundle("/assets/GovernanceReport.bundle.json");

      // Update definition.pbir to reference the semantic model by connection instead of byPath
      if (semanticModelId) {
        const pbirPart = bundle.parts.find(p => p.path === "definition.pbir");
        if (pbirPart) {
          const pbirJson = JSON.parse(pbirPart.content);
          // Replace byPath reference with byConnection for deployed model
          delete pbirJson.datasetReference?.byPath;
          pbirJson.datasetReference = {
            byConnection: {
              connectionString: null,
              pbiServiceModelId: null,
              pbiModelVirtualServerName: "sobe_wowvirtualserver",
              pbiModelDatabaseName: semanticModelId,
              name: "EntityDataSource",
              connectionType: "pbiServiceXmlaStyleLive",
            },
          };
          pbirPart.content = JSON.stringify(pbirJson, null, 2);
        }
      }

      // Build API parts from the bundle
      const parts = bundle.parts.map(p => ({
        path: p.path,
        payload: p.binary ? p.content : btoa(unescape(encodeURIComponent(p.content))),
        payloadType: "InlineBase64" as const,
      }));

      const request: CreateItemRequest = {
        displayName,
        type: "Report",
        description: "ImpactIQ Power BI Governance report — visualizes governance metadata.",
        definition: {
          format: "PBIR",
          parts,
        },
      };

      const item = await this.fabricApi.items.createItem(workspaceId, request);
      return { success: true, itemId: item.id, itemName: item.displayName };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Get the SQL analytics endpoint for a Fabric Lakehouse.
   * Calls GET /v1/workspaces/{wid}/lakehouses/{lid} to retrieve SQL endpoint properties.
   */
  async getLakehouseSqlEndpoint(workspaceId: string, lakehouseId: string): Promise<string | undefined> {
    try {
      const token = await this.workloadClient.auth.acquireFrontendAccessToken({
        scopes: ["https://analysis.windows.net/powerbi/api/.default"],
      });
      const response = await fetch(
        `https://api.fabric.microsoft.com/v1/workspaces/${encodeURIComponent(workspaceId)}/lakehouses/${encodeURIComponent(lakehouseId)}`,
        {
          headers: {
            Authorization: `Bearer ${token.token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) return undefined;
      const data = await response.json();
      return data?.properties?.sqlEndpointProperties?.connectionString;
    } catch {
      return undefined;
    }
  }

  /**
   * Deploy a Data Pipeline that runs the notebook on a schedule.
   */
  async deployPipeline(
    workspaceId: string,
    displayName: string,
    notebookId?: string
  ): Promise<DeploymentResult> {
    try {
      // Check if pipeline already exists
      const existing = await this.findItemByName(workspaceId, displayName, "DataPipeline");
      if (existing) {
        return { success: true, itemId: existing.id, itemName: existing.displayName };
      }

      // Build pipeline definition with notebook activity if notebookId is available
      const pipelineDefinition = this.buildPipelineDefinition(notebookId);
      const pipelineContent = JSON.stringify(pipelineDefinition);
      const base64Content = btoa(unescape(encodeURIComponent(pipelineContent)));

      const request: CreateItemRequest = {
        displayName,
        type: "DataPipeline",
        description: "ImpactIQ governance extraction pipeline - schedules the governance notebook execution.",
        definition: {
          parts: [
            {
              path: "pipeline-content.json",
              payload: base64Content,
              payloadType: "InlineBase64",
            },
          ],
        },
      };

      const item = await this.fabricApi.items.createItem(workspaceId, request);
      return { success: true, itemId: item.id, itemName: item.displayName };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Deploy all resources in sequence: Lakehouse → Notebook + SemanticModel → Report → Pipeline.
   */
  async deployAll(
    workspaceId: string,
    definition: ImpactIQItemDefinition
  ): Promise<FullDeploymentResult> {
    const lakehouseName = definition.lakehouseName || "PowerBIGovernance";
    const notebookName = definition.notebookName || "GovernanceNotebook";
    const pipelineName = definition.pipelineName || "GovernanceExtraction";
    const semanticModelName = definition.semanticModelName || "Power BI Governance Model";
    const reportName = definition.reportName || "Power BI Governance Report";

    // 1. Deploy Lakehouse first
    const lakehouseResult = await this.deployLakehouse(workspaceId, lakehouseName);

    // 2. Get the lakehouse SQL endpoint for the semantic model connection
    let sqlEndpoint: string | undefined;
    if (lakehouseResult.success && lakehouseResult.itemId) {
      sqlEndpoint = await this.getLakehouseSqlEndpoint(workspaceId, lakehouseResult.itemId);
    }

    // 3. Deploy Notebook (with lakehouse attachment) and Semantic Model (with lakehouse connection) in parallel
    const [notebookResult, semanticModelResult] = await Promise.all([
      this.deployNotebook(
        workspaceId,
        notebookName,
        definition,
        lakehouseResult.success ? lakehouseResult.itemId : undefined
      ),
      this.deploySemanticModel(
        workspaceId,
        semanticModelName,
        lakehouseResult.success ? lakehouseResult.itemId : undefined,
        lakehouseName,
        sqlEndpoint
      ),
    ]);

    // 4. Deploy Report (referencing the semantic model)
    const reportResult = await this.deployReport(
      workspaceId,
      reportName,
      semanticModelResult.success ? semanticModelResult.itemId : undefined
    );

    // 5. Deploy Pipeline (referencing the notebook)
    const pipelineResult = await this.deployPipeline(
      workspaceId,
      pipelineName,
      notebookResult.success ? notebookResult.itemId : undefined
    );

    return {
      lakehouse: lakehouseResult,
      notebook: notebookResult,
      semanticModel: semanticModelResult,
      report: reportResult,
      pipeline: pipelineResult,
    };
  }

  /**
   * Check existing deployment status by looking for items in the workspace.
   * Returns deployment flags AND item IDs so dependents can reference them.
   */
  async checkDeploymentStatus(
    workspaceId: string,
    definition: ImpactIQItemDefinition
  ): Promise<DeploymentStatus> {
    const lakehouseName = definition.lakehouseName || "PowerBIGovernance";
    const notebookName = definition.notebookName || "GovernanceNotebook";
    const pipelineName = definition.pipelineName || "GovernanceExtraction";
    const semanticModelName = definition.semanticModelName || "Power BI Governance Model";
    const reportName = definition.reportName || "Power BI Governance Report";

    const [lakehouse, notebook, pipeline, semanticModel, report] = await Promise.all([
      this.findItemByName(workspaceId, lakehouseName, "Lakehouse"),
      this.findItemByName(workspaceId, notebookName, "Notebook"),
      this.findItemByName(workspaceId, pipelineName, "DataPipeline"),
      this.findItemByName(workspaceId, semanticModelName, "SemanticModel"),
      this.findItemByName(workspaceId, reportName, "Report"),
    ]);

    return {
      isLakehouseDeployed: !!lakehouse,
      isNotebookDeployed: !!notebook,
      isPipelineDeployed: !!pipeline,
      isSemanticModelDeployed: !!semanticModel,
      isReportDeployed: !!report,
      lakehouseItemId: lakehouse?.id,
      notebookItemId: notebook?.id,
      pipelineItemId: pipeline?.id,
      semanticModelItemId: semanticModel?.id,
      reportItemId: report?.id,
    };
  }

  // ---- Private helpers ----

  private async findItemByName(workspaceId: string, displayName: string, type: string): Promise<Item | undefined> {
    try {
      const items = await this.fabricApi.items.listItems(workspaceId, { type });
      return items.value?.find(i => i.displayName === displayName);
    } catch {
      return undefined;
    }
  }

  /**
   * Load a PBIP bundle JSON from the bundled assets folder.
   */
  private async loadBundle(assetPath: string): Promise<PBIPBundle> {
    const response = await fetch(assetPath);
    if (!response.ok) {
      throw new Error(`Failed to load bundle from ${assetPath} (HTTP ${response.status})`);
    }
    return response.json();
  }

  /**
   * Load the GovernanceNotebook.ipynb from the bundled assets folder.
   */
  private async loadNotebookFromAssets(): Promise<Record<string, unknown>> {
    const response = await fetch("/assets/GovernanceNotebook.ipynb");
    if (!response.ok) {
      throw new Error(`Failed to load GovernanceNotebook.ipynb from assets (HTTP ${response.status})`);
    }
    return response.json();
  }

  /**
   * Inject user configuration (schema, workspaces, workers) into the notebook's first cell.
   * Replaces the default config values with user-specified ones.
   */
  private injectConfiguration(notebookJson: Record<string, unknown>, definition: ImpactIQItemDefinition): void {
    const cells = notebookJson["cells"] as Array<Record<string, unknown>>;
    if (!cells || cells.length === 0) return;

    const firstCell = cells[0];
    const source = firstCell["source"] as string[];
    if (!Array.isArray(source)) return;

    // Replace configuration values in the source lines
    for (let i = 0; i < source.length; i++) {
      const line = source[i];

      if (line.startsWith('LAKEHOUSE_SCHEMA')) {
        source[i] = `LAKEHOUSE_SCHEMA = "${definition.lakehouseSchema || "dbo"}"          # Configured by ImpactIQ workload\n`;
      } else if (line.startsWith('WORKSPACE_NAMES')) {
        const wsJson = JSON.stringify(definition.workspaceNames || ["All"]);
        source[i] = `WORKSPACE_NAMES = ${wsJson}         # Configured by ImpactIQ workload\n`;
      } else if (line.startsWith('MAX_PARALLEL_WORKERS')) {
        source[i] = `MAX_PARALLEL_WORKERS = ${definition.maxParallelWorkers || 5}\n`;
      }
    }
  }

  /**
   * Attach a default lakehouse to the notebook metadata.
   * Fabric notebooks store lakehouse attachment in notebook-level metadata.
   */
  private attachLakehouse(
    notebookJson: Record<string, unknown>,
    workspaceId: string,
    lakehouseId: string,
    lakehouseName: string
  ): void {
    // Fabric notebook metadata format for default lakehouse
    let metadata = notebookJson["metadata"] as Record<string, unknown>;
    if (!metadata) {
      metadata = {};
      notebookJson["metadata"] = metadata;
    }

    // Set the dependencies.lakehouse metadata that Fabric uses to attach the default lakehouse.
    // This replaces any previously baked-in lakehouse reference from the original .ipynb file.
    let dependencies = metadata["dependencies"] as Record<string, unknown>;
    if (!dependencies) {
      dependencies = {};
      metadata["dependencies"] = dependencies;
    }
    dependencies["lakehouse"] = {
      default_lakehouse: lakehouseId,
      default_lakehouse_name: lakehouseName,
      default_lakehouse_workspace_id: workspaceId,
      known_lakehouses: [
        {
          id: lakehouseId,
        },
      ],
    };
  }

  /**
   * Build a Fabric Data Pipeline definition JSON that runs a notebook.
   */
  private buildPipelineDefinition(notebookId?: string): Record<string, unknown> {
    const activities: Record<string, unknown>[] = [];

    if (notebookId) {
      activities.push({
        name: "Run GovernanceNotebook",
        type: "TridentNotebook",
        dependsOn: [],
        policy: {
          timeout: "0.12:00:00",
          retry: 0,
          retryIntervalInSeconds: 30,
          secureInput: false,
          secureOutput: false,
        },
        typeProperties: {
          notebookId: notebookId,
          workspaceId: null, // use current workspace
        },
      });
    }

    return {
      properties: {
        activities,
        annotations: [],
      },
    };
  }
}

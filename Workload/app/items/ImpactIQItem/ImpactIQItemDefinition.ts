
/***
 * Interface representing the definition of an ImpactIQ item.
 * This information is stored in Fabric as Item definition.
 * It will be returned once the item definition is loaded.
 */
export interface ImpactIQItemDefinition {
  /** Lakehouse schema name for metadata tables (default: "dbo") */
  lakehouseSchema?: string;
  /** Workspace names to scan. ["All"] scans all accessible workspaces */
  workspaceNames?: string[];
  /** Number of parallel API calls (1-10) */
  maxParallelWorkers?: number;
  /** Name of the deployed lakehouse in the workspace */
  lakehouseName?: string;
  /** Name of the deployed notebook in the workspace */
  notebookName?: string;
  /** Name of the deployed pipeline in the workspace */
  pipelineName?: string;
  /** Name of the deployed semantic model in the workspace */
  semanticModelName?: string;
  /** Name of the deployed report in the workspace */
  reportName?: string;
  /** Whether the notebook has been deployed */
  isNotebookDeployed?: boolean;
  /** Whether the lakehouse has been deployed */
  isLakehouseDeployed?: boolean;
  /** Whether the pipeline has been deployed */
  isPipelineDeployed?: boolean;
  /** Whether the semantic model has been deployed */
  isSemanticModelDeployed?: boolean;
  /** Whether the report has been deployed */
  isReportDeployed?: boolean;
  /** Last successful run timestamp */
  lastRunTimestamp?: string;
  /** SQL connection string for the lakehouse SQL endpoint */
  sqlConnectionString?: string;
}

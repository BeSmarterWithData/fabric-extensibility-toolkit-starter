import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Badge,
  Card,
  CardHeader,
  Divider,
  Button,
  Spinner,
  tokens,
} from "@fluentui/react-components";
import {
  DatabaseRegular,
  NotebookRegular,
  PipelineRegular,
  CheckmarkCircle24Filled,
  Clock24Regular,
  Info24Regular,
  RocketRegular,
  ArrowSyncRegular,
  DataBarVerticalRegular,
  DocumentTableRegular,
} from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";
import { ImpactIQDeploymentService, DeploymentResult, FullDeploymentResult, DeploymentStatus } from "./ImpactIQDeploymentService";
import "./ImpactIQItem.scss";

interface ImpactIQStatusPanelProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<ImpactIQItemDefinition>;
  currentDefinition: ImpactIQItemDefinition;
  onDefinitionChange: (updates: Partial<ImpactIQItemDefinition>) => void;
}

/**
 * Center panel - Status dashboard for ImpactIQ governance extraction.
 * Displays deployment status with real deploy buttons, last run info,
 * and extracted tables overview.
 */
export function ImpactIQStatusPanel({
  workloadClient,
  item,
  currentDefinition,
  onDefinitionChange,
}: ImpactIQStatusPanelProps) {
  const { t } = useTranslation();
  const [isDeploying, setIsDeploying] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  // Track deployed item IDs so dependents can reference them
  const [deployedItemIds, setDeployedItemIds] = useState<Partial<DeploymentStatus>>({});

  const deployedIcon = <CheckmarkCircle24Filled style={{ color: tokens.colorPaletteGreenForeground1 }} />;

  const workspaceId = item?.workspaceId;

  /**
   * Check actual deployment status by querying the workspace for existing items.
   */
  const checkDeploymentStatus = useCallback(async () => {
    if (!workspaceId) return;
    setIsCheckingStatus(true);
    try {
      const service = new ImpactIQDeploymentService(workloadClient);
      const status = await service.checkDeploymentStatus(workspaceId, currentDefinition);
      setDeployedItemIds(status);
      onDefinitionChange({
        isLakehouseDeployed: status.isLakehouseDeployed,
        isNotebookDeployed: status.isNotebookDeployed,
        isPipelineDeployed: status.isPipelineDeployed,
        isSemanticModelDeployed: status.isSemanticModelDeployed,
        isReportDeployed: status.isReportDeployed,
      });
    } catch (error) {
      console.error("Failed to check deployment status:", error);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [workloadClient, workspaceId, currentDefinition.lakehouseName, currentDefinition.notebookName, currentDefinition.pipelineName, currentDefinition.semanticModelName, currentDefinition.reportName]);

  // Auto-check deployment status on mount when workspace is available
  useEffect(() => {
    if (workspaceId) {
      checkDeploymentStatus();
    }
  }, [workspaceId]);

  /**
   * Deploy all resources (Lakehouse, Notebook, Pipeline) in sequence.
   */
  const handleDeployAll = async () => {
    if (!workspaceId) return;
    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(null);

    try {
      const service = new ImpactIQDeploymentService(workloadClient);
      const result: FullDeploymentResult = await service.deployAll(workspaceId, currentDefinition);

      // Update definition with deployment status
      onDefinitionChange({
        isLakehouseDeployed: result.lakehouse.success,
        isNotebookDeployed: result.notebook.success,
        isPipelineDeployed: result.pipeline.success,
        isSemanticModelDeployed: result.semanticModel.success,
        isReportDeployed: result.report.success,
        lastRunTimestamp: new Date().toISOString(),
      });

      // Build status message
      const successes: string[] = [];
      const failures: string[] = [];
      if (result.lakehouse.success) successes.push("Lakehouse"); else failures.push(`Lakehouse: ${result.lakehouse.error}`);
      if (result.notebook.success) successes.push("Notebook"); else failures.push(`Notebook: ${result.notebook.error}`);
      if (result.semanticModel.success) successes.push("Semantic Model"); else failures.push(`Semantic Model: ${result.semanticModel.error}`);
      if (result.report.success) successes.push("Report"); else failures.push(`Report: ${result.report.error}`);
      if (result.pipeline.success) successes.push("Pipeline"); else failures.push(`Pipeline: ${result.pipeline.error}`);

      if (failures.length === 0) {
        setDeploySuccess(`Successfully deployed: ${successes.join(", ")}`);
      } else {
        setDeployError(`Deployed: ${successes.join(", ") || "none"}. Failed: ${failures.join("; ")}`);
      }
    } catch (error) {
      setDeployError(error?.message || "Deployment failed unexpectedly.");
    } finally {
      setIsDeploying(false);
    }
  };

  /**
   * Deploy a single resource type, respecting the dependency chain:
   * Lakehouse → Notebook (needs lakehouse ID)
   * Lakehouse → SemanticModel (needs lakehouse SQL endpoint) → Report (needs model ID)
   * Notebook → Pipeline (needs notebook ID)
   */
  const handleDeploySingle = async (resourceType: "lakehouse" | "notebook" | "pipeline" | "semanticModel" | "report") => {
    if (!workspaceId) return;
    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(null);

    try {
      const service = new ImpactIQDeploymentService(workloadClient);
      let result: DeploymentResult | undefined;
      const lakehouseName = currentDefinition.lakehouseName || "PowerBIGovernance";

      // Helper: ensure lakehouse is deployed and return its ID
      const ensureLakehouse = async (): Promise<string | undefined> => {
        let id = deployedItemIds.lakehouseItemId;
        if (!id) {
          const lhResult = await service.deployLakehouse(workspaceId, lakehouseName);
          if (lhResult.success) {
            id = lhResult.itemId;
            setDeployedItemIds(prev => ({ ...prev, lakehouseItemId: id }));
            onDefinitionChange({ isLakehouseDeployed: true });
          } else {
            setDeployError(`Prerequisite failed: lakehouse — ${lhResult.error}`);
            return undefined;
          }
        }
        return id;
      };

      switch (resourceType) {
        case "lakehouse":
          result = await service.deployLakehouse(workspaceId, lakehouseName);
          if (result.success) {
            setDeployedItemIds(prev => ({ ...prev, lakehouseItemId: result.itemId }));
            onDefinitionChange({ isLakehouseDeployed: true });
          }
          break;

        case "notebook": {
          const lhId = await ensureLakehouse();
          if (!lhId) return;
          result = await service.deployNotebook(
            workspaceId,
            currentDefinition.notebookName || "GovernanceNotebook",
            currentDefinition,
            lhId
          );
          if (result.success) {
            setDeployedItemIds(prev => ({ ...prev, notebookItemId: result.itemId }));
            onDefinitionChange({ isNotebookDeployed: true });
          }
          break;
        }

        case "semanticModel": {
          const lhId = await ensureLakehouse();
          if (!lhId) return;
          const sqlEndpoint = await service.getLakehouseSqlEndpoint(workspaceId, lhId);
          result = await service.deploySemanticModel(
            workspaceId,
            currentDefinition.semanticModelName || "Power BI Governance Model",
            lhId,
            lakehouseName,
            sqlEndpoint
          );
          if (result.success) {
            setDeployedItemIds(prev => ({ ...prev, semanticModelItemId: result.itemId }));
            onDefinitionChange({ isSemanticModelDeployed: true });
          }
          break;
        }

        case "report": {
          // Report needs the semantic model → which needs the lakehouse
          let smId = deployedItemIds.semanticModelItemId;
          if (!smId) {
            const lhId = await ensureLakehouse();
            if (!lhId) return;
            const sqlEndpoint = await service.getLakehouseSqlEndpoint(workspaceId, lhId);
            const smResult = await service.deploySemanticModel(
              workspaceId,
              currentDefinition.semanticModelName || "Power BI Governance Model",
              lhId,
              lakehouseName,
              sqlEndpoint
            );
            if (smResult.success) {
              smId = smResult.itemId;
              setDeployedItemIds(prev => ({ ...prev, semanticModelItemId: smId }));
              onDefinitionChange({ isSemanticModelDeployed: true });
            } else {
              setDeployError(`Prerequisite failed: semantic model — ${smResult.error}`);
              return;
            }
          }
          result = await service.deployReport(
            workspaceId,
            currentDefinition.reportName || "Power BI Governance Report",
            smId
          );
          if (result.success) {
            setDeployedItemIds(prev => ({ ...prev, reportItemId: result.itemId }));
            onDefinitionChange({ isReportDeployed: true });
          }
          break;
        }

        case "pipeline": {
          let notebookId = deployedItemIds.notebookItemId;
          if (!notebookId) {
            const lhId = await ensureLakehouse();
            if (!lhId) return;
            const nbResult = await service.deployNotebook(
              workspaceId,
              currentDefinition.notebookName || "GovernanceNotebook",
              currentDefinition,
              lhId
            );
            if (nbResult.success) {
              notebookId = nbResult.itemId;
              setDeployedItemIds(prev => ({ ...prev, notebookItemId: notebookId }));
              onDefinitionChange({ isNotebookDeployed: true });
            } else {
              setDeployError(`Prerequisite failed: notebook — ${nbResult.error}`);
              return;
            }
          }
          result = await service.deployPipeline(
            workspaceId,
            currentDefinition.pipelineName || "GovernanceExtraction",
            notebookId
          );
          if (result.success) {
            setDeployedItemIds(prev => ({ ...prev, pipelineItemId: result.itemId }));
            onDefinitionChange({ isPipelineDeployed: true });
          }
          break;
        }
      }

      if (result?.success) {
        const label = resourceType === "semanticModel" ? "Semantic Model" : resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
        setDeploySuccess(`${label} deployed successfully.`);
      } else if (result) {
        setDeployError(result.error || `Failed to deploy ${resourceType}.`);
      }
    } catch (error) {
      setDeployError(error?.message || `Failed to deploy ${resourceType}.`);
    } finally {
      setIsDeploying(false);
    }
  };

  const allDeployed = currentDefinition.isLakehouseDeployed && currentDefinition.isNotebookDeployed && currentDefinition.isPipelineDeployed && currentDefinition.isSemanticModelDeployed && currentDefinition.isReportDeployed;

  /**
   * List of tables extracted by ImpactIQ, grouped by extraction cell
   */
  const tableGroups = [
    {
      title: t('ImpactIQ_Tables_Environment', 'Environment Details'),
      description: t('ImpactIQ_Tables_Environment_Desc', 'Workspaces, datasets, reports, dataflows, apps, and refresh history'),
      tables: [
        "Workspaces", "FabricItems", "Datasets", "DatasetSourcesInfo",
        "DatasetRefreshHistory", "DatasetRefreshSchedule", "Dataflows",
        "DataflowLineage", "DataflowSourcesInfo", "DataflowRefreshHistory",
        "Reports", "ReportPages", "Apps", "AppReports"
      ]
    },
    {
      title: t('ImpactIQ_Tables_Model', 'Model Metadata'),
      description: t('ImpactIQ_Tables_Model_Desc', 'Tables, columns, measures, relationships, calculation groups, and dependencies'),
      tables: ["ModelDetail", "ModelDependencies"]
    },
    {
      title: t('ImpactIQ_Tables_Report', 'Report Metadata'),
      description: t('ImpactIQ_Tables_Report_Desc', 'Visuals, pages, bookmarks, filters, visual objects, and report-level measures'),
      tables: [
        "Connections", "Pages", "Visuals", "Bookmarks", "CustomVisuals",
        "ReportFilters", "PageFilters", "VisualFilters", "VisualObjects",
        "ReportLevelMeasures", "VisualInteractions"
      ]
    },
    {
      title: t('ImpactIQ_Tables_Dataflow', 'Dataflow Details'),
      description: t('ImpactIQ_Tables_Dataflow_Desc', 'Dataflow queries and M expressions for Gen1 and Gen2 dataflows'),
      tables: ["DataflowDetail"]
    }
  ];

  return (
    <div className="impactiq-view">
      <Text size={500} weight="semibold">
        {t('ImpactIQ_Status_Title', 'ImpactIQ Governance Dashboard')}
      </Text>
      <Text size={300}>
        {t('ImpactIQ_Status_Subtitle', 'Automated Power BI & Fabric metadata extraction into your Lakehouse. Deploy the resources below, then run the notebook to extract metadata.')}
      </Text>

      <Divider />

      {/* Deploy All Button */}
      <div className="impactiq-config-section">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <Button
            appearance="primary"
            icon={isDeploying ? <Spinner size="tiny" /> : <RocketRegular />}
            disabled={isDeploying || allDeployed || !workspaceId}
            onClick={handleDeployAll}
            size="medium"
          >
            {isDeploying ? t('ImpactIQ_Deploy_Deploying', 'Deploying...') : allDeployed ? t('ImpactIQ_Deploy_AllDeployed', 'All Deployed') : t('ImpactIQ_Deploy_All', 'Deploy All')}
          </Button>
          <Button
            appearance="subtle"
            icon={isCheckingStatus ? <Spinner size="tiny" /> : <ArrowSyncRegular />}
            disabled={isCheckingStatus || !workspaceId}
            onClick={checkDeploymentStatus}
            size="small"
          >
            {t('ImpactIQ_Deploy_Refresh', 'Refresh Status')}
          </Button>
        </div>

        {deployError && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: tokens.colorPaletteRedBackground1, borderRadius: 4 }}>
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{deployError}</Text>
          </div>
        )}
        {deploySuccess && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: tokens.colorPaletteGreenBackground1, borderRadius: 4 }}>
            <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>{deploySuccess}</Text>
          </div>
        )}
        {!workspaceId && (
          <div style={{ marginTop: 8 }}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{t('ImpactIQ_Deploy_SaveFirst', 'Save the item first to enable deployment.')}</Text>
          </div>
        )}
      </div>

      <Divider />

      {/* Deployment Status Section */}
      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Status_Deployment', 'Deployment Status')}
        </Text>

        <div className="impactiq-status-cards">
          <Card className="impactiq-status-card">
            <CardHeader
              image={<DatabaseRegular style={{ fontSize: 24 }} />}
              header={<Text weight="semibold">{currentDefinition.lakehouseName || "PowerBIGovernance"}</Text>}
              description={
                <Badge
                  appearance="filled"
                  color={currentDefinition.isLakehouseDeployed ? "success" : "warning"}
                  size="small"
                >
                  {currentDefinition.isLakehouseDeployed
                    ? t('ImpactIQ_Status_Deployed', 'Deployed')
                    : t('ImpactIQ_Status_NotDeployed', 'Not Deployed')}
                </Badge>
              }
              action={currentDefinition.isLakehouseDeployed ? deployedIcon : (
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={isDeploying || !workspaceId}
                  onClick={() => handleDeploySingle("lakehouse")}
                >
                  Deploy
                </Button>
              )}
            />
          </Card>

          <Card className="impactiq-status-card">
            <CardHeader
              image={<NotebookRegular style={{ fontSize: 24 }} />}
              header={<Text weight="semibold">{currentDefinition.notebookName || "GovernanceNotebook"}</Text>}
              description={
                <Badge
                  appearance="filled"
                  color={currentDefinition.isNotebookDeployed ? "success" : "warning"}
                  size="small"
                >
                  {currentDefinition.isNotebookDeployed
                    ? t('ImpactIQ_Status_Deployed', 'Deployed')
                    : t('ImpactIQ_Status_NotDeployed', 'Not Deployed')}
                </Badge>
              }
              action={currentDefinition.isNotebookDeployed ? deployedIcon : (
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={isDeploying || !workspaceId}
                  onClick={() => handleDeploySingle("notebook")}
                  title={!currentDefinition.isLakehouseDeployed ? "Will deploy Lakehouse first" : undefined}
                >
                  {!currentDefinition.isLakehouseDeployed ? "Deploy (+ Lakehouse)" : "Deploy"}
                </Button>
              )}
            />
          </Card>

          <Card className="impactiq-status-card">
            <CardHeader
              image={<DataBarVerticalRegular style={{ fontSize: 24 }} />}
              header={<Text weight="semibold">{currentDefinition.semanticModelName || "Power BI Governance Model"}</Text>}
              description={
                <Badge
                  appearance="filled"
                  color={currentDefinition.isSemanticModelDeployed ? "success" : "warning"}
                  size="small"
                >
                  {currentDefinition.isSemanticModelDeployed
                    ? t('ImpactIQ_Status_Deployed', 'Deployed')
                    : t('ImpactIQ_Status_NotDeployed', 'Not Deployed')}
                </Badge>
              }
              action={currentDefinition.isSemanticModelDeployed ? deployedIcon : (
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={isDeploying || !workspaceId}
                  onClick={() => handleDeploySingle("semanticModel")}
                  title={!currentDefinition.isLakehouseDeployed ? "Will deploy Lakehouse first" : undefined}
                >
                  {!currentDefinition.isLakehouseDeployed ? "Deploy (+ Lakehouse)" : "Deploy"}
                </Button>
              )}
            />
          </Card>

          <Card className="impactiq-status-card">
            <CardHeader
              image={<DocumentTableRegular style={{ fontSize: 24 }} />}
              header={<Text weight="semibold">{currentDefinition.reportName || "Power BI Governance Report"}</Text>}
              description={
                <Badge
                  appearance="filled"
                  color={currentDefinition.isReportDeployed ? "success" : "warning"}
                  size="small"
                >
                  {currentDefinition.isReportDeployed
                    ? t('ImpactIQ_Status_Deployed', 'Deployed')
                    : t('ImpactIQ_Status_NotDeployed', 'Not Deployed')}
                </Badge>
              }
              action={currentDefinition.isReportDeployed ? deployedIcon : (
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={isDeploying || !workspaceId}
                  onClick={() => handleDeploySingle("report")}
                  title={!currentDefinition.isSemanticModelDeployed ? "Will deploy Lakehouse + Semantic Model first" : undefined}
                >
                  {!currentDefinition.isSemanticModelDeployed ? "Deploy (+ prereqs)" : "Deploy"}
                </Button>
              )}
            />
          </Card>

          <Card className="impactiq-status-card">
            <CardHeader
              image={<PipelineRegular style={{ fontSize: 24 }} />}
              header={<Text weight="semibold">{currentDefinition.pipelineName || "GovernanceExtraction"}</Text>}
              description={
                <Badge
                  appearance="filled"
                  color={currentDefinition.isPipelineDeployed ? "success" : "warning"}
                  size="small"
                >
                  {currentDefinition.isPipelineDeployed
                    ? t('ImpactIQ_Status_Deployed', 'Deployed')
                    : t('ImpactIQ_Status_NotDeployed', 'Not Deployed')}
                </Badge>
              }
              action={currentDefinition.isPipelineDeployed ? deployedIcon : (
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={isDeploying || !workspaceId}
                  onClick={() => handleDeploySingle("pipeline")}
                  title={!currentDefinition.isNotebookDeployed ? "Will deploy Lakehouse + Notebook first" : undefined}
                >
                  {!currentDefinition.isNotebookDeployed ? "Deploy (+ prereqs)" : "Deploy"}
                </Button>
              )}
            />
          </Card>
        </div>
      </div>

      <Divider />

      {/* Last Run Info */}
      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Status_LastRun', 'Last Run')}
        </Text>
        <div className="impactiq-last-run">
          {currentDefinition.lastRunTimestamp ? (
            <>
              <Clock24Regular />
              <Text>{currentDefinition.lastRunTimestamp}</Text>
            </>
          ) : (
            <>
              <Info24Regular />
              <Text>{t('ImpactIQ_Status_NeverRun', 'No extraction has been run yet. Deploy and run the notebook to extract metadata.')}</Text>
            </>
          )}
        </div>
      </div>

      <Divider />

      {/* Extracted Tables Overview */}
      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Status_Tables', 'Extracted Tables')}
        </Text>
        <Text size={200}>
          {t('ImpactIQ_Status_Tables_Desc', 'These tables will be created in your Lakehouse after running the governance extraction notebook.')}
        </Text>

        <div className="impactiq-table-groups">
          {tableGroups.map(group => (
            <Card key={group.title} className="impactiq-table-group-card">
              <CardHeader
                header={<Text weight="semibold">{group.title}</Text>}
                description={<Text size={200}>{group.description}</Text>}
              />
              <div className="impactiq-table-badges">
                {group.tables.map(table => (
                  <Badge
                    key={table}
                    appearance="outline"
                    size="medium"
                    className="impactiq-table-badge"
                  >
                    {table}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Divider />

      {/* Configuration Summary */}
      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Status_ConfigSummary', 'Current Configuration')}
        </Text>
        <div className="impactiq-config-summary">
          <div className="impactiq-summary-row">
            <Text size={200} weight="semibold">{t('ImpactIQ_Summary_Schema', 'Schema:')}</Text>
            <Text size={200}>{currentDefinition.lakehouseSchema || "dbo"}</Text>
          </div>
          <div className="impactiq-summary-row">
            <Text size={200} weight="semibold">{t('ImpactIQ_Summary_Workspaces', 'Workspaces:')}</Text>
            <Text size={200}>{(currentDefinition.workspaceNames || ["All"]).join(", ")}</Text>
          </div>
          <div className="impactiq-summary-row">
            <Text size={200} weight="semibold">{t('ImpactIQ_Summary_Workers', 'Parallel Workers:')}</Text>
            <Text size={200}>{currentDefinition.maxParallelWorkers || 5}</Text>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { useTranslation } from "react-i18next";
import {
  Input,
  Label,
  SpinButton,
  Textarea,
  Text,
  Divider,
} from "@fluentui/react-components";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";
import "./ImpactIQItem.scss";

interface ImpactIQConfigPanelProps {
  currentDefinition: ImpactIQItemDefinition;
  onDefinitionChange: (updates: Partial<ImpactIQItemDefinition>) => void;
}

/**
 * Left panel - Configuration form for ImpactIQ governance extraction.
 * Controls lakehouse schema, workspace scope, and performance settings.
 */
export function ImpactIQConfigPanel({
  currentDefinition,
  onDefinitionChange,
}: ImpactIQConfigPanelProps) {
  const { t } = useTranslation();

  const handleWorkspaceNamesChange = (value: string) => {
    const names = value.split(",").map(s => s.trim()).filter(Boolean);
    onDefinitionChange({ workspaceNames: names.length > 0 ? names : ["All"] });
  };

  return (
    <div className="impactiq-view">
      <Text size={500} weight="semibold">
        {t('ImpactIQ_Config_Title', 'Extraction Settings')}
      </Text>

      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Config_Lakehouse_Header', 'Lakehouse Configuration')}
        </Text>

        <div className="impactiq-field">
          <Label htmlFor="lakehouse-schema">
            {t('ImpactIQ_Config_Schema_Label', 'Lakehouse Schema')}
          </Label>
          <Input
            id="lakehouse-schema"
            value={currentDefinition.lakehouseSchema || "dbo"}
            onChange={(_, data) => onDefinitionChange({ lakehouseSchema: data.value })}
            placeholder="dbo"
          />
          <Text size={200} className="impactiq-field-hint">
            {t('ImpactIQ_Config_Schema_Hint', 'Schema name in your Lakehouse. "dbo" is the typical default.')}
          </Text>
        </div>

        <div className="impactiq-field">
          <Label htmlFor="lakehouse-name">
            {t('ImpactIQ_Config_LakehouseName_Label', 'Lakehouse Name')}
          </Label>
          <Input
            id="lakehouse-name"
            value={currentDefinition.lakehouseName || "PowerBIGovernance"}
            onChange={(_, data) => onDefinitionChange({ lakehouseName: data.value })}
            placeholder="PowerBIGovernance"
          />
          <Text size={200} className="impactiq-field-hint">
            {t('ImpactIQ_Config_LakehouseName_Hint', 'Name for the Lakehouse that will store governance metadata.')}
          </Text>
        </div>
      </div>

      <Divider />

      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Config_Scope_Header', 'Workspace Scope')}
        </Text>

        <div className="impactiq-field">
          <Label htmlFor="workspace-names">
            {t('ImpactIQ_Config_Workspaces_Label', 'Workspaces')}
          </Label>
          <Textarea
            id="workspace-names"
            value={(currentDefinition.workspaceNames || ["All"]).join(", ")}
            onChange={(_, data) => handleWorkspaceNamesChange(data.value)}
            placeholder='All'
            rows={3}
          />
          <Text size={200} className="impactiq-field-hint">
            {t('ImpactIQ_Config_Workspaces_Hint', 'Enter "All" to scan all workspaces, or comma-separated workspace names (max 10).')}
          </Text>
        </div>
      </div>

      <Divider />

      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Config_Performance_Header', 'Performance')}
        </Text>

        <div className="impactiq-field">
          <Label htmlFor="parallel-workers">
            {t('ImpactIQ_Config_Workers_Label', 'Parallel Workers')}
          </Label>
          <SpinButton
            id="parallel-workers"
            value={currentDefinition.maxParallelWorkers || 5}
            min={1}
            max={10}
            onChange={(_, data) => {
              const val = data.value ?? data.displayValue ? parseInt(data.displayValue, 10) : 5;
              if (val >= 1 && val <= 10) {
                onDefinitionChange({ maxParallelWorkers: val });
              }
            }}
          />
          <Text size={200} className="impactiq-field-hint">
            {t('ImpactIQ_Config_Workers_Hint', 'Number of parallel API calls (1-10). Higher = faster but more API load.')}
          </Text>
        </div>
      </div>

      <Divider />

      <div className="impactiq-config-section">
        <Text size={400} weight="semibold">
          {t('ImpactIQ_Config_Naming_Header', 'Resource Names')}
        </Text>

        <div className="impactiq-field">
          <Label htmlFor="notebook-name">
            {t('ImpactIQ_Config_NotebookName_Label', 'Notebook Name')}
          </Label>
          <Input
            id="notebook-name"
            value={currentDefinition.notebookName || "GovernanceNotebook"}
            onChange={(_, data) => onDefinitionChange({ notebookName: data.value })}
            placeholder="GovernanceNotebook"
          />
        </div>

        <div className="impactiq-field">
          <Label htmlFor="pipeline-name">
            {t('ImpactIQ_Config_PipelineName_Label', 'Pipeline Name')}
          </Label>
          <Input
            id="pipeline-name"
            value={currentDefinition.pipelineName || "GovernanceExtraction"}
            onChange={(_, data) => onDefinitionChange({ pipelineName: data.value })}
            placeholder="GovernanceExtraction"
          />
        </div>

        <div className="impactiq-field">
          <Label htmlFor="semantic-model-name">
            {t('ImpactIQ_Config_SemanticModelName_Label', 'Semantic Model Name')}
          </Label>
          <Input
            id="semantic-model-name"
            value={currentDefinition.semanticModelName || "Power BI Governance Model"}
            onChange={(_, data) => onDefinitionChange({ semanticModelName: data.value })}
            placeholder="Power BI Governance Model"
          />
        </div>

        <div className="impactiq-field">
          <Label htmlFor="report-name">
            {t('ImpactIQ_Config_ReportName_Label', 'Report Name')}
          </Label>
          <Input
            id="report-name"
            value={currentDefinition.reportName || "Power BI Governance Report"}
            onChange={(_, data) => onDefinitionChange({ reportName: data.value })}
            placeholder="Power BI Governance Report"
          />
        </div>
      </div>
    </div>
  );
}

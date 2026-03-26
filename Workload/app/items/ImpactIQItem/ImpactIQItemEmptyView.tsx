import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";
import { ItemEditorEmptyView, EmptyStateTask } from "../../components/ItemEditor";
import "./ImpactIQItem.scss";

interface ImpactIQItemEmptyViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<ImpactIQItemDefinition>;
  onNavigateToSetup: () => void;
}

/**
 * Empty state component for ImpactIQ - the first screen users see.
 * Guides users through setting up their Power BI governance extraction.
 */
export function ImpactIQItemEmptyView({
  workloadClient,
  item,
  onNavigateToSetup
}: ImpactIQItemEmptyViewProps) {
  const { t } = useTranslation();

  const tasks: EmptyStateTask[] = [
    {
      id: 'setup-governance',
      label: t('ImpactIQItemEmptyView_SetupButton', 'Configure Governance Extraction'),
      icon: undefined,
      description: t('ImpactIQItemEmptyView_SetupButton_Description', 'Set up your Lakehouse schema, workspace scope, and deployment settings for automated Power BI metadata extraction.'),
      onClick: onNavigateToSetup,
    }
  ];

  return (
    <ItemEditorEmptyView
      title={t('ImpactIQItemEmptyView_Title', 'Welcome to ImpactIQ')}
      description={t('ImpactIQItemEmptyView_Description', 'ImpactIQ provides automated Power BI & Fabric governance by extracting metadata from your reports, models, dataflows, and workspaces into a Fabric Lakehouse. Configure your extraction settings to get started.')}
      imageSrc="/assets/items/HelloWorldItem/EditorEmpty.svg"
      imageAlt="ImpactIQ empty state illustration"
      tasks={tasks}
    />
  );
}

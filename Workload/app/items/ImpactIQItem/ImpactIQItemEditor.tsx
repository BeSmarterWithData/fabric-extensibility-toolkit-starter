import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotificationType } from "@ms-fabric/workload-client";
import { PageProps, ContextProps } from "../../App";
import { ItemWithDefinition, getWorkloadItem, callGetItem, saveWorkloadItem } from "../../controller/ItemCRUDController";
import { callOpenSettings } from "../../controller/SettingsController";
import { callNotificationOpen } from "../../controller/NotificationController";
import { ItemEditor, useViewNavigation, RegisteredNotification } from "../../components/ItemEditor";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";
import { ImpactIQItemEmptyView } from "./ImpactIQItemEmptyView";
import { ImpactIQItemDefaultView } from "./ImpactIQItemDefaultView";
import { ImpactIQItemRibbon } from "./ImpactIQItemRibbon";
import "./ImpactIQItem.scss";

/**
 * Different views that are available for the ImpactIQ item
 */
export const EDITOR_VIEW_TYPES = {
  EMPTY: 'empty',
  DEFAULT: 'default',
} as const;

const enum SaveStatus {
  NotSaved = 'NotSaved',
  Saving = 'Saving',
  Saved = 'Saved'
}

const DEFAULT_DEFINITION: ImpactIQItemDefinition = {
  lakehouseSchema: "dbo",
  workspaceNames: ["All"],
  maxParallelWorkers: 5,
  lakehouseName: "PowerBIGovernance",
  notebookName: "GovernanceNotebook",
  pipelineName: "GovernanceExtraction",
  semanticModelName: "Power BI Governance Model",
  reportName: "Power BI Governance Report",
  isNotebookDeployed: false,
  isLakehouseDeployed: false,
  isPipelineDeployed: false,
  isSemanticModelDeployed: false,
  isReportDeployed: false,
};

export function ImpactIQItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const pageContext = useParams<ContextProps>();
  const { t } = useTranslation();

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<ItemWithDefinition<ImpactIQItemDefinition>>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.NotSaved);
  const [currentDefinition, setCurrentDefinition] = useState<ImpactIQItemDefinition>(DEFAULT_DEFINITION);
  const [viewSetter, setViewSetter] = useState<((view: string) => void) | null>(null);

  const { pathname } = useLocation();

  async function loadDataFromUrl(pageContext: ContextProps, pathname: string): Promise<void> {
    if (pageContext.itemObjectId && item && item.id === pageContext.itemObjectId) {
      return;
    }

    setIsLoading(true);
    var LoadedItem: ItemWithDefinition<ImpactIQItemDefinition> = undefined;
    if (pageContext.itemObjectId) {
      try {
        LoadedItem = await getWorkloadItem<ImpactIQItemDefinition>(
          workloadClient,
          pageContext.itemObjectId,
        );

        if (!LoadedItem.definition) {
          setSaveStatus(SaveStatus.NotSaved);
          LoadedItem = {
            ...LoadedItem,
            definition: { ...DEFAULT_DEFINITION }
          };
        } else {
          setSaveStatus(SaveStatus.Saved);
        }

        setItem(LoadedItem);
        setCurrentDefinition(LoadedItem.definition || { ...DEFAULT_DEFINITION });
      } catch (error) {
        setItem(undefined);
      }
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadDataFromUrl(pageContext, pathname);
  }, [pageContext, pathname]);

  const handleOpenSettings = async () => {
    if (item) {
      try {
        const item_res = await callGetItem(workloadClient, item.id);
        await callOpenSettings(workloadClient, item_res.item, 'About');
      } catch (error) {
        console.error('Failed to open settings:', error);
      }
    }
  };

  async function saveItem() {
    setSaveStatus(SaveStatus.Saving);
    item.definition = { ...currentDefinition };
    setCurrentDefinition(item.definition);

    let successResult;
    let errorMessage = "";

    try {
      successResult = await saveWorkloadItem<ImpactIQItemDefinition>(
        workloadClient,
        item,
      );
    } catch (error) {
      errorMessage = error?.message;
    }

    const wasSaved = Boolean(successResult);

    if (wasSaved) {
      setSaveStatus(SaveStatus.Saved);
      callNotificationOpen(
        props.workloadClient,
        t("ItemEditor_Saved_Notification_Title"),
        t("ItemEditor_Saved_Notification_Text", { itemName: item.displayName }),
        undefined,
        undefined
      );
    } else {
      setSaveStatus(SaveStatus.NotSaved);
      const failureMessage = errorMessage
        ? `${t("ItemEditor_SaveFailed_Notification_Text", { itemName: item.displayName })} ${errorMessage}.`
        : t("ItemEditor_SaveFailed_Notification_Text", { itemName: item.displayName });

      callNotificationOpen(
        props.workloadClient,
        t("ItemEditor_SaveFailed_Notification_Title"),
        failureMessage,
        NotificationType.Error,
        undefined
      );
    }
  }

  const isSaveEnabled = (currentView: string) => {
    if (currentView === EDITOR_VIEW_TYPES.EMPTY) {
      return false;
    }
    if (saveStatus === SaveStatus.Saved) {
      return false;
    }
    return true;
  };

  // Wrapper component for empty view that uses navigation hook
  const EmptyViewWrapper = () => {
    const { setCurrentView } = useViewNavigation();

    return (
      <ImpactIQItemEmptyView
        workloadClient={workloadClient}
        item={item}
        onNavigateToSetup={() => {
          setCurrentDefinition(prev => ({ ...prev, ...DEFAULT_DEFINITION }));
          setSaveStatus(SaveStatus.NotSaved);
          setCurrentView(EDITOR_VIEW_TYPES.DEFAULT);
        }}
      />
    );
  };

  // Static view definitions
  const views = [
    {
      name: EDITOR_VIEW_TYPES.EMPTY,
      component: <EmptyViewWrapper />
    },
    {
      name: EDITOR_VIEW_TYPES.DEFAULT,
      component: (
        <ImpactIQItemDefaultView
          workloadClient={workloadClient}
          item={item}
          currentDefinition={currentDefinition}
          onDefinitionChange={(updates: Partial<ImpactIQItemDefinition>) => {
            setCurrentDefinition(prev => ({ ...prev, ...updates }));
            setSaveStatus(SaveStatus.NotSaved);
          }}
        />
      )
    }
  ];

  // Determine correct view after loading
  useEffect(() => {
    if (!isLoading && item && viewSetter) {
      const hasConfig = item?.definition?.lakehouseSchema || item?.definition?.isNotebookDeployed;
      const correctView = hasConfig ? EDITOR_VIEW_TYPES.DEFAULT : EDITOR_VIEW_TYPES.EMPTY;
      viewSetter(correctView);
    }
  }, [isLoading, item, viewSetter]);

  // Static notification definitions
  const notifications: RegisteredNotification[] = [];

  return (
    <ItemEditor
      isLoading={isLoading}
      loadingMessage={t("ImpactIQItemEditor_Loading", "Loading ImpactIQ...")}
      ribbon={(context) => (
        <ImpactIQItemRibbon
          {...props}
          viewContext={context}
          isSaveButtonEnabled={isSaveEnabled(context.currentView)}
          saveItemCallback={saveItem}
          openSettingsCallback={handleOpenSettings}
        />
      )}
      messageBar={notifications}
      views={views}
      viewSetter={(setCurrentView) => {
        if (!viewSetter) {
          setViewSetter(() => setCurrentView);
        }
      }}
    />
  );
}

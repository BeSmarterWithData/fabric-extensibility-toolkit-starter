import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ImpactIQItemDefinition } from "./ImpactIQItemDefinition";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { ImpactIQConfigPanel } from "./ImpactIQConfigPanel";
import { ImpactIQStatusPanel } from "./ImpactIQStatusPanel";
import "./ImpactIQItem.scss";

interface ImpactIQItemDefaultViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<ImpactIQItemDefinition>;
  currentDefinition: ImpactIQItemDefinition;
  onDefinitionChange: (updates: Partial<ImpactIQItemDefinition>) => void;
}

export function ImpactIQItemDefaultView({
  workloadClient,
  item,
  currentDefinition,
  onDefinitionChange,
}: ImpactIQItemDefaultViewProps) {
  const { t } = useTranslation();

  return (
    <ItemEditorDefaultView
      left={{
        content: (
          <ImpactIQConfigPanel
            currentDefinition={currentDefinition}
            onDefinitionChange={onDefinitionChange}
          />
        ),
        width: 380,
        minWidth: 320,
        title: t('ImpactIQ_Config_Label', 'Configuration'),
        enableUserResize: true,
        collapsible: true
      }}
      center={{
        content: (
          <ImpactIQStatusPanel
            workloadClient={workloadClient}
            item={item}
            currentDefinition={currentDefinition}
            onDefinitionChange={onDefinitionChange}
          />
        )
      }}
    />
  );
}

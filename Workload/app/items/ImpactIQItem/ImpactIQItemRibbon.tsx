import React from "react";
import { PageProps } from '../../App';
import {
  Ribbon,
  RibbonAction,
  createSaveAction,
  createSettingsAction
} from '../../components/ItemEditor';
import { ViewContext } from '../../components';

/**
 * Props interface for the ImpactIQ Ribbon component
 */
export interface ImpactIQItemRibbonProps extends PageProps {
  isSaveButtonEnabled?: boolean;
  viewContext: ViewContext;
  saveItemCallback: () => Promise<void>;
  openSettingsCallback: () => Promise<void>;
}

/**
 * ImpactIQItemRibbon - Ribbon with Save and Settings actions
 * for the ImpactIQ governance configuration editor.
 */
export function ImpactIQItemRibbon(props: ImpactIQItemRibbonProps) {
  const { viewContext } = props;

  const saveAction = createSaveAction(
    props.saveItemCallback,
    !props.isSaveButtonEnabled
  );

  const settingsAction = createSettingsAction(
    props.openSettingsCallback
  );

  const homeToolbarActions: RibbonAction[] = [
    saveAction,
    settingsAction,
  ];

  return (
    <Ribbon
      homeToolbarActions={homeToolbarActions}
      viewContext={viewContext}
    />
  );
}

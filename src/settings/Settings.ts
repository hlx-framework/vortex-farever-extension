import * as React from 'react';
import { connect } from 'react-redux';
import { Toggle } from 'vortex-api';
import { GAME_ID } from '../common';
import { setAutoUpdateMods } from './actions';

interface IConnectedProps {
  autoUpdateMods: boolean;
}

interface IActionProps {
  onToggle: (enabled: boolean) => void;
}

function SettingsComponent(props: IConnectedProps & IActionProps): React.ReactElement {
  return React.createElement(Toggle, {
    checked: props.autoUpdateMods,
    onToggle: props.onToggle,
  } as any, 'Automatically download and install compatible Farever mod updates');
}

function mapStateToProps(state: any): IConnectedProps {
  return {
    autoUpdateMods: state.settings[GAME_ID]?.autoUpdateMods ?? true,
  };
}

function mapDispatchToProps(dispatch: any): IActionProps {
  return {
    onToggle: (enabled: boolean) => dispatch(setAutoUpdateMods(enabled)),
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(SettingsComponent);

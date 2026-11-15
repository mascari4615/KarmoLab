import { buildWindowOpacity } from '../lib/window-opacity-controls';

Toolbox.register({
  ...Toolbox.getLazyWidgetPublicMeta('windowopacity'),
  tabs: [{ id: 'window-opacity-main', label: '조절', build(container: HTMLElement): void {
    Toolbox.onDispose(buildWindowOpacity(container));
  } }],
});

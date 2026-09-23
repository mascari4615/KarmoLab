import {t} from '../../lib/i18n';
import {renderAbout} from './render';
import {aboutStyles} from './styles';
Mdd.injectCSS('about', aboutStyles);
Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('about') ?? {}), id: 'about',
    tabs: [{id: 'app', label: t('widgets.about.title', undefined, '소개'),
        build(container: HTMLElement): void {
            const controller = new AbortController();
            Toolbox.onDispose(() => controller.abort());
            void renderAbout(container, controller.signal);
        }
    }]
});

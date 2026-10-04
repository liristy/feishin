import { AppThemeConfiguration } from '/@/shared/themes/app-theme-types';

export const defaultLight: AppThemeConfiguration = {
    app: {
        'overlay-header':
            'linear-gradient(rgb(255 255 255 / 50%) 0%, rgb(255 255 255 / 80%)), var(--theme-background-noise)',
        'overlay-subheader':
            'linear-gradient(180deg, rgba(255, 255, 255, 5%) 0%, var(--theme-colors-background)), var(--theme-background-noise)',
        'scrollbar-handle-background': 'rgba(140, 140, 140, 30%)',
        'scrollbar-handle-hover-background': 'rgba(140, 140, 140, 60%)',
        'scrollbar-track-background': 'transparent',
    },
    colors: {
        background: 'rgb(255, 255, 255)',
        'background-alternate': 'rgb(245, 243, 242)',
        black: 'rgb(0, 0, 0)',
        foreground: 'rgb(31, 31, 31)',
        'foreground-muted': 'rgb(119, 119, 123)',
        primary: 'rgb(250, 45, 72)',
        'state-error': 'rgb(255, 59, 48)',
        'state-info': 'rgb(0, 122, 255)',
        'state-success': 'rgb(48, 209, 88)',
        'state-warning': 'rgb(255, 214, 0)',
        surface: 'rgb(235, 233, 232)',
        'surface-foreground': 'rgb(0, 0, 0)',
        white: 'rgb(255, 255, 255)',
    },
    mantineOverride: {
        primaryShade: {
            light: 6,
        },
    },
    mode: 'light',
};

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
        background: 'rgb(250, 251, 250)',
        'background-alternate': 'rgb(240, 243, 241)',
        black: 'rgb(0, 0, 0)',
        foreground: 'rgb(25, 25, 25)',
        'foreground-muted': 'rgb(80, 80, 80)',
        primary: 'rgb(19, 139, 102)',
        'state-error': 'rgb(255, 59, 48)',
        'state-info': 'rgb(0, 122, 255)',
        'state-success': 'rgb(48, 209, 88)',
        'state-warning': 'rgb(255, 214, 0)',
        surface: 'rgb(233, 239, 235)',
        'surface-foreground': 'rgb(0, 0, 0)',
        white: 'rgb(255, 255, 255)',
    },
    mantineOverride: {
        primaryShade: {
            light: 9,
        },
    },
    mode: 'light',
};

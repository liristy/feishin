import { AppThemeConfiguration } from '/@/shared/themes/app-theme-types';

export const defaultDark: AppThemeConfiguration = {
    app: {
        'overlay-header': 'linear-gradient(transparent, rgb(20 23 24 / 90%))',
        'overlay-subheader': 'linear-gradient(transparent, var(--theme-colors-background))',
    },
    colors: {
        background: 'rgb(29, 31, 32)',
        'background-alternate': 'rgb(36, 35, 36)',
        foreground: 'rgb(242, 244, 243)',
        'foreground-muted': 'rgb(190, 196, 194)',
        primary: 'rgb(48, 207, 155)',
        surface: 'rgb(41, 44, 44)',
        'surface-foreground': 'rgb(234, 239, 236)',
    },
    mode: 'dark',
};

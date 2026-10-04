import { AppThemeConfiguration } from '/@/shared/themes/app-theme-types';

export const defaultDark: AppThemeConfiguration = {
    app: {
        'overlay-header': 'linear-gradient(transparent, rgb(20 23 24 / 90%))',
        'overlay-subheader': 'linear-gradient(transparent, var(--theme-colors-background))',
    },
    colors: {
        background: 'rgb(31, 31, 33)',
        'background-alternate': 'rgb(39, 39, 41)',
        foreground: 'rgb(245, 245, 247)',
        'foreground-muted': 'rgb(161, 161, 166)',
        primary: 'rgb(255, 55, 95)',
        surface: 'rgb(52, 52, 54)',
        'surface-foreground': 'rgb(245, 245, 247)',
    },
    mode: 'dark',
};

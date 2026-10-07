import { useEffect } from 'react';

export const useButtonFocus = () => {
    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (event.detail === 0 || !(event.target instanceof Element)) return;

            const button = event.target.closest<HTMLElement>(
                'button, [role="button"], [data-button-control], input[type="button"], input[type="submit"], input[type="reset"]',
            );
            if (button === document.activeElement) button?.blur();
        };

        // Capture runs before actions can hide the window or focus a dialog input.
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, []);
};

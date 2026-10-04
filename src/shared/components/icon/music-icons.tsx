import { IconBase, IconBaseProps } from 'react-icons';

export const LyricsIcon = (props: IconBaseProps) => (
    <IconBase viewBox="0 0 24 24" {...props}>
        <path
            d="M6.1 4.25H18c2 0 3.15 1.15 3.15 3.15v6.4c0 2-1.15 3.15-3.15 3.15h-7.5l-3.5 2.95c-.3.25-.65.08-.65-.3v-2.65H6.1c-2 0-3.15-1.15-3.15-3.15V7.4c0-2 1.15-3.15 3.15-3.15Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.7"
        />
        <g transform="translate(1.8 1.6) scale(.85)">
            <circle cx="9" cy="9.1" fill="currentColor" r="1.6" />
            <circle cx="15" cy="9.1" fill="currentColor" r="1.6" />
            <path
                d="M10.05 10c-.03 1.1-.58 2.05-1.55 2.8M16.05 10c-.03 1.1-.58 2.05-1.55 2.8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.3"
            />
        </g>
    </IconBase>
);

export const QueueIcon = (props: IconBaseProps) => (
    <IconBase viewBox="0 0 24 24" {...props}>
        <path
            d="M8.5 6h12M8.5 12h12M8.5 18h12"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
        />
        <path
            d="M4.75 6a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 6a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 6a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"
            fill="currentColor"
        />
    </IconBase>
);

export const PlaylistIcon = (props: IconBaseProps) => (
    <IconBase viewBox="0 0 24 24" {...props}>
        <path
            d="M3 5h9M3 10h9M3 15h6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
        />
        <path
            d="M17.5 4.3 22 3.2v3.2l-3 0.7v10.2c0 1.6-1.4 2.7-3.2 2.7-1.6 0-2.8-.9-2.8-2.2 0-1.6 1.5-2.7 3.3-2.7.5 0 .9.1 1.2.2Z"
            fill="currentColor"
        />
    </IconBase>
);

export const PlaylistAddIcon = (props: IconBaseProps) => (
    <IconBase viewBox="0 0 24 24" {...props}>
        <path
            d="M3 5h17M3 11h17M3 17h8m7-3v7m-3.5-3.5h7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
        />
    </IconBase>
);

export const PlaylistRemoveIcon = (props: IconBaseProps) => (
    <IconBase viewBox="0 0 24 24" {...props}>
        <path
            d="M3 5h17M3 11h17M3 17h8m3.5.5h7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
        />
    </IconBase>
);

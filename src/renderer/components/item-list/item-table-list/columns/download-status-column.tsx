import {
    ColumnSkeletonFixed,
    ItemTableListInnerColumn,
    TableColumnContainer,
} from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { SongDownloadStatus } from '/@/renderer/features/offline/song-download-status';
import { Song } from '/@/shared/types/domain-types';

export const DownloadStatusColumn = (props: ItemTableListInnerColumn) => {
    const song = props.getRowItem?.(props.rowIndex) ?? props.data[props.rowIndex];
    if (!song) return <ColumnSkeletonFixed {...props} />;
    return (
        <TableColumnContainer {...props}>
            <SongDownloadStatus song={song as Song} />
        </TableColumnContainer>
    );
};

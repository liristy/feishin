export const LIST_REFRESH_MUTATION_KEY = 'item-list-refresh';

export const getListRefreshMutationKey = (listKey: string) =>
    [LIST_REFRESH_MUTATION_KEY, listKey] as const;

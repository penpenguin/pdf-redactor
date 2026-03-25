function createGroupId() {
  return `group-${crypto.randomUUID()}`;
}

function itemKey(item) {
  return `${item.page}:${item.id}`;
}

function buildSignature(items) {
  return items
    .map((item) => `${item.page}:${item.id}:${item.kind}:${item.text ?? ""}`)
    .join("|");
}

function flattenPending(pending) {
  return Object.entries(pending ?? {})
    .sort(([leftPage], [rightPage]) => Number(leftPage) - Number(rightPage))
    .flatMap(([, items]) => items ?? []);
}

export function appendGroup(groups, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return groups;
  }

  const lastGroup = groups.at(-1);
  if (lastGroup && buildSignature(lastGroup.items) === buildSignature(items)) {
    return groups;
  }

  return [
    ...groups,
    {
      id: createGroupId(),
      text: items.find((item) => item.text)?.text ?? "",
      items,
    },
  ];
}

export function removeItemsFromGroups(groups, removals) {
  const keys = new Set(removals.map(({ page, id }) => `${page}:${id}`));

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !keys.has(`${item.page}:${item.id}`)),
    }))
    .filter((group) => group.items.length > 0);
}

export function clearGroups() {
  return [];
}

export function diffPendingItems(previousPending, nextPending) {
  const previousItems = flattenPending(previousPending);
  const nextItems = flattenPending(nextPending);
  const previousKeys = new Set(previousItems.map(itemKey));
  const nextKeys = new Set(nextItems.map(itemKey));

  return {
    addedItems: nextItems.filter((item) => !previousKeys.has(itemKey(item))),
    removedItems: previousItems
      .filter((item) => !nextKeys.has(itemKey(item)))
      .map(({ page, id }) => ({ page, id })),
  };
}

export function toListEntries(groups) {
  return groups.map((group) => ({
    groupId: group.id,
    text: group.text,
    pages: [...new Set(group.items.map((item) => item.page + 1))].sort((a, b) => a - b),
    count: group.items.length,
  }));
}

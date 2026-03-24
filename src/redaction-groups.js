function createGroupId() {
  return `group-${crypto.randomUUID()}`;
}

function buildSignature(items) {
  return items
    .map((item) => `${item.page}:${item.id}:${item.kind}:${item.text ?? ""}`)
    .join("|");
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

export function toListEntries(groups) {
  return groups.map((group) => ({
    groupId: group.id,
    text: group.text,
    pages: [...new Set(group.items.map((item) => item.page + 1))].sort((a, b) => a - b),
    count: group.items.length,
  }));
}

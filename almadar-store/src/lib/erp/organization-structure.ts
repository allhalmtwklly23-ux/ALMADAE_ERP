export type OrganizationUnitNode = {
  id: string;
  code: string;
  nameAr: string;
  status: "active" | "inactive" | "archived";
};

export type OrganizationRelationshipNode = {
  id: string;
  structureTypeId: string;
  parentUnitId: string;
  childUnitId: string;
  validFrom: string;
  validTo: string | null;
};

export type OrganizationTreeNode = OrganizationUnitNode & {
  children: OrganizationTreeNode[];
  cycleReference: boolean;
  sharedReference: boolean;
};

export type OrganizationRelationshipDraft = {
  structureTypeId: string;
  parentUnitId: string;
  childUnitId: string;
  validFrom: string;
};

export type OrganizationRelationshipIssue =
  | "incomplete"
  | "self_parent"
  | "backdate_not_allowed"
  | "cycle"
  | "data_conflict"
  | "already_active"
  | "future_conflict";

export function getActiveOrganizationRelationships(
  relationships: OrganizationRelationshipNode[],
  structureTypeId: string,
  date: string,
) {
  return relationships.filter((relationship) =>
    relationship.structureTypeId === structureTypeId
    && relationship.validFrom <= date
    && (relationship.validTo === null || relationship.validTo >= date)
  );
}

export function wouldCreateOrganizationCycle(
  parentUnitId: string,
  childUnitId: string,
  relationships: OrganizationRelationshipNode[],
) {
  if (parentUnitId === childUnitId) return true;

  const childrenByParent = new Map<string, string[]>();
  for (const relationship of relationships) {
    const children = childrenByParent.get(relationship.parentUnitId) ?? [];
    children.push(relationship.childUnitId);
    childrenByParent.set(relationship.parentUnitId, children);
  }

  const pending = [childUnitId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const unitId = pending.pop();
    if (!unitId || visited.has(unitId)) continue;
    if (unitId === parentUnitId) return true;
    visited.add(unitId);
    pending.push(...(childrenByParent.get(unitId) ?? []));
  }
  return false;
}

export function validateOrganizationRelationshipDraft(
  draft: OrganizationRelationshipDraft,
  structureType: { id: string; allowsMultipleParents: boolean } | undefined,
  relationships: OrganizationRelationshipNode[],
  today: string,
): OrganizationRelationshipIssue | { closeRelationshipId: string } | null {
  if (!structureType || draft.structureTypeId !== structureType.id
      || !draft.parentUnitId || !draft.childUnitId || !draft.validFrom) {
    return "incomplete";
  }
  if (draft.parentUnitId === draft.childUnitId) return "self_parent";
  if (draft.validFrom < today) return "backdate_not_allowed";

  const structureRelationships = relationships.filter(
    (relationship) => relationship.structureTypeId === structureType.id,
  );
  const checkpoints = new Set([
    draft.validFrom,
    ...structureRelationships
      .filter((relationship) => relationship.validFrom > draft.validFrom)
      .map((relationship) => relationship.validFrom),
  ]);
  for (const date of checkpoints) {
    const activeRelationships = getActiveOrganizationRelationships(
      structureRelationships,
      structureType.id,
      date,
    );
    if (wouldCreateOrganizationCycle(draft.parentUnitId, draft.childUnitId, activeRelationships)) {
      return "cycle";
    }
  }

  if (structureType.allowsMultipleParents) return null;

  const overlappingParents = structureRelationships.filter((relationship) =>
    relationship.childUnitId === draft.childUnitId
    && (relationship.validTo === null || relationship.validTo >= draft.validFrom)
  );
  if (overlappingParents.length > 1) return "data_conflict";

  const existing = overlappingParents[0];
  if (!existing) return null;
  if (existing.parentUnitId === draft.parentUnitId) return "already_active";
  if (existing.validFrom >= draft.validFrom) return "future_conflict";
  return { closeRelationshipId: existing.id };
}

export function buildOrganizationTree(
  units: OrganizationUnitNode[],
  relationships: OrganizationRelationshipNode[],
): OrganizationTreeNode[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const childrenByParent = new Map<string, Set<string>>();
  const unitsWithParents = new Set<string>();

  for (const relationship of relationships) {
    if (!unitsById.has(relationship.parentUnitId) || !unitsById.has(relationship.childUnitId)) continue;
    const children = childrenByParent.get(relationship.parentUnitId) ?? new Set<string>();
    children.add(relationship.childUnitId);
    childrenByParent.set(relationship.parentUnitId, children);
    unitsWithParents.add(relationship.childUnitId);
  }

  const expanded = new Set<string>();
  const buildNode = (unitId: string, ancestors: Set<string>): OrganizationTreeNode | null => {
    const unit = unitsById.get(unitId);
    if (!unit) return null;
    if (ancestors.has(unitId)) {
      return { ...unit, children: [], cycleReference: true, sharedReference: false };
    }
    if (expanded.has(unitId)) {
      return { ...unit, children: [], cycleReference: false, sharedReference: true };
    }

    expanded.add(unitId);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(unitId);
    const childIds = [...(childrenByParent.get(unitId) ?? [])]
      .sort((leftId, rightId) => {
        const left = unitsById.get(leftId);
        const right = unitsById.get(rightId);
        return (left?.nameAr ?? leftId).localeCompare(right?.nameAr ?? rightId, "ar");
      });

    return {
      ...unit,
      cycleReference: false,
      sharedReference: false,
      children: childIds
        .map((childId) => buildNode(childId, nextAncestors))
        .filter((child): child is OrganizationTreeNode => child !== null),
    };
  };

  const roots = units
    .filter((unit) => !unitsWithParents.has(unit.id))
    .sort((left, right) => left.nameAr.localeCompare(right.nameAr, "ar"));
  const tree = roots
    .map((unit) => buildNode(unit.id, new Set<string>()))
    .filter((node): node is OrganizationTreeNode => node !== null);

  for (const unit of units) {
    if (!expanded.has(unit.id)) {
      const node = buildNode(unit.id, new Set<string>());
      if (node) tree.push(node);
    }
  }

  return tree;
}

export function filterOrganizationTree(nodes: OrganizationTreeNode[], query: string): OrganizationTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return nodes;

  const filterNode = (node: OrganizationTreeNode): OrganizationTreeNode | null => {
    const matchesNode = [node.nameAr, node.code, node.id, node.status]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    if (matchesNode) return node;

    const children = node.children
      .map(filterNode)
      .filter((child): child is OrganizationTreeNode => child !== null);
    return children.length > 0 ? { ...node, children } : null;
  };

  return nodes.map(filterNode).filter((node): node is OrganizationTreeNode => node !== null);
}

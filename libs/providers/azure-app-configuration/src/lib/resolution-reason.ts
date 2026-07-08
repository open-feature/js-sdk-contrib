import type { ITargetingContext } from '@microsoft/feature-management';
import { VariantAssignmentReason } from '@microsoft/feature-management';
import type { ResolutionReason } from '@openfeature/server-sdk';
import { StandardResolutionReasons } from '@openfeature/server-sdk';
import { createHash } from 'node:crypto';

const TARGETING_FILTER = 'Microsoft.Targeting';

export interface FeatureFlagDefinition {
  id: string;
  enabled?: boolean;
  conditions?: {
    client_filters?: { name: string }[];
  };
  allocation?: {
    default_when_disabled?: string;
    default_when_enabled?: string;
    user?: { variant: string; users: string[] }[];
    group?: { variant: string; groups: string[] }[];
    percentile?: { variant: string; from: number; to: number }[];
    seed?: string;
  };
  variants?: { name: string }[];
}

export function resolveBooleanResolutionReason(featureFlag: FeatureFlagDefinition): ResolutionReason {
  if (featureFlag.enabled !== true) {
    return StandardResolutionReasons.STATIC;
  }

  const clientFilters = featureFlag.conditions?.client_filters;
  if (!clientFilters?.length) {
    return StandardResolutionReasons.STATIC;
  }

  const appliesTargeting = clientFilters.some((filter) => filter.name === TARGETING_FILTER);
  return appliesTargeting ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC;
}

export async function resolveVariantResolutionReason(
  featureFlag: FeatureFlagDefinition,
  targetingContext: ITargetingContext,
  enabled: boolean,
): Promise<ResolutionReason> {
  if (!featureFlag.variants?.length) {
    return StandardResolutionReasons.STATIC;
  }

  let assignmentReason = VariantAssignmentReason.None;

  if (!enabled) {
    assignmentReason = VariantAssignmentReason.DefaultWhenDisabled;
  } else if (featureFlag.allocation) {
    const targetedReason = await resolveTargetingAllocationReason(featureFlag, targetingContext);
    assignmentReason =
      targetedReason !== VariantAssignmentReason.None ? targetedReason : VariantAssignmentReason.DefaultWhenEnabled;
  } else {
    assignmentReason = VariantAssignmentReason.DefaultWhenEnabled;
  }

  return mapVariantAssignmentReason(assignmentReason);
}

function mapVariantAssignmentReason(reason: VariantAssignmentReason): ResolutionReason {
  switch (reason) {
    case VariantAssignmentReason.User:
    case VariantAssignmentReason.Group:
    case VariantAssignmentReason.Percentile:
      return StandardResolutionReasons.TARGETING_MATCH;
    case VariantAssignmentReason.DefaultWhenDisabled:
    case VariantAssignmentReason.DefaultWhenEnabled:
      return StandardResolutionReasons.DEFAULT;
    default:
      return StandardResolutionReasons.DEFAULT;
  }
}

async function resolveTargetingAllocationReason(
  featureFlag: FeatureFlagDefinition,
  targetingContext: ITargetingContext,
): Promise<VariantAssignmentReason> {
  const allocation = featureFlag.allocation;
  if (!allocation) {
    return VariantAssignmentReason.None;
  }

  if (allocation.user) {
    for (const userAllocation of allocation.user) {
      if (isTargetedUser(targetingContext.userId, userAllocation.users)) {
        return VariantAssignmentReason.User;
      }
    }
  }

  if (allocation.group) {
    for (const groupAllocation of allocation.group) {
      if (isTargetedGroup(targetingContext.groups, groupAllocation.groups)) {
        return VariantAssignmentReason.Group;
      }
    }
  }

  if (allocation.percentile) {
    for (const percentileAllocation of allocation.percentile) {
      const hint = allocation.seed ?? `allocation\n${featureFlag.id}`;
      if (isTargetedPercentile(targetingContext.userId, hint, percentileAllocation.from, percentileAllocation.to)) {
        return VariantAssignmentReason.Percentile;
      }
    }
  }

  return VariantAssignmentReason.None;
}

function isTargetedUser(userId: string | undefined, users: string[]): boolean {
  if (userId === undefined) {
    return false;
  }

  return users.includes(userId);
}

function isTargetedGroup(sourceGroups: string[] | undefined, targetedGroups: string[]): boolean {
  if (sourceGroups === undefined) {
    return false;
  }

  return sourceGroups.some((group) => targetedGroups.includes(group));
}

function isTargetedPercentile(userId: string | undefined, hint: string, from: number, to: number): boolean {
  if (from < 0 || from > 100 || to < 0 || to > 100 || from > to) {
    return false;
  }

  const audienceContextId = `${userId ?? ''}\n${hint}`;
  const contextMarker = createHash('sha256').update(audienceContextId).digest().readUInt32LE(0);
  const contextPercentage = (contextMarker / 0xffffffff) * 100;

  if (to === 100) {
    return contextPercentage >= from;
  }

  return contextPercentage >= from && contextPercentage < to;
}

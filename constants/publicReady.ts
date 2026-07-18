export type PublicReadyEnforcementPolicy = Readonly<{
  /**
   * Creation cohort boundary for the bio requirement. This does not expire
   * grandfathering for trucks created before it.
   */
  newTruckBioRequiredAt: string;
  /**
   * Optional future instant when legacy trucks also require a bio for customer
   * visibility. Null keeps legacy visibility enforcement disabled.
   */
  legacyTruckBioEnforcementAt: string | null;
}>;

export const PUBLIC_READY_ENFORCEMENT_POLICY: PublicReadyEnforcementPolicy = {
  newTruckBioRequiredAt: '2026-07-19T00:00:00Z',
  legacyTruckBioEnforcementAt: null,
};

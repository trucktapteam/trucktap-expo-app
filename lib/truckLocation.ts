type LocationLike = {
  label?: string | null;
  address?: string | null;
};

type TruckLocationLike = {
  location?: LocationLike | null;
  liveLocation?: LocationLike | null;
  address?: string | null;
};

const firstReadableValue = (values: (string | null | undefined)[]) => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

export const getTruckDisplayLocation = (truck: TruckLocationLike) =>
  firstReadableValue([
    truck.location?.label,
    truck.location?.address,
    truck.liveLocation?.label,
    truck.liveLocation?.address,
    truck.address,
  ]) ?? 'Location available';

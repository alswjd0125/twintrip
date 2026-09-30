export type TourPlaceRecord = {
  contentId: string;
  contentTypeId: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  image?: string;
  firstImage?: string;
  firstImage2?: string;
  imageSource?: "firstimage" | "firstimage2" | "detailImage2";
  detailImageAttempted?: boolean;
  detailImageUsed?: boolean;
};

const normalizeTourTitle = (value: string) =>
  value.replace(/[\s()\[\]·.,-]/g, "").toLowerCase();

export function selectExactTourPlace<T extends TourPlaceRecord>(
  results: T[],
  aliases: string[],
) {
  const normalizedAliases = aliases.map(normalizeTourTitle);
  return (
    results.find((item) =>
      normalizedAliases.includes(normalizeTourTitle(item.title)),
    ) ||
    results.find((item) =>
      normalizedAliases.some((alias) => normalizeTourTitle(item.title).includes(alias)),
    )
  );
}

export async function resolveTourPlace<T extends TourPlaceRecord>(
  query: string,
  aliases: string[] = [query],
): Promise<T | null> {
  const response = await fetch(
    `/api/tour/search?q=${encodeURIComponent(query)}&resolveImage=1`,
  );
  if (!response.ok) return null;
  const data = await response.json();
  return selectExactTourPlace((data.items || []) as T[], aliases) || null;
}

const endpoint = process.env.TOUR_API_ENDPOINT || "https://apis.data.go.kr/B551011/KorService2";

export async function tourFetch(path: string, params: Record<string, string>) {
  if (!process.env.TOUR_API_KEY) throw new Error("NOT_CONFIGURED");
  const serviceKey = decodeURIComponent(process.env.TOUR_API_KEY);
  const query = new URLSearchParams({
    ...params,
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TwinTrip",
    _type: "json",
  });
  const response = await fetch(`${endpoint}/${path}?${query}`);
  if (!response.ok) throw new Error("FAILED");
  const json = await response.json();
  const header = json?.response?.header || json;
  if (header?.resultCode !== "0000") {
    const error = new Error("TOUR_API_RESPONSE") as Error & {
      endpoint?: string;
      resultCode?: string;
      resultMsg?: string;
    };
    error.endpoint = path;
    error.resultCode = String(header?.resultCode || "UNKNOWN");
    error.resultMsg = String(header?.resultMsg || "Unknown TourAPI error");
    throw error;
  }
  return json.response.body;
}

export function tourApiErrorDetail(error: unknown, fallbackEndpoint: string) {
  const detail = error as Error & {
    endpoint?: string;
    resultCode?: string;
    resultMsg?: string;
  };
  return {
    endpoint: detail.endpoint || fallbackEndpoint,
    resultCode: detail.resultCode || "REQUEST_FAILED",
    resultMsg: detail.resultMsg || detail.message || "Unknown TourAPI error",
  };
}

export function items(body: any) {
  const value = body?.items?.item;
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

export function place(value: any) {
  const secureImage = (source: unknown) =>
    String(source || "").trim().replace(/^http:\/\//, "https://");
  const firstImage = secureImage(value.firstimage);
  const firstImage2 = secureImage(value.firstimage2);
  return {
    contentId: String(value.contentid || ""),
    contentTypeId: String(value.contenttypeid || ""),
    title: String(value.title || ""),
    address: String(value.addr1 || ""),
    longitude: Number(value.mapx || 0),
    latitude: Number(value.mapy || 0),
    firstImage: firstImage || undefined,
    firstImage2: firstImage2 || undefined,
    image: firstImage || firstImage2 || undefined,
    imageSource: firstImage ? "firstimage" : firstImage2 ? "firstimage2" : undefined,
    detailImageAttempted: false,
    detailImageUsed: false,
    overview: value.overview ? String(value.overview).replace(/<[^>]+>/g, "") : undefined,
  };
}

export async function withDetailImage<T extends ReturnType<typeof place>>(item: T): Promise<T> {
  if (item.image || !item.contentId) return item;
  try {
    const body = await tourFetch("detailImage2", {
      contentId: item.contentId,
      imageYN: "Y",
      numOfRows: "10",
      pageNo: "1",
    });
    const detail = items(body).find((image) => image.originimgurl || image.smallimageurl);
    const image = String(detail?.originimgurl || detail?.smallimageurl || "")
      .trim()
      .replace(/^http:\/\//, "https://");
    return image
      ? ({ ...item, image, imageSource: "detailImage2", detailImageAttempted: true, detailImageUsed: true } as T)
      : ({ ...item, detailImageAttempted: true } as T);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const detail = tourApiErrorDetail(error, "detailImage2");
      console.warn("[TwinTrip TourAPI] image fallback failed", {
        endpoint: detail.endpoint,
        contentId: item.contentId,
        resultCode: detail.resultCode,
        resultMsg: detail.resultMsg,
      });
    }
    return { ...item, detailImageAttempted: true } as T;
  }
}

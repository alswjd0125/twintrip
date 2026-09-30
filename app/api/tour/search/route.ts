import { NextRequest, NextResponse } from "next/server";
import { items, place, tourFetch, withDetailImage } from "../../../../lib/tour-api";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) return NextResponse.json({ items: [] });

    const body = await tourFetch("searchKeyword2", {
      keyword: query,
      numOfRows: "12",
      pageNo: "1",
      arrange: "O",
    });
    let results = items(body).map(place);

    if (request.nextUrl.searchParams.get("resolveImage") === "1") {
      results = await Promise.all(results.map(withDetailImage));
      console.info(
        "[TwinTrip TourAPI]",
        query,
        results.map((item) => ({
          title: item.title,
          contentId: item.contentId,
          firstImage: Boolean(item.firstImage),
          firstImage2: Boolean(item.firstImage2),
          detailImageAttempted: item.detailImageAttempted,
          detailImageUsed: item.detailImageUsed,
          imageSource: item.imageSource || "none",
        }))
      );
    }

    return NextResponse.json({ items: results });
  } catch (error) {
    console.error("[TwinTrip TourAPI] search failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { items: [], message: "관광지 검색을 불러오지 못했어요." },
      { status: 503 }
    );
  }
}

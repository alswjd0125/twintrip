import { NextRequest, NextResponse } from "next/server";
import { items, place, tourApiErrorDetail, tourFetch, withDetailImage } from "../../../../lib/tour-api";

export async function GET(request: NextRequest) {
  try {
    const contentId = request.nextUrl.searchParams.get("contentId") || "";
    const contentTypeId = request.nextUrl.searchParams.get("contentTypeId") || "";
    if (!contentId) {
      return NextResponse.json({ item: null, message: "관광지 식별자가 필요해요." }, { status: 400 });
    }
    const [commonResult, introResult] = await Promise.allSettled([
      tourFetch("detailCommon2", { contentId }),
      tourFetch("detailIntro2", { contentId, contentTypeId }),
    ]);
    if (commonResult.status === "rejected") {
      console.error("[TwinTrip TourAPI] detail request failed", {
        ...tourApiErrorDetail(commonResult.reason, "detailCommon2"),
        contentId,
        contentTypeId,
      });
    }
    if (introResult.status === "rejected") {
      console.error("[TwinTrip TourAPI] detail request failed", {
        ...tourApiErrorDetail(introResult.reason, "detailIntro2"),
        contentId,
        contentTypeId,
      });
    }
    if (commonResult.status === "rejected" && introResult.status === "rejected") {
      return NextResponse.json(
        { item: null, message: "상세 정보를 불러오지 못했어요." },
        { status: 503 },
      );
    }
    const common = commonResult.status === "fulfilled" ? items(commonResult.value)[0] || {} : {
      contentid: contentId,
      contenttypeid: contentTypeId,
    };
    const intro = introResult.status === "fulfilled" ? items(introResult.value)[0] || {} : {};
    delete intro.contentid;
    delete intro.contenttypeid;
    const resolved = await withDetailImage(place(common));
    return NextResponse.json({ item: { ...resolved, intro } });
  } catch (error) {
    console.error("[TwinTrip TourAPI] detail route failed", {
      ...tourApiErrorDetail(error, "detail"),
      contentId: request.nextUrl.searchParams.get("contentId") || "",
      contentTypeId: request.nextUrl.searchParams.get("contentTypeId") || "",
    });
    return NextResponse.json(
      { item: null, message: "상세 정보를 불러오지 못했어요." },
      { status: 503 },
    );
  }
}

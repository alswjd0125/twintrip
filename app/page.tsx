"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CloudRain,
  Compass,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Umbrella,
  X,
} from "../lib/icons";
import { resolveTourPlace } from "../lib/tour-place";
type Place = {
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
  overview?: string;
  intro?: Record<string, string>;
};
type Schedule = Place & {
  id: string;
  visitDate: string;
  plannedTime: string;
  actualTime?: string;
  status: "PLANNED" | "CURRENT" | "COMPLETED" | "SKIPPED";
  delayMinutes?: number;
  stayMinutes?: number;
  locked?: boolean;
  mustKeep?: boolean;
  completed?: boolean;
  current?: boolean;
  indoorOutdoor?: "INDOOR" | "OUTDOOR" | "UNKNOWN";
  openingHours?: string;
};
type Trip = {
  id: string;
  title: string;
  region: string;
  startDate: string;
  endDate: string;
  demo: boolean;
  status?: "DRAFT" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "TWIN";
  schedules: Schedule[];
};
type TwinMode = "MINIMAL" | "BALANCED" | "FLEXIBLE";
type ConflictType = "WEATHER" | "OPENING_HOURS" | "TRAVEL_TIME" | "CONGESTION";
type Conflict = {
  itemId: string;
  conflictType: ConflictType;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  source: "LIVE" | "TOUR_API" | "DEMO" | "PLAN_DERIVED";
};
type LiveTrigger = {
  id: string;
  timestamp: string;
  triggerType: "WEATHER_CHANGE" | "OPENING_CHANGE" | "DELAY" | "CONGESTION";
  itemId: string;
  reason: string;
  source: "LIVE" | "DEMO";
};
type ChangeEvent = {
  timestamp: string;
  triggerType: LiveTrigger["triggerType"];
  originalItem: Schedule;
  replacementItem: Schedule;
  reasons: string[];
  twinMode: TwinMode;
};
type TwinPlan = {
  id: string;
  originalTripId: string;
  createdAt: string;
  mode: TwinMode;
  source: "PRE_TRIP" | "LIVE";
  schedules: Schedule[];
  changes: Array<{ itemId: string; original: Schedule; replacement: Schedule; reasons: string[] }>;
};
const FALLBACK = "/hero-seoul.jpg";
const samples: Place[] = [
  {
    contentId: "126508",
    contentTypeId: "12",
    title: "경복궁",
    address: "서울특별시 종로구 사직로 161",
    latitude: 37.5796,
    longitude: 126.977,
  },
  {
    contentId: "132183",
    contentTypeId: "38",
    title: "광장시장",
    address: "서울특별시 종로구 창경궁로 88",
    latitude: 37.57,
    longitude: 126.9996,
  },
  {
    contentId: "126535",
    contentTypeId: "12",
    title: "남산서울타워",
    address: "서울특별시 용산구 남산공원길 105",
    latitude: 37.5512,
    longitude: 126.9882,
  },
  {
    contentId: "970138",
    contentTypeId: "12",
    title: "반포한강공원",
    address: "서울특별시 서초구 신반포로11길 40",
    latitude: 37.5102,
    longitude: 126.9958,
  },
];
const alternatives: Place[] = [
  {
    contentId: "129703",
    contentTypeId: "14",
    title: "국립중앙박물관",
    address: "서울특별시 용산구 서빙고로 137 (용산동6가)",
    latitude: 37.521116788705534,
    longitude: 126.97911242871115,
  },
  {
    contentId: "129491",
    contentTypeId: "14",
    title: "리움미술관",
    address: "서울특별시 용산구 이태원로55길 60-16",
    latitude: 37.5384,
    longitude: 126.9992,
  },
  {
    contentId: "126506",
    contentTypeId: "12",
    title: "덕수궁",
    address: "서울특별시 중구 세종대로 99",
    latitude: 37.5658,
    longitude: 126.9751,
  },
];
const tourLookupFor = (title: string) => {
  if (title === "남산서울타워" || title === "N서울타워") {
    return { query: "남산서울타워", aliases: ["남산서울타워"] };
  }
  if (title === "반포한강공원") {
    return { query: title, aliases: ["반포한강공원", "반포 한강공원"] };
  }
  return { query: title, aliases: [title] };
};
const resolveSchedulePlace = <T extends Place>(title: string) => {
  const lookup = tourLookupFor(title);
  return resolveTourPlace<T>(lookup.query, lookup.aliases);
};
const normalizeTrip = (trip: Trip): Trip => ({
  ...trip,
  status: trip.status || "DRAFT",
  schedules: trip.schedules.map((item) => ({
    ...item,
    mustKeep: item.mustKeep ?? item.locked ?? false,
    locked: item.mustKeep ?? item.locked ?? false,
    completed: item.completed ?? item.status === "COMPLETED",
    current: item.current ?? item.status === "CURRENT",
    indoorOutdoor: item.indoorOutdoor || (item.contentTypeId === "14" ? "INDOOR" : "UNKNOWN"),
  })),
});
const scheduleMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
const sortedSchedules = (schedules: Schedule[]) => [...schedules].sort((a, b) => {
  const dateOrder = a.visitDate.localeCompare(b.visitDate);
  return dateOrder || scheduleMinutes(a.plannedTime) - scheduleMinutes(b.plannedTime);
});
const detectConflicts = (trip: Trip, trigger?: LiveTrigger | null): Conflict[] => {
  const conflicts: Conflict[] = [];
  const schedules = sortedSchedules(trip.schedules);
  schedules.forEach((item, index) => {
    const next = schedules[index + 1];
    if (next && scheduleMinutes(next.plannedTime) - scheduleMinutes(item.plannedTime) < (item.stayMinutes || 90)) {
      conflicts.push({ itemId: item.id, conflictType: "TRAVEL_TIME", severity: "MEDIUM", reason: "예상 체류시간보다 다음 일정까지의 간격이 짧아요.", source: "PLAN_DERIVED" });
    }
  });
  const rainTarget = trigger?.itemId || (trip.demo
    ? schedules.find((item) => scheduleMinutes(item.plannedTime) >= 18 * 60 && item.indoorOutdoor === "OUTDOOR")?.id
    : undefined);
  if (rainTarget && (trip.demo || trigger)) {
    conflicts.push({ itemId: rainTarget, conflictType: "WEATHER", severity: "HIGH", reason: trigger?.reason || "18시 강수확률 80%로 야외 일정에 영향이 예상돼요.", source: trigger?.source || "DEMO" });
  }
  return conflicts.filter((conflict, index, all) => all.findIndex((entry) => entry.itemId === conflict.itemId && entry.conflictType === conflict.conflictType) === index);
};
const createActiveTrip = (trip: Trip): Trip => ({
  ...normalizeTrip(trip),
  id: `${trip.id}-active`,
  status: "ACTIVE",
  schedules: trip.schedules.map((item, index) => ({ ...item, status: index === 0 ? "CURRENT" : "PLANNED", current: index === 0, completed: false })),
});
const getStored = <T,>(key: string): T | null => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : null; } catch { return null; }
};
const setStored = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const clearDerivedTripState = () => {
  ["twintrip-original", "twintrip-confirmed", "twintrip-active", "twintrip-twin", "twintrip-planb", "twintrip-conflicts", "twintrip-live-event", "twintrip-change-events"].forEach((key) => localStorage.removeItem(key));
};
const makeSample = (): Trip => {
  let d = new Date().toISOString().slice(0, 10);
  const demoPlaces = samples.slice(1);
  return {
    id: "demo-seoul",
    title: "서울 당일치기",
    region: "서울",
    startDate: d,
    endDate: d,
    demo: true,
    schedules: demoPlaces.map((p, i) => ({
      ...p,
      id: `s${i}`,
      visitDate: d,
      plannedTime: ["12:30", "15:00", "18:00"][i],
      stayMinutes: 90,
      locked: i === 0,
      mustKeep: i === 0,
      indoorOutdoor: i === 2 ? "OUTDOOR" : "UNKNOWN",
      status: "PLANNED",
      completed: false,
      current: false,
    })),
  };
};
function go(p: string) {
  history.pushState({}, "", p);
  dispatchEvent(new PopStateEvent("popstate"));
}
function Logo() {
  return (
    <button className="logo flow-logo" aria-label="TwinTrip 홈" onClick={() => go("/")}>
      <svg className="flow-wordmark" viewBox="0 0 190 48" role="img" aria-label="TwinTrip">
        <defs>
          <linearGradient id="flow-route-ink" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#10233f" />
            <stop offset="1" stopColor="#70b6e7" />
          </linearGradient>
        </defs>
        <text x="2" y="34" className="flow-wordmark-text">TwinTrip</text>
        <path className="flow-wordmark-route" d="M97 34 C111 43 128 40 143 35 C157 30 170 31 184 28" />
        <path className="flow-wordmark-fork" d="M181 28 C184 27 186 25 188 23" />
      </svg>
    </button>
  );
}
function Header({ step = 0 }: { step?: number }) {
  const [open, setOpen] = useState(false);
  const [tripName, setTripName] = useState("서울 여행");
  let path = typeof location === "undefined" ? "/" : location.pathname;
  useEffect(() => {
    const stored = getStored<Trip>("twintrip-active") || getStored<Trip>("twintrip-confirmed") || getStored<Trip>("twintrip");
    if (stored?.title) setTripName(stored.title);
  }, [path]);
  const move = (to: string) => {
    setOpen(false);
    go(to);
  };
  return (
    <>
      <header>
        <Logo />
        <nav className="journey-nav" aria-label="여행 단계">
          {[
            ["/trip/new", "PLAN"],
            ["/trip/check", "CHECK"],
            ["/trip/replan", "PLAN B!"],
            ["/trip/live", "TRAVEL"],
            ["/trip/change", "CHANGE"],
          ].map(([to, label]) => (
            <button
              key={to}
              className={path === to ? "active" : ""}
              aria-current={path === to ? "page" : undefined}
              onClick={() => move(to)}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="header-actions">
          <small>{tripName}<ChevronDown /></small>
          <button
            className="menu-trigger"
            aria-label="메뉴 열기"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
        </span>
      </header>
      {open && (
        <div className="nav-layer" onClick={() => setOpen(false)}>
          <nav
            className="nav-drawer"
            aria-label="주요 메뉴"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <Logo />
              <button aria-label="메뉴 닫기" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            {[
              ["/", "HOME", "처음으로"],
              ["/trip/new", "PLAN", "여행 계획"],
              ["/trip/check", "CHECK", "여행 점검"],
              ["/trip/replan", "PLAN B!", "대체 일정"],
              ["/trip/live", "TRAVEL", "여행 진행"],
              ["/trip/change", "CHANGE", "변경 확인"],
            ].map(([to, en, ko]) => {
              let active =
                to === "/"
                  ? path === "/"
                  : to === "/#about"
                    ? false
                    : path.startsWith(to);
              return (
                <button
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  key={to}
                  onClick={() => {
                    move(to);
                  }}
                >
                  <span>{en}</span>
                  <b>{ko}</b>
                  <ArrowRight />
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
function Progress({ step }: { step: number }) {
  return (
    <nav className="progress">
      {["Plan", "Check", "Travel", "Change", "Re-plan"].map((x, i) => (
        <div className={i < step ? "on" : ""} key={x}>
          <b>{i + 1 < step ? <Check /> : i + 1}</b>
          <span>{x}</span>
        </div>
      ))}
    </nav>
  );
}
function Btn({
  children,
  onClick,
  alt = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  alt?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`btn ${alt ? "alt" : ""}`}
    >
      {children}
    </button>
  );
}
function Back({ to, text }: { to: string; text: string }) {
  return (
    <button className="back" onClick={() => go(to)}>
      <ArrowLeft />
      {text}
    </button>
  );
}
function Demo() {
  return (
    <div className="demo">
      <Sparkles />
      <b>DEMO · 서울 당일치기</b>
      <span>30분 지연 · 18시 이후 우천이 적용됩니다</span>
    </div>
  );
}
function RouteLine({ schedules, currentId, changedId, compact = false }: { schedules: Schedule[]; currentId?: string; changedId?: string; compact?: boolean }) {
  return (
    <ol className={`route-line${compact ? " compact" : ""}`}>
      {schedules.map((item, index) => {
        const state = item.completed || item.status === "COMPLETED" ? "done" : item.id === currentId || item.current || item.status === "CURRENT" ? "current" : "upcoming";
        return <li className={`${state}${item.id === changedId ? " changed" : ""}`} key={item.id}>
          <span className="route-node" />
          <time>{item.plannedTime}</time>
          <div><b>{item.title}</b><small>{item.address}</small>{item.mustKeep && <em>MUST KEEP</em>}</div>
        </li>;
      })}
    </ol>
  );
}
function useTrip() {
  const [t, setT] = useState<Trip | null>(null);
  useEffect(() => {
    let x = localStorage.getItem("twintrip");
    if (!x && new URLSearchParams(location.search).get("demo") === "1") {
      x = JSON.stringify(makeSample());
      localStorage.setItem("twintrip", x);
    }
    if (!x) return;
    const stored = normalizeTrip(JSON.parse(x) as Trip);
    const hasLegacyImage = stored.schedules.some((schedule) =>
      /images\.unsplash\.com|\/hero-seoul\.jpg/.test(schedule.image || ""),
    );
    const shouldResolveDemo = stored.demo || hasLegacyImage;
    const sanitized = shouldResolveDemo
      ? {
          ...stored,
          schedules: stored.schedules.map((schedule) => ({
            ...schedule,
            image: /images\.unsplash\.com|\/hero-seoul\.jpg/.test(schedule.image || "")
              ? undefined
              : schedule.image,
            imageSource: /images\.unsplash\.com|\/hero-seoul\.jpg/.test(schedule.image || "")
              ? undefined
              : schedule.imageSource,
          })),
        }
      : stored;
    setT(sanitized);
    localStorage.setItem("twintrip", JSON.stringify(sanitized));
    if (!shouldResolveDemo) return;
    Promise.all(
      sanitized.schedules.map(async (schedule) => {
        try {
          const resolved = await resolveSchedulePlace<Place>(schedule.title);
          return resolved ? { ...schedule, ...resolved } : schedule;
        } catch {
          return schedule;
        }
      }),
    ).then((schedules) => {
      const migrated = { ...sanitized, schedules };
      setT(migrated);
      localStorage.setItem("twintrip", JSON.stringify(migrated));
    });
  }, []);
  const set = (v: Trip) => {
    const normalized = normalizeTrip(v);
    setT(normalized);
    localStorage.setItem("twintrip", JSON.stringify(normalized));
    clearDerivedTripState();
  };
  return [t, set] as const;
}
function Home() {
  const pickQueries = [
    { query: "경복궁", aliases: ["경복궁"] },
    { query: "반포한강공원", aliases: ["반포한강공원", "반포 한강공원"] },
    { query: "국립중앙박물관", aliases: ["국립중앙박물관"] },
    { query: "익선동 한옥거리", aliases: ["익선동 한옥거리", "익선동한옥거리", "익선동 한옥마을"] },
  ];
  const [homePicks, setHomePicks] = useState<Place[]>(
    pickQueries.map(({ query }) => ({ contentId: query, contentTypeId: "", title: query, address: "", latitude: 0, longitude: 0 }))
  );
  const [homePicksLoading, setHomePicksLoading] = useState(true);
  useEffect(() => {
    Promise.all(
      pickQueries.map(async ({ query, aliases }) => {
        try {
          return await resolveTourPlace<Place>(query, aliases);
        } catch {
          return null;
        }
      })
    )
      .then((items) => setHomePicks((current) => current.map((fallback, index) => items[index] || fallback)))
      .finally(() => setHomePicksLoading(false));
  }, []);
  return (
    <main className="clean-home">
      <Header />
      <section className="home-hero">
        <img src="/hero-seoul.jpg" alt="한강과 서울 도심 전경" />
        <div className="home-copy">
          <h1>
            <span>계획이 바뀌어도,</span>
            <strong>여행은 계속되니까.</strong>
          </h1>
          <p>예상치 못한 변화에도,<br />TwinTrip은 지금까지의 여행은 그대로 두고<br />남은 일정을 다시 연결합니다.</p>
          <button className="primary-action" onClick={() => go("/trip/new")}>여행 계획하기 <ArrowRight /></button>
        </div>
      </section>
      <section className="home-twin-story" aria-labelledby="home-twin-story-title">
        <div className="twin-story-copy plan-copy">
          <p id="home-twin-story-title">YOUR PLAN</p>
          <h2>지금의 여행도,<br />소중한 이야기니까.</h2>
        </div>
        <figure className="twin-story-route" aria-label="하나의 여행 경로에서 기존 일정과 Twin 일정으로 분기되는 과정">
          <svg viewBox="0 0 520 146" role="img" aria-hidden="true">
            <path className="story-route-origin" d="M12 73 H224" />
            <circle className="story-route-node" cx="224" cy="73" r="4" />
            <path className="story-route-keep" d="M224 73 C276 73 294 39 346 39 H508" />
            <path className="story-route-twin" d="M224 73 C276 73 294 107 346 107 H508" />
            <text x="354" y="27">기존 일정 유지</text>
            <text className="twin-label" x="354" y="132">필요한 구간만 변경</text>
          </svg>
        </figure>
        <div className="twin-story-copy twin-copy">
          <p>YOUR TWIN</p>
          <h2>같은 여행에서 시작해,<br />변화가 필요한 순간에 다른 길로.</h2>
        </div>
      </section>
      <section className="home-picks" id="about">
        <header><h2>서울에서 시작해보세요</h2><p>한국관광공사 관광데이터에서 불러온 장소입니다.</p></header>
        <div>
          {homePicks.map((place, i) => (
            <button key={place.contentId} onClick={() => go("/trip/new")}>
              {place.image ? <img src={place.image} alt={place.title} /> : <span className={`pick-placeholder${homePicksLoading ? " is-loading" : ""}`} aria-label={homePicksLoading ? "이미지 불러오는 중" : "이미지 준비 중"}>IMAGE PENDING</span>}
              <b>{place.title}</b>
              <small>{place.address}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
function tripDates(start: string, end: string) {
  const out: string[] = [];
  let a = new Date(`${start}T00:00:00`),
    b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(+a) || Number.isNaN(+b) || a > b)
    return start ? [start] : [];
  for (
    let d = new Date(a);
    d <= b && out.length < 30;
    d.setDate(d.getDate() + 1)
  ) {
    let y = d.getFullYear(),
      m = String(d.getMonth() + 1).padStart(2, "0"),
      day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}
function NewTrip() {
  const [trip, setTrip] = useTrip();
  const destinationSearchRef = useRef<HTMLElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);
  let today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: "",
    region: "서울",
    startDate: today,
    endDate: today,
  });
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "success" | "empty" | "error"
  >("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [detail, setDetail] = useState<Place | null>(null);
  const [activeDay, setActiveDay] = useState(today);
  useEffect(() => {
    if (trip) {
      setForm({
        title: trip.title,
        region: trip.region,
        startDate: trip.startDate,
        endDate: trip.endDate,
      });
      setActiveDay(trip.startDate);
    }
  }, [trip?.id]);
  useEffect(() => {
    if (!trip?.demo) return;
    let active = true;
    setSearchState("loading");
    Promise.all(
      ["경복궁", "반포한강공원", "국립중앙박물관", "익선동 한옥거리"].map((name) =>
        resolveTourPlace<Place>(name).catch(() => null),
      ),
    ).then((places) => {
      if (!active) return;
      const resolved = places.filter((place): place is Place => Boolean(place));
      setResults(resolved);
      setSearchState(resolved.length ? "success" : "error");
      if (!resolved.length) setSearchMessage("데모 관광지를 불러오지 못했어요.");
    });
    return () => {
      active = false;
    };
  }, [trip?.id]);
  let dates = tripDates(form.startDate, form.endDate),
    list = trip?.schedules || [],
    dayList = list.filter((s) => s.visitDate === activeDay);
  const persistForm = (next: typeof form) => {
    setForm(next);
    let validDates = tripDates(next.startDate, next.endDate),
      t = trip || {
        id: crypto.randomUUID(),
        title: next.title,
        region: next.region,
        startDate: next.startDate,
        endDate: next.endDate,
        demo: false,
        schedules: [],
      };
    setTrip({
      ...t,
      ...next,
      schedules: t.schedules.filter((s) => validDates.includes(s.visitDate)),
    });
    if (!validDates.includes(activeDay))
      setActiveDay(validDates[0] || next.startDate);
  };
  const search = async () => {
    if (!q.trim()) return;
    setSearchState("loading");
    setSearchMessage("");
    try {
      let r = await fetch(`/api/tour/search?q=${encodeURIComponent(q.trim())}&resolveImage=1`),
        j = await r.json();
      if (!r.ok)
        throw new Error(j.message || "관광지 검색을 불러오지 못했어요.");
      setResults(j.items || []);
      setSearchState(j.items?.length ? "success" : "empty");
    } catch (e) {
      setResults([]);
      setSearchMessage(
        e instanceof Error ? e.message : "관광지 검색을 불러오지 못했어요.",
      );
      setSearchState("error");
    }
  };
  const add = (p: Place) => {
    let t = trip || {
        id: crypto.randomUUID(),
        ...form,
        demo: false,
        schedules: [],
      },
      count = t.schedules.filter((s) => s.visitDate === activeDay).length;
    setTrip({
      ...t,
      ...form,
      schedules: [
        ...t.schedules,
        {
          ...p,
          id: crypto.randomUUID(),
          visitDate: activeDay,
          plannedTime: ["10:00", "12:30", "15:00", "18:00"][count] || "19:00",
          stayMinutes: 90,
          locked: false,
          mustKeep: false,
          completed: false,
          current: false,
          indoorOutdoor: p.contentTypeId === "14" ? "INDOOR" : "UNKNOWN",
          status: "PLANNED",
        },
      ],
    });
  };
  const move = (i: number, n: number) => {
    if (!trip) return;
    let ordered = [...dayList],
      target = ordered[i + n];
    if (!target) return;
    let ai = trip.schedules.findIndex((s) => s.id === ordered[i].id),
      bi = trip.schedules.findIndex((s) => s.id === target.id),
      all = [...trip.schedules];
    [all[ai], all[bi]] = [all[bi], all[ai]];
    setTrip({ ...trip, schedules: all });
  };
  return (
    <main className="trip-new">
      <Header step={1} />
      <div className="trip-shell">
        <Back to="/" text="홈으로" />
        <div className="trip-left">
          <section className="trip-heading">
            <div className="make-type" aria-hidden="true">
              <span>PLAN</span>
              <span>Your Trip.</span>
            </div>
            <div className="plan-intro-copy">
              <h1>
                나만의 여행을
                <br />
                만들어 볼까요?
              </h1>
              <p>여행 날짜를 정하고, 실제 관광데이터에서 장소를 찾아보세요.</p>
            </div>
            <figure className="plan-visual">
              <img src="/hero-seoul.jpg" alt="서울 여행 풍경" />
              <figcaption>SEOUL CITY</figcaption>
            </figure>
          </section>
          <section className="trip-info">
            <div className="trip-form">
              <label>
                여행명
                <input
                  aria-label="여행명"
                  placeholder="예: 서울 미술관 투어"
                  value={form.title}
                  onChange={(e) =>
                    persistForm({ ...form, title: e.target.value })
                  }
                />
              </label>
              <label>
                여행 지역
                <select
                  aria-label="여행 지역"
                  value={form.region}
                  onChange={(e) =>
                    persistForm({ ...form, region: e.target.value })
                  }
                >
                  <option>서울</option>
                  <option>부산</option>
                  <option>제주</option>
                  <option>강원</option>
                  <option>경주</option>
                </select>
              </label>
              <label>
                여행 시작일
                <input
                  aria-label="여행 시작일"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    persistForm({
                      ...form,
                      startDate: e.target.value,
                      endDate:
                        e.target.value > form.endDate
                          ? e.target.value
                          : form.endDate,
                    })
                  }
                />
              </label>
              <label>
                여행 종료일
                <input
                  aria-label="여행 종료일"
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(e) =>
                    persistForm({ ...form, endDate: e.target.value })
                  }
                />
              </label>
            </div>
          </section>
          <section className="destination-search" ref={destinationSearchRef}>
            <div className="section-title">
              <i>02</i>
              <div>
                <span>FIND A PLACE</span>
                <h2>관광지 검색</h2>
              </div>
            </div>
            <div className="search modern">
              <Search />
              <input
                ref={destinationInputRef}
                id="destination-keyword"
                aria-label="관광지 키워드"
                placeholder="경복궁, 해운대, 성산일출봉..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <button onClick={search}>검색</button>
            </div>
            {searchState === "idle" && (
              <div className="search-guide">
                <Compass />
                <b>어디로 떠나고 싶나요?</b>
                <span>한국관광공사 관광데이터에서 실제 장소를 검색합니다.</span>
              </div>
            )}
            {searchState === "loading" && (
              <div className="search-guide loading">
                <span className="loader" />
                <b>관광데이터를 찾고 있어요</b>
              </div>
            )}
            {searchState === "empty" && (
              <div className="search-guide">
                <Search />
                <b>검색 결과가 없어요</b>
                <span>다른 관광지명이나 지역명으로 검색해 보세요.</span>
              </div>
            )}
            {searchState === "error" && (
              <div className="search-guide error">
                <CircleAlert />
                <b>검색 정보를 불러오지 못했어요</b>
                <span>{searchMessage}</span>
                <button onClick={search}>다시 시도</button>
              </div>
            )}
            {searchState === "success" && (
              <div className="destination-grid">
                {results.map((p) => (
                  <article key={`${p.contentId}-${p.contentTypeId}`}>
                    <button
                      className="destination-photo"
                      onClick={() => setDetail(p)}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" />
                      ) : (
                        <span>
                          <Compass />
                          이미지 없음
                        </span>
                      )}
                      <em>TYPE {p.contentTypeId || "—"}</em>
                    </button>
                    <div>
                      <button
                        className="destination-name"
                        onClick={() => setDetail(p)}
                      >
                        <b>{p.title}</b>
                        <span>
                          <MapPin />
                          {p.address || "주소 정보 없음"}
                        </span>
                      </button>
                      <small>ID {p.contentId}</small>
                      <button
                        className="add-destination"
                        onClick={() => add(p)}
                      >
                        <Plus /> {dates.indexOf(activeDay) + 1}일차 일정에 추가
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
        <section className="itinerary-builder">
          <div className="itinerary-paper-head">
            <div>
              <h2>MY TRIP</h2>
              <p>나만의 서울 여행 일정</p>
            </div>
            <span><b>{list.length}</b> PLACES</span>
          </div>
          <div className="day-selector-row">
            <div className="day-tabs">
              {dates.map((d, i) => (
                <button
                  className={activeDay === d ? "active" : ""}
                  key={d}
                  onClick={() => setActiveDay(d)}
                >
                  <b>DAY {String(i + 1).padStart(2, "0")}</b>
                  <span>
                    {new Date(`${d}T00:00:00`).toLocaleDateString("ko-KR", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </span>
                  <em>{list.filter((s) => s.visitDate === d).length}</em>
                </button>
              ))}
            </div>
            <button
              className="add-day"
              onClick={() => {
                const next = new Date(`${form.endDate}T00:00:00`);
                next.setDate(next.getDate() + 1);
                const endDate = next.toISOString().slice(0, 10);
                persistForm({ ...form, endDate });
                setActiveDay(endDate);
              }}
            >
              <Plus /> DAY 추가
            </button>
          </div>
          {!dayList.length ? (
            <div className="day-empty">
              <span>{`DAY ${Math.max(1, dates.indexOf(activeDay) + 1)}`}</span>
              <Compass />
              <b>이 날의 첫 장소를 추가해 보세요</b>
              <p>왼쪽 검색 결과에서 원하는 장소를 선택하세요.</p>
            </div>
          ) : (
            <div className="day-schedule">
              {dayList.map((s, i) => (
                <div className="timeline-entry" key={s.id}>
                  <article>
                    <div className="schedule-order">
                      <button
                        aria-label="위로 이동"
                        disabled={!i}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp />
                      </button>
                      <b>{String(i + 1).padStart(2, "0")}</b>
                      <button
                        aria-label="아래로 이동"
                        disabled={i === dayList.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown />
                      </button>
                    </div>
                    {s.image ? (
                      <img src={s.image} alt={`${s.title} TourAPI 사진`} />
                    ) : (
                      <span className="no-thumb">
                        <Compass />
                      </span>
                    )}
                    <div className="schedule-place">
                      <b>{s.title}</b>
                      <span>
                        <MapPin />
                        {s.address || "위치 정보 없음"}
                      </span>
                      {s.overview && <p>{s.overview}</p>}
                    </div>
                    <label>
                      시간
                      <input
                        aria-label={`${s.title} 방문 시간`}
                        type="time"
                        value={s.plannedTime}
                        onChange={(e) =>
                          trip &&
                          setTrip({
                            ...trip,
                            schedules: list.map((x) =>
                              x.id === s.id
                                ? { ...x, plannedTime: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="stay-control">
                      체류
                      <select
                        aria-label={`${s.title} 예상 체류시간`}
                        value={s.stayMinutes || 90}
                        onChange={(e) =>
                          trip &&
                          setTrip({
                            ...trip,
                            schedules: list.map((x) =>
                              x.id === s.id
                                ? { ...x, stayMinutes: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="30">30분</option>
                        <option value="60">1시간</option>
                        <option value="90">1시간 30분</option>
                        <option value="120">2시간</option>
                      </select>
                    </label>
                    <button
                      className={`lock-place ${s.mustKeep ? "locked" : ""}`}
                      aria-label={`${s.title} 일정 ${s.mustKeep ? "필수 유지 해제" : "필수 유지"}`}
                      aria-pressed={!!s.mustKeep}
                      onClick={() =>
                        trip &&
                        setTrip({
                          ...trip,
                          schedules: list.map((x) =>
                            x.id === s.id ? { ...x, mustKeep: !x.mustKeep, locked: !x.mustKeep } : x,
                          ),
                        })
                      }
                    >
                      <ShieldCheck />
                      {s.mustKeep ? "MUST KEEP" : "필수 유지"}
                    </button>
                    <small className="must-keep-help">상황이 바뀌어도 이 일정은 유지해요.</small>
                    <button
                      className="remove-place"
                      aria-label={`${s.title} 삭제`}
                      onClick={() =>
                        trip &&
                        setTrip({
                          ...trip,
                          schedules: list.filter((x) => x.id !== s.id),
                        })
                      }
                    >
                      <Trash2 />
                    </button>
                  </article>
                  {i < dayList.length - 1 && (
                    <div className="travel-leg">
                      <Navigation />
                      <span>
                        {trip?.demo
                          ? `DEMO · 이동 ${[18, 24, 22][i] || 20}분`
                          : "이동시간은 CHECK에서 확인"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            className="planner-add-place"
            onClick={() => {
              destinationSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => destinationInputRef.current?.focus({ preventScroll: true }), 350);
            }}
          >
            <Plus /> 일정 추가하기
          </button>
          <div className="trip-cta">
            <span>
              <b>
                {dates.length} DAYS · {list.length} PLACES
              </b>
              입력한 여행은 자동으로 저장됩니다.
            </span>
            <Btn
              disabled={!form.title || !list.length}
              onClick={() => go("/trip/check")}
            >
              이 일정, 괜찮은지 확인하기 <ArrowRight />
            </Btn>
          </div>
        </section>
      </div>
      {detail && <Modal place={detail} close={() => setDetail(null)} />}
    </main>
  );
}
function Title({
  eye,
  title,
  desc,
}: {
  eye: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="title">
      <em>{eye}</em>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  );
}
function Card({
  title,
  name,
  children,
}: {
  title: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2>
        <i>{title}</i>
        {name}
      </h2>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <CalendarDays />
      <b>{text}</b>
    </div>
  );
}
function Modal({ place, close }: { place: Place; close: () => void }) {
  const [p, setP] = useState(place),
    [state, setState] = useState<"loading" | "done" | "error">("loading");
  useEffect(() => {
    setState("loading");
    fetch(
      `/api/tour/detail?contentId=${encodeURIComponent(place.contentId)}&contentTypeId=${encodeURIComponent(place.contentTypeId)}`,
    )
      .then(async (r) => {
        let x = await r.json();
        if (!r.ok || !x.item) throw new Error();
        setP({ ...place, ...x.item });
        setState("done");
      })
      .catch(() => setState("error"));
  }, [place]);
  return (
    <div
      className="modal tour-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${p.title} 상세정보`}
    >
      <section>
        <button aria-label="닫기" onClick={close}>
          <X />
        </button>
        {p.image ? (
          <img src={p.image} alt="" />
        ) : (
          <div className="modal-no-image">
            <Compass />
            이미지 없음
          </div>
        )}
        <div>
          <em>TOUR DATA · {p.contentTypeId}</em>
          <h2>{p.title}</h2>
          <p>
            <MapPin />
            {p.address || "주소 정보 없음"}
          </p>
          {state === "loading" && (
            <div className="detail-state">
              <span className="loader" />
              상세정보를 불러오고 있어요.
            </div>
          )}
          {state === "error" && (
            <div className="detail-state error">
              <CircleAlert />
              상세정보를 불러오지 못했어요.
            </div>
          )}
          {state === "done" && (
            <>
              <h3>소개</h3>
              <p>{p.overview || "제공된 소개 정보가 없습니다."}</p>
              <h3>운영 · 이용 정보</h3>
              {p.intro &&
                Object.entries(p.intro)
                  .filter(([, v]) => v)
                  .slice(0, 7)
                  .map(([k, v]) => (
                    <small key={k}>
                      <b>{k}</b>
                      {String(v).replace(/<[^>]+>/g, " ")}
                    </small>
                  ))}
            </>
          )}
          <Btn onClick={close}>확인</Btn>
        </div>
      </section>
    </div>
  );
}
function CheckPage() {
  const [trip] = useTrip();
  const [confirmed, setConfirmed] = useState(false);
  if (!trip) return <Need />;
  const normalized = normalizeTrip(trip);
  const normalizedTrip = { ...normalized, schedules: sortedSchedules(normalized.schedules) };
  const conflicts = detectConflicts(normalizedTrip);
  const visualPlace = normalizedTrip.schedules.find((schedule) => schedule.image) || normalizedTrip.schedules.at(-1);
  const secondVisual = [...normalizedTrip.schedules].reverse().find((schedule) => schedule.image && schedule.id !== visualPlace?.id);
  const demoFacts = [
    { temperature: "26°C", rain: "20%", weather: "구름 조금", crowd: "혼잡", hours: "09:00 - 18:00", travel: 25, spare: 30, memo: "주말 방문 혼잡 예상" },
    { temperature: "25°C", rain: "30%", weather: "구름 조금", crowd: "약간 혼잡", hours: "10:00 - 23:00", travel: 20, spare: 40, memo: "현재 일정 유지 가능" },
    { temperature: "28°C", rain: "80%", weather: "비 예보", crowd: "약간 혼잡", hours: "24시간", travel: 30, spare: 20, memo: "저녁 이후 비 예보 · 대체 일정 검토" },
  ];
  const checks = normalizedTrip.schedules.map((s, i) => {
    const itemConflicts = conflicts.filter((conflict) => conflict.itemId === s.id);
    const demoRisk = itemConflicts.some((conflict) => conflict.conflictType === "WEATHER");
    const next = normalizedTrip.schedules[i + 1];
    const gap = next
      ? Number(next.plannedTime.slice(0, 2)) * 60 + Number(next.plannedTime.slice(3)) -
        (Number(s.plannedTime.slice(0, 2)) * 60 + Number(s.plannedTime.slice(3)))
      : null;
    const tight = gap !== null && gap < (s.stayMinutes || 90);
    const spare = gap === null ? 0 : gap - (s.stayMinutes || 90);
    const demo = trip.demo ? (demoRisk ? demoFacts[2] : demoFacts[Math.min(i, 1)]) : null;
    return {
      ...s,
      conflicts: itemConflicts,
      needsReview: itemConflicts.length > 0,
      action: itemConflicts.length ? "CHECK" : "KEEP",
      demo,
      gap,
      spare,
      note: demoRisk
        ? "야외 일정 시간대에 비 예보가 있어 대안을 준비하는 편이 좋아요."
        : tight
          ? `예상 체류 ${s.stayMinutes || 90}분보다 다음 일정까지의 간격이 짧아요.`
          : "현재 입력된 일정 간격에서는 바로 확인되는 충돌이 없습니다.",
    };
  });
  const issueCount = checks.filter((x) => x.needsReview).length;
  const weatherRisk = checks.find((item) => item.conflicts.some((conflict) => conflict.conflictType === "WEATHER"));
  const firstRisk = checks.find((item) => item.needsReview);
  const saveConfirmed = () => {
    const confirmedTrip = { ...normalizedTrip, status: "CONFIRMED" as const };
    setStored("twintrip-original", normalizedTrip);
    setStored("twintrip-confirmed", confirmedTrip);
    setStored("twintrip-conflicts", conflicts);
    setConfirmed(true);
  };
  const previewPlanB = () => {
    const confirmedTrip = { ...normalizedTrip, status: "CONFIRMED" as const };
    setStored("twintrip-original", normalizedTrip);
    setStored("twintrip-confirmed", confirmedTrip);
    setStored("twintrip-conflicts", conflicts);
    go("/trip/replan");
  };
  const startTrip = () => {
    const confirmedTrip = { ...normalizedTrip, status: "CONFIRMED" as const };
    setStored("twintrip-original", normalizedTrip);
    setStored("twintrip-confirmed", confirmedTrip);
    setStored("twintrip-conflicts", conflicts);
    setStored("twintrip-active", createActiveTrip(confirmedTrip));
    localStorage.removeItem("twintrip-live-event");
    localStorage.removeItem("twintrip-twin");
    localStorage.removeItem("twintrip-planb");
    localStorage.removeItem("twintrip-change-events");
    go("/trip/live");
  };
  const dateLabel = new Date(`${trip.startDate}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  return (
    <main className="service-page check-page-clean">
      <Header step={2} />
      <div className="service-shell">
        <header className="page-heading"><p>{trip.region} · {dateLabel}</p><h1>출발 전, 일정을 한 번 더 확인했어요.</h1><span>날씨와 운영 정보, 이동 간격을 기준으로 조정이 필요한 일정을 찾았습니다.</span></header>
        <div className="check-layout-clean">
          <section className="check-route-panel">
            <h2>오늘의 경로</h2>
            <RouteLine schedules={normalizedTrip.schedules} changedId={firstRisk?.id} />
          </section>
          <section className="check-detail-list">
            {checks.map((item, index) => (
              <article className={item.needsReview ? "needs-review" : ""} key={item.id}>
                <time>{item.plannedTime}</time>
                <div className="check-place-clean">
                  {item.image ? <img src={item.image} alt={`${item.title} TourAPI 사진`} /> : <span className="check-no-image">IMAGE<br />PENDING</span>}
                  <div><h3>{item.title}</h3><p>{item.address || "주소 정보 없음"}</p>{item.mustKeep && <small>MUST KEEP</small>}</div>
                </div>
                <div className="check-meta"><span>날씨 <b>{item.demo ? `${item.demo.temperature} · ${item.demo.rain}` : "확인 필요"}</b></span><span>운영 <b>{item.demo ? item.demo.hours : "TourAPI 상세"}</b></span><span>이동 <b>{item.demo ? `${item.demo.travel}분` : item.gap === null ? "마지막 일정" : `${item.gap}분`}</b></span></div>
                <p>{item.conflicts[0]?.reason || item.demo?.memo || item.note}</p>
              </article>
            ))}
          </section>
        </div>
        <section className="check-conclusion"><p><b>{weatherRisk ? "18:00 이후 비가 예상돼요." : issueCount ? "일정 간격을 확인해 주세요." : "현재 시나리오에서 변경이 필요한 일정을 찾지 못했어요."}</b><span>{weatherRisk ? `${weatherRisk.title} 일정이 영향을 받을 수 있어 대체 경로를 준비했습니다.` : firstRisk ? `${firstRisk.title} 일정의 시간 간격을 다시 확인해 주세요.` : "현재 일정 그대로 여행을 시작할 수 있습니다."}</span></p>{trip.demo && <small>{weatherRisk ? "DEMO 시나리오 · 강수확률 80%" : "DEMO 시나리오 · 현재 날씨 변경 대상 없음"}</small>}<button onClick={previewPlanB} disabled={!firstRisk}>대체 일정 미리보기 <ArrowRight /></button></section>
        <div className="page-actions"><button className="secondary-action" onClick={() => go("/trip/new")}><ArrowLeft /> 계획 수정하기</button><button className="primary-action" onClick={startTrip}>{confirmed ? "여행 시작하기" : "일정 확정하고 여행 시작하기"} <ArrowRight /></button></div>
      </div>
    </main>
  );
}
function Recommend() {
  const [trip] = useTrip();
  if (!trip) return <Need />;
  const originalPlan = getStored<Trip>("twintrip-original") || trip;
  let old = originalPlan.schedules.at(-1),
    next = alternatives.find((candidate) => candidate.contentId !== old?.contentId && !originalPlan.schedules.some((schedule) => schedule.contentId === candidate.contentId)) || alternatives[0];
  const apply = () => {
    if (old) {
      const originalSchedule = { ...old };
      const replacementSchedule = { ...old, ...next, id: old.id };
      const schedules = originalPlan.schedules.map((schedule) => schedule.id === old?.id ? replacementSchedule : { ...schedule });
      setStored("twintrip-original", originalPlan);
      setStored("twintrip-confirmed", { ...originalPlan, status: "CONFIRMED", schedules });
      setStored("twintrip-active", createActiveTrip({ ...originalPlan, schedules }));
      setStored("twintrip-twin", { id: `${originalPlan.id}-twin-${Date.now()}`, originalTripId: originalPlan.id, createdAt: new Date().toISOString(), mode: "MINIMAL", source: "PRE_TRIP", schedules, changes: [{ itemId: originalSchedule.id, original: originalSchedule, replacement: replacementSchedule, reasons: ["날씨 영향을 받지 않는 대체 장소"] }] } satisfies TwinPlan);
    }
    go("/trip/live");
  };
  return (
    <main className="recommend-page">
      <Header step={2} />
      <div className="shell narrow">
        <Back to="/trip/check" text="점검 결과" />
        <Title
          eye="BEFORE & AFTER"
          title="비를 피하는 일정으로 바꿔봤어요"
          desc="공공 관광데이터 후보를 먼저 검증한 뒤 가장 적합한 장소를 골랐습니다."
        />
        <section className="compare">
          <article className="before-card">
            <span>BEFORE</span>
            <img src={old?.image || FALLBACK} alt="" />
            <div>
              <time>{old?.plannedTime}</time>
              <h3>{old?.title}</h3>
              <p>
                {trip.demo && <b>RAIN 80%</b>}
                <b>OUTDOOR</b>
              </p>
            </div>
          </article>
          <div className="change-flow">
            <small>일정 변경</small>
            <ArrowRight />
          </div>
          <article className="after-card">
            <span className="cutout" aria-label="PLAN B">
              <i>P</i>
              <i>L</i>
              <i>A</i>
              <i>N</i>
              <i>B!</i>
            </span>
            <img src={next.image} alt="" />
            <div>
              <time>{old?.plannedTime}</time>
              <h3>{next.title}</h3>
              <p>
                <b>INDOOR</b>
              </p>
            </div>
          </article>
        </section>
        <section className="reason">
          <Sparkles />
          <div>
            <b>왜 이 장소인가요?</b>
            <div className="reason-badges">
              <span>INDOOR</span>
              <span>18 MIN</span>
              <span>LOW WEATHER RISK</span>
            </div>
            <p>
              현재 위치에서 이동 부담이 적고 비의 영향을 받지 않는 실내
              관광지예요. 남은 일정 시간 안에 여유롭게 관람할 수 있습니다.
            </p>
          </div>
        </section>
        <div className="facts">
          <div>
            <b>
              18 <small>MIN</small>
            </b>
            <span>예상 이동시간</span>
          </div>
          <div>
            <b>
              2.8 <small>KM</small>
            </b>
            <span>현재 위치에서</span>
          </div>
        </div>
        <div className="decision">
          <Btn alt onClick={() => go("/trip/live")}>
            원래 일정 유지
          </Btn>
          <Btn onClick={apply}>
            이 일정으로 변경하기 <ArrowRight />
          </Btn>
        </div>
      </div>
    </main>
  );
}
function Live() {
  const [plannedTrip] = useTrip();
  const [trip, setActiveTrip] = useState<Trip | null>(null);
  const [liveEvent, setLiveEvent] = useState<LiveTrigger | null>(null);
  useEffect(() => {
    const stored = getStored<Trip>("twintrip-active");
    const base = stored || getStored<Trip>("twintrip-confirmed") || plannedTrip;
    if (!base) return;
    const active = stored ? normalizeTrip(stored) : createActiveTrip(base);
    setActiveTrip(active);
    setStored("twintrip-active", active);
    setLiveEvent(getStored<LiveTrigger>("twintrip-live-event"));
  }, [plannedTrip?.id]);
  if (!trip) return <Need />;
  let current =
      trip.schedules.find((s) => s.status === "CURRENT") ||
      trip.schedules.find((s) => s.status === "PLANNED"),
    idx = trip.schedules.findIndex((s) => s.id === current?.id),
    next = trip.schedules[idx + 1];
  const done = () => {
    if (!current) return;
    let now = new Date(),
      actual = now.toTimeString().slice(0, 5);
    const nextTrip = {
      ...trip,
      schedules: trip.schedules.map((s, i) =>
        s.id === current.id
          ? {
              ...s,
              status: "COMPLETED",
              actualTime: actual,
              delayMinutes: trip.demo ? 30 : 0,
              completed: true,
              current: false,
            }
          : i === idx + 1
            ? { ...s, status: "CURRENT", current: true, completed: false }
            : s,
      ),
    } as Trip;
    setActiveTrip(nextTrip);
    setStored("twintrip-active", nextTrip);
  };
  const completedCount = trip.schedules.filter((item) => item.status === "COMPLETED").length;
  const progress = trip.schedules.length ? Math.round((completedCount / trip.schedules.length) * 100) : 0;
  const triggerDemoChange = () => {
    const target = trip.schedules.find((item, index) => index > idx && !item.mustKeep && item.indoorOutdoor === "OUTDOOR") || trip.schedules.at(-1);
    if (!target) return;
    const trigger: LiveTrigger = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), triggerType: "WEATHER_CHANGE", itemId: target.id, reason: "18시 강수확률이 80%로 상승해 야외 일정에 충돌이 발생했어요.", source: "DEMO" };
    setStored("twintrip-live-event", trigger);
    setStored("twintrip-conflicts", detectConflicts(trip, trigger));
    setLiveEvent(trigger);
    go("/trip/change");
  };
  const changeHistory = getStored<ChangeEvent[]>("twintrip-change-events") || [];
  const hasTwinChange = changeHistory.length > 0;
  return (
    <main className="service-page live-page-clean">
      <Header step={3} />
      <div className="service-shell">
        <header className="page-heading"><p>{trip.title} · {completedCount}/{trip.schedules.length}</p><h1>{hasTwinChange ? "여행을 이어가세요." : "지금, 서울을 여행 중이에요."}</h1><span>완료한 일정은 그대로 두고, 다음 장소까지의 흐름을 보여드립니다.</span></header>
        <div className="live-layout-clean">
          <section className="live-route"><h2>오늘의 경로</h2><RouteLine schedules={trip.schedules} currentId={current?.id} changedId={hasTwinChange ? changeHistory.at(-1)?.replacementItem.id : undefined} /></section>
          <section className="current-place-clean">
            <img src={current?.image || FALLBACK} alt={current?.title || "현재 여행지"} />
            <div><small>NOW · {current?.plannedTime}</small><h2>{current?.title || "모든 일정 완료"}</h2><p>{current?.address}</p>{current && <button className="primary-action" onClick={done}>방문 완료 <ArrowRight /></button>}</div>
          </section>
        </div>
        <section className="live-next-clean"><div><small>NEXT · {next?.plannedTime || "여행 완료"}</small><b>{next?.title || "오늘의 모든 일정을 마쳤어요"}</b><span>{next ? "이동 약 25분" : "수고했어요."}</span></div><div className="progress-track"><i style={{width: `${progress}%`}} /></div><small>{completedCount}/{trip.schedules.length} 완료</small></section>
        {hasTwinChange && <div className="change-confirmation"><b>일정이 변경되었습니다.</b><span>전체 일정 {trip.schedules.length}곳 중 {Math.max(0, trip.schedules.length - 1)}곳은 그대로예요.</span><span>새로운 일정으로 여행을 계속해보세요.</span><button onClick={() => go("/trip/replan")}>변경 내역 보기 <ArrowRight /></button></div>}
        <section className="live-variable"><div><b>{liveEvent ? "18시 강수확률이 상승했어요." : "남은 일정의 변수를 확인해요."}</b><span>{liveEvent?.reason || (trip.demo ? "데모 날씨 변화를 발생시켜 Twin 흐름을 확인할 수 있습니다." : "연결된 데이터 기준으로 남은 일정을 확인합니다.")}</span></div><button disabled={trip.demo && idx < 1 && !liveEvent} onClick={() => liveEvent ? go("/trip/change") : triggerDemoChange()}>{liveEvent ? "변경 내용 확인" : trip.demo ? "DEMO 변화 발생" : "남은 일정 확인"} <ArrowRight /></button></section>
      </div>
    </main>
  );
}
function ChangePage() {
  const [plannedTrip] = useTrip();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [originalTrip, setOriginalTrip] = useState<Trip | null>(null);
  const [trigger, setTrigger] = useState<LiveTrigger | null>(null);
  const [twinPlace, setTwinPlace] = useState<Place | null>(null);
  useEffect(() => {
    const activeTrip = getStored<Trip>("twintrip-active") || plannedTrip;
    const storedOriginal = getStored<Trip>("twintrip-original") || plannedTrip;
    const latestChange = (getStored<ChangeEvent[]>("twintrip-change-events") || []).at(-1);
    setTrip(activeTrip);
    setOriginalTrip(storedOriginal);
    setTrigger(getStored<LiveTrigger>("twintrip-live-event"));
    if (latestChange?.replacementItem) setTwinPlace(latestChange.replacementItem);
    if (activeTrip?.demo) {
      let mounted = true;
      resolveTourPlace<Place>("국립중앙박물관", ["국립중앙박물관"])
        .then((place) => mounted && place && setTwinPlace(place))
        .catch(() => mounted && setTwinPlace(alternatives[0]));
      return () => { mounted = false; };
    }
  }, [plannedTrip?.id]);
  if (!trip) return <Need />;
  const latestChange = (getStored<ChangeEvent[]>("twintrip-change-events") || []).at(-1);
  const affected = originalTrip?.schedules.find((item) => item.id === (trigger?.itemId || latestChange?.originalItem.id)) || latestChange?.originalItem || originalTrip?.schedules.at(-1) || trip.schedules.at(-1);
  const previous = affected ? (originalTrip || trip).schedules[(originalTrip || trip).schedules.findIndex((item) => item.id === affected.id) - 1] : undefined;
  const twin = twinPlace || alternatives[0];
  return (
    <main className="service-page change-page-clean">
      <Header step={4} />
      <div className="service-shell">
        <button className="text-back" onClick={() => go("/trip/live")}><ArrowLeft /> 여행으로 돌아가기</button>
        <header className="page-heading"><p>{affected?.plannedTime} · WEATHER UPDATE</p><h1>일정에 변화가 생겼어요.</h1><span>저녁부터 비가 예상되어, 남은 야외 일정 하나를 다시 연결할 수 있습니다.</span></header>
        <div className="change-layout-clean">
          <section className="branch-view"><h2>현재 여행 경로</h2><RouteLine schedules={trip.schedules} currentId={trip.schedules.find(x => x.current)?.id} changedId={affected?.id} /><div className="route-fork" aria-label="Original과 Twin 경로 분기"><div className="fork-origin"><b>{previous?.title || "현재 장소"}</b><i /></div><div className="fork-option original"><small>ORIGINAL</small><strong>{affected?.plannedTime} {affected?.title}</strong></div><div className="fork-option twin"><small>TWIN</small><strong>{affected?.plannedTime} {twin.title}</strong></div></div><p className="branch-note">완료한 경로는 유지하고 18:00 일정부터 새 경로로 연결합니다.</p></section>
          <section className="affected-place">{twin.image ? <img src={twin.image} alt={twin.title} /> : <span className="planb-image-pending">IMAGE PENDING</span>}<small>Twin 연결 후보</small><h2>{twin.title}</h2><p>{twin.address}</p><dl><div><dt>상황</dt><dd>{trip.demo ? "강수확률 80% · DEMO" : "날씨 변화"}</dd></div><div><dt>Original</dt><dd>{affected?.plannedTime} {affected?.title}</dd></div><div><dt>Twin</dt><dd>{affected?.plannedTime} {twin.title}</dd></div></dl></section>
        </div>
        <div className="page-actions"><button className="secondary-action" onClick={() => go("/trip/live")}>원래 일정 유지</button><button className="primary-action" onClick={() => go("/trip/replan")}>Twin 일정 확인하기 <ArrowRight /></button></div>
      </div>
    </main>
  );
}
function Replan() {
  const [trip] = useTrip();
  const [confirmed, setConfirmed] = useState<Trip | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<Trip | null>(null);
  const [options, setOptions] = useState<(Place & { travel?: number; distance?: number })[]>([]);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<"all" | "keep" | "change">("all");
  const [mode, setMode] = useState<TwinMode>("MINIMAL");
  const [source, setSource] = useState<"PRE_TRIP" | "LIVE">("PRE_TRIP");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const liveTrigger = getStored<LiveTrigger>("twintrip-live-event");
    let activeTrip = getStored<Trip>("twintrip-active");
    let originalTrip = getStored<Trip>("twintrip-original");
    let confirmedTrip = getStored<Trip>("twintrip-confirmed");
    const storedTwin = getStored<TwinPlan>("twintrip-twin");
    const rawInitial = originalTrip || confirmedTrip || trip;
    if (!rawInitial) { setLoading(false); return; }
    const isLiveSource = Boolean(liveTrigger && activeTrip);
    const initial = normalizeTrip(rawInitial);
    const detected = getStored<Conflict[]>("twintrip-conflicts") || detectConflicts(activeTrip || initial, liveTrigger);
    setSource(isLiveSource ? "LIVE" : "PRE_TRIP");
    setConflicts(detected);
    setConfirmed(initial);
    setActiveSnapshot(activeTrip ? normalizeTrip(activeTrip) : null);
    const storedReplacement = storedTwin?.changes.at(-1)?.replacement;
    const storedOriginal = storedTwin?.changes.at(-1)?.original;
    const originalIds = new Set(initial.schedules.map((schedule) => schedule.contentId));
    if (
      storedReplacement &&
      storedOriginal &&
      storedReplacement.contentId !== storedOriginal.contentId &&
      !originalIds.has(storedReplacement.contentId)
    ) {
      setOptions([{ ...storedReplacement, travel: 18 }]);
    }
    if (location.hostname === "localhost") {
      const inspectSchedules = (value: Trip | null) => value?.schedules.map((schedule) => ({ title: schedule.title, contentId: schedule.contentId, plannedTime: schedule.plannedTime, mustKeep: schedule.mustKeep, completed: schedule.completed, current: schedule.current })) || null;
      console.debug("[TwinTrip PLAN B state]", JSON.stringify({
        original: inspectSchedules(originalTrip),
        confirmed: inspectSchedules(confirmedTrip),
        active: inspectSchedules(activeTrip),
        twin: storedTwin ? inspectSchedules({ ...initial, schedules: storedTwin.schedules }) : null,
        conflicts: detected,
      }));
    }
    if (!initial) { setLoading(false); return; }
    let active = true;
    const prepare = async () => {
      let base = initial;
      const hasLegacyImage = base.schedules.some((schedule) =>
        /images\.unsplash\.com|\/hero-seoul\.jpg/.test(schedule.image || ""),
      );
      if (base.demo || hasLegacyImage) {
        const schedules = await Promise.all(base.schedules.map(async (schedule) => {
          try {
            const resolved = await resolveSchedulePlace<Place>(schedule.title);
            return resolved ? { ...schedule, ...resolved } : { ...schedule, image: undefined, imageSource: undefined };
          } catch {
            return { ...schedule, image: undefined, imageSource: undefined };
          }
        }));
        base = { ...base, schedules };
        if (!active) return;
        setConfirmed(base);
        setStored("twintrip-original", { ...base, status: originalTrip?.status || "DRAFT" });
        if (!storedTwin?.changes.length) {
          setStored("twintrip-confirmed", { ...base, status: "CONFIRMED" });
        }
      }
      if (base.demo) {
        const demoAlternative = { ...alternatives[0], travel: 18, distance: 2.8 };
        const currentIds = new Set(base.schedules.map((schedule) => schedule.contentId));
        const target = [...base.schedules].reverse().find((schedule) => detected.some((conflict) => conflict.itemId === schedule.id));
        const isEligible = (candidate: Place) => candidate.contentId !== target?.contentId && !currentIds.has(candidate.contentId);
        setOptions(isEligible(demoAlternative) ? [demoAlternative] : []);
        const place = await resolveTourPlace<Place>("국립중앙박물관", ["국립중앙박물관"]);
        if (active && place) setOptions(isEligible(place) ? [{ ...place, travel: 18, distance: 2.8 }] : []);
      } else {
        const target = [...base.schedules].reverse().find((schedule) => detected.some((conflict) => conflict.itemId === schedule.id) && !schedule.mustKeep && !schedule.completed && !schedule.current);
        if (target?.longitude && target?.latitude) {
          const response = await fetch(`/api/tour/nearby?mapX=${target.longitude}&mapY=${target.latitude}`);
          const data = await response.json();
          const currentIds = new Set(base.schedules.map((schedule) => schedule.contentId));
          if (active) setOptions((data.items || []).filter((place: Place) => place.contentId !== target.contentId && !currentIds.has(place.contentId)).slice(0, 3));
        }
      }
      if (active) setLoading(false);
    };
    prepare().catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [trip?.id]);
  useEffect(() => {
    const choice = options[0];
    if (!confirmed || !choice) return;
    const targetIndex = confirmed.schedules.reduce(
      (found, schedule, index) => conflicts.some((conflict) => conflict.itemId === schedule.id) && !schedule.mustKeep && !schedule.completed && !schedule.current ? index : found,
      -1,
    );
    if (targetIndex < 0) return;
    const originalSchedule = { ...confirmed.schedules[targetIndex] };
    const replacementSchedule = { ...originalSchedule, ...choice, id: originalSchedule.id, plannedTime: originalSchedule.plannedTime, mustKeep: false, locked: false, indoorOutdoor: choice.contentTypeId === "14" ? "INDOOR" as const : "UNKNOWN" as const };
    const schedules = confirmed.schedules.map((schedule, index) => index === targetIndex ? replacementSchedule : schedule);
    const draftTwin: TwinPlan = { id: `${confirmed.id}-twin-draft`, originalTripId: confirmed.id, createdAt: new Date().toISOString(), mode, source, schedules, changes: [{ itemId: originalSchedule.id, original: originalSchedule, replacement: replacementSchedule, reasons: confirmed.demo ? ["실내 장소", "18시 운영 중 (DEMO)", "기존 장소에서 이동 18분 (DEMO)"] : ["CHECK에서 충돌이 탐지된 일정", "기존 위치 주변의 TourAPI 관광지"] }] };
    setStored("twintrip-twin", draftTwin);
  }, [confirmed, options, conflicts, mode, source]);
  if (!trip) return <Need />;
  const originalPlan = confirmed || trip;
  const safeTargetIndex = originalPlan.schedules.reduce(
    (found, schedule, index) => conflicts.some((conflict) => conflict.itemId === schedule.id) && !schedule.mustKeep && !schedule.completed && !schedule.current ? index : found,
    -1,
  );
  const originalSchedule = originalPlan.schedules[safeTargetIndex];
  const choice = options[selected];
  const twinSchedules = originalPlan.schedules.map((s, i) => i === safeTargetIndex && choice ? { ...s, ...choice, id: s.id, plannedTime: s.plannedTime, mustKeep: false, locked: false, indoorOutdoor: choice.contentTypeId === "14" ? "INDOOR" as const : "UNKNOWN" as const } : { ...s });
  const replacementSchedule = safeTargetIndex >= 0 && choice ? twinSchedules[safeTargetIndex] : undefined;
  const reasons = originalPlan.demo
    ? ["실내 장소", "18시 운영 중 (DEMO)", "기존 장소에서 이동 18분 (DEMO)", "완료·현재·MUST KEEP 일정 유지"]
    : ["CHECK에서 충돌이 탐지된 일정", "기존 위치 주변의 TourAPI 관광지", "완료·현재·MUST KEEP 일정 유지"];
  const changedCount = safeTargetIndex >= 0 && choice ? 1 : 0;
  const keptCount = originalPlan.schedules.length - changedCount;
  const visibleRows = originalPlan.schedules.map((schedule, index) => ({ schedule, index })).filter(({ index }) =>
    filter === "all" || (filter === "change" ? index === safeTargetIndex : index !== safeTargetIndex),
  );
  const apply = () => {
    if (!choice) return;
    const originalSnapshot = originalSchedule ? { ...originalSchedule } : undefined;
    const replacementSnapshot = replacementSchedule ? { ...replacementSchedule } : undefined;
    const twin: TwinPlan = { id: `${originalPlan.id}-twin-${Date.now()}`, originalTripId: originalPlan.id, createdAt: new Date().toISOString(), mode, source, schedules: twinSchedules.map((schedule) => ({ ...schedule })), changes: originalSnapshot && replacementSnapshot ? [{ itemId: originalSnapshot.id, original: originalSnapshot, replacement: replacementSnapshot, reasons }] : [] };
    setStored("twintrip-twin", twin);
    setStored("twintrip-planb", { ...originalPlan, id: twin.id, status: "TWIN", schedules: twinSchedules.map((schedule) => ({ ...schedule })) });
    setStored("twintrip-confirmed", { ...originalPlan, status: "CONFIRMED", schedules: twinSchedules.map((schedule) => ({ ...schedule })) });
    if (source === "LIVE" && originalSnapshot && replacementSnapshot) {
      const activeBase = activeSnapshot || originalPlan;
      const active = { ...activeBase, schedules: activeBase.schedules.map((item) => item.id === originalSnapshot.id ? { ...item, ...replacementSnapshot, status: item.status, completed: item.completed, current: item.current } : { ...item }) };
      setStored("twintrip-active", active);
      const trigger = getStored<LiveTrigger>("twintrip-live-event");
      const history = getStored<ChangeEvent[]>("twintrip-change-events") || [];
      setStored("twintrip-change-events", [...history, { timestamp: new Date().toISOString(), triggerType: trigger?.triggerType || "WEATHER_CHANGE", originalItem: originalSnapshot, replacementItem: replacementSnapshot, reasons, twinMode: mode }]);
      localStorage.removeItem("twintrip-live-event");
    } else {
      setStored("twintrip-active", createActiveTrip({ ...originalPlan, schedules: twinSchedules.map((schedule) => ({ ...schedule })) }));
    }
    setSaved(true);
    go("/trip/live");
  };
  return (
    <main className="service-page planb-page-clean">
      <Header step={3} />
      <div className="service-shell">
        <header className="page-heading"><p>{source === "LIVE" ? "여행 중 변경" : "출발 전 미리보기"}</p><h1>원래 여행은 그대로, 필요한 한 곳만 바꿨어요.</h1><span>완료한 일정과 필수 일정은 유지하고, 충돌이 예상되는 구간만 Twin 경로로 연결합니다.</span></header>
        <div className="planb-comparison">
          <section className="planb-route"><div className="route-labels"><span>ORIGINAL</span><span>TWIN</span></div><RouteLine schedules={originalPlan.schedules} currentId={activeSnapshot?.schedules.find(x => x.current)?.id} changedId={originalSchedule?.id} /><p>{originalSchedule ? `${originalSchedule.plannedTime} 지점에서 경로가 분기됩니다.` : "변경이 필요한 일정이 없습니다."}</p></section>
          <section className="replacement-view">
            <div className="replacement-before"><small>ORIGINAL · {originalSchedule?.plannedTime}</small>{originalSchedule?.image ? <img src={originalSchedule.image} alt={originalSchedule.title} /> : <span className="planb-image-pending">IMAGE PENDING</span>}<h2>{originalSchedule?.title || "변경 대상 없음"}</h2><p>{originalSchedule?.address}</p></div>
            <ArrowRight className="replacement-arrow" />
            <div className="replacement-after"><small>TWIN · {replacementSchedule?.plannedTime}</small>{replacementSchedule?.image ? <img src={replacementSchedule.image} alt={replacementSchedule.title} /> : <span className="planb-image-pending">{loading ? "불러오는 중" : "IMAGE PENDING"}</span>}<h2>{replacementSchedule?.title || (loading ? "대체 장소를 확인 중이에요" : "조건에 맞는 대체 장소를 찾지 못했어요.")}</h2><p>{replacementSchedule?.address}</p></div>
          </section>
        </div>
        {changedCount > 0 && <section className="recommendation-reasons"><h2>WHY THIS TWIN</h2><div>{reasons.slice(0,3).map((reason, i) => <p key={reason}><b>{String(i+1).padStart(2,"0")}</b><span>{reason}</span></p>)}</div></section>}
        <div className="page-actions"><button className="secondary-action" onClick={() => go(source === "LIVE" ? "/trip/live" : "/trip/check")}><ArrowLeft /> 원래 일정 유지</button><button className="primary-action" disabled={!choice} onClick={apply}>이 Twin 경로로 여행하기 <ArrowRight /></button></div>
        {saved && <p className="planb-saved">Twin 경로를 저장했습니다. 원래 일정은 별도로 보존됩니다.</p>}
      </div>
    </main>
  );
}
function Need() {
  return (
    <main>
      <Header />
      <div className="need">
        <Compass />
        <h1>먼저 여행을 만들어 주세요</h1>
        <Btn onClick={() => go("/trip/new")}>여행 만들기</Btn>
      </div>
    </main>
  );
}
export default function App() {
  const [path, setPath] = useState("/");
  useEffect(() => {
    let f = () => setPath(location.pathname);
    f();
    addEventListener("popstate", f);
    const controller = new AbortController(),
      ctx = (document as any).modelContext;
    ctx?.registerTool?.(
      {
        name: "start_sample_trip",
        title: "샘플 여행 시작",
        description:
          "TwinTrip 서울 당일치기 데모 여행을 만들고 점검 화면을 엽니다.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          ["twintrip-active", "twintrip-original", "twintrip-confirmed", "twintrip-twin", "twintrip-planb", "twintrip-conflicts", "twintrip-live-event", "twintrip-change-events"].forEach((key) => localStorage.removeItem(key));
          localStorage.setItem("twintrip", JSON.stringify(makeSample()));
          go("/trip/check");
          return { tripId: "demo-seoul", status: "ready" };
        },
      },
      { signal: controller.signal },
    );
    return () => {
      removeEventListener("popstate", f);
      controller.abort();
    };
  }, []);
  return path === "/trip/new" ? (
    <NewTrip />
  ) : path === "/trip/check" ? (
    <CheckPage />
  ) : path === "/trip/check/recommend" ? (
    <Recommend />
  ) : path === "/trip/live" ? (
    <Live />
  ) : path === "/trip/change" ? (
    <ChangePage />
  ) : path === "/trip/replan" ? (
    <Replan />
  ) : (
    <Home />
  );
}

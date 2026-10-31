import {
  defaultImageFrame,
  defaultShapeFrame,
  defaultTextFrame,
  uid,
} from "./factory";
import type { Doc, Frame, ImageFrame, ShapeFrame, TextFrame } from "./types";
import { toPx } from "./units";

function txt(o: Partial<TextFrame>): TextFrame {
  // templates position text boxes edge-accurately — zero padding so the
  // overflow indicator doesn't fire on label-height boxes
  return { ...defaultTextFrame(), padding: 0, ...o };
}
function img(o: Partial<ImageFrame>): ImageFrame {
  return { ...defaultImageFrame(), ...o };
}
function shp(o: Partial<ShapeFrame>): ShapeFrame {
  return { ...defaultShapeFrame(o.shape ?? "rect"), ...o };
}

function page(background: string, frames: Frame[]): Doc["pages"][number] {
  return { id: uid(), background, frames };
}

export interface TemplateDef {
  id: string;
  name: string;
  sizeLabel: string;
  description: string;
  build: () => Doc;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "poster-event",
    name: "Event Poster",
    sizeLabel: '13" × 19"',
    description: "Bold headline poster with hero image and info block",
    build: () => ({
      name: "Event Poster 13×19",
      width: toPx(13, "in"),
      height: toPx(19, "in"),
      unit: "in",
      margins: { top: 100, right: 100, bottom: 100, left: 100 },
      bleed: 12,
      pages: [
        page("#18181b", [
          shp({ x: 0, y: 140, w: toPx(13, "in"), h: 10, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Accent bar" }),
          txt({
            x: 100, y: 210, w: 1048, h: 380,
            text: "SUMMER\nMUSIC FEST",
            fontFamily: "Anton", fontSize: 168, color: "#fafafa",
            lineHeight: 1.0, letterSpacing: 2, name: "Headline",
          }),
          txt({
            x: 100, y: 630, w: 980, h: 70,
            text: "Three stages · 24 artists · One unforgettable night",
            fontFamily: "Oswald", fontSize: 34, color: "#d4d4d8", name: "Subhead",
          }),
          img({ x: 100, y: 760, w: 1048, h: 620, name: "Hero image" }),
          txt({
            x: 100, y: 1440, w: 620, h: 190,
            text: "SEPT 20–21\nRIVERSIDE PARK",
            fontFamily: "Oswald", fontSize: 52, color: "#f59e0b", lineHeight: 1.25, name: "Date & venue",
          }),
          txt({
            x: 780, y: 1450, w: 368, h: 170,
            text: "Tickets at the gate\n$25 · All ages · 2 PM",
            fontFamily: "Merriweather", fontSize: 24, color: "#a1a1aa", lineHeight: 1.6, align: "right", name: "Ticket info",
          }),
          shp({ x: 0, y: 1734, w: toPx(13, "in"), h: 90, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Footer band" }),
          txt({
            x: 100, y: 1760, w: 1048, h: 44,
            text: "WWW.SUMMERMUSICFEST.COM",
            fontFamily: "Oswald", fontSize: 24, color: "#18181b", align: "center", letterSpacing: 4, name: "URL",
          }),
        ]),
      ],
    }),
  },
  {
    id: "flyer-product",
    name: "Product Flyer",
    sizeLabel: "A4",
    description: "Classic promo flyer with price tag and body copy",
    build: () => ({
      name: "Product Flyer A4",
      width: toPx(21, "cm"),
      height: toPx(29.7, "cm"),
      unit: "cm",
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      bleed: 12,
      pages: [
        page("#ffffff", [
          shp({ x: 0, y: 0, w: toPx(21, "cm"), h: 12, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Top rule" }),
          txt({
            x: 48, y: 64, w: 698, h: 130,
            text: "Fresh Roasted\nCoffee Beans",
            fontFamily: "Playfair Display", fontSize: 54, color: "#18181b", lineHeight: 1.15, name: "Headline",
          }),
          txt({
            x: 48, y: 205, w: 640, h: 50,
            text: "Small-batch · Single origin · Fair trade",
            fontFamily: "Lora", fontSize: 22, italic: true, color: "#52525b", name: "Tagline",
          }),
          img({ x: 48, y: 285, w: 698, h: 370, name: "Product photo" }),
          txt({
            x: 48, y: 700, w: 420, h: 250,
            text: "Taste the difference that careful roasting makes. We source our beans directly from growers and roast in weekly micro-batches for peak flavor.\n\nNow available in whole bean or ground for your favorite brew method.",
            fontFamily: "Merriweather", fontSize: 17, color: "#3f3f46", lineHeight: 1.65, name: "Body copy",
          }),
          shp({ x: 510, y: 700, w: 236, h: 150, fill: "#f59e0b", stroke: "none", strokeWidth: 0, radius: 14, name: "Price card" }),
          txt({
            x: 510, y: 722, w: 236, h: 66,
            text: "$14.99",
            fontFamily: "Anton", fontSize: 46, color: "#18181b", align: "center", name: "Price",
          }),
          txt({
            x: 510, y: 792, w: 236, h: 36,
            text: "250 g bag · roast date on label",
            fontFamily: "Oswald", fontSize: 15, color: "#451a03", align: "center", name: "Price note",
          }),
          txt({
            x: 48, y: 1010, w: 698, h: 44,
            text: "www.emberroast.co  ·  @emberroast",
            fontFamily: "Oswald", fontSize: 16, color: "#71717a", align: "center", letterSpacing: 1, name: "Footer",
          }),
        ]),
      ],
    }),
  },
  {
    id: "newsletter",
    name: "Newsletter",
    sizeLabel: "A4 · 2 pages",
    description: "Masthead, lead story with image, two-column article flow",
    build: () => {
      const W = toPx(21, "cm");
      return {
        name: "Community Newsletter",
        width: W,
        height: toPx(29.7, "cm"),
        unit: "cm",
        margins: { top: 48, right: 48, bottom: 48, left: 48 },
        bleed: 12,
        pages: [
          page("#ffffff", [
            shp({ x: 0, y: 0, w: W, h: 110, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Masthead band" }),
            txt({
              x: 48, y: 22, w: 520, h: 66,
              text: "THE CITY LEDGER",
              fontFamily: "Anton", fontSize: 46, color: "#fafafa", letterSpacing: 2, name: "Masthead",
            }),
            txt({
              x: 560, y: 40, w: 186, h: 32,
              text: "October 2026 · Vol. 12",
              fontFamily: "Oswald", fontSize: 15, color: "#a1a1aa", align: "right", name: "Issue",
            }),
            txt({
              x: 48, y: 150, w: 698, h: 96,
              text: "Downtown Revival Gains Momentum as Old Mill Reopens",
              fontFamily: "Playfair Display", fontSize: 38, color: "#18181b", lineHeight: 1.2, name: "Headline",
            }),
            txt({
              x: 48, y: 252, w: 698, h: 30,
              text: "By A. Reporter — Staff Writer",
              fontFamily: "Lora", fontSize: 16, italic: true, color: "#71717a", name: "Byline",
            }),
            img({ x: 48, y: 296, w: 698, h: 300, name: "Lead photo" }),
            txt({
              x: 48, y: 632, w: 330, h: 420,
              text: "After three years of renovation, the Old Mill opened its doors to the public again this weekend, drawing thousands of visitors to the riverfront.\n\nThe project, funded jointly by the city and a local heritage trust, preserved the original timber frame while adding modern community spaces inside.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Column 1",
            }),
            txt({
              x: 416, y: 632, w: 330, h: 420,
              text: "City planners say the mill will host a weekend market starting next month, with stalls reserved for local growers and makers.\n\n\"This building has always been the heart of downtown,\" said project director Maria Santos. \"Now it beats again.\"\n\nFull coverage on page 2.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Column 2",
            }),
          ]),
          page("#ffffff", [
            txt({
              x: 48, y: 72, w: 698, h: 44,
              text: "COMMUNITY",
              fontFamily: "Oswald", fontSize: 26, color: "#b45309", letterSpacing: 3, name: "Section A",
            }),
            shp({ x: 48, y: 122, w: 698, h: 3, fill: "#e4e4e7", stroke: "none", strokeWidth: 0, name: "Rule A" }),
            txt({
              x: 48, y: 150, w: 330, h: 360,
              text: "Volunteers painted the new crosswalk murals on Elm Street last Saturday, the fourth such project this year. Organizers estimate more than 200 residents took part.\n\nThe council voted 6–1 to extend the farmers market season through November, citing record attendance over the summer months.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Article A1",
            }),
            txt({
              x: 416, y: 150, w: 330, h: 360,
              text: "The library's mobile unit adds two new stops in the north end starting this week, bringing books, wifi and homework help closer to families there.\n\nSchedule updates are posted at the front desk and online.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Article A2",
            }),
            txt({
              x: 48, y: 560, w: 698, h: 44,
              text: "EVENTS",
              fontFamily: "Oswald", fontSize: 26, color: "#b45309", letterSpacing: 3, name: "Section B",
            }),
            shp({ x: 48, y: 610, w: 698, h: 3, fill: "#e4e4e7", stroke: "none", strokeWidth: 0, name: "Rule B" }),
            txt({
              x: 48, y: 638, w: 698, h: 300,
              text: "OCT 24 — Autumn jazz night, Riverside Pavilion, 7 PM.\nOCT 31 — Family pumpkin parade and costume contest, Main Street, 10 AM.\nNOV 08 — Heritage open-house tours of the Old Mill, free with registration.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.9, name: "Events list",
            }),
          ]),
        ],
      };
    },
  },
  {
    id: "brochure-trifold",
    name: "Tri-fold Brochure",
    sizeLabel: 'Letter · landscape',
    description: "Three-panel layout with image headers and contact panel",
    build: () => {
      // true landscape Letter — the three 344px-wide panels only fit an
      // 11in-wide page (24 + 3·344 = 1056); width/height were swapped before,
      // which pushed every panel off the right edge of the page
      const W = toPx(11, "in");
      const H = toPx(8.5, "in");
      const panel = (i: number) => 24 + i * 344;
      return {
        name: "Tri-fold Brochure",
        width: W,
        height: H,
        unit: "in",
        margins: { top: 24, right: 24, bottom: 24, left: 24 },
        bleed: 12,
        pages: [
          page("#ffffff", [
            img({ x: panel(0), y: 24, w: 320, h: 200, name: "Panel 1 image" }),
            img({ x: panel(1), y: 24, w: 320, h: 200, name: "Panel 2 image" }),
            img({ x: panel(2), y: 24, w: 320, h: 200, name: "Panel 3 image" }),
            txt({
              x: panel(0), y: 248, w: 320, h: 48,
              text: "OUR STORY",
              fontFamily: "Oswald", fontSize: 26, color: "#18181b", align: "center", letterSpacing: 2, name: "Panel 1 title",
            }),
            txt({
              x: panel(1), y: 248, w: 320, h: 48,
              text: "WHAT WE DO",
              fontFamily: "Oswald", fontSize: 26, color: "#18181b", align: "center", letterSpacing: 2, name: "Panel 2 title",
            }),
            txt({
              x: panel(2), y: 248, w: 320, h: 48,
              text: "GET INVOLVED",
              fontFamily: "Oswald", fontSize: 26, color: "#18181b", align: "center", letterSpacing: 2, name: "Panel 3 title",
            }),
            txt({
              x: panel(0) + 20, y: 312, w: 280, h: 330,
              text: "Founded in 1998, we are a community workshop dedicated to hands-on learning and craft.\n\nEvery program is run by volunteers who love what they do.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, align: "center", name: "Panel 1 body",
            }),
            txt({
              x: panel(1) + 20, y: 312, w: 280, h: 330,
              text: "Weekly classes, open workshop nights, and a tool library with 300+ items to borrow.\n\nScholarships are available for every program we offer.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, align: "center", name: "Panel 2 body",
            }),
            txt({
              x: panel(2) + 20, y: 312, w: 280, h: 330,
              text: "Become a member, teach a class, or lend a hand at our monthly repair café.\n\nVisit the front desk or sign up online — it takes two minutes.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, align: "center", name: "Panel 3 body",
            }),
            shp({ x: 0, y: H - 70, w: W, h: 70, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Footer band" }),
            txt({
              x: 24, y: H - 56, w: W - 48, h: 40,
              text: "hello@makeworkshop.org  ·  (555) 010-1998  ·  42 Foundry Lane",
              fontFamily: "Oswald", fontSize: 16, color: "#fafafa", align: "center", letterSpacing: 1, name: "Contact line",
            }),
          ]),
        ],
      };
    },
  },
  {
    id: "report-cover",
    name: "Report Cover",
    sizeLabel: "A4",
    description: "Image band, title block and organization footer",
    build: () => ({
      name: "Annual Report Cover",
      width: toPx(21, "cm"),
      height: toPx(29.7, "cm"),
      unit: "cm",
      margins: { top: 64, right: 64, bottom: 64, left: 64 },
      bleed: 12,
      pages: [
        page("#ffffff", [
          img({ x: 0, y: 0, w: toPx(21, "cm"), h: 300, name: "Cover image" }),
          txt({
            x: 64, y: 370, w: 666, h: 170,
            text: "Annual Impact\nReport 2026",
            fontFamily: "Playfair Display", fontSize: 52, color: "#18181b", lineHeight: 1.2, name: "Title",
          }),
          shp({ x: 64, y: 560, w: 120, h: 6, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Accent rule" }),
          txt({
            x: 64, y: 600, w: 666, h: 60,
            text: "Growing responsibly, together.",
            fontFamily: "Lora", fontSize: 24, color: "#52525b", name: "Subtitle",
          }),
          txt({
            x: 64, y: 950, w: 666, h: 60,
            text: "Northwind Foundation · October 2026",
            fontFamily: "Oswald", fontSize: 18, color: "#71717a", letterSpacing: 1, name: "Org line",
          }),
          shp({ x: 0, y: 1055, w: toPx(21, "cm"), h: 68, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Bottom band" }),
        ]),
      ],
    }),
  },
  {
    id: "blank-poster",
    name: "Blank Poster",
    sizeLabel: '13" × 19"',
    description: "Empty 13×19 canvas with margin guides",
    build: () => ({
      name: "Poster 13×19",
      width: toPx(13, "in"),
      height: toPx(19, "in"),
      unit: "in",
      margins: { top: 100, right: 100, bottom: 100, left: 100 },
      bleed: 12,
      pages: [page("#ffffff", [])],
    }),
  },
  {
    id: "sale-mega-landscape",
    name: "Mega Sale Banner",
    sizeLabel: "A4 · landscape",
    description: "Loud landscape sale ad — huge headline, discount badge, hero photo",
    build: () => {
      const W = toPx(29.7, "cm");
      const H = toPx(21, "cm");
      return {
        name: "Mega Sale Banner A4",
        width: W,
        height: H,
        unit: "cm",
        margins: { top: 48, right: 48, bottom: 48, left: 48 },
        bleed: 12,
        pages: [
          page("#18181b", [
            shp({ x: 600, y: 60, w: 500, h: 500, shape: "ellipse", fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Deco circle" }),
            img({ x: 690, y: 150, w: 320, h: 320, name: "Hero product photo" }),
            txt({
              x: 64, y: 100, w: 560, h: 320,
              text: "MEGA\nSALE",
              fontFamily: "Anton", fontSize: 150, color: "#fafafa", lineHeight: 0.95, name: "Headline",
            }),
            txt({
              x: 64, y: 430, w: 500, h: 48,
              text: "One weekend. Everything must go.",
              fontFamily: "Oswald", fontSize: 30, color: "#d4d4d8", name: "Subhead",
            }),
            shp({ x: 64, y: 520, w: 300, h: 100, fill: "#f59e0b", stroke: "none", strokeWidth: 0, radius: 20, name: "Discount badge" }),
            txt({
              x: 64, y: 549, w: 300, h: 52,
              text: "UP TO 50% OFF",
              fontFamily: "Anton", fontSize: 42, color: "#18181b", align: "center", name: "Badge text",
            }),
            txt({
              x: 64, y: 650, w: 460, h: 40,
              text: "Sat–Sun · Nov 15–16 · 8 AM–6 PM",
              fontFamily: "Oswald", fontSize: 22, color: "#a1a1aa", name: "Dates",
            }),
            shp({ x: 0, y: 730, w: toPx(29.7, "cm"), h: 64, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Footer band" }),
            txt({
              x: 0, y: 748, w: toPx(29.7, "cm"), h: 32,
              text: "WWW.MEGAMART-SALE.COM",
              fontFamily: "Oswald", fontSize: 20, color: "#18181b", align: "center", letterSpacing: 3, name: "URL",
            }),
          ]),
        ],
      };
    },
  },
  {
    id: "grand-opening",
    name: "Grand Opening Flyer",
    sizeLabel: "Letter · landscape",
    description: "Landscape announcement ad with event details, photo and offer chip",
    build: () => ({
      name: "Grand Opening Flyer",
      width: toPx(11, "in"),
      height: toPx(8.5, "in"),
      unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      bleed: 12,
      pages: [
        page("#ffffff", [
          shp({ x: 0, y: 0, w: toPx(11, "in"), h: 130, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Top band" }),
          txt({
            x: 0, y: 30, w: toPx(11, "in"), h: 76,
            text: "GRAND OPENING",
            fontFamily: "Anton", fontSize: 62, color: "#f59e0b", align: "center", letterSpacing: 6, name: "Banner title",
          }),
          txt({
            x: 64, y: 180, w: 480, h: 120,
            text: "Join us for\nthe big day",
            fontFamily: "Playfair Display", fontSize: 40, color: "#18181b", lineHeight: 1.15, name: "Headline",
          }),
          txt({
            x: 64, y: 320, w: 460, h: 110,
            text: "Doors open at nine with free coffee, live music, and door prizes every hour of the weekend.",
            fontFamily: "Lora", fontSize: 20, color: "#52525b", lineHeight: 1.5, name: "Intro",
          }),
          txt({
            x: 64, y: 460, w: 460, h: 90,
            text: "SATURDAY NOV 8 · 9 AM\n1224 Main Street, Downtown",
            fontFamily: "Oswald", fontSize: 26, color: "#18181b", lineHeight: 1.5, name: "Date & address",
          }),
          shp({ x: 64, y: 590, w: 320, h: 90, fill: "#f59e0b", stroke: "none", strokeWidth: 0, radius: 16, name: "Offer chip" }),
          txt({
            x: 64, y: 619, w: 320, h: 36,
            text: "10% OFF your first visit",
            fontFamily: "Oswald", fontSize: 24, color: "#18181b", align: "center", name: "Offer text",
          }),
          img({ x: 600, y: 180, w: 392, h: 400, name: "Storefront photo" }),
          shp({ x: 64, y: 728, w: 928, h: 3, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Footer rule" }),
          txt({
            x: 0, y: 748, w: toPx(11, "in"), h: 32,
            text: "www.harborhome.co  ·  @harborhome",
            fontFamily: "Oswald", fontSize: 16, color: "#71717a", align: "center", name: "Footer",
          }),
        ]),
      ],
    }),
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    sizeLabel: "A4 · landscape",
    description: "Landscape showcase grid — three product cards with photo, name, price",
    build: () => {
      const W = toPx(29.7, "cm");
      const H = toPx(21, "cm");
      const cardX = (i: number) => 60 + i * 344;
      return {
        name: "Product Showcase A4",
        width: W,
        height: H,
        unit: "cm",
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        bleed: 12,
        pages: [
          page("#fafafa", [
            txt({
              x: 0, y: 40, w: W, h: 40,
              text: "NEW COLLECTION",
              fontFamily: "Oswald", fontSize: 26, color: "#b45309", align: "center", letterSpacing: 5, name: "Eyebrow",
            }),
            txt({
              x: 0, y: 84, w: W, h: 72,
              text: "Autumn Arrivals",
              fontFamily: "Playfair Display", fontSize: 48, color: "#18181b", align: "center", name: "Title",
            }),
            shp({ x: cardX(0), y: 190, w: 312, h: 470, fill: "#ffffff", stroke: "#e4e4e7", strokeWidth: 1, radius: 12, name: "Card 1" }),
            img({ x: cardX(0) + 16, y: 206, w: 280, h: 250, name: "Product 1 photo" }),
            txt({ x: cardX(0) + 16, y: 480, w: 280, h: 36, text: "Wool Overshirt", fontFamily: "Playfair Display", fontSize: 22, color: "#18181b", align: "center", name: "Product 1 name" }),
            txt({ x: cardX(0) + 16, y: 518, w: 280, h: 36, text: "$89", fontFamily: "Anton", fontSize: 26, color: "#b45309", align: "center", name: "Product 1 price" }),
            txt({ x: cardX(0) + 24, y: 560, w: 264, h: 80, text: "Brushed lambswool with corozo buttons. Made to last decades, not seasons.", fontFamily: "Lora", fontSize: 14, color: "#71717a", align: "center", lineHeight: 1.5, name: "Product 1 blurb" }),
            shp({ x: cardX(1), y: 190, w: 312, h: 470, fill: "#ffffff", stroke: "#e4e4e7", strokeWidth: 1, radius: 12, name: "Card 2" }),
            img({ x: cardX(1) + 16, y: 206, w: 280, h: 250, name: "Product 2 photo" }),
            txt({ x: cardX(1) + 16, y: 480, w: 280, h: 36, text: "Field Satchel", fontFamily: "Playfair Display", fontSize: 22, color: "#18181b", align: "center", name: "Product 2 name" }),
            txt({ x: cardX(1) + 16, y: 518, w: 280, h: 36, text: "$129", fontFamily: "Anton", fontSize: 26, color: "#b45309", align: "center", name: "Product 2 price" }),
            txt({ x: cardX(1) + 24, y: 560, w: 264, h: 80, text: "Waxed canvas, leather trim, and a laptop sleeve that actually fits.", fontFamily: "Lora", fontSize: 14, color: "#71717a", align: "center", lineHeight: 1.5, name: "Product 2 blurb" }),
            shp({ x: cardX(2), y: 190, w: 312, h: 470, fill: "#ffffff", stroke: "#e4e4e7", strokeWidth: 1, radius: 12, name: "Card 3" }),
            img({ x: cardX(2) + 16, y: 206, w: 280, h: 250, name: "Product 3 photo" }),
            txt({ x: cardX(2) + 16, y: 480, w: 280, h: 36, text: "Everyday Sneaker", fontFamily: "Playfair Display", fontSize: 22, color: "#18181b", align: "center", name: "Product 3 name" }),
            txt({ x: cardX(2) + 16, y: 518, w: 280, h: 36, text: "$75", fontFamily: "Anton", fontSize: 26, color: "#b45309", align: "center", name: "Product 3 price" }),
            txt({ x: cardX(2) + 24, y: 560, w: 264, h: 80, text: "Recycled sole, organic cotton upper, zero break-in period.", fontFamily: "Lora", fontSize: 14, color: "#71717a", align: "center", lineHeight: 1.5, name: "Product 3 blurb" }),
            shp({ x: 0, y: 700, w: W, h: 94, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Footer band" }),
            txt({
              x: 0, y: 730, w: W, h: 34,
              text: "Free shipping on orders over $50  ·  autumnstreet.com",
              fontFamily: "Oswald", fontSize: 18, color: "#fafafa", align: "center", letterSpacing: 1, name: "Footer",
            }),
          ]),
        ],
      };
    },
  },
  {
    id: "pamphlet-dl",
    name: "DL Pamphlet",
    sizeLabel: "DL · 2 pages",
    description: "Slim advertising pamphlet — cover, perks and tear-off coupon",
    build: () => ({
      name: "DL Pamphlet",
      width: toPx(99, "mm"),
      height: toPx(210, "mm"),
      unit: "mm",
      margins: { top: 24, right: 24, bottom: 24, left: 24 },
      bleed: 12,
      pages: [
        page("#18181b", [
          shp({ x: 0, y: 0, w: toPx(99, "mm"), h: 10, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Top rule" }),
          txt({
            x: 0, y: 40, w: toPx(99, "mm"), h: 30,
            text: "EMBER & OAK",
            fontFamily: "Oswald", fontSize: 18, color: "#f59e0b", align: "center", letterSpacing: 4, name: "Brand",
          }),
          txt({
            x: 24, y: 100, w: 326, h: 160,
            text: "COFFEE\nTHAT MOVES\nWITH YOU",
            fontFamily: "Anton", fontSize: 40, color: "#fafafa", align: "center", lineHeight: 1.1, name: "Cover title",
          }),
          img({ x: 24, y: 300, w: 326, h: 250, name: "Cover photo" }),
          txt({
            x: 24, y: 580, w: 326, h: 40,
            text: "Grab-and-go bar · fresh beans daily",
            fontFamily: "Lora", fontSize: 15, italic: true, color: "#a1a1aa", align: "center", name: "Tagline",
          }),
          txt({
            x: 0, y: 700, w: toPx(99, "mm"), h: 28,
            text: "OPEN DAILY 6 AM – 2 PM",
            fontFamily: "Oswald", fontSize: 15, color: "#d4d4d8", align: "center", letterSpacing: 2, name: "Hours",
          }),
          shp({ x: 0, y: 760, w: toPx(99, "mm"), h: 34, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Bottom band" }),
          txt({
            x: 0, y: 767, w: toPx(99, "mm"), h: 24,
            text: "12 Market Lane",
            fontFamily: "Oswald", fontSize: 15, color: "#18181b", align: "center", name: "Address",
          }),
        ]),
        page("#ffffff", [
          txt({
            x: 0, y: 40, w: toPx(99, "mm"), h: 32,
            text: "WHY EMBER & OAK?",
            fontFamily: "Oswald", fontSize: 20, color: "#b45309", align: "center", letterSpacing: 2, name: "Heading",
          }),
          shp({ x: 87, y: 80, w: 200, h: 3, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Accent rule" }),
          txt({ x: 24, y: 110, w: 326, h: 28, text: "Direct-trade beans", fontFamily: "Oswald", fontSize: 16, color: "#18181b", name: "Perk 1 title" }),
          txt({ x: 24, y: 138, w: 326, h: 60, text: "Roasted in small batches every Monday and Thursday, never warehoused.", fontFamily: "Merriweather", fontSize: 13, color: "#3f3f46", lineHeight: 1.6, name: "Perk 1 body" }),
          txt({ x: 24, y: 220, w: 326, h: 28, text: "Brewed in 90 seconds", fontFamily: "Oswald", fontSize: 16, color: "#18181b", name: "Perk 2 title" }),
          txt({ x: 24, y: 248, w: 326, h: 60, text: "Precision pour-over and espresso, dialed in fresh throughout the day.", fontFamily: "Merriweather", fontSize: 13, color: "#3f3f46", lineHeight: 1.6, name: "Perk 2 body" }),
          txt({ x: 24, y: 330, w: 326, h: 28, text: "Cups that give back", fontFamily: "Oswald", fontSize: 16, color: "#18181b", name: "Perk 3 title" }),
          txt({ x: 24, y: 358, w: 326, h: 60, text: "Five cents from every cup funds the riverside cleanup crew.", fontFamily: "Merriweather", fontSize: 13, color: "#3f3f46", lineHeight: 1.6, name: "Perk 3 body" }),
          shp({ x: 24, y: 440, w: 326, h: 2, fill: "#e4e4e7", stroke: "none", strokeWidth: 0, name: "Divider" }),
          shp({ x: 24, y: 470, w: 326, h: 90, fill: "#fffbeb", stroke: "#f59e0b", strokeWidth: 2, radius: 10, name: "Coupon" }),
          txt({ x: 24, y: 486, w: 326, h: 32, text: "FIRST CUP FREE", fontFamily: "Anton", fontSize: 24, color: "#18181b", align: "center", name: "Coupon title" }),
          txt({ x: 24, y: 522, w: 326, h: 24, text: "with this pamphlet · until Dec 1", fontFamily: "Lora", fontSize: 12, italic: true, color: "#71717a", align: "center", name: "Coupon terms" }),
          txt({
            x: 0, y: 730, w: toPx(99, "mm"), h: 28,
            text: "emberandoak.co  ·  (555) 010-0112",
            fontFamily: "Oswald", fontSize: 14, color: "#71717a", align: "center", name: "Footer",
          }),
        ]),
      ],
    }),
  },
  {
    id: "bifold-brochure",
    name: "Half-fold Brochure",
    sizeLabel: "A4 · landscape · 2 pages",
    description: "Classic bi-fold pamphlet — outside cover plus two-panel inside spread",
    build: () => {
      const W = toPx(29.7, "cm");
      const H = toPx(21, "cm");
      return {
        name: "Half-fold Brochure",
        width: W,
        height: H,
        unit: "cm",
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        bleed: 12,
        pages: [
          page("#fafafa", [
            shp({ x: 561, y: 0, w: W - 561, h: H, fill: "#18181b", stroke: "none", strokeWidth: 0, name: "Cover panel" }),
            txt({
              x: 0, y: 60, w: 561, h: 34,
              text: "WORKSHOP 44",
              fontFamily: "Oswald", fontSize: 22, color: "#18181b", align: "center", letterSpacing: 3, name: "Brand",
            }),
            txt({
              x: 70, y: 110, w: 421, h: 60,
              text: "A community makerspace for wood, metal and fabric.",
              fontFamily: "Lora", fontSize: 16, color: "#52525b", align: "center", lineHeight: 1.5, name: "Back blurb",
            }),
            txt({
              x: 70, y: 600, w: 421, h: 110,
              text: "44 Foundry Lane\nhello@workshop44.org\n(555) 010-1998",
              fontFamily: "Oswald", fontSize: 16, color: "#3f3f46", align: "center", lineHeight: 1.8, name: "Contact block",
            }),
            txt({
              x: 620, y: 120, w: 460, h: 250,
              text: "MAKE.\nBUILD.\nCREATE.",
              fontFamily: "Anton", fontSize: 64, color: "#fafafa", lineHeight: 1.05, name: "Cover title",
            }),
            shp({ x: 620, y: 400, w: 120, h: 8, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Cover rule" }),
            img({ x: 620, y: 440, w: 440, h: 240, name: "Cover photo" }),
            txt({
              x: 620, y: 710, w: 440, h: 32,
              text: "Open studio nights every Thursday",
              fontFamily: "Oswald", fontSize: 16, color: "#a1a1aa", name: "Cover tagline",
            }),
          ]),
          page("#ffffff", [
            shp({ x: 560, y: 0, w: 3, h: H, fill: "#e4e4e7", stroke: "none", strokeWidth: 0, name: "Fold line" }),
            txt({ x: 64, y: 60, w: 440, h: 38, text: "CLASSES", fontFamily: "Oswald", fontSize: 24, color: "#b45309", letterSpacing: 3, name: "Inside 1 title" }),
            img({ x: 64, y: 110, w: 440, h: 250, name: "Inside 1 photo" }),
            txt({
              x: 64, y: 390, w: 440, h: 220,
              text: "From first-timer woodworking to advanced metalwork, every class is hands-on and capped at eight makers.\n\nMembers get two free classes every month, plus unlimited open-studio time.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Inside 1 body",
            }),
            txt({ x: 620, y: 60, w: 440, h: 38, text: "OPEN STUDIO", fontFamily: "Oswald", fontSize: 24, color: "#b45309", letterSpacing: 3, name: "Inside 2 title" }),
            img({ x: 620, y: 110, w: 440, h: 250, name: "Inside 2 photo" }),
            txt({
              x: 620, y: 390, w: 440, h: 220,
              text: "Bring a project, borrow from the tool library, and work alongside people who love this stuff as much as you do.\n\nThursday nights, 6–10 PM. First visit is always free.",
              fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.7, name: "Inside 2 body",
            }),
            shp({ x: 0, y: 740, w: W, h: 54, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Footer band" }),
            txt({
              x: 0, y: 755, w: W, h: 32,
              text: "Sign up at workshop44.org/join",
              fontFamily: "Oswald", fontSize: 18, color: "#18181b", align: "center", name: "Footer",
            }),
          ]),
        ],
      };
    },
  },
  {
    id: "property-showcase",
    name: "Property Showcase",
    sizeLabel: "Letter · landscape",
    description: "Real-estate ad — full-width photo band, price chip, stats and agent card",
    build: () => ({
      name: "Property Showcase",
      width: toPx(11, "in"),
      height: toPx(8.5, "in"),
      unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      bleed: 12,
      pages: [
        page("#ffffff", [
          img({ x: 0, y: 0, w: toPx(11, "in"), h: 320, name: "Property photo" }),
          shp({ x: 64, y: 270, w: 240, h: 84, fill: "#f59e0b", stroke: "none", strokeWidth: 0, radius: 12, name: "Price chip" }),
          txt({
            x: 64, y: 294, w: 240, h: 40,
            text: "$489,000",
            fontFamily: "Anton", fontSize: 36, color: "#18181b", align: "center", name: "Price",
          }),
          txt({
            x: 64, y: 380, w: 560, h: 110,
            text: "Modern Family Home\nin Maple Heights",
            fontFamily: "Playfair Display", fontSize: 40, color: "#18181b", lineHeight: 1.15, name: "Headline",
          }),
          txt({ x: 64, y: 510, w: 190, h: 44, text: "4 BEDS", fontFamily: "Oswald", fontSize: 30, color: "#18181b", name: "Stat beds" }),
          txt({ x: 64, y: 558, w: 190, h: 24, text: "Above grade", fontFamily: "Lora", fontSize: 13, color: "#71717a", name: "Stat beds label" }),
          txt({ x: 264, y: 510, w: 190, h: 44, text: "3 BATH", fontFamily: "Oswald", fontSize: 30, color: "#18181b", name: "Stat baths" }),
          txt({ x: 264, y: 558, w: 190, h: 24, text: "Renovated 2024", fontFamily: "Lora", fontSize: 13, color: "#71717a", name: "Stat baths label" }),
          txt({ x: 464, y: 510, w: 190, h: 44, text: "2,840 SQ FT", fontFamily: "Oswald", fontSize: 30, color: "#18181b", name: "Stat size" }),
          txt({ x: 464, y: 558, w: 190, h: 24, text: "Corner lot", fontFamily: "Lora", fontSize: 13, color: "#71717a", name: "Stat size label" }),
          txt({
            x: 64, y: 600, w: 480, h: 140,
            text: "• Open-plan kitchen and living\n• New roof and HVAC (2024)\n• Fenced yard with mature oaks\n• Walk to Maple Elementary",
            fontFamily: "Merriweather", fontSize: 15, color: "#3f3f46", lineHeight: 1.8, name: "Feature list",
          }),
          shp({ x: 700, y: 380, w: 292, h: 360, fill: "#18181b", stroke: "none", strokeWidth: 0, radius: 14, name: "Agent card" }),
          img({ x: 732, y: 412, w: 90, h: 90, name: "Agent photo" }),
          txt({ x: 840, y: 424, w: 140, h: 30, text: "Dana Whitfield", fontFamily: "Oswald", fontSize: 20, color: "#fafafa", name: "Agent name" }),
          txt({ x: 840, y: 456, w: 140, h: 22, text: "Sunrise Realty", fontFamily: "Lora", fontSize: 13, color: "#a1a1aa", name: "Agent agency" }),
          shp({ x: 732, y: 530, w: 228, h: 3, fill: "#f59e0b", stroke: "none", strokeWidth: 0, name: "Card rule" }),
          txt({ x: 732, y: 550, w: 228, h: 30, text: "(555) 010-4321", fontFamily: "Oswald", fontSize: 18, color: "#fafafa", name: "Agent phone" }),
          txt({ x: 732, y: 586, w: 228, h: 26, text: "book a tour today", fontFamily: "Lora", fontSize: 14, italic: true, color: "#d4d4d8", name: "Agent note" }),
          shp({ x: 732, y: 630, w: 228, h: 56, fill: "#f59e0b", stroke: "none", strokeWidth: 0, radius: 10, name: "CTA chip" }),
          txt({ x: 732, y: 646, w: 228, h: 28, text: "SCHEDULE A VISIT", fontFamily: "Oswald", fontSize: 17, color: "#18181b", align: "center", name: "CTA text" }),
          txt({
            x: 0, y: 776, w: toPx(11, "in"), h: 24,
            text: "Equal Housing Opportunity  ·  sunrise.realty/44-oaks-lane",
            fontFamily: "Oswald", fontSize: 12, color: "#71717a", align: "center", name: "Footer",
          }),
        ]),
      ],
    }),
  },
];

export function buildTemplate(id: string): Doc | null {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const doc = t.build();
  doc.width = Math.round(doc.width);
  doc.height = Math.round(doc.height);
  return doc;
}

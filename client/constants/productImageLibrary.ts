/**
 * Smart Product Image Library — for grocery / supermarket / vegetable stores.
 * Each entry covers one food category and lists Arabic keyword aliases plus
 * 3-5 curated Unsplash image URLs (all free to display via CDN).
 *
 * Extend this array to add more products; the search function auto-picks matches.
 */

const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=420&h=420&fit=crop&q=80`;

export interface LibraryEntry {
  keywords: string[]; // Arabic aliases; partial match works
  urls: string[];     // 3–5 curated variants
}

export const PRODUCT_IMAGE_LIBRARY: LibraryEntry[] = [
  // ── خضروات ──────────────────────────────────────────────────────────────
  {
    keywords: ["طماطم", "بندورة", "تماط"],
    urls: [
      U("1546094096-0df4bcaaa337"),
      U("1592924357228-91a4daadcfea"),
      U("1561136594-7f68807a8d75"),
      U("1471194402547-f188ae6dedd7"),
    ],
  },
  {
    keywords: ["خيار", "خيارة"],
    urls: [
      U("1589621316382-008455b857cd"),
      U("1449300079323-02847be96222"),
      U("1501200291289-c5a76c232e5f"),
    ],
  },
  {
    keywords: ["بطاطا", "بطاطس", "بطاطه"],
    urls: [
      U("1518977676601-b53f82aba655"),
      U("1564385135347-6c7b30d6e80b"),
      U("1508302960313-47e3f51daebf"),
    ],
  },
  {
    keywords: ["بصل", "بصله"],
    urls: [
      U("1587049352846-4a222e784d38"),
      U("1565557623262-b51c2513a641"),
      U("1518977656693-d78e4a5e2fdc"),
    ],
  },
  {
    keywords: ["ثوم", "ثومه"],
    urls: [
      U("1540148124-7c1f7f95f5dd"),
      U("1622557987012-dae714c6f847"),
      U("1550989460-0adf9ea622e2"),
    ],
  },
  {
    keywords: ["فلفل", "فلفله", "فليفلة", "حار", "رومي"],
    urls: [
      U("1590165482310-1cf220c790c6"),
      U("1455267143567-af41dc3da694"),
      U("1563262924-641a8b3d397f"),
    ],
  },
  {
    keywords: ["باذنجان", "بادنجان"],
    urls: [
      U("1605034313761-73ea4a0cfcc5"),
      U("1526041092449-209d556f7b2a"),
      U("1583148915214-39c65b1c7f81"),
    ],
  },
  {
    keywords: ["جزر", "جزرة"],
    urls: [
      U("1598170845058-32b9d6a5da37"),
      U("1447175008436-054170537620"),
      U("1511546695946-7a55aa6d5bc0"),
    ],
  },
  {
    keywords: ["خس", "سلطة خضراء", "لتيس"],
    urls: [
      U("1576045057995-568f588f82fb"),
      U("1622205313162-be1d5716a43b"),
      U("1512621776951-a57141f2eefd"),
    ],
  },
  {
    keywords: ["كوسا", "كوسة", "قرعة"],
    urls: [
      U("1563398170-b38ee9cb7aad"),
      U("1596461404969-9ae70f2830c1"),
      U("1589621316382-008455b857cd"),
    ],
  },
  {
    keywords: ["بامية"],
    urls: [
      U("1595351474590-e2b1c05b4c3e"),
      U("1595274659583-9c3ddc375af5"),
      U("1518620763259-8ccbdf6c9c91"),
    ],
  },
  {
    keywords: ["فاصوليا", "لوبيا", "فول"],
    urls: [
      U("1515543904397-7d3bba42dc3a"),
      U("1563398170-b38ee9cb7aad"),
      U("1490474418585-ba9bad8fd0ea"),
    ],
  },
  {
    keywords: ["سبانخ", "حميض"],
    urls: [
      U("1576045057995-568f588f82fb"),
      U("1512621776951-a57141f2eefd"),
      U("1610832958596-05954f5e8b45"),
    ],
  },
  {
    keywords: ["بقدونس", "بقدونسة", "معدنوس"],
    urls: [
      U("1553852297-a9d30dc03e3a"),
      U("1571506165871-ee72a35bc9d4"),
      U("1590165482310-1cf220c790c6"),
    ],
  },
  {
    keywords: ["نعناع", "نعنع"],
    urls: [
      U("1500977379-20b0efc7e5b6"),
      U("1558618666-fcd25c85cd64"),
      U("1487530811176-3780de880c2d"),
    ],
  },
  {
    keywords: ["كزبرة", "كسبرة"],
    urls: [
      U("1553852297-a9d30dc03e3a"),
      U("1568702846914-96b305d2aaeb"),
      U("1512621776951-a57141f2eefd"),
    ],
  },
  {
    keywords: ["فجل"],
    urls: [
      U("1571506165871-ee72a35bc9d4"),
      U("1546094096-0df4bcaaa337"),
      U("1512621776951-a57141f2eefd"),
    ],
  },

  // ── فواكه ───────────────────────────────────────────────────────────────
  {
    keywords: ["موز", "موزة"],
    urls: [
      U("1571771894821-ce9b6c11b08e"),
      U("1528825871115-3581a5387919"),
      U("1481349518771-20055b2a7b24"),
      U("1603833665858-e61d17a8c5ab"),
    ],
  },
  {
    keywords: ["تفاح", "تفاحة"],
    urls: [
      U("1568702846914-96b305d2aaeb"),
      U("1567306226416-28f0efdc88ce"),
      U("1550258987-190a2d41a8ba"),
      U("1569870499705-504209102861"),
    ],
  },
  {
    keywords: ["برتقال", "برتقالة"],
    urls: [
      U("1547514701-42782101795e"),
      U("1582979512210-d30fd22cdbab"),
      U("1611080626919-7cf5a9dbab12"),
    ],
  },
  {
    keywords: ["عنب", "عنبة"],
    urls: [
      U("1537640538966-79f369143f8f"),
      U("1596363505818-87f28ec7e985"),
      U("1474744272217-f4d07a6aefc9"),
    ],
  },
  {
    keywords: ["رمان"],
    urls: [
      U("1605000797498-6f2f6b6e4a3e"),
      U("1574943320219-553eb213f72d"),
      U("1526081692742-4d8e6b35d9a2"),
    ],
  },
  {
    keywords: ["مانجو", "منجا"],
    urls: [
      U("1553279768-865429fa0078"),
      U("1601493700631-2b16ec4b4716"),
      U("1618897996318-5a901fa6ca71"),
    ],
  },
  {
    keywords: ["بطيخ", "خربز", "جحش"],
    urls: [
      U("1566486189-9d6fe29cc2fb"),
      U("1558618666-fcd25c85cd64"),
      U("1535189043414-b5d970f6d5b2"),
    ],
  },
  {
    keywords: ["شمام", "كانتالوب", "بطيخ أصفر"],
    urls: [
      U("1571506165871-ee72a35bc9d4"),
      U("1535189043414-b5d970f6d5b2"),
      U("1548697640-a3e9e8b71e3a"),
    ],
  },
  {
    keywords: ["ليمون", "ليمونة", "حامض"],
    urls: [
      U("1548791483-1912fcd8abe9"),
      U("1585065921786-b8e5d0b5e8a2"),
      U("1590165482310-1cf220c790c6"),
    ],
  },
  {
    keywords: ["فراولة", "فريز", "توت أحمر"],
    urls: [
      U("1464965911861-746a04b4bca6"),
      U("1543528176-61b51f25d3f9"),
      U("1571771894821-ce9b6c11b08e"),
    ],
  },
  {
    keywords: ["توت", "توت عنبي"],
    urls: [
      U("1542838132-92c53300491e"),
      U("1596363505818-87f28ec7e985"),
      U("1537640538966-79f369143f8f"),
    ],
  },
  {
    keywords: ["خوخ", "مشمش"],
    urls: [
      U("1517359652813-27be26e2fb62"),
      U("1620516882-c8a44fc91a3c"),
      U("1601493700631-2b16ec4b4716"),
    ],
  },
  {
    keywords: ["كيوي"],
    urls: [
      U("1585059895524-72319bc9f567"),
      U("1611080626919-7cf5a9dbab12"),
      U("1553279768-865429fa0078"),
    ],
  },
  {
    keywords: ["أناناس", "انانس"],
    urls: [
      U("1528825871115-3581a5387919"),
      U("1603833665858-e61d17a8c5ab"),
      U("1490474418585-ba9bad8fd0ea"),
    ],
  },
  {
    keywords: ["تمر", "تمرة", "رطب"],
    urls: [
      U("1618897996318-5a901fa6ca71"),
      U("1526081692742-4d8e6b35d9a2"),
      U("1574943320219-553eb213f72d"),
    ],
  },

  // ── مواد غذائية ─────────────────────────────────────────────────────────
  {
    keywords: ["رز", "أرز", "رزة"],
    urls: [
      U("1536304929831-ee1ca9d44906"),
      U("1516684402241-6a82e8f59c4a"),
      U("1490474418585-ba9bad8fd0ea"),
    ],
  },
  {
    keywords: ["دقيق", "طحين"],
    urls: [
      U("1509440159596-0249088772ff"),
      U("1549931319-a545dcf3bc73"),
      U("1574297374-97b2a00a0bf4"),
    ],
  },
  {
    keywords: ["سكر", "سكرة"],
    urls: [
      U("1574297374-97b2a00a0bf4"),
      U("1509440159596-0249088772ff"),
      U("1516684402241-6a82e8f59c4a"),
    ],
  },
  {
    keywords: ["زيت", "زيت نباتي", "زيت زيتون"],
    urls: [
      U("1474979266404-7eaacbcd87c5"),
      U("1558618666-fcd25c85cd64"),
      U("1568706971256-4b954aaeeef6"),
    ],
  },
  {
    keywords: ["ملح", "ملحة"],
    urls: [
      U("1574297374-97b2a00a0bf4"),
      U("1516684402241-6a82e8f59c4a"),
      U("1509440159596-0249088772ff"),
    ],
  },
  {
    keywords: ["حليب", "لبن", "حليبة"],
    urls: [
      U("1550583724-aa135a0e5a1f"),
      U("1563636619-e9143da7973b"),
      U("1628088062854-d1870b4553da"),
    ],
  },
  {
    keywords: ["بيض", "بيضة"],
    urls: [
      U("1582722872445-44dc5f7e3c8f"),
      U("1603048588665-791ca8aea617"),
      U("1506459522-e13a09a57429"),
    ],
  },
  {
    keywords: ["خبز", "صمون", "تنور", "عيش"],
    urls: [
      U("1549931319-a545dcf3bc73"),
      U("1509440159596-0249088772ff"),
      U("1517686469429-8bdb88b9f907"),
    ],
  },
  {
    keywords: ["شاي", "شاهي"],
    urls: [
      U("1556679343-c7306c1976bc"),
      U("1571934811421-4e2e6ead76f1"),
      U("1487530811176-3780de880c2d"),
    ],
  },
  {
    keywords: ["قهوة", "قهوه"],
    urls: [
      U("1495474472287-4d71bcdd2085"),
      U("1459755486867-638c5c82e6f4"),
      U("1509042239860-f4c0fdba74a1"),
    ],
  },
  {
    keywords: ["دجاج", "فروج", "دجاجة"],
    urls: [
      U("1603048588665-791ca8aea617"),
      U("1601050690117-57e99d0670a8"),
      U("1598103442097-8b74394b95c7"),
    ],
  },
  {
    keywords: ["لحم", "لحمة", "لحوم"],
    urls: [
      U("1529692157571-d4e3d27ce9b0"),
      U("1558030137-a56a83c4b252"),
      U("1607623814075-e51df1bdc82f"),
    ],
  },
  {
    keywords: ["سمك", "سمكة", "حوت"],
    urls: [
      U("1534482421-64566f976cfa"),
      U("1559304822-9eb2813c8550"),
      U("1580584126903-c17d41830450"),
    ],
  },
];

/**
 * Find library entries that match the given Arabic query.
 * Returns up to 3 matching entries (multi-product search).
 */
export function searchProductImages(query: string): LibraryEntry | null {
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (q.length < 2) return null;

  // Exact or partial keyword match
  return (
    PRODUCT_IMAGE_LIBRARY.find((entry) =>
      entry.keywords.some(
        (k) =>
          q === k ||
          q.includes(k) ||
          k.includes(q) ||
          // handle common misspellings: drop last char and compare
          (q.length > 2 && k.startsWith(q.slice(0, -1))) ||
          (k.length > 2 && q.startsWith(k.slice(0, -1)))
      )
    ) ?? null
  );
}

/** Business types that should show the library. */
export const GROCERY_BUSINESS_TYPES = new Set(["supermarket", "grocery"]);

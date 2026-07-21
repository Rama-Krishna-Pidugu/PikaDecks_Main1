interface SEOHeadOptions {
  title: string;
  description: string;
  urlPath: string;
  schemas: any[];
}

export function createSEOHead({ title, description, urlPath, schemas }: SEOHeadOptions) {
  const fullUrl = `https://pikadecks.app${urlPath}`;

  const meta = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: fullUrl },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "https://pikadecks.app/og-image.png" },
    { property: "og:image:alt", content: "Pikadecks mascot with floating AI flashcards" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: "https://pikadecks.app/og-image.png" },
  ];

  const links = [{ rel: "canonical", href: fullUrl }];

  const scripts = schemas.map((schema) => ({
    type: "application/ld+json",
    children: JSON.stringify(schema),
  }));

  return {
    meta,
    links,
    scripts,
  };
}

export function createSoftwareApplicationSchema({
  name = "Pikadecks",
  description = "AI-powered flashcard app that turns PDFs, YouTube videos, notes, and websites into beautiful,  spaced-repetition study decks.",
  url = "https://pikadecks.app/",
  price = "0",
  ratingValue = "4.9",
  ratingCount = "1200",
} = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    applicationCategory: "EducationalApplication",
    operatingSystem: "iOS, Android, Web",
    description,
    offers: { "@type": "Offer", price, priceCurrency: "USD" },
    aggregateRating: { "@type": "AggregateRating", ratingValue, ratingCount },
    image: "https://pikadecks.app/og-image.png",
    url,
  };
}

export function createProductSchema({
  name = "Pikadecks",
  description = "AI-powered flashcard and spaced repetition study app.",
  url = "https://pikadecks.app/",
  price = "0",
  ratingValue = "4.9",
  ratingCount = "1200",
} = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue,
      ratingCount,
    },
    image: "https://pikadecks.app/og-image.png",
    url,
  };
}

export function createFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export function createHowToSchema({
  name,
  description,
  steps,
}: {
  name: string;
  description: string;
  steps: { text: string; image?: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text: s.text,
      name: `Step ${i + 1}`,
      url: "https://pikadecks.app/",
    })),
  };
}

const fs = require("fs");
const path = require("path");

const PUBLISHED_BASE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ4xmtov9YFBrwAOvx5ydZx34duAZLfQbBeEyAABCsasRFe2I1Sfg7LC10I0ob2rMftsTJRZdfZBuV1";

const OUTPUT_FILE = path.join(__dirname, "..", "data", "products.json");

const PRODUCT_SHEETS = [
  { name: "For Mom", gid: "1008491446" },
  { name: "For Baby", gid: "1564781549" },
  { name: "Pregnancy / Postpartum", gid: "1255929932" },
  { name: "Babyproofing & Home Safety", gid: "1263147126" },
  { name: "At Home Essentials", gid: "764227509" },
  { name: "Birth & Recovery Essentials", gid: "1814002083" },
  { name: "Luxury suggestion", gid: "1715571422" },
  { name: "Baby Gear & Nursery", gid: "2129934827" },
  { name: "Toys 6-12 month", gid: "1935672515" },
  { name: "Travel Essentials", gid: "2113636204" },
  { name: "Toy 0-3 month", gid: "757672832" },
  { name: "Toy 3-6 month", gid: "2045599679" },
  { name: "Solids essential", gid: "607160760" },
  { name: "Books", gid: "1648078891" },
];

function parseCSV(text) {
  const rows = [];

  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field.trim());
      field = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function createProductId(sheet, product, link) {
  /*
   * Sheet is included because the same/similar product
   * could theoretically occur in different tabs.
   */
  const source = `${sheet}|${product}|${link}`;

  let hash = 0;

  for (let i = 0; i < source.length; i++) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }

  return `P${Math.abs(hash)}`;
}

function findHeaderRow(rows) {
  /*
   * We don't assume headers are always exactly row 1.
   *
   * Find a row containing Product + Link.
   */
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const normalized = rows[i].map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    );

    if (normalized.includes("product") && normalized.includes("link")) {
      return i;
    }
  }

  return -1;
}

function getColumnIndexes(headerRow) {
  const normalized = headerRow.map((value) =>
    String(value || "")
      .trim()
      .toLowerCase(),
  );

  return {
    category: normalized.indexOf("category"),
    product: normalized.indexOf("product"),
    link: normalized.indexOf("link"),
    remarks: normalized.indexOf("remarks"),
    brand: normalized.indexOf("brand"),
  };
}

async function downloadSheet(sheet) {
  console.log(`Downloading: ${sheet.name}`);

  const csvUrl =
    `${PUBLISHED_BASE_URL}/pub` +
    `?output=csv` +
    `&single=true` +
    `&gid=${sheet.gid}`;

  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download "${sheet.name}": ` +
        `${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

function convertRowsToProducts(sheet, rows) {
  const headerIndex = findHeaderRow(rows);

  if (headerIndex === -1) {
    console.warn(
      `⚠️ Skipping "${sheet.name}" - Product/Link headers not found`,
    );

    return [];
  }

  const columns = getColumnIndexes(rows[headerIndex]);

  if (columns.product === -1) {
    console.warn(`⚠️ Skipping "${sheet.name}" - Product column not found`);

    return [];
  }

  let currentCategory = "";

  const products = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];

    /*
     * IMPORTANT:
     *
     * Google Sheets merged cells generally produce:
     *
     * Clothing essentials | Onesie
     *                     | Jhabla
     *                     | Socks
     *
     * Therefore whenever Category is blank we KEEP
     * the last non-empty category.
     */

    const category =
      columns.category >= 0 ? row[columns.category]?.trim() || "" : "";

    if (category) {
      currentCategory = category;
    }

    const product = row[columns.product]?.trim() || "";

    const link = columns.link >= 0 ? row[columns.link]?.trim() || "" : "";

    const remarks =
      columns.remarks >= 0 ? row[columns.remarks]?.trim() || "" : "";

    const brand = columns.brand >= 0 ? row[columns.brand]?.trim() || "" : "";

    /*
     * Empty product row = nothing to import.
     */
    if (!product) {
      continue;
    }

    products.push({
      id: createProductId(sheet.name, product, link),

      sheet: sheet.name,

      /*
       * Forward-filled category.
       */
      category: currentCategory,

      product,
      brand,
      remarks,
      affiliateLink: link,
    });
  }

  return products;
}

async function syncProducts() {
  console.log("");
  console.log("================================");
  console.log("PRODUCT SYNC STARTED");
  console.log("================================");
  console.log("");

  const sheetsToImport = PRODUCT_SHEETS;

  console.log(`Configured ${sheetsToImport.length} product sheet(s)`);

  const allProducts = [];

  const summary = [];

  for (const sheet of PRODUCT_SHEETS) {
    try {
      const csv = await downloadSheet(sheet);

      const rows = parseCSV(csv);

      const products = convertRowsToProducts(sheet, rows);

      allProducts.push(...products);

      summary.push({
        sheet: sheet.name,
        products: products.length,
      });

      console.log(`✅ ${sheet.name}: ${products.length} products`);

      console.log("");
    } catch (error) {
      console.error(`❌ Failed: ${sheet.name}`);
      console.error(error.message);
      console.log("");
    }
  }
  fs.mkdirSync(path.dirname(OUTPUT_FILE), {
    recursive: true,
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), "utf8");

  console.log("");
  console.log("================================");
  console.log("SYNC SUMMARY");
  console.log("================================");

  for (const item of summary) {
    console.log(`${item.sheet}: ${item.products}`);
  }

  console.log("--------------------------------");

  console.log(`TOTAL PRODUCTS: ${allProducts.length}`);

  console.log("");
  console.log(`Saved to: ${OUTPUT_FILE}`);

  console.log("");
  console.log("✅ PRODUCT SYNC COMPLETE");
  console.log("");
}

syncProducts().catch((error) => {
  console.error("");
  console.error("❌ PRODUCT SYNC FAILED");
  console.error(error);
  process.exitCode = 1;
});

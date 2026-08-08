import { expect, test } from "@playwright/test";

// A game shipped as fifty parts is the case this feature exists for. Every check here is the
// same question in a different place: does fifty transfers behave as one thing the user can
// see, act on, and get an honest account of?

const FIXTURE = "/index.html?fixture";

async function seed(page, downloads) {
  await page.evaluate((items) => {
    const original = window.__SANDWICH_TEST_BRIDGE__.invoke;
    window.__SANDWICH_TEST_BRIDGE__.invoke = async (command, payload) =>
      command === "list_downloads" ? items : original(command, payload);
  }, downloads);
  await page.evaluate(() => window.__sandwichRefresh());
}

/** Fifty parts of one batch, with the states a real half-finished download would have. */
function parts({ count = 5, batch = "b1", name = "Cyberpunk", done = 0, failed = 0 } = {}) {
  return Array.from({ length: count }, (_, index) => {
    let status = "queued";
    if (index < done) status = "completed";
    else if (index < done + failed) status = "failed";
    else if (index === done + failed) status = "active";
    return {
      id: `${batch}-${index}`,
      filename: `${name}.part${String(index + 1).padStart(2, "0")}.rar`,
      status,
      completed_bytes: status === "completed" ? 2_000_000 : status === "active" ? 500_000 : 0,
      total_bytes: 2_000_000,
      bytes_per_second: status === "active" ? 250_000 : 0,
      connections: status === "active" ? 4 : 0,
      num_pieces: 8,
      bitfield: "0",
      source_url: `https://cdn.example.com/${name}.part${index + 1}.rar`,
      directory: "C:\\Downloads",
      batch_id: batch,
      batch_name: name
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForSelector(".download-card");
});

/* ── Getting fifty links in ──────────────────────────────────────────────── */

test("the add panel offers several links without becoming a panel of its own", async ({ page }) => {
  await page.locator("#open-add").click();
  await expect(page.locator("#batch-input")).toBeHidden();

  await page.locator("#mode-many").click();
  await expect(page.locator("#batch-input")).toBeVisible();
  await expect(page.locator("#url")).toBeHidden();
});

test("a range stands for every file it covers, and says so before anything is queued", async ({ page }) => {
  await page.locator("#open-add").click();
  await page.locator("#mode-many").click();
  await page.locator("#batch-input").fill("https://cdn.example.com/Cyberpunk.part[01-50].rar");

  await expect(page.locator("#batch-headline")).toHaveText("50 files ready");
  await expect(page.locator("#batch-rejects")).toBeHidden();
  // The suggested name is the thing itself, not the scaffolding around the sequence.
  await expect(page.locator("#batch-name")).toHaveAttribute("placeholder", "Cyberpunk");
});

test("repeats and bad lines are reported, and the bad ones are named", async ({ page }) => {
  // Silently dropping lines is how somebody ends up with 47 of 50 parts and no idea which
  // three are missing.
  await page.locator("#open-add").click();
  await page.locator("#mode-many").click();
  await page.locator("#batch-input").fill(
    [
      "https://cdn.example.com/a.rar",
      "https://cdn.example.com/a.rar",
      "ftp://cdn.example.com/b.rar",
      "https://cdn.example.com/c.rar"
    ].join("\n")
  );

  await expect(page.locator("#batch-headline")).toHaveText("2 files ready");
  await expect(page.locator("#batch-detail")).toContainText("1 repeat removed");
  await expect(page.locator("#batch-detail")).toContainText("1 line skipped");

  const rejects = page.locator("#batch-rejects");
  await expect(rejects).toBeVisible();
  await rejects.locator("summary").click();
  await expect(rejects).toContainText("ftp://cdn.example.com/b.rar");
});

test("a backwards range is refused rather than quietly sorted", async ({ page }) => {
  await page.locator("#open-add").click();
  await page.locator("#mode-many").click();
  await page.locator("#batch-input").fill("https://cdn.example.com/game.part[50-01].rar");

  await expect(page.locator("#batch-headline")).toContainText(/Nothing here/i);
  await expect(page.locator("#submit-batch")).toBeDisabled();
});

test("an empty box explains the range syntax instead of just refusing", async ({ page }) => {
  await page.locator("#open-add").click();
  await page.locator("#mode-many").click();
  await expect(page.locator("#batch-detail")).toContainText("part[01-50]");
  await expect(page.locator("#submit-batch")).toBeDisabled();
});

/* ── Fifty transfers, one card ───────────────────────────────────────────── */

test("a batch is one card, not fifty", async ({ page }) => {
  await seed(page, parts({ count: 50, done: 12 }));
  await expect(page.locator(".download-card")).toHaveCount(1);
  await expect(page.locator(".download-card .filename")).toHaveText("Cyberpunk");
});

test("the card counts files, because bytes alone do not say how far in you are", async ({ page }) => {
  await seed(page, parts({ count: 50, done: 12 }));
  await expect(page.locator(".download-card .size")).toContainText("12 of 50 files");
});

test("a failure among running parts is counted without stopping the batch reading as active", async ({ page }) => {
  await seed(page, parts({ count: 10, done: 4, failed: 3 }));
  const card = page.locator(".download-card").first();
  await expect(card.locator(".download-state")).toHaveText("Downloading");
  await expect(card.locator(".size")).toContainText("3 failed");
});

test("the sidebar counts cards, not transfers", async ({ page }) => {
  // A sidebar reading "50 downloading" beside a single visible card is a sidebar that lies.
  await seed(page, parts({ count: 50 }));
  await expect(page.locator('[data-count="all"]')).toHaveText("1");
});

test("expanding a batch lists its parts, and only broken ones get a control", async ({ page }) => {
  await seed(page, parts({ count: 6, done: 2, failed: 1 }));
  await page.locator(".download-card .disclosure").first().click();

  const members = page.locator(".member-list .member");
  await expect(members).toHaveCount(6);
  await expect(members.first()).toContainText("Cyberpunk.part01.rar");
  // One retry, for the one failed part — not six.
  await expect(page.locator(".member-retry")).toHaveCount(1);
});

test("batch actions act on the whole set", async ({ page }) => {
  await seed(page, parts({ count: 5, done: 1 }));
  const card = page.locator(".download-card").first();
  await expect(card.getByRole("button", { name: /Pause all/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /Cancel all/ })).toBeVisible();
  // The single-download wording must not leak onto a group.
  await expect(card.getByRole("button", { name: /^Pause Cyberpunk$/ })).toHaveCount(0);
});

test("cancelling a batch says how many files it is about to throw away", async ({ page }) => {
  await seed(page, parts({ count: 50, done: 12 }));
  await page.locator(".download-card").first().getByRole("button", { name: /Cancel all/ }).click();

  const dialog = page.locator("#app-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("50 files");
  await expect(dialog).toContainText("12 already finished");
});

test("searching for one part finds the batch that holds it", async ({ page }) => {
  // Grouping must not hide the very file someone is looking for.
  await seed(page, parts({ count: 20 }));
  await page.locator("#queue-search").fill("part07");
  await expect(page.locator(".download-card")).toHaveCount(1);
  await expect(page.locator(".download-card .filename")).toHaveText("Cyberpunk");
});

test("a loose download beside a batch stays its own card", async ({ page }) => {
  await seed(page, [
    ...parts({ count: 4 }),
    {
      id: "loose", filename: "holiday.mp4", status: "active",
      completed_bytes: 100, total_bytes: 1000, bytes_per_second: 50,
      connections: 1, num_pieces: 4, bitfield: "0",
      source_url: "https://example.com/holiday.mp4", directory: "C:\\Downloads"
    }
  ]);
  await expect(page.locator(".download-card")).toHaveCount(2);
  await expect(page.locator(".download-card .filename")).toContainText(["Cyberpunk", "holiday.mp4"]);
});

test("a batch held for the download window says so once, not fifty times", async ({ page }) => {
  const held = parts({ count: 8 }).map((member) => ({ ...member, status: "paused", scheduled: true }));
  await seed(page, held);
  const card = page.locator(".download-card").first();
  await expect(card.locator(".download-state")).toHaveText("Waiting for the download window");
  await expect(card.getByRole("button", { name: /Start all now/ })).toBeVisible();
});

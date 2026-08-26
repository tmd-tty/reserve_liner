import { chromium, type Page } from "playwright";
import { Command } from "commander";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// id属性に ":" を含む要素はCSSエスケープを避けるため属性セレクタで指定する
const byId = (id: string) => `[id="${id}"]`;

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function todayStr(): string {
  return formatDate(new Date());
}

function tomorrowStr(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDate(tomorrow);
}

const program = new Command();
program
  .option("--date <yyyymmdd>", "日付を指定yyyymmdd", tomorrowStr())
  .option("--today", "当日の日付を指定する(--dateより優先)", false)
  .option("--retry <count>", "リトライ回数を設定。", (v) => parseInt(v, 10), 20)
  .option("--target <index>", "予約する便を指定", (v) => parseInt(v, 10), 2)
  .option("--point", "point購入モードON", false)
  .option("--debug", "デバッグモードON", false);
program.parse(process.argv);

const opts = program.opts<{
  date: string;
  today: boolean;
  retry: number;
  target: number;
  point: boolean;
  debug: boolean;
}>();

const targetDateStr = opts.today ? todayStr() : opts.date;

console.log(`予約対象日: ${targetDateStr}`);

async function openTopPage(page: Page, url: string) {
  console.log("################ トップページ");
  // goto()はload完了まで待つため、続く操作はロケーターのauto-waitingに任せる
  await page.goto(url);
}

async function login(page: Page, id: string, password: string) {
  console.log("################ ログイン画面");
  await page.locator(byId("login:userId")).fill(id);
  await page.locator(byId("login:password")).fill(password);
  await page.locator(byId("login:submit")).click();
}

async function selectDestinationAndDate(page: Page, dateStr: string) {
  console.log("################ 予約選択画面");
  // 目的地
  await page.locator(byId("trainData:destination")).selectOption("R004");

  // 日付: option一覧をブラウザ側でまとめて評価し、往復回数を減らす
  const dateSelect = page.locator(byId("trainData:jyoushaDate"));
  const dateOptions = await dateSelect.locator("option").evaluateAll((elements) =>
    elements.map((el) => ({
      value: (el as HTMLOptionElement).value,
      text: el.textContent?.trim() ?? "",
    })),
  );

  for (const { value, text } of dateOptions) {
    console.log(`表示名: ${text}, value属性: ${value}`);
  }

  const matched = dateOptions.find((option) => option.value.startsWith(dateStr));
  if (!matched) {
    throw new Error(`指定日付(${dateStr})に一致する選択肢が見つかりません。`);
  }
  await dateSelect.selectOption(matched.value);

  await page.locator(byId("vacancyButton")).click();
}

// 対象の便が予約可能になるまでリトライし、可能なら予約ボタンをクリックする
// 戻り値はtrue=予約ボタンをクリックできた、false=maxAttempts回試してもダメだった
async function waitForAvailableTrainAndReserve(
  page: Page,
  targetIndex: number,
  maxAttempts: number,
): Promise<boolean> {
  console.log("################ 空席照会");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const submitButton = page.locator(".train").nth(targetIndex).locator(".submitButton");

    try {
      // reload直後は描画がまだのことがあるので、短い猶予だけ持たせて出現を待つ
      await submitButton.waitFor({ state: "visible", timeout: 3000 });
      console.log("条件を満たしました！");
      await submitButton.click();
      return true;
    } catch {
      console.log(`${attempt}回目: 条件を満たしていません。3秒後に更新します...`);
      await page.reload();
    }
  }

  return false;
}

async function selectSeatAutoAllocate(page: Page) {
  console.log("################ 座席選択画面");
  await page.locator(byId("purchaseSeatSelectMethod:autoAllocateBtn")).click();
}

async function confirmPurchase(page: Page, mode: { debug: boolean; point: boolean }) {
  console.log("################ 購入画面");
  await page.locator(byId("purchaseSettlementConfirm:agreement")).click();

  if (mode.debug) {
    console.log("debugモードで終了しました。");
    return;
  }

  const buttonId = mode.point
    ? "purchaseSettlementConfirm:nextPointBtn"
    : "purchaseSettlementConfirm:nextPaymentBtn";
  await page.locator(byId(buttonId)).click();
  // 購入確定リクエストの完了を待つ
  await page.waitForLoadState("networkidle");
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await openTopPage(page, process.env.KEIO_URL!);
  await login(page, process.env.KEIO_ID!, process.env.KEIO_PASSWORD!);
  await selectDestinationAndDate(page, targetDateStr);

  const reserved = await waitForAvailableTrainAndReserve(page, opts.target, opts.retry);

  if (!reserved) {
    console.log("タイムアウトしました。条件が満たされませんでした。");
    await browser.close();
    return;
  }

  await selectSeatAutoAllocate(page);
  await confirmPurchase(page, { debug: opts.debug, point: opts.point });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

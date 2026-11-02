import { chromium, type Page } from "playwright";
import { Command, InvalidArgumentError, Option } from "commander";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notifySlack, recordJob, type JobStatus } from "./report.js";

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

// 便の指定は発車時刻(HH:MM)。"7:10" のような表記は "07:10" に揃える
function parseDepartureTime(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new InvalidArgumentError("発車時刻をHH:MM形式で指定してください。例: 07:10");
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

const program = new Command();
program
  .option("--date <yyyymmdd>", "日付を指定yyyymmdd", tomorrowStr())
  .option("--today", "当日の日付を指定する(--dateより優先)", false)
  .addOption(
    new Option("--destination <code>", "予約する行き先を指定(R003: 京王八王子・高尾山口・高幡不動→新宿方面 / R004: 橋本・京王多摩センター→新宿方面)")
      .choices(["R003", "R004"])
      .default("R004"),
  )
  .option("--retry <count>", "リトライ回数を設定。", (v) => parseInt(v, 10), 20)
  .option("--target <HH:MM>", "予約する便を発車時刻で指定 例: 07:10", parseDepartureTime, "07:10")
  .option("--point", "point購入モードON", false)
  .option("--debug", "デバッグモードON", false);
program.parse(process.argv);

const opts = program.opts<{
  date: string;
  today: boolean;
  destination: "R003" | "R004";
  retry: number;
  target: string;
  point: boolean;
  debug: boolean;
}>();

const targetDateStr = opts.today ? todayStr() : opts.date;

// 通知用の短いラベル(例: "11/4(水) 07:10")
function requestLabel(): string {
  const d = targetDateStr;
  const date = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
  const wd = "日月火水木金土"[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${wd}) ${opts.target}`;
}

// 結果の種類ごとの表示。slack はSlack通知の見出し、label はダッシュボードに載せる短い見出し
const REPORTS = {
  reserved: { status: "success", emoji: ":white_check_mark:", slack: "ライナー予約完了", label: "予約完了" },
  tested: { status: "success", emoji: ":test_tube:", slack: "ライナー予約テスト", label: "テスト" },
  soldOut: { status: "failure", emoji: ":x:", slack: "ライナー予約できず", label: "予約できず" },
  error: { status: "failure", emoji: ":rotating_light:", slack: "ライナー予約エラー", label: "エラー" },
} satisfies Record<string, { status: JobStatus; emoji: string; slack: string; label: string }>;

/**
 * 結果をSlackとダッシュボードに報告する
 *   Slack:          ":white_check_mark: *ライナー予約完了* 11/4(水) 07:10 京王ライナー32号" (+エラー詳細の行)
 *   ダッシュボード: "予約完了 11/4(水) 07:10 京王ライナー32号"
 */
async function report(kind: keyof typeof REPORTS, detail = "", errorMessage?: string) {
  const { status, emoji, slack, label } = REPORTS[kind];
  const body = `${requestLabel()} ${detail}`.trim();
  await notifySlack([`${emoji} *${slack}* ${body}`, ...(errorMessage ? [errorMessage] : [])]);
  await recordJob("reserve_liner", status, `${label} ${body}${errorMessage ? `: ${errorMessage}` : ""}`);
}

// 便の表示内容から列車名(例: 京王ライナー32号)だけを取り出す
function trainName(trainText: string): string {
  return trainText.match(/\S*ライナー\S*号/)?.[0] ?? "";
}

console.log(`予約対象日: ${targetDateStr}`);
console.log(`予約対象便: ${opts.target}発`);

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

async function selectDestinationAndDate(page: Page, destination: string, dateStr: string) {
  console.log("################ 予約選択画面");
  // 目的地
  await page.locator(byId("trainData:destination")).selectOption(destination);

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
// 予約ボタンをクリックできたら便の表示内容(取れなければ空文字)を、maxAttempts回試してもダメならnullを返す
async function waitForAvailableTrainAndReserve(
  page: Page,
  departureTime: string,
  maxAttempts: number,
): Promise<string | null> {
  console.log("################ 空席照会");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 発車時刻のspan(例: "07:10")を持つ便を探す。表示順(index)には依存しない
    const train = page.locator(".train").filter({
      has: page.locator(".trainServiceInfo span", { hasText: new RegExp(`^\\s*${departureTime}\\s*$`) }),
    });

    // 各便には「指定席」と「指定席（立席）」の枠があるため、立席の枠を除外して探す
    const submitButton = train
      .locator(".vacancyInfo")
      .filter({ hasNotText: "立席" })
      .locator(".submitButton");

    try {
      // reload直後は描画がまだのことがあるので、短い猶予だけ持たせて出現を待つ
      await submitButton.waitFor({ state: "visible", timeout: 3000 });
      console.log("条件を満たしました！");
      // 通知用に便の表示内容(発車時刻など)を控えておく。取れなくても予約は続行する
      const trainText = await train
        .innerText({ timeout: 1000 })
        .then((t) => t.replace(/\s+/g, " ").trim())
        .catch(() => "");
      await submitButton.click();
      return trainText;
    } catch {
      console.log(`${attempt}回目: 条件を満たしていません。3秒後に更新します...`);
      await page.reload();
    }
  }

  return null;
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
  try {
    const page = await browser.newPage();

    await openTopPage(page, process.env.KEIO_URL!);
    await login(page, process.env.KEIO_ID!, process.env.KEIO_PASSWORD!);
    await selectDestinationAndDate(page, opts.destination, targetDateStr);

    const trainText = await waitForAvailableTrainAndReserve(page, opts.target, opts.retry);

    if (trainText === null) {
      console.log("タイムアウトしました。条件が満たされませんでした。");
      await report("soldOut", `満席・${opts.retry}回試行`);
      return;
    }

    await selectSeatAutoAllocate(page);
    await confirmPurchase(page, { debug: opts.debug, point: opts.point });

    const name = trainName(trainText);
    await (opts.debug ? report("tested", `${name}（購入なし）`) : report("reserved", name));
  } finally {
    await browser.close();
  }
}

main().catch(async (err) => {
  console.error(err);
  const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
  await report("error", undefined, msg);
  process.exit(1);
});

/**
 * 実行結果の報告: Slack通知と、ジョブ実行状況ダッシュボード(job_status)への記録
 *
 * どちらも workspace 共通のスクリプトを呼ぶだけで、失敗しても本処理は止めない。
 * (reserve_liner と morning_brief で同じ内容のファイルを使っている)
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKSPACE = path.join(os.homedir(), "workspace");
const NOTIFY_SCRIPT = process.env.NOTIFY_SCRIPT ?? path.join(WORKSPACE, "shellscripts/bin/slack/notify_webhook.sh");
const RECORD_SCRIPT = process.env.JOB_STATUS_SCRIPT ?? path.join(WORKSPACE, "job_status/bin/record_job.sh");

export type JobStatus = "success" | "failure" | "warning";

const startedAt = Date.now();

/** スクリプトを実行する。存在しない・失敗した場合は警告を出すだけ */
function runScript(script: string, args: string[], label: string): Promise<string> {
  if (!fs.existsSync(script)) {
    console.warn(`${label}: スクリプトが見つからないためスキップします (${script})`);
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    execFile(script, args, { timeout: 60_000 }, (err, stdout) => {
      if (err) console.warn(`${label}に失敗しました: ${err.message}`);
      resolve(stdout.trim());
    });
  });
}

/** Slackに通知する(1要素=1行) */
export async function notifySlack(lines: string[]): Promise<void> {
  const res = await runScript(NOTIFY_SCRIPT, [lines.join("\n")], "Slack通知");
  if (res && res !== "ok") console.warn(`Slack通知の応答が想定外です: ${res}`);
}

/** ダッシュボードに実行結果を記録する(所要時間はプロセス起動からの秒数) */
export async function recordJob(job: string, status: JobStatus, summary: string): Promise<void> {
  const seconds = String(Math.round((Date.now() - startedAt) / 1000));
  await runScript(RECORD_SCRIPT, [job, status, summary, seconds], "ジョブ記録");
}

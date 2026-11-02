import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 実行結果をダッシュボード(~/workspace/job_status)に記録する。無ければ何もしない
const RECORD_SCRIPT =
  process.env.JOB_STATUS_SCRIPT ?? path.join(os.homedir(), "workspace/job_status/bin/record_job.sh");

const startedAt = Date.now();

export function recordJob(job: string, status: "success" | "failure" | "warning", summary: string): Promise<void> {
  if (!fs.existsSync(RECORD_SCRIPT)) return Promise.resolve();
  const seconds = String(Math.round((Date.now() - startedAt) / 1000));
  return new Promise((resolve) => {
    execFile(RECORD_SCRIPT, [job, status, summary, seconds], { timeout: 30000 }, (err) => {
      if (err) console.warn(`ジョブ記録に失敗しました: ${err.message}`);
      resolve();
    });
  });
}

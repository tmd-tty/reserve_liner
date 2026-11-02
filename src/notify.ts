import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// 他のツール(cross_list など)と同じSlack通知スクリプトを使う
const NOTIFY_SCRIPT =
  process.env.NOTIFY_SCRIPT ?? path.join(os.homedir(), "workspace/shellscripts/bin/slack/notify_webhook.sh");

/**
 * Slackに通知する。通知の失敗で本処理が落ちないよう、エラーはログに出すだけにする。
 *
 * notify_webhook.sh はメッセージをそのままJSON文字列に埋め込むため、
 * ダブルクォートとバックスラッシュを除去し、改行は "\n"(バックスラッシュ+n)に変換して渡す。
 */
export function notifySlack(lines: string[]): Promise<void> {
  const message = lines.map((l) => l.replace(/["\\]/g, "").replace(/\r?\n/g, " ")).join("\\n");

  if (!fs.existsSync(NOTIFY_SCRIPT)) {
    console.warn(`Slack通知スクリプトが見つからないため通知をスキップします: ${NOTIFY_SCRIPT}`);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    execFile(NOTIFY_SCRIPT, [message], { timeout: 15000 }, (err, stdout) => {
      if (err) {
        console.warn(`Slack通知に失敗しました: ${err.message}`);
      } else if (stdout.trim() !== "ok") {
        console.warn(`Slack通知の応答が想定外です: ${stdout.trim()}`);
      }
      resolve();
    });
  });
}

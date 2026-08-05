# 実行方法

```
npm install
npx playwright install chromium
```

```
npm start -- --date 20260602 --retry 200
```

```
npm start -- --date 20260602 --retry 200 --point
```

```
npm start -- --date 20260602 --retry 200 --debug
```

# option

+ `--date yyyymmdd`
  + yyyymmddで予約したい日付を設定
  + デフォルト翌日
+ `--retry 1`
  + リトライ回数を指定
  + デフォルト20(3秒*20回=1分)
+ `--target 0`
  + 予約する便を指定。
    + 0: 05:45
    + 1: 06:18
    + 2: 07:10 (デフォルト)
    + 3: 08:14
    + 4: 08:26
+ `--point`
  + ポイント購入モードで起動(ポイントで支払う)
+ `--debug`
  + デバッグモードで起動(購入を実行せずに終了)


# .envファイル

+ KEIO_URL 対象のURL
+ KEIO_ID= 対象のログインID
+ KEIO_PASSWORD 対象のログインパスワード

# TODO
+ 時間の指定ができるようにする

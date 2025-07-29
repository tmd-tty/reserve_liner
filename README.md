# 実行方法

```
python reserve_liner.py --date 20250602 --retry 1`
```

```
python reserve_liner.py --date 20250602 --retry 1` --debug
```

# option

+ `--date yyyymmdd`
  + yyyymmddで予約したい日付を設定
  + デフォルト実行日
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
+ 画面遷移ごとのログを出力する
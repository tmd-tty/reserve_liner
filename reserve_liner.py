
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
import time
import argparse
from datetime import datetime
import os
from os.path import join, dirname
from dotenv import load_dotenv
 
'''
 
load_dotenv(verbose=True)
 
dotenv_path = join(dirname(__file__), '.env')
load_dotenv(dotenv_path)

today = datetime.today().strftime("%Y%m%d")
print(today)

# 引数で日付を受け取る
parser = argparse.ArgumentParser()
parser.add_argument("--date", help="日付を指定yyyymmdd", default=today)
parser.add_argument("--retry", help="リトライ回数を設定。", type=int, default=20)
parser.add_argument("--target", help="予約する便を指定", type=int, default=2)
parser.add_argument("--debug", action="store_true", help="デバッグモードON")
args = parser.parse_args()


'''

# Chromeのドライバーを指定
driver = webdriver.Chrome()

# 対象のページを開く
driver.get(os.environ.get("KEIO_URL"))

# ページが読み込まれるのを待つ
time.sleep(2)


################ ログイン画面 
driver.find_element(By.ID, "login:userId").send_keys(os.environ.get("KEIO_ID"))
driver.find_element(By.ID, "login:password").send_keys(os.environ.get("KEIO_PASSWORD"))
driver.find_element(By.ID, "login:submit").click()
# driver.find_element(By.CLASS_NAME, "linkButton").click()
time.sleep(2)

################ 予約選択画面 
# 目的地
dropdown2 = Select(driver.find_element(By.ID, "trainData:destination"))
dropdown2.select_by_value("R004")
# 日付
dropdown1 = Select(driver.find_element(By.ID, "trainData:jyoushaDate"))
options = dropdown1.options
for option in options:
    if option.get_attribute('value').startswith(args.date):
        dropdown1.select_by_value(option.get_attribute('value'))
    print(f"表示名: {option.text}, value属性: {option.get_attribute('value')}")
driver.find_element(By.ID, "vacancyButton").click()
time.sleep(2)


# 最大リトライ回数（例：20回 × 3秒 = 最大1分）
max_attempts = args.retry
attempt = 0



while attempt < max_attempts:
    try:
        # 例：特定の要素が存在するかどうか
        
        trains = driver.find_elements(By.CLASS_NAME,"train")
        train = trains[args.target]
        print(f"{train.text}")
        train.find_element(By.CLASS_NAME, "submitButton")
        print("条件を満たしました！")
        train.find_element(By.CLASS_NAME, "submitButton").click()
        break
    except:
        print(f"{attempt+1}回目: 条件を満たしていません。3秒後に更新します...")
        time.sleep(3)
        driver.refresh()
        attempt += 1
        

if attempt == max_attempts:
    print("タイムアウトしました。条件が満たされませんでした。")
    quit()
time.sleep(2)

################ 座席選択画面 
driver.find_element(By.ID, "purchaseSeatSelectMethod:autoAllocateBtn").click()
time.sleep(2)


################ 購入画面 
driver.find_element(By.ID, "purchaseSettlementConfirm:agreement").click()
# 以下で購入確定
if args.debug:
    print("debugモードで終了しました。")
else:
    driver.find_element(By.ID, "purchaseSettlementConfirm:nextPaymentBtn").click()


# 数秒待ってから終了
time.sleep(10)
quit()


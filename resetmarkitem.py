import requests
import base64
import json
import time
import os
import random

CAPTCHA_API_KEY = 'FmaegsApMO/3vZ5dcO8aYw==0TsWexrKeDOUhT8a'

username = 'thanhhai1995'
password = 'Anhhai1995@'

def getImage():
    api_url = 'https://api3.gnddt.com/api/oauth/GetCaptcha'
    imgstring = requests.post(api_url).json()
    imgdata = base64.b64decode(imgstring)
    with open('download.png', 'wb') as f:
        f.write(imgdata)

def getCaptcha(filename):
    api_url = 'https://api.api-ninjas.com/v1/imagetotext'
    headers = {"X-Api-Key": CAPTCHA_API_KEY}
    while True:
        getImage()
        with open(filename, 'rb') as image_file_descriptor:
            files = {'image': image_file_descriptor}
            r = requests.post(api_url, headers=headers, files=files)
        
        try:
            response = r.json()
        except ValueError:
            continue

        if isinstance(response, list) and response and 'text' in response[0] and len(response[0]['text']) >= 4:
            return response[0]['text'].replace('-', '').replace('_', '')
        else:
            time.sleep(1)

def getLoginToken(username, password):
    api_url = 'https://api3.gnddt.com/api/oauth/Token'
    while True:
        getImage()
        Captcha = getCaptcha('download.png')
        myUser = {
            "username": username,
            "password": password,
            "Token": "",
            "msg": "",
            "result": True,
            "Captcha": Captcha
        }
        r = requests.post(api_url, json=myUser)
        response = r.json()

        if response.get('result'):
            break
        else:
            time.sleep(1)

    return response['Token']

def getUserInfo(token):
    api_url = 'https://api3.gnddt.com/api/oauth/GetUserInfo'
    headers = {
        "Authorization": token,
        "Accept": "application/json"
    }
    response = requests.get(api_url, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        return None

def getMarkItem(token, user_id, server_id, curr_page=1):
    api_url = 'https://api3.gnddt.com/api/Function/GetMarkItem'
    data = {
        "UserID": user_id,
        "ServerId": server_id,
        "currPage": curr_page
    }
    headers = {
        "Authorization": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    response = requests.post(api_url, headers=headers, json=data)
    return response.json()

def getMarkItemList(token, user_id, server_id):
    all_item_ids = []
    
    first_page = getMarkItem(token, user_id, server_id, curr_page=1)
    page_model = first_page.get('pageModel', {})
    total_page = page_model.get('totalPage', 1)
    
    print(f"Tổng số trang: {total_page}")
    
    for page in range(1, total_page + 1):
        print(f"Đang lấy trang {page}/{total_page}...")
        
        if page == 1:
            page_data = first_page
        else:
            page_data = getMarkItem(token, user_id, server_id, curr_page=page)
        
        items = page_data.get('items', [])
        for item in items:
            item_id = item.get('ItemId')
            item_name = item.get('Name')
            if item_id:
                all_item_ids.append({
                    "ItemId": item_id,
                    "ItemName": item_name
                })
        
        if page < total_page:
            time.sleep(0.5)
    
    print(f"Tổng số ItemId thu thập được: {len(all_item_ids)}")
    return all_item_ids

def callGetAllMarkItemIds(token, user_id, server_id):
    api_url = 'https://api3.gnddt.com/api/Function/getAllMarkItemIds'
    data = {
        "UserID": user_id,
        "ServerId": server_id
    }
    headers = {
        "Authorization": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    response = requests.post(api_url, headers=headers, json=data)
    print("Đã Reset Vip15")
    return response.json()

def resetMarkItem(token, user_id, server_id, item_id):
    api_url = 'https://api3.gnddt.com/api/Function/ResetMarkItem'
    data = {
        "UserID": user_id,
        "ServerId": server_id,
        "ItemId": item_id
    }
    headers = {
        "Authorization": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    response = requests.post(api_url, headers=headers, json=data)
    return response.json()

def resetAllMarkItems(token, user_id, server_id, all_items):
    total = len(all_items)
    print(f"\nBắt đầu reset {total} ấn...")
    
    for i, item in enumerate(all_items, 1):
        item_id = item.get('ItemId')
        item_name = item.get('ItemName', 'Unknown')
        
        resetMarkItem(token, user_id, server_id, item_id)
        print(f"[{i}/{total}] Reset: {item_name}")
        
        time.sleep(0.3)
    
    print(f"\nĐã reset {total} ấn thành công!")

def main():
    token = getLoginToken(username, password)
    user_info = getUserInfo(token)['UserInfo']
    user_id = user_info['UserIdDefault']
    server_id = user_info['ServerIdDefault']
    
    all_items = getMarkItemList(token, user_id, server_id)
    
    if not all_items:
        print("Danh sách rỗng, đang gọi API getAllMarkItemIds...")
        callGetAllMarkItemIds(token, user_id, server_id)
        all_items = getMarkItemList(token, user_id, server_id)
    
    print(f"Danh sách Ấn: {[item['ItemName'] for item in all_items]}")
    
    if all_items:
        resetAllMarkItems(token, user_id, server_id, all_items)

if __name__ == "__main__":
    main()
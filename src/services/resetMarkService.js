import { getLoginToken } from './apiService.js';

export async function getMarkItem(token, userId, serverId, currPage = 1) {
    const apiUrl = 'https://api3.gnddt.com/api/Function/GetMarkItem';
    const data = {
        UserID: userId,
        ServerId: serverId,
        currPage: currPage
    };
    
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    return await res.json();
}

export async function getMarkItemList(token, userId, serverId) {
    const allItemIds = [];
    
    const firstPage = await getMarkItem(token, userId, serverId, 1);
    const totalPage = firstPage?.pageModel?.totalPage || 1;
    
    for (let page = 1; page <= totalPage; page++) {
        let pageData = page === 1 ? firstPage : await getMarkItem(token, userId, serverId, page);
        
        const items = pageData?.items || [];
        for (const item of items) {
            if (item.ItemId) {
                allItemIds.push({
                    ItemId: item.ItemId,
                    ItemName: item.Name || 'Unknown'
                });
            }
        }
        
        if (page < totalPage) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return allItemIds;
}

export async function callGetAllMarkItemIds(token, userId, serverId) {
    const apiUrl = 'https://api3.gnddt.com/api/Function/getAllMarkItemIds';
    const data = {
        UserID: userId,
        ServerId: serverId
    };
    
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    console.log(`[ResetMark] Đã Trigger getAllMarkItemIds`);
    return await res.json();
}

export async function callResetAllMarkItem(token, userId, serverId) {
    const apiUrl = 'https://api3.gnddt.com/api/Function/ResetAllMarkItem';
    const data = {
        currPage: 1,
        rowPage: 10,
        totalPage: 2,
        ServerId: serverId,
        UserId: userId,
        Otp: "",
        ItemId: 0
    };
    
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    console.log(`[ResetMark] Đã Trigger Reset Vip15 (ResetAllMarkItem)`);
    return await res.json();
}

export async function resetMarkItem(token, userId, serverId, itemId) {
    const apiUrl = 'https://api3.gnddt.com/api/Function/ResetMarkItem';
    const data = {
        UserID: userId,
        ServerId: serverId,
        ItemId: itemId
    };
    
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    return await res.json();
}

export async function startResetMark(accounts, onProgress, checkStop) {
    if (onProgress) onProgress({ message: 'Bắt đầu quá trình reset ấn...' });

    const accTotal = accounts.length;

    for (let i = 0; i < accTotal; i++) {
        if (checkStop && checkStop()) break;

        const account = accounts[i];
        const accCurrent = i + 1;

        if (onProgress) onProgress({
            message: `Đang đăng nhập tài khoản ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        const loginAccount = await getLoginToken(account.username, account.password, checkStop);
        if (!loginAccount) {
            if (checkStop && checkStop()) break;
            if (onProgress) onProgress({
                message: `❌ Đăng nhập thất bại: ${account.username}`,
                accCurrent, accTotal, username: account.username
            });
            continue;
        }

        const { token, serverId, userId } = loginAccount;

        if (onProgress) onProgress({
            message: `Đang tải danh sách Ấn cho ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        let allItems = await getMarkItemList(token, userId, serverId);
        
        if (!allItems || allItems.length === 0) {
            if (onProgress) onProgress({
                message: `Danh sách rỗng, đang gọi API getAllMarkItemIds...`,
                accCurrent, accTotal, username: account.username
            });
            await callGetAllMarkItemIds(token, userId, serverId);
            allItems = await getMarkItemList(token, userId, serverId);
            
            if (!allItems || allItems.length === 0) {
                if (onProgress) onProgress({
                    message: `Danh sách vẫn rỗng, tiến hành ResetAllMarkItem (Vip15)...`,
                    accCurrent, accTotal, username: account.username
                });
                await callResetAllMarkItem(token, userId, serverId);
                await callGetAllMarkItemIds(token, userId, serverId);
                allItems = await getMarkItemList(token, userId, serverId);
            }
        }

        if (!allItems || allItems.length === 0) {
            if (onProgress) onProgress({
                message: `❌ Không lấy được danh sách Ấn cho ${account.username}`,
                accCurrent, accTotal, username: account.username
            });
            continue;
        }

        const itemTotal = allItems.length;
        
        for (let j = 0; j < itemTotal; j++) {
            if (checkStop && checkStop()) break;

            const item = allItems[j];
            const itemCurrent = j + 1;

            if (onProgress) onProgress({
                message: `Đang reset: ${item.ItemName}...`,
                accCurrent, accTotal, username: account.username,
                codeCurrent: itemCurrent, codeTotal: itemTotal // Map "item" logic onto "code" UI
            });

            try {
                await resetMarkItem(token, userId, serverId, item.ItemId);
            } catch (err) {
                console.log(`[ResetMark] Lỗi reset item ${item.ItemName}: ${err.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (onProgress && !(checkStop && checkStop())) {
             onProgress({
                message: `✅ Đã reset thành công ${itemTotal} ấn cho ${account.username}`,
                accCurrent, accTotal, username: account.username,
                codeCurrent: itemTotal, codeTotal: itemTotal
            });
        }
    }

    if (onProgress) {
        if (checkStop && checkStop()) {
            onProgress({ message: '🛑 Đã dừng tiến trình theo yêu cầu.' });
        } else {
            onProgress({ message: '✅ Đã hoàn thành quá trình reset ấn cho tất cả tài khoản.' });
        }
    }
}

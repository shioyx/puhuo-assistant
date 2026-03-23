'use strict';

// ══════════════════════════════════════════════
// 点插件图标 → 打开/切换到独立全页标签
// ══════════════════════════════════════════════
const PANEL_URL = chrome.runtime.getURL('panel/panel.html');

chrome.action.onClicked.addListener(async (tab) => {
  // 找已有的铺货助手标签，有就切换过去
  const existing = await chrome.tabs.query({ url: PANEL_URL });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
    return;
  }
  // 没有就新开一个
  chrome.tabs.create({ url: PANEL_URL, active: true });
});

// ══════════════════════════════════════════════
// 消息路由
// ══════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(e => sendResponse({ ok:false, error:e.message }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    // ── 采集当前1688页 ──
    case 'SCRAPE_LIST': {
      const tab = await getActive1688Tab();
      if (!tab) return { ok:false, error:'请先在左侧1688内嵌浏览器打开搜索结果页' };
      return await sendToTab(tab.id, { type:'SCRAPE_LIST' });
    }

    // ── 采集当前1688详情页 ──
    case 'SCRAPE_DETAIL': {
      const tab = await getActive1688Tab();
      if (!tab) return { ok:false, error:'请先在左侧1688内嵌浏览器打开商品详情页' };
      return await sendToTab(tab.id, { type:'SCRAPE_DETAIL' });
    }

    // ── 从content_1688浮动按钮直接采集（存入storage） ──
    case 'ADD_TO_BOX': {
      const r = await chrome.storage.local.get(['puhuo5_data']);
      const data = r.puhuo5_data || { products:[], history:[], settings:{}, templates:[] };
      const p = msg.product;
      if (!data.products.find(x => x.offerId === p.offerId)) {
        data.products.unshift({ ...p, id:genId(), addedAt:p.addedAt||new Date().toISOString() });
        await chrome.storage.local.set({ puhuo5_data: data });
      }
      // 通知铺货助手页面刷新
      notifyPanel('BOX_UPDATED', { count: data.products.length });
      return { ok:true, total: data.products.length };
    }

    // ── 打开抖店发布页并自动填写 ──
    case 'FILL_DOUYIN': {
      const url = 'https://fxg.jinritemai.com/ffa/g/create';
      const tabs = await chrome.tabs.query({ url: 'https://fxg.jinritemai.com/*' });
      let dyTab = tabs.find(t => t.url?.includes('/ffa/g/create'));
      if (!dyTab) {
        dyTab = await chrome.tabs.create({ url, active: true });
        await waitTabLoad(dyTab.id, 8000);
      } else {
        await chrome.tabs.update(dyTab.id, { active: true });
      }
      await sleep(1500);
      return await sendToTab(dyTab.id, { type:'FILL_FORM', data: msg.data });
    }

    // ── 解析商品链接 ──
    case 'FETCH_DETAIL': {
      try {
        const resp = await fetch(msg.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await resp.text();
        return { ok:true, product: extractFromHtml(html, msg.url) };
      } catch(e) { return { ok:false, error:e.message }; }
    }

    // ── 标签页导航（在内嵌iframe里打开URL） ──
    case 'NAVIGATE_1688': {
      // 找已打开的1688标签
      const tabs = await chrome.tabs.query({ url: 'https://*.1688.com/*' });
      if (tabs.length) {
        await chrome.tabs.update(tabs[0].id, { url: msg.url, active: true });
      } else {
        await chrome.tabs.create({ url: msg.url });
      }
      return { ok:true };
    }

    // ── Storage ──
    case 'STORAGE_GET': {
      const d = await chrome.storage.local.get(msg.keys);
      return { ok:true, data:d };
    }
    case 'STORAGE_SET': {
      await chrome.storage.local.set(msg.data);
      return { ok:true };
    }
    case 'PING':
      return { ok:true, version: chrome.runtime.getManifest().version };
  }
  return { ok:false, error:'unknown: ' + msg.type };
}

// 通知铺货助手主页面
async function notifyPanel(type, data) {
  const tabs = await chrome.tabs.query({ url: PANEL_URL });
  tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type, ...data }).catch(()=>{}));
}

async function getActive1688Tab() {
  // 优先找活跃的1688标签
  const active = await chrome.tabs.query({ active:true, currentWindow:true });
  if (active[0]?.url?.includes('1688.com')) return active[0];
  const all = await chrome.tabs.query({ url:'https://*.1688.com/*' });
  return all[0] || null;
}

async function sendToTab(tabId, msg, timeout=8000) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ ok:false, error:'超时，请刷新页面重试' }), timeout);
    chrome.tabs.sendMessage(tabId, msg, r => {
      clearTimeout(t);
      resolve(chrome.runtime.lastError ? { ok:false, error:chrome.runtime.lastError.message } : (r||{ ok:false }));
    });
  });
}

async function waitTabLoad(tabId, timeout=8000) {
  return new Promise(resolve => {
    const end = Date.now()+timeout;
    const check = () => chrome.tabs.get(tabId, t => {
      if (t?.status==='complete') { resolve(t); return; }
      if (Date.now()<end) setTimeout(check,300); else resolve(null);
    });
    check();
  });
}

function extractFromHtml(html, url) {
  const offerId = url.match(/offer\/(\d+)/)?.[1] || '';
  let title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(/\s*[-–|]\s*阿里巴巴.*$/,'').trim() || '';
  let price = 0;
  const pm = html.match(/1件价格[^\d]*([\d.]+)/) || html.match(/"priceInfo":\{"price":"([\d.]+)"/) || html.match(/"defaultItemPrice":"([\d.]+)"/);
  if (pm) price = parseFloat(pm[1]);
  const imgs = [];
  const imgM = html.match(/"imageList":\[([^\]]+)\]/);
  if (imgM) { const us = imgM[1].match(/https?:\/\/[^"'\s]+\.(?:jpg|png)/gi)||[]; imgs.push(...us.slice(0,8)); }
  return { offerId, url, title:title.substring(0,60), price, images:imgs, supplierName:'', monthlySales:'', moq:1 };
}

function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// Badge 显示采集箱数量
async function updateBadge() {
  try {
    const r = await chrome.storage.local.get(['puhuo5_data']);
    const n = r.puhuo5_data?.products?.length||0;
    chrome.action.setBadgeText({ text: n>0?String(n):'' });
    chrome.action.setBadgeBackgroundColor({ color:'#165DFF' });
  } catch(e) {}
}
chrome.storage.onChanged.addListener(updateBadge);
updateBadge();

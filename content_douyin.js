/**
 * content_douyin.js — 注入抖店后台
 * 自动填写商品发布页面 + 批量改价 + 管理已上架商品
 */
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch(msg.type) {
    case 'FILL_FORM':    fillGoodsForm(msg.data).then(sendResponse);  return true;
    case 'BATCH_PRICE':  batchPrice(msg.data).then(sendResponse);     return true;
    case 'GET_GOODS':    getGoodsList().then(sendResponse);            return true;
    case 'PING':         sendResponse({ ok:true, url:location.href }); return false;
  }
});

// ══════════════════════════════════════════════
// 填写商品发布表单
// ══════════════════════════════════════════════
async function fillGoodsForm(data) {
  const url = location.href;
  
  // 确认在发布页
  if (!url.includes('/ffa/g/create') && !url.includes('/ffa/mshop/goods/create') &&
      !url.includes('goods/create') && !url.includes('g/edit')) {
    return { ok:false, error:'请先打开抖店商品发布页面 (fxg.jinritemai.com/ffa/g/create)' };
  }

  const log = [];
  let filled = 0;

  try {
    await sleep(800);

    // ── 1. 商品标题 ──
    if (data.title) {
      const titleInput = await waitForElement([
        'input[placeholder*="标题"]',
        'input[placeholder*="商品名"]', 
        'input[data-testid="title"]',
        '.goods-title input',
        '[class*="title-input"] input',
        'input[maxlength="60"]',
        'input[maxlength="40"]',
      ]);
      if (titleInput) {
        await fillReactInput(titleInput, data.title.substring(0, 60));
        filled++; log.push('标题✓');
      }
    }

    await sleep(300);

    // ── 2. 主图 ──
    // 抖店主图需要上传，通过拖拽或粘贴URL
    // 如果有图片URL，尝试通过剪贴板粘贴
    if (data.images?.length) {
      // 先找主图上传区
      const uploadArea = document.querySelector(
        '[class*="main-image"] [class*="upload"], [class*="goods-image"] [class*="upload-btn"], ' +
        '[class*="imageUpload"], [class*="cover-upload"]'
      );
      if (uploadArea) {
        log.push(`主图区已找到（${data.images.length}张图）`);
        // 注意：跨域图片无法直接通过input[type=file]填写
        // 实际使用时需要先下载图片到本地再上传
      }
    }

    // ── 3. 类目 ──
    // 类目选择需要交互，暂时跳过
    log.push('类目需手动选择');

    // ── 4. 售价 ──
    if (data.sellPrice) {
      await sleep(200);
      const priceInputs = document.querySelectorAll(
        'input[placeholder*="价格"], input[placeholder*="售价"], ' +
        '[class*="price"] input[type="number"], [class*="price-input"] input'
      );
      let priceSet = false;
      for (const inp of priceInputs) {
        const label = getLabel(inp);
        if (label?.includes('划线') || label?.includes('市场') || label?.includes('原价')) continue;
        if (!priceSet && inp.type === 'number' || inp.inputMode === 'decimal') {
          await fillReactInput(inp, String(data.sellPrice));
          filled++; priceSet = true; log.push('售价✓');
          break;
        }
      }
    }

    // ── 5. 划线原价 ──
    if (data.origPrice && data.origPrice > data.sellPrice) {
      const origInputs = document.querySelectorAll('input[placeholder*="划线"], input[placeholder*="市场价"], input[placeholder*="原价"]');
      for (const inp of origInputs) {
        await fillReactInput(inp, String(data.origPrice));
        filled++; log.push('划线价✓'); break;
      }
    }

    // ── 6. 库存 ──
    if (data.stock) {
      const stockInputs = document.querySelectorAll('input[placeholder*="库存"], [class*="stock"] input');
      for (const inp of stockInputs) {
        await fillReactInput(inp, String(data.stock || 999));
        filled++; log.push('库存✓'); break;
      }
    }

    // ── 7. 商品描述 ──
    if (data.desc) {
      await sleep(200);
      const descArea = document.querySelector(
        'textarea[placeholder*="描述"], textarea[placeholder*="卖点"], ' +
        '[contenteditable="true"][class*="desc"], [class*="description"] textarea'
      );
      if (descArea) {
        await fillTextarea(descArea, data.desc);
        filled++; log.push('描述✓');
      }
    }

    return {
      ok: true,
      filled,
      log,
      message: `已自动填写 ${filled} 个字段：${log.join('、')}`
    };
  } catch (e) {
    return { ok: false, error: e.message, filled, log };
  }
}

// ══════════════════════════════════════════════
// 批量改价（在商品列表页操作）
// ══════════════════════════════════════════════
async function batchPrice(data) {
  if (!location.href.includes('/ffa/g/list') && !location.href.includes('goods/list')) {
    return { ok:false, error:'请先打开商品管理页面 (fxg.jinritemai.com/ffa/g/list)' };
  }

  const { productIds, newPrice, priceType } = data;
  if (!productIds?.length) return { ok:false, error:'没有商品ID' };

  let done = 0;
  // 对每个商品ID，找到对应行并操作
  for (const pid of productIds) {
    const row = document.querySelector(`[data-id="${pid}"], tr:has([data-product-id="${pid}"])`);
    if (!row) continue;
    
    const editBtn = row.querySelector('button:contains("编辑"), [class*="edit-btn"]');
    if (editBtn) {
      editBtn.click();
      await sleep(500);
      // 填写价格
      const priceInp = document.querySelector('input[placeholder*="售价"], [class*="price"] input');
      if (priceInp) {
        await fillReactInput(priceInp, String(newPrice));
        await sleep(200);
        const saveBtn = document.querySelector('button:contains("保存"), [class*="save-btn"]');
        if (saveBtn) { saveBtn.click(); await sleep(300); done++; }
      }
    }
  }
  return { ok:true, done, total: productIds.length };
}

// ══════════════════════════════════════════════
// 获取已上架商品列表
// ══════════════════════════════════════════════
async function getGoodsList() {
  if (!location.href.includes('/ffa/g/list') && !location.href.includes('goods/list')) {
    return { ok:false, error:'请先打开商品管理页面' };
  }

  const items = [];
  // 抖店商品列表行
  const rows = document.querySelectorAll(
    'table tbody tr, [class*="goods-list"] [class*="row"], [class*="list-item"]'
  );
  
  rows.forEach(row => {
    const titleEl = row.querySelector('[class*="title"], [class*="name"] a, td:nth-child(2) a');
    const priceEl = row.querySelector('[class*="price"], td:nth-child(3)');
    const idEl = row.querySelector('[class*="id"], [data-product-id]');
    const imgEl = row.querySelector('img');
    const statusEl = row.querySelector('[class*="status"], td:nth-child(4)');

    const title = titleEl?.textContent?.trim();
    if (!title) return;
    
    items.push({
      id: idEl?.textContent?.trim() || idEl?.dataset?.productId || '',
      title: title.substring(0, 50),
      price: parseFloat(priceEl?.textContent?.replace(/[^\d.]/g,'') || '0'),
      image: imgEl?.src || '',
      status: statusEl?.textContent?.trim() || '',
    });
  });

  return { ok:true, items, total: items.length, pageUrl: location.href };
}

// ══════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════
async function fillReactInput(el, value) {
  el.focus();
  
  // 选中全部
  el.select?.();
  document.execCommand('selectAll');
  
  // 通过 nativeInputValueSetter 设置值（兼容React）
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  // 触发所有必要事件
  ['focus', 'input', 'change', 'blur'].forEach(evt => {
    el.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
  });
  // React 需要的合成事件
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
  
  await sleep(100);
}

async function fillTextarea(el, value) {
  await fillReactInput(el, value);
}

function getLabel(input) {
  // 找 input 关联的 label 文字
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent;
  }
  // 找最近的 label 祖先或兄弟
  let el = input;
  for (let i = 0; i < 5; i++) {
    el = el.parentElement;
    if (!el) break;
    const label = el.querySelector('label, [class*="label"]');
    if (label) return label.textContent;
  }
  return '';
}

async function waitForElement(selectors, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && isVisible(el)) return el;
    }
    await sleep(200);
  }
  return null;
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 注入页面提示（告知用户插件已就绪）
function injectReadyTip() {
  if (!location.href.includes('fxg.jinritemai.com')) return;
  if (document.getElementById('puhuo-tip')) return;

  const tip = document.createElement('div');
  tip.id = 'puhuo-tip';
  tip.style.cssText = `
    position:fixed;bottom:16px;right:16px;z-index:99999;
    background:linear-gradient(135deg,#165DFF,#0E42D2);color:#fff;
    border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;
    box-shadow:0 4px 12px rgba(22,93,255,.35);pointer-events:none;
    display:flex;align-items:center;gap:6px;
  `;
  tip.innerHTML = '<span>🛍️</span><span>铺货助手已连接</span>';
  document.body.appendChild(tip);
  setTimeout(() => { tip.style.opacity='0'; tip.style.transition='opacity .5s'; }, 3000);
  setTimeout(() => tip.remove(), 3600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectReadyTip);
} else {
  setTimeout(injectReadyTip, 500);
}

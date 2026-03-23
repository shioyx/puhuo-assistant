/**
 * content_1688.js — 注入1688页面（搜索页 + 详情页）
 * 精确选择器，基于实际DOM结构测试
 */
'use strict';

// ══════════════════════════════════════════════
// 消息监听
// ══════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_LIST')   { sendResponse(scrapeListPage());   return false; }
  if (msg.type === 'SCRAPE_DETAIL') { sendResponse(scrapeDetailPage()); return false; }
  if (msg.type === 'SCRAPE_CURRENT_DETAIL') {
    // 在当前详情页提取数据（用于一键采集按钮）
    sendResponse(scrapeDetailPage());
    return false;
  }
});

// ══════════════════════════════════════════════
// 注入浮动采集按钮（详情页）
// ══════════════════════════════════════════════
function injectDetailButton() {
  if (!location.href.includes('detail.1688.com/offer/')) return;
  if (document.getElementById('puhuo-btn')) return;

  const btn = document.createElement('div');
  btn.id = 'puhuo-btn';
  btn.style.cssText = `
    position:fixed;bottom:120px;right:16px;z-index:99999;
    background:linear-gradient(135deg,#165DFF,#0E42D2);color:#fff;
    border-radius:10px;padding:10px 14px;cursor:pointer;
    font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(22,93,255,.4);
    display:flex;flex-direction:column;align-items:center;gap:2px;
    min-width:52px;text-align:center;user-select:none;
    transition:transform .15s,box-shadow .15s;
  `;
  btn.innerHTML = '<span style="font-size:18px">🛒</span><span style="font-size:11px;line-height:1.2">一键<br>采集</span>';
  btn.onmouseenter = () => { btn.style.transform='scale(1.05)'; btn.style.boxShadow='0 6px 20px rgba(22,93,255,.5)'; };
  btn.onmouseleave = () => { btn.style.transform=''; btn.style.boxShadow='0 4px 16px rgba(22,93,255,.4)'; };
  btn.onclick = async () => {
    btn.innerHTML = '<span style="font-size:14px">⏳</span><span style="font-size:10px">采集中</span>';
    const data = scrapeDetailPage();
    if (data.ok) {
      chrome.runtime.sendMessage({ type: 'ADD_TO_BOX', product: data.product }, (r) => {
        if (r?.ok) {
          btn.innerHTML = '<span style="font-size:14px">✅</span><span style="font-size:10px">已采集</span>';
          btn.style.background = 'linear-gradient(135deg,#00B42A,#009922)';
        } else {
          btn.innerHTML = '<span style="font-size:14px">❌</span><span style="font-size:10px">失败</span>';
          btn.style.background = 'linear-gradient(135deg,#F53F3F,#cc3333)';
        }
        setTimeout(() => {
          btn.innerHTML = '<span style="font-size:18px">🛒</span><span style="font-size:11px;line-height:1.2">一键<br>采集</span>';
          btn.style.background = 'linear-gradient(135deg,#165DFF,#0E42D2)';
        }, 2500);
      });
    } else {
      btn.innerHTML = '<span style="font-size:14px">❌</span><span style="font-size:10px">失败</span>';
      setTimeout(() => {
        btn.innerHTML = '<span style="font-size:18px">🛒</span><span style="font-size:11px;line-height:1.2">一键<br>采集</span>';
      }, 2000);
    }
  };
  document.body.appendChild(btn);
}

// ══════════════════════════════════════════════
// 注入搜索页批量采集UI
// ══════════════════════════════════════════════
function injectListUI() {
  if (!location.href.includes('s.1688.com') && !location.href.includes('offer_search')) return;
  if (document.getElementById('puhuo-bar')) return;

  // 在每个商品卡片上添加采集按钮
  addCardButtons();

  // 监听动态加载
  const observer = new MutationObserver(() => addCardButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

function addCardButtons() {
  // 1688新版卡片：class="search-offer-wrapper cardui-normal search-offer-it"
  const cards = document.querySelectorAll(
    '.search-offer-wrapper, [class*="space-offer-card"], [class*="offer-card-wrapper"]'
  );
  
  cards.forEach(card => {
    if (card.querySelector('.puhuo-collect-btn')) return;
    
    // 找offerId
    const link = card.querySelector('a[href*="offerId="]');
    if (!link) return;
    const offerId = link.href.match(/offerId=(\d+)/)?.[1];
    if (!offerId) return;

    const btn = document.createElement('button');
    btn.className = 'puhuo-collect-btn';
    btn.style.cssText = `
      position:absolute;bottom:6px;right:6px;z-index:100;
      background:#165DFF;color:#fff;border:none;border-radius:6px;
      padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;
      opacity:0;transition:opacity .15s;white-space:nowrap;
      box-shadow:0 2px 8px rgba(22,93,255,.4);
    `;
    btn.textContent = '+ 采集';
    
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(btn);
    card.onmouseenter = () => { btn.style.opacity = '1'; };
    card.onmouseleave = () => { btn.style.opacity = '0'; };
    
    btn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.textContent = '采集中...'; btn.disabled = true;
      
      const product = extractCardData(card, offerId);
      chrome.runtime.sendMessage({ type: 'ADD_TO_BOX', product }, (r) => {
        if (r?.ok) {
          btn.textContent = '✓ 已采集';
          btn.style.background = '#00B42A';
        } else {
          btn.textContent = '+ 采集'; btn.disabled = false;
          btn.style.background = '#165DFF';
        }
      });
    };
  });
}

function extractCardData(card, offerId) {
  // 标题：从 link title 或 aria-label 或 img alt 或内部文字提取
  const titleLink = card.querySelector('a[href*="offerId="]');
  let title = titleLink?.getAttribute('title') || titleLink?.getAttribute('aria-label') || '';
  
  if (!title) {
    // 从卡片文字中提取（过滤掉供应商名、价格等）
    const spans = card.querySelectorAll('[class*="title"] *');
    for (const s of spans) {
      const t = s.textContent?.trim();
      if (t && t.length > 8 && t.length < 80 && !/^\d|¥|件$/.test(t)) { title = t; break; }
    }
  }
  
  // 价格
  let price = 0;
  const priceEl = card.querySelector('[class*="price"]');
  if (priceEl) {
    const nums = priceEl.textContent.replace(/[^\d.]/g,' ').trim().split(/\s+/).filter(n=>/^\d+(\.\d+)?$/.test(n));
    price = parseFloat(nums[0] || '0');
  }
  
  // 图片（找高清，修复截断URL）
  const fixUrl = (s) => {
    if (!s || !s.includes('alicdn.com')) return null;
    return s.replace(/_\d+x\d+q\d+\.jpg/,'.jpg').replace(/_\d+x\d+\.jpg/,'.jpg')
            .replace(/\.jpg_\d+x\d+\.jpg/,'.jpg').replace(/!tplv-[^&"']+/,'')
            .replace(/\.jp$/,'.jpg').replace(/\.pn$/,'.png')
            .replace(/^\/\//,'https://');
  };
  const imgs = [];
  card.querySelectorAll('img').forEach(img => {
    const raw = img.src || img.dataset.src || img.getAttribute('data-lazy-src') || img.getAttribute('data-src') || '';
    const hd = fixUrl(raw);
    if (hd && !hd.includes('50x50') && !hd.includes('icon') && !imgs.includes(hd)) imgs.push(hd);
  });

  // 供应商
  let supplier = '';
  const shopLinks = card.querySelectorAll('a[href*=".1688.com"]:not([href*="detail.1688"])');
  for (const sl of shopLinks) {
    const t = sl.textContent?.trim();
    if (t && t.length > 2 && t.length < 30 && !t.includes('联系') && !t.includes('点此')) {
      supplier = t; break;
    }
  }

  // 销量
  let sales = '';
  card.querySelectorAll('*').forEach(el => {
    if (el.childNodes.length === 1) {
      const t = el.textContent?.trim();
      if (t && /[万千百]?\d+\+?[件条个]/.test(t) && t.length < 20) sales = t;
    }
  });

  // 月销量数字
  let moq = 1;
  card.querySelectorAll('*').forEach(el => {
    if (el.childNodes.length === 1) {
      const t = el.textContent?.trim();
      if (t && /^\d+件起/.test(t)) moq = parseInt(t);
    }
  });

  return {
    offerId,
    url: `https://detail.1688.com/offer/${offerId}.html`,
    title: title.substring(0, 60) || `1688商品${offerId}`,
    price,
    image: imgs[0] || '',
    images: [...new Set(imgs)].slice(0, 8),
    supplierName: supplier,
    monthlySales: sales,
    moq,
    addedAt: new Date().toISOString(),
    source: 'list',
  };
}

// ══════════════════════════════════════════════
// 采集搜索结果页所有商品
// ══════════════════════════════════════════════
function scrapeListPage() {
  try {
    const items = [];
    const seen = new Set();
    
    // 1688新版：卡片选择器
    const cards = document.querySelectorAll(
      '.search-offer-wrapper, [class*="space-offer-card"], .offer-list-comp [class*="item"]'
    );

    cards.forEach(card => {
      const link = card.querySelector('a[href*="offerId="]');
      if (!link) return;
      const offerId = link.href.match(/offerId=(\d+)/)?.[1];
      if (!offerId || seen.has(offerId)) return;
      seen.add(offerId);
      items.push(extractCardData(card, offerId));
    });

    // Fallback：直接从所有 offerId 链接提取
    if (items.length === 0) {
      document.querySelectorAll('a[href*="offerId="]').forEach(link => {
        const offerId = link.href.match(/offerId=(\d+)/)?.[1];
        if (!offerId || seen.has(offerId)) return;
        seen.add(offerId);
        let card = link;
        for (let i = 0; i < 8; i++) {
          card = card.parentElement;
          if (!card) break;
          if (card.querySelector('img') && card.querySelector('[class*="price"]')) break;
        }
        if (card) items.push(extractCardData(card, offerId));
      });
    }

    return { ok: true, items, total: items.length, pageUrl: location.href };
  } catch (e) {
    return { ok: false, error: e.message, items: [] };
  }
}

// ══════════════════════════════════════════════
// 采集详情页完整商品信息
// ══════════════════════════════════════════════
function scrapeDetailPage() {
  try {
    if (!location.href.includes('detail.1688.com/offer/') && !location.href.includes('detail.m.1688.com')) {
      return { ok: false, error: '请在1688商品详情页使用此功能' };
    }

    const offerId = location.pathname.match(/offer\/(\d+)/)?.[1] ||
                    new URLSearchParams(location.search).get('offerId') || '';

    // ── 标题（优先用页面title，去掉" - 阿里巴巴"） ──
    let title = document.title.replace(/\s*[-–]\s*阿里巴巴.*$/,'').trim();
    if (!title || title.length < 5) {
      // fallback: 找第二个h1（第一个是店铺名）
      const h1s = document.querySelectorAll('h1');
      for (const h of h1s) {
        const t = h.textContent?.trim();
        if (t && t.length > 8 && !t.match(/^[^\u4e00-\u9fa5]+$/)) { // 包含中文
          title = t; break;
        }
      }
    }

    // ── 价格（优先"密文代发"区域的"1件价格"） ──
    let price = 0;
    const bodyText = document.body.innerText;
    const priceMatch1 = bodyText.match(/1件价格[^¥￥]*[¥￥]\s*([\d.]+)/);
    const priceMatch2 = bodyText.match(/密文代发[^¥￥\n]*[¥￥]\s*([\d.]+)/);
    if (priceMatch1) price = parseFloat(priceMatch1[1]);
    else if (priceMatch2) price = parseFloat(priceMatch2[1]);
    else {
      // fallback：最小价格
      const priceEls = document.querySelectorAll('[class*="price"]');
      for (const el of priceEls) {
        const nums = el.textContent.replace(/[^\d.]/g,' ').trim().split(/\s+/)
          .filter(n => /^\d+(\.\d+)?$/.test(n) && parseFloat(n) > 0 && parseFloat(n) < 10000);
        if (nums.length) { price = parseFloat(nums[0]); break; }
      }
    }

    // ── 供应商名称 ──
    const shopH1 = document.querySelector('h1');
    const supplierName = shopH1?.textContent?.trim() || 
      document.querySelector('[class*="company-name"], [class*="shop-name"] h1')?.textContent?.trim() || '';

    // ── 店铺年限 ──
    const shopYearMatch = bodyText.match(/入驻(\d+)年/);
    const shopYears = shopYearMatch ? shopYearMatch[1] + '年' : '';

    // ── 月销量 ──
    const salesMatch = bodyText.match(/已售([\d.万千百]+\+?[件条个个])/);
    const monthlySales = salesMatch ? salesMatch[1] : '';

    // ── 主图（缩略图列表 + window.__INIT_DATA__ 数据源） ──
    const mainImgs = [];

    // 优先从页面 JS 数据中提取（最完整，不依赖DOM懒加载）
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const t = s.textContent || '';
        // 匹配 "imageList":[{"url":"xxx"}] 格式
        const m = t.match(/"imageList"\s*:\s*(\[.*?\])/);
        if (m) {
          JSON.parse(m[1]).forEach(item => {
            const url = item.url || item.imageUrl || '';
            if (url && url.includes('alicdn.com') && !mainImgs.includes(url)) {
              mainImgs.push(url.startsWith('//') ? 'https:'+url : url);
            }
          });
          break;
        }
      }
    } catch(e) {}

    // Fallback：从缩略图列表提取
    if (mainImgs.length === 0) {
      const imgList = document.querySelector(
        'ul[class*="thumbnail"], ul[class*="gallery-list"], [class*="image-list"] ul, [class*="left-image"] ul'
      );
      const src2imgs = (src) => {
        if (!src || !src.includes('alicdn.com')) return null;
        return src
          .replace(/_\d+x\d+q\d+\.jpg/, '.jpg').replace(/_\d+x\d+\.jpg/, '.jpg')
          .replace(/\.jpg_\d+x\d+\.jpg/, '.jpg').replace(/\?x-oss-process=.*$/, '')
          .replace(/\.jp$/, '.jpg').replace(/\.pn$/, '.png')
          .replace(/^(\/\/)/, 'https://');
      };
      if (imgList) {
        imgList.querySelectorAll('img').forEach(img => {
          const src = img.src || img.dataset.src || img.getAttribute('data-lazy-src') || '';
          const fixed = src2imgs(src);
          if (fixed && !mainImgs.includes(fixed)) mainImgs.push(fixed);
        });
      }
      // 再找页面大图
      if (mainImgs.length === 0) {
        document.querySelectorAll('[class*="gallery"] img, [class*="detail-left"] img').forEach(img => {
          const src = img.src || img.dataset.src || '';
          const fixed = src2imgs(src);
          if (fixed && !mainImgs.includes(fixed) && !src.includes('50x50')) mainImgs.push(fixed);
        });
      }
    }
    // Fallback：找页面所有大图
    if (mainImgs.length === 0) {
      document.querySelectorAll(
        '[class*="gallery"] img:not([class*="icon"]):not([class*="logo"]), ' +
        '[class*="detail-left"] img, [class*="main-image"] img'
      ).forEach(img => {
        let src = img.src || '';
        if (src && src.includes('alicdn.com') && !src.includes('50x50') && !src.includes('_logo'))
          if (!mainImgs.includes(src)) mainImgs.push(src);
      });
    }

    // ── 详情图 ──
    const detailImgs = [];
    // 触发懒加载区域
    const descArea = document.querySelector(
      '[class*="desc-area"], [id*="desc"], [class*="detail-desc"], [class*="description"]'
    );
    if (descArea) {
      descArea.querySelectorAll('img').forEach(img => {
        const src = img.src || img.dataset.src || img.getAttribute('data-lazy') || '';
        if (src && src.includes('alicdn.com') && !detailImgs.includes(src)) detailImgs.push(src);
      });
    }

    // ── SKU颜色/规格 ──
    const colors = [], sizes = [];
    const colorHeading = [...document.querySelectorAll('h3, h4, [class*="sku-heading"], [class*="attr-title"]')]
      .find(h => h.textContent?.includes('颜色') || h.textContent?.includes('款式'));
    
    if (colorHeading) {
      const container = colorHeading.nextElementSibling || colorHeading.parentElement;
      container?.querySelectorAll('img[alt]:not([alt=""]), [class*="sku-item"] [class*="name"]').forEach(el => {
        const t = el.alt || el.textContent?.trim();
        if (t && t.length < 20 && !colors.includes(t)) colors.push(t);
      });
    }

    const sizeHeading = [...document.querySelectorAll('h3, h4, [class*="sku-heading"], [class*="attr-title"]')]
      .find(h => h.textContent?.includes('尺码') || h.textContent?.includes('尺寸') || h.textContent?.includes('规格'));
    if (sizeHeading) {
      const container = sizeHeading.nextElementSibling || sizeHeading.parentElement;
      container?.querySelectorAll('[class*="sku-item"] [class*="name"], [class*="option"]').forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length < 10 && !sizes.includes(t)) sizes.push(t);
      });
    }

    // ── 商品属性表 ──
    const attributes = {};
    document.querySelectorAll('table tr, [class*="attribute-list"] li, [class*="prop-item"]').forEach(row => {
      const cells = row.querySelectorAll('th, td, [role="rowheader"], [role="cell"], dt, dd');
      for (let i = 0; i < cells.length - 1; i += 2) {
        const k = cells[i]?.textContent?.trim().replace(/:$/, '');
        const v = cells[i+1]?.textContent?.trim();
        if (k && v && k.length < 20 && v.length < 200) attributes[k] = v;
      }
    });

    // ── 支持平台标签 ──
    const tags = [];
    document.querySelectorAll('[class*="tag"], [class*="label"], [class*="badge"], [class*="service"]').forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length < 15 && t.length > 1) tags.push(t);
    });
    const supportDouyinExpress = tags.some(t => t.includes('抖音面单') || t.includes('密文代发'));
    const supportDropship = tags.some(t => t.includes('一件代发') || t.includes('代发'));
    const supportRefund7 = tags.some(t => t.includes('7天无理由'));
    const supportFreeShip = tags.some(t => t.includes('包邮') || t.includes('退货包运费'));

    return {
      ok: true,
      product: {
        offerId,
        url: location.href.split('?')[0],
        title: title.substring(0, 60),
        price,
        supplierName,
        shopYears,
        monthlySales,
        moq: 1,
        image: mainImgs[0] || '',
        images: [...new Set(mainImgs)].slice(0, 12),
        detailImages: [...new Set(detailImgs)].slice(0, 20),
        colors: [...new Set(colors)].slice(0, 15),
        sizes: [...new Set(sizes)].slice(0, 10),
        attributes,
        tags,
        supportDouyinExpress,
        supportDropship,
        supportRefund7,
        supportFreeShip,
        addedAt: new Date().toISOString(),
        source: 'detail',
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ══════════════════════════════════════════════
// 初始化
// ══════════════════════════════════════════════
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }

function init() {
  const url = location.href;
  if (url.includes('detail.1688.com/offer/') || url.includes('detail.m.1688.com')) {
    // 等待页面完全渲染
    setTimeout(injectDetailButton, 1500);
  } else if (url.includes('s.1688.com') || url.includes('offer_search')) {
    setTimeout(injectListUI, 1500);
  }
}

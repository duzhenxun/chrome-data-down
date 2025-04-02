// 版本检查配置
const GITHUB_OWNER = 'duzhenxun';
const GITHUB_REPO = 'chrome-data-down';
const VERSION_CHECK_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const UPDATE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// 检查新版本
async function checkForUpdates() {
  try {
    const response = await fetch(VERSION_CHECK_URL);
    const data = await response.json();
    const latestVersion = data.tag_name.replace('v', '');
    const currentVersion = chrome.runtime.getManifest().version;

    // 将版本号拆分为数字数组进行比较
    const latestParts = latestVersion.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);

    // 比较版本号的每个部分
    let hasUpdate = false;
    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latest = latestParts[i] || 0;
      const current = currentParts[i] || 0;
      if (latest > current) {
        hasUpdate = true;
        break;
      } else if (latest < current) {
        break;
      }
    }

    if (hasUpdate) {
      // 更新扩展图标
      chrome.action.setBadgeText({ text: '↑' });
      chrome.action.setBadgeBackgroundColor({ color: '#FFCC00' });

      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes: data.body || '暂无更新说明'
      };
    }

    return { hasUpdate: false };
  } catch (error) {
    console.error('检查更新失败:', error);
    return { hasUpdate: false, error: error.message };
  }
}

// 定期检查更新（每天检查一次）
chrome.alarms.create('checkUpdate', { periodInMinutes: 24 * 60 });

// 监听定时器
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUpdate') {
    checkForUpdates();
  }
});

// 监听来自popup页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'checkUpdate') {
    checkForUpdates().then(sendResponse);
    return true; // 保持消息通道开启以支持异步响应
  } else if (request.type === 'openUpdatePage') {
    chrome.tabs.create({ url: UPDATE_URL });
  }
});

// 初始检查更新
checkForUpdates();